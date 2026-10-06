#!/bin/sh
set -eu
game_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
if command -v xdg-open >/dev/null 2>&1; then
  exec xdg-open "$game_dir/PLAY.html"
fi
printf '%s\n' '未找到默认浏览器启动器，请使用支持 WebGL 2 的桌面浏览器打开同目录的 PLAY.html。'
exit 1
