#!/usr/bin/env bash
# 沿用已上架应用的包名和安装路径，整理统信商店更新包。
set -euo pipefail
source_deb=${1:?需要 Tauri DEB 路径}
output_dir=${2:?需要输出目录}
appid=site.daguojueqi.greatpowers
version=$(node -p "JSON.parse(require('fs').readFileSync('package.json','utf8')).version")
source_version=$(dpkg-deb -f "$source_deb" Version)
if [ "$source_version" != "$version" ]; then echo '源安装包版本与项目版本不一致' >&2; exit 1; fi
dpkg --compare-versions "$version" gt 2.0.1.1
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
node --input-type=module - "$base/files/share/doc/构建信息.json" <<'JS'
import {writeFileSync,readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {GAME_VERSION,BUILD_ID} from './src/version.js';
writeFileSync(process.argv[2],JSON.stringify({version:JSON.parse(readFileSync('package.json','utf8')).version,gameVersion:GAME_VERSION,build:BUILD_ID,sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),applicationId:'site.daguojueqi.greatpowers',nativeIdentifier:'cn.greatpowers.rts'},null,2)+'\n');
JS
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
# 历史平台解析器不识别 zstd control 归档，保持已上架包使用的 gzip 格式。
dpkg-deb -Zgzip --root-owner-group --build "$scratch_dir/pack" "$output_dir/${appid}_${version}_${arch}.deb"
dpkg-deb -c "$output_dir/${appid}_${version}_${arch}.deb"
dpkg-deb -f "$output_dir/${appid}_${version}_${arch}.deb" Package Version Architecture Depends
sha256sum "$output_dir/${appid}_${version}_${arch}.deb" > "$output_dir/${appid}_${version}_${arch}.sha256"
