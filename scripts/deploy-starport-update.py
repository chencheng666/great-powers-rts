#!/usr/bin/env python3
"""只切换科幻版静态资源；保留原版、旧下载包和正在进行的对战。"""
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
import urllib.request
from urllib.parse import quote

archive, expected, release = sys.argv[1:]
if not re.fullmatch(r'[0-9A-Za-z-]+', release):
    raise SystemExit('发布编号不合法')
def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()
if sha(archive) != expected:
    raise SystemExit('发布包校验失败')
current = Path('/opt/great-powers/current').resolve()
if current.parent != Path('/opt/great-powers/releases') or not (current/'dist').is_dir():
    raise SystemExit('当前目录不符合部署约定')
root = current/'dist'
backup = Path('/opt/great-powers/frontend-backups')/release
if backup.exists():
    raise SystemExit('备份已存在，禁止覆盖')
def listeners():
    rows = subprocess.check_output(['ss', '-ltnpH'], text=True)
    return sorted(line for line in rows.splitlines() if re.search(r':(?:8088|8089)\s', line))
def get(path):
    with urllib.request.urlopen('http://127.0.0.1:8088/'+quote(path), timeout=20) as response:
        return response.read()
protected = {p: sha(root/p) for p in ['index.html', 'official/index.html', 'release.json'] if (root/p).is_file()}
processes = listeners()
if not processes:
    raise SystemExit('未检测到既有对战监听，停止静态发布')
health_before = json.loads(get('api/health'))
changed = []
with tempfile.TemporaryDirectory(prefix='starport-stage-') as temp:
    stage = Path(temp)
    with tarfile.open(archive, 'r:gz') as package:
        for member in package.getmembers():
            path = PurePosixPath(member.name)
            if path.is_absolute() or '..' in path.parts or not (member.isfile() or member.isdir()):
                raise SystemExit('发布包包含非法路径')
        package.extractall(stage)
    manifest = json.loads((stage/'starport/release.json').read_text())
    for item in manifest['files']:
        relative = item['path']
        if not relative.startswith('starport/') or '..' in PurePosixPath(relative).parts or sha(stage/relative) != item['sha256']:
            raise SystemExit('科幻版文件清单校验失败')
    addition = json.loads((stage/'downloads/starport-addition.json').read_text())
    name = addition['name']
    if not re.fullmatch(r'packages/Great-Powers-Starport-v[0-9.]+-TapTap-r[0-9]+\.zip', name):
        raise SystemExit('下载文件名不符合科幻版约定')
    package_file = stage/'downloads'/name
    if sha(package_file) != addition['sha256'] or package_file.stat().st_size != addition['size']:
        raise SystemExit('科幻下载包校验失败')
    # 以线上清单为基础追加，不能用本地旧清单覆盖其他渠道的新文件。
    live = json.loads((root/'downloads/manifest.json').read_text())
    old = next((x for x in live['files'] if x['name'] == name), None)
    if old and (old['sha256'] != addition['sha256'] or old['size'] != addition['size']):
        raise SystemExit('同名历史下载文件不一致')
    live['files'] = [addition] + [x for x in live['files'] if x['name'] != name]
    live['starportFile'] = name
    live['starportBuild'] = manifest['build']
    (stage/'downloads/manifest.json').write_text(json.dumps(live, ensure_ascii=False, indent=2)+'\n')
    backup.mkdir(parents=True)
    pages = ['starport/index.html', 'starport/LICENSE', 'starport/THIRD-PARTY-NOTICES.txt', 'starport/版本与隐私说明.txt', 'starport/release.json', 'official/starport/index.html', 'downloads/index.html', 'downloads/manifest.json']
    try:
        for page in pages:
            target = root/page
            if target.exists():
                saved = backup/page
                saved.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(target, saved)
        for asset in (stage/'starport/assets').iterdir():
            if not re.fullmatch(r'[0-9A-Za-z_.-]+\.(js|css|svg|png|webp|glb|m4a|woff2?)', asset.name):
                raise RuntimeError('静态资源名称不在白名单')
            target = root/'starport/assets'/asset.name
            if target.exists() and sha(target) != sha(asset):
                raise RuntimeError('同名哈希资源不一致')
            if not target.exists():
                shutil.copyfile(asset, target); target.chmod(0o644)
        target_zip = root/'downloads'/name
        if target_zip.exists() and sha(target_zip) != addition['sha256']:
            raise RuntimeError('历史下载包不允许覆盖')
        if not target_zip.exists():
            shutil.copyfile(package_file, target_zip); target_zip.chmod(0o644)
        for page in pages:
            target = root/page
            target.parent.mkdir(parents=True, exist_ok=True)
            pending = target.with_name(target.name+'.next')
            shutil.copyfile(stage/page, pending); pending.chmod(0o644)
        for page in pages:
            target = root/page
            os.replace(target.with_name(target.name+'.next'), target); changed.append(page)
        for item in manifest['files']:
            if hashlib.sha256(get(item['path'])).hexdigest() != item['sha256']:
                raise RuntimeError('科幻版HTTP资源校验失败：'+item['path'])
        for page in ['starport/release.json', 'official/starport/index.html', 'downloads/index.html', 'downloads/manifest.json']:
            if get(page) != (stage/page).read_bytes():
                raise RuntimeError('页面HTTP回读不一致：'+page)
        if any(sha(root/page) != digest for page, digest in protected.items()):
            raise RuntimeError('原版保护文件发生变化')
        if listeners() != processes:
            raise RuntimeError('对战监听发生变化，请核查')
        health_after = json.loads(get('api/health'))
        result = {'release': release, 'build': manifest['build'], 'version': manifest['version'], 'files': len(manifest['files']), 'archiveSha256': addition['sha256'], 'protectedFilesUnchanged': True, 'battleProcessesUnchanged': True, 'healthBefore': health_before, 'healthAfter': health_after}
        (backup/'验收结果.json').write_text(json.dumps(result, ensure_ascii=False, indent=2))
        print(json.dumps(result, ensure_ascii=False))
    except BaseException:
        for page in reversed(changed):
            target, saved = root/page, backup/page
            if saved.exists():
                pending = target.with_name(target.name+'.rollback')
                shutil.copyfile(saved, pending); os.replace(pending, target)
            else:
                target.unlink(missing_ok=True)
        raise
