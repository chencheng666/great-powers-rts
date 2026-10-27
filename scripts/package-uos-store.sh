#!/usr/bin/env bash
# 将本次构建的 Tauri DEB 整理为统信商店候选包；目标系统实测前不能视为可发布。
set -euo pipefail
source_deb=${1:?需要 Tauri DEB 路径}
output_dir=${2:?需要输出目录}
appid=site.daguojueqi.greatpowers
version=2.0.1.1
arch=$(dpkg-deb -f "$source_deb" Architecture)
case "$arch" in amd64|arm64) ;; *) echo '不支持的包架构' >&2; exit 1;; esac
scratch_dir=$(mktemp -d)
trap 'rm -rf "$scratch_dir"' EXIT
dpkg-deb -x "$source_deb" "$scratch_dir/source"
mapfile -t executables < <(find "$scratch_dir/source/usr/bin" -maxdepth 1 -type f -executable)
if [ "${#executables[@]}" != 1 ]; then echo '原包中可执行文件数量不符合预期' >&2; exit 1; fi
binary=$(basename "${executables[0]}")
base="$scratch_dir/pack/opt/apps/$appid"
mkdir -p "$scratch_dir/pack/DEBIAN" "$base/files/bin" "$base/files/share/doc" "$base/entries/applications" "$base/entries/icons/hicolor/512x512/apps" "$output_dir"
install -m 755 "${executables[0]}" "$base/files/bin/$binary"
cp LICENSE THIRD-PARTY-ASSETS.txt THIRD-PARTY-NOTICES.txt ASSETS.md "$base/files/share/doc/"
install -m 644 src-tauri/icons/icon.png "$base/entries/icons/hicolor/512x512/apps/$appid.png"
cat > "$base/entries/applications/$appid.desktop" <<DESKTOP
[Desktop Entry]
Type=Application
Name=大国崛起
Name[en_US]=Great Powers
Comment=原创即时战略游戏
Exec=/opt/apps/$appid/files/bin/$binary
Icon=$appid
Terminal=false
Categories=Game;StrategyGame;
StartupNotify=true
DESKTOP
python3 - "$base/info" "$appid" "$version" "$arch" <<'PY'
import json,sys
path,appid,version,arch=sys.argv[1:]
info={'appid':appid,'name':'大国崛起','version':version,'arch':[arch],'permissions':{'autostart':False,'notification':False,'trayicon':False,'clipboard':False,'account':False,'bluetooth':False,'camera':False,'audio_record':False,'installed_apps':False},'support-plugins':[],'plugins':[]}
with open(path,'w',encoding='utf-8') as f: json.dump(info,f,ensure_ascii=False,indent=2);f.write('\n')
PY
depends=$(dpkg-deb -f "$source_deb" Depends)
cat > "$scratch_dir/pack/DEBIAN/control" <<CONTROL
Package: $appid
Version: $version
Architecture: $arch
Maintainer: 陈成 <15542389060@163.com>
Depends: $depends
Section: games
Priority: optional
Description: 大国崛起原创即时战略游戏
 原创三维即时战略游戏，支持单机和联网入口。
CONTROL
dpkg-deb --root-owner-group --build "$scratch_dir/pack" "$output_dir/${appid}_${version}_${arch}.deb"
dpkg-deb -c "$output_dir/${appid}_${version}_${arch}.deb"
dpkg-deb -f "$output_dir/${appid}_${version}_${arch}.deb" Package Version Architecture Depends
sha256sum "$output_dir/${appid}_${version}_${arch}.deb" > "$output_dir/${appid}_${version}_${arch}.sha256"
