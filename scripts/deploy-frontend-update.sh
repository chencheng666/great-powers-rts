#!/usr/bin/env bash
set -euo pipefail
# 只更新静态页面，不重启对战进程、不覆盖战绩、不删除旧版哈希资源。
archive="${1:?请提供发布包路径}"
expected="${2:?请提供发布包 SHA256}"
release="${3:?请提供发布编号}"
[[ "$release" =~ ^[0-9A-Za-z-]+$ ]]
printf '%s  %s\n' "$expected" "$archive" | sha256sum -c -
current=$(readlink -f /opt/great-powers/current)
[[ "$current" == /opt/great-powers/releases/* && -d "$current/dist" ]]
root="$current/dist"
stage=$(mktemp -d)
backup="/opt/great-powers/frontend-backups/$release"
[[ ! -e "$backup" ]]
switched=false
finish() {
  result=$?
  if [[ "$result" != 0 && "$switched" == true ]]; then
    install -m 644 "$backup/index.html" "$root/index.html.rollback"
    mv -Tf "$root/index.html.rollback" "$root/index.html"
    printf '校验失败，已恢复上一版页面\n'
  fi
  rm -rf "$stage"
  exit "$result"
}
trap finish EXIT
tar -xzf "$archive" -C "$stage"
install -d "$backup"
install -m 644 "$root/index.html" "$backup/index.html"
for file in "$stage"/assets/*; do
  [[ -f "$file" ]]
  name=$(basename "$file")
  [[ "$name" =~ ^[0-9A-Za-z_.-]+\.(js|css)$ ]]
  if [[ -e "$root/assets/$name" ]]; then cmp "$file" "$root/assets/$name"; else install -m 644 "$file" "$root/assets/$name"; fi
done
install -m 644 "$stage/index.html" "$root/index.html.next"
cd "$root"
sha256sum -c "$stage/frontend.sha256"
mv -Tf "$root/index.html.next" "$root/index.html"
switched=true
curl --fail --silent http://127.0.0.1:8088/api/health
curl --fail --silent http://127.0.0.1:8088/ -o "$stage/published.html"
cmp "$stage/index.html" "$stage/published.html"
install -m 644 "$stage/frontend.sha256" "$backup/frontend.sha256"
printf '\n前端发布成功：%s；对战进程未重启\n' "$release"
