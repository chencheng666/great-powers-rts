#!/usr/bin/env python3
"""在没有 dpkg 的主机上检查统信更新包，不执行安装包中的程序。"""
import argparse
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import struct
import tarfile

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('package', type=Path)
parser.add_argument('--sha256', required=True)
parser.add_argument('--source', required=True)
parser.add_argument('--output', type=Path)
args = parser.parse_args()
appid = 'site.daguojueqi.greatpowers'
prefix = f'opt/apps/{appid}/'

def require(condition, message):
    if not condition:
        raise SystemExit(message)

digest = hashlib.file_digest(args.package.open('rb'), 'sha256').hexdigest()
require(digest == args.sha256, '安装包完整摘要不一致')
members = {}
with args.package.open('rb') as stream:
    require(stream.read(8) == b'!<arch>\n', '不是有效的 DEB ar 归档')
    while header := stream.read(60):
        require(len(header) == 60 and header[58:] == b'`\n', 'ar 成员头损坏')
        name = header[:16].decode().strip().rstrip('/')
        size = int(header[48:58])
        require(name not in members and size >= 0, 'ar 包含重复或非法成员')
        members[name] = stream.read(size)
        require(len(members[name]) == size, 'ar 成员被截断')
        if size % 2:
            stream.read(1)
require(set(members) == {'debian-binary', 'control.tar.gz', 'data.tar.gz'}, '必须使用标准 gzip DEB 归档')
require(members['debian-binary'] == b'2.0\n', 'DEB 格式版本不符合预期')
with tarfile.open(fileobj=io.BytesIO(members['control.tar.gz']), mode='r:gz') as archive:
    files = [m for m in archive if m.isfile()]
    require(len(files) == 1 and files[0].name.lstrip('./') == 'control', '禁止额外维护脚本或控制文件')
    control = archive.extractfile(files[0]).read().decode()
fields = dict(line.split(': ', 1) for line in control.splitlines() if ': ' in line and not line.startswith(' '))
require(fields.get('Package') == appid, '商店包名发生变化')
require(fields.get('Version') == '3.1.0' and fields.get('Architecture') == 'amd64', '版本或架构不符合本轮更新')
require('libwebkit2gtk-4.1-0' in fields.get('Depends', ''), '缺少 WebKitGTK 运行依赖声明')

metadata, desktop, info = None, None, None
binary, icon, file_count = False, False, 0
with tarfile.open(fileobj=io.BytesIO(members['data.tar.gz']), mode='r:gz') as archive:
    for member in archive:
        path = PurePosixPath(member.name)
        require(not path.is_absolute() and '..' not in path.parts, '安装路径越界')
        name = str(path).removeprefix('./')
        require(member.isdir() or member.isfile(), '更新包不应包含链接或特殊设备')
        require(member.uid == 0 and member.gid == 0, '安装文件属主不符合要求')
        if member.isdir():
            require(name in {'.', 'opt', 'opt/apps', f'opt/apps/{appid}'} or name.startswith(prefix), '目录超出独立应用范围')
            continue
        require(name.startswith(prefix), '文件写入了独立应用目录以外的位置')
        file_count += 1
        source = archive.extractfile(member)
        if name == prefix+'files/bin/great-powers-desktop':
            head = source.read(64)
            require(head[:6] == b'\x7fELF\x02\x01' and struct.unpack('<H', head[18:20])[0] == 62, '主程序不是 x86_64 ELF')
            require(bool(member.mode & 0o111), '主程序没有执行权限')
            binary = True
        elif name == prefix+'info':
            info = json.load(source)
        elif name == prefix+f'entries/applications/{appid}.desktop':
            desktop = source.read().decode()
        elif name == prefix+f'entries/icons/hicolor/512x512/apps/{appid}.png':
            head = source.read(24)
            require(head[:8] == b'\x89PNG\r\n\x1a\n' and struct.unpack('>II', head[16:24]) == (512, 512), '图标不是 512×512 PNG')
            icon = True
        elif name == prefix+'files/share/doc/构建信息.json':
            metadata = json.load(source)
require(binary and icon and desktop and info and metadata, '关键安装文件不完整')
require(f'Exec=/opt/apps/{appid}/files/bin/great-powers-desktop\n' in desktop, '桌面启动路径不兼容旧版')
require(info['appid'] == appid and info['version'] == '3.1.0' and info['arch'] == ['amd64'], '应用 info 与控制文件不一致')
require(all(value is False for value in info['permissions'].values()), '应用权限声明扩大')
require(metadata['sourceCommit'] == args.source and metadata['nativeIdentifier'] == 'cn.greatpowers.rts', '源提交或原生存储标识不一致')
result = {'file': args.package.name, 'bytes': args.package.stat().st_size, 'sha256': digest,
          'version': fields['Version'], 'architecture': fields['Architecture'], 'depends': fields['Depends'],
          'source': metadata, 'files': file_count, 'gzipArchive': True, 'maintenanceScripts': False,
          'legacyPackageIdPreserved': True, 'legacyExecPathPreserved': True, 'targetDeviceTested': False}
if args.output:
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n')
print(json.dumps(result, ensure_ascii=False, indent=2))
