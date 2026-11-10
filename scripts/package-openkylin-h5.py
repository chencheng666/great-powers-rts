#!/usr/bin/env python3
"""将完整离线 H5 资源打包为标准 DEB，通过系统浏览器启动，不依赖 WebKitGTK。"""
import argparse
import gzip
import hashlib
import io
import json
from pathlib import Path
import re
import subprocess
import tarfile

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--html', type=Path, required=True)
parser.add_argument('--output', type=Path, required=True)
args = parser.parse_args()
root = Path(__file__).resolve().parent.parent
version = json.loads((root/'package.json').read_text())['version']
build = re.search(r"BUILD_ID = '([^']+)'", (root/'src/version.js').read_text())[1]
html = args.html.read_bytes()
if not html.startswith(b'<!doctype html>') and not html.startswith(b'<!DOCTYPE html>'):
    raise SystemExit('游戏入口不是完整 HTML')
if re.search(rb'<(?:script|link)\b[^>]*(?:src|href)=[\"\'](?:\./)?assets/', html):
    raise SystemExit('游戏入口仍然引用外部构建文件')
source = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip()
files = {'opt/great-powers/PLAY.html': (html, 0o644)}
for name in ['LICENSE', 'THIRD-PARTY-ASSETS.txt', 'THIRD-PARTY-NOTICES.txt', 'ASSETS.md', 'EQUIPMENT.md']:
    files['usr/share/doc/great-powers-rts/'+name] = ((args.html.parent/name).read_bytes(), 0o644)
launcher = '''#!/bin/sh
set -eu
if [ -z "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ]; then
  printf '%s\\n' '请在图形桌面中启动大国崛起。' >&2
  exit 1
fi
exec xdg-open /opt/great-powers/PLAY.html
'''
files['usr/bin/great-powers-rts'] = (launcher.encode(), 0o755)
desktop = '''[Desktop Entry]
Type=Application
Name=大国崛起
Name[en_US]=Great Powers
Comment=海陆空即时战略 离线H5版
Exec=/usr/bin/great-powers-rts
TryExec=/usr/bin/great-powers-rts
Icon=cn.greatpowers.rts
Terminal=false
Categories=Game;StrategyGame;
StartupNotify=false
'''
files['usr/share/applications/cn.greatpowers.rts.desktop'] = (desktop.encode(), 0o644)
files['usr/share/icons/hicolor/512x512/apps/cn.greatpowers.rts.png'] = ((root/'src-tauri/icons/icon.png').read_bytes(), 0o644)
readme = f'''大国崛起 {version} openKylin申请包

这是完整离线H5资源的DEB封装，使用系统默认浏览器运行，不是Tauri或Electron版。
申请验证范围为openKylin 3.0 x86_64。Architecture=all表示包内不含架构专属机器码，
不表示已验证全部处理器、浏览器或图形驱动。

安装：sudo apt install ./great-powers-rts_{version}_all.deb
启动：应用菜单中的“大国崛起”，或 great-powers-rts
卸载：sudo apt remove great-powers-rts

需要图形桌面、xdg-utils及支持WebGL2和WebAudio的Firefox或Chromium系浏览器。
模型、地图、三首音乐和中文语音随包安装，单机无需本地服务器。
首次点击进入游戏以启用音频。联网入口与主动反馈需要网络。

存档和荣誉保存在所选浏览器的本地数据中。切换浏览器、清理浏览器数据前请分别导出备份。
本包入口固定为/opt/great-powers/PLAY.html。与官网、uTools及Tauri版存档隔离；
旧版进度请通过游戏界面的JSON导入导出迁移，不声称跨容器自动继承。
安装包不含维护脚本，不删除用户目录，不安装后台服务。
本机macOS浏览器功能验证是补充证据，不代替openKylin的安装、运行及卸载验证。

官网：https://www.daguojueqi.site/
源码：https://github.com/chencheng666/great-powers-rts
'''
files['usr/share/doc/great-powers-rts/README.zh_CN'] = (readme.encode(), 0o644)
metadata = {'version': version, 'build': build, 'sourceCommit': source, 'runtime': '系统默认浏览器',
            'entry': '/opt/great-powers/PLAY.html', 'gameHtmlSha256': hashlib.sha256(html).hexdigest(),
            'target': 'openKylin 3.0 x86_64', 'openKylinRuntimeTested': False}
files['usr/share/doc/great-powers-rts/构建信息.json'] = (json.dumps(metadata, ensure_ascii=False, indent=2).encode()+b'\n', 0o644)
def tar_bytes(entries):
    result = io.BytesIO()
    with tarfile.open(fileobj=result, mode='w', format=tarfile.USTAR_FORMAT) as archive:
        for name, (content, mode) in sorted(entries.items()):
            info = tarfile.TarInfo('./'+name)
            info.size, info.mode, info.mtime = len(content), mode, 0
            info.uid = info.gid = 0
            info.uname = info.gname = 'root'
            archive.addfile(info, io.BytesIO(content))
    return gzip.compress(result.getvalue(), compresslevel=9, mtime=0)
depends = 'xdg-utils, firefox | chromium | chromium-browser'
control = f'''Package: great-powers-rts
Version: {version}
Architecture: all
Maintainer: 陈成 <15542389060@163.com>
Depends: {depends}
Section: games
Priority: optional
Installed-Size: {(sum(len(v[0]) for v in files.values())+1023)//1024}
Homepage: https://www.daguojueqi.site/
Description: 大国崛起原创即时战略游戏离线H5版
 内置模型、地图、音乐和中文语音，使用系统默认图形浏览器启动。
'''
sums = ''.join(hashlib.md5(content).hexdigest()+'  '+name+'\n' for name, (content, _) in sorted(files.items()))
parts = {'debian-binary': b'2.0\n', 'control.tar.gz': tar_bytes({'control': (control.encode(), 0o644), 'md5sums': (sums.encode(), 0o644)}), 'data.tar.gz': tar_bytes(files)}
result = bytearray(b'!<arch>\n')
for name, content in parts.items():
    result += f'{name+"/":<16}{0:<12}{0:<6}{0:<6}{"100644":<8}{len(content):<10}`\n'.encode()
    result += content
    if len(content) % 2:
        result += b'\n'
if args.output.exists():
    raise SystemExit('目标文件已存在，禁止覆盖历史包')
args.output.parent.mkdir(parents=True, exist_ok=True)
args.output.write_bytes(result)
report = {'file': args.output.name, 'version': version, 'architecture': 'all', 'bytes': len(result),
          'sha256': hashlib.sha256(result).hexdigest(), 'source': metadata, 'depends': depends,
          'files': {name: hashlib.sha256(content).hexdigest() for name, (content, _) in sorted(files.items())},
          'maintenanceScripts': False, 'openKylinRuntimeTested': False}
args.output.with_suffix('.verification.json').write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n')
args.output.with_suffix('.sha256').write_text(report['sha256']+'  '+args.output.name+'\n')
print(json.dumps({k:v for k,v in report.items() if k != 'files'}, ensure_ascii=False, indent=2))
