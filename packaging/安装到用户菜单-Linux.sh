#!/bin/sh
set -eu
source_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
data_dir="${XDG_DATA_HOME:-$HOME/.local/share}"
target_dir="$data_dir/great-powers-rts"
if [ ! -f "$source_dir/PLAY.html" ]; then
  printf '%s\n' '请完整解压试玩包后，在 PLAY.html 所在目录运行此脚本。'
  exit 1
fi
mkdir -p "$target_dir" "$data_dir/applications"
cp "$source_dir/PLAY.html" "$target_dir/PLAY.html"
for file in README.txt LICENSE ASSETS.md EQUIPMENT.md THIRD-PARTY-NOTICES.txt 中文语音使用教程.md 中文语音设置.png; do
  cp "$source_dir/$file" "$target_dir/$file"
done
# 桌面文件使用目录变量展开后的绝对路径，并转义 Exec 中的保留字符。
escaped_path=$(printf '%s' "$target_dir/PLAY.html" | sed 's/\\/\\\\/g;s/"/\\"/g;s/`/\\`/g;s/\$/\\$/g;s/%/%%/g')
desktop_file="$data_dir/applications/io.github.chencheng666.greatpowersrts.desktop"
printf '%s\n' '[Desktop Entry]' 'Type=Application' 'Version=1.0' 'Name=大国崛起' 'Comment=开源即时战略单机试玩版' "Exec=xdg-open \"$escaped_path\"" 'Icon=applications-games' 'Terminal=false' 'Categories=Game;StrategyGame;' 'StartupNotify=true' > "$desktop_file"
printf '%s\n' '已安装到当前用户的应用菜单，无需管理员权限。' "游戏目录：$target_dir" "卸载：删除该目录与 ${desktop_file}。" '更新前请在旧版导出存档，更新后可通过主界面导入。'
