#!/usr/bin/env bash
set -euo pipefail
# 独立目录、独立端口、独立账户；不改动服务器已有的 80/443 服务。
archive="${1:?请传入发布包绝对路径}"
expected="${2:?请传入发布包 SHA256}"
release="${3:?请传入版本编号}"
base=/opt/great-powers
[[ "$release" =~ ^[0-9A-Za-z-]+$ ]]
printf '%s  %s\n' "$expected" "$archive" | sha256sum -c -
if ss -lntp | grep -q ':8088 ' && ! systemctl is-active --quiet great-powers; then
  printf '8088 端口已被其他服务占用，停止部署\n'; exit 1
fi
install -d "$base/releases/$release" "$base/runtime" /var/lib/great-powers
cd "$base/runtime"
curl --fail --location --retry 3 -o SHASUMS256.txt https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt
nodefile=$(awk '/node-v[0-9.]+-linux-x64.tar.xz$/ {print $2}' SHASUMS256.txt)
[[ "$nodefile" =~ ^node-(v22\.[0-9]+\.[0-9]+)-linux-x64\.tar\.xz$ ]]
version="${BASH_REMATCH[1]}"
if ! test -x "$base/runtime/bin/node" || [[ "$("$base/runtime/bin/node" --version)" != "$version" ]]; then
  curl --fail --location --retry 3 -o node.tar.xz "https://nodejs.org/dist/latest-v22.x/$nodefile"
  wanted=$(awk -v file="$nodefile" '$2==file {print $1}' SHASUMS256.txt)
  [[ -n "$wanted" ]]
  printf '%s  node.tar.xz\n' "$wanted" | sha256sum -c -
  tar -xJf node.tar.xz --strip-components=1
fi
tar -xzf "$archive" -C "$base/releases/$release"
if [[ -n "${4:-}" ]]; then
  printf '%s  %s\n' "${5:?请传入补丁包 SHA256}" "$4" | sha256sum -c -
  tar -xzf "$4" -C "$base/releases/$release"
fi
if ! id great-powers >/dev/null 2>&1; then useradd --system --home-dir /var/lib/great-powers --shell /sbin/nologin great-powers; fi
chown great-powers:great-powers /var/lib/great-powers
chmod 700 /var/lib/great-powers
cd "$base/releases/$release"
PATH="$base/runtime/bin:$PATH" npm ci --omit=dev --ignore-scripts
install -m 644 packaging/great-powers.service /etc/systemd/system/great-powers.service
previous=$(readlink "$base/current" || true)
ln -s "$base/releases/$release" "$base/current.next"
mv -Tf "$base/current.next" "$base/current"
systemctl daemon-reload
systemctl enable great-powers
systemctl restart great-powers
healthy=false
for attempt in {1..20}; do
  if curl --fail --silent http://127.0.0.1:8088/api/health; then healthy=true; break; fi
  sleep 1
done
if [[ "$healthy" != true ]]; then
  if [[ -n "$previous" ]]; then ln -s "$previous" "$base/current.rollback"; mv -Tf "$base/current.rollback" "$base/current"; systemctl restart great-powers; else systemctl stop great-powers; fi
  printf '\n健康检查失败，已恢复旧版或停止新服务\n';exit 1
fi
printf '\n部署成功：%s\n' "$release"
systemctl --no-pager --full status great-powers
