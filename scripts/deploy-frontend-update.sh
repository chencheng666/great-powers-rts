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
pages=(index.html)
switched=false
finish() {
  result=$?
  if [[ "$result" != 0 && "$switched" == true ]]; then
    for page in "${pages[@]}"; do
      install -m 644 "$backup/$page" "$root/$page.rollback"
      mv -Tf "$root/$page.rollback" "$root/$page"
    done
    printf '校验失败，已恢复上一版页面\n'
  fi
  rm -rf "$stage"
  exit "$result"
}
trap finish EXIT
tar -xzf "$archive" -C "$stage"
install -d "$backup"
# 可选同步官网和下载页，白名单内的每页均先备份，再统一校验。
for page in official/index.html downloads/index.html; do
  if [[ -f "$stage/$page" ]]; then pages+=("$page"); fi
done
for page in "${pages[@]}"; do
  [[ -f "$root/$page" ]]
  install -d "$backup/$(dirname "$page")"
  install -m 644 "$root/$page" "$backup/$page"
done
for file in "$stage"/assets/*; do
  [[ -f "$file" ]]
  name=$(basename "$file")
  [[ "$name" =~ ^[0-9A-Za-z_.-]+\.(js|css)$ ]]
  if [[ -e "$root/assets/$name" ]]; then cmp "$file" "$root/assets/$name"; else install -m 644 "$file" "$root/assets/$name"; fi
done
for page in "${pages[@]}"; do
  install -m 644 "$stage/$page" "$root/$page.next"
done
cd "$root"
sha256sum -c "$stage/frontend.sha256"
switched=true
for page in "${pages[@]}"; do
  mv -Tf "$root/$page.next" "$root/$page"
done
curl --fail --silent http://127.0.0.1:8088/api/health
for page in "${pages[@]}"; do
  curl --fail --silent "http://127.0.0.1:8088/$page" -o "$stage/published.html"
  cmp "$stage/$page" "$stage/published.html"
done
install -m 644 "$stage/frontend.sha256" "$backup/frontend.sha256"
printf '\n前端发布成功：%s；对战进程未重启\n' "$release"
