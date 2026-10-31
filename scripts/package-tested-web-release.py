#!/usr/bin/env python3
"""打包已验收网页和共用服务代码；未变媒体由服务器继承并逐项核对摘要。"""
import hashlib
import json
import re
import subprocess
import sys
import tarfile
from pathlib import Path

root = Path(__file__).resolve().parent.parent
release = sys.argv[1] if len(sys.argv) > 1 else ''
if not re.fullmatch(r'[0-9A-Za-z-]+', release):
    raise SystemExit('请提供合法发布编号')
if subprocess.check_output(['git', 'diff', '--name-only', 'HEAD'], cwd=root, text=True).strip():
    raise SystemExit('请先提交本轮代码，确保构建与提交可对应')
dist = root / 'dist'
if not (dist / 'index.html').is_file():
    raise SystemExit('请先构建网页')
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
commit = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip()
build = re.search(r"BUILD_ID = '([^']+)'", (root / 'src/version.js').read_text())[1]
files = {str(p.relative_to(dist)): sha(p) for p in sorted(dist.rglob('*'))
         if p.is_file() and p.name != 'release.json' and 'downloads/packages/' not in str(p.relative_to(dist))}
manifest = {'sourceCommit': commit, 'build': build, 'files': files,
            'scope': '官网、网页与国内双人/六方服务；历史ZIP、桌面和商店安装包保留原版本'}
(dist / 'release.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
paths = [root / 'package.json', root / 'package-lock.json', root / 'scripts/deploy-strategic-release.py', dist / 'release.json']
for folder in ['src', 'server']:
    paths.extend(p for p in (root / folder).rglob('*') if p.is_file() and '__pycache__' not in p.parts)
media = {'.glb', '.wav', '.mp3', '.m4a', '.mp4', '.webm', '.png', '.jpg', '.jpeg', '.webp'}
for relative in files:
    path = dist / relative
    if (relative.startswith('assets/') or relative.startswith('official/assets/')) and path.suffix.lower() in media:
        continue
    paths.append(path)
folder = root / 'releases' / release
folder.mkdir(parents=True, exist_ok=True)
archive = folder / (release + '.tar.gz')
if archive.exists():
    raise SystemExit('发布包已存在，禁止覆盖')
with tarfile.open(archive, 'w:gz') as tar:
    for path in sorted(set(paths)):
        tar.add(path, arcname=str(path.relative_to(root)), recursive=False)
report = {'release': release, 'sourceCommit': commit, 'build': build, 'archive': str(archive),
          'bytes': archive.stat().st_size, 'sha256': sha(archive), 'entries': len(set(paths)), 'requiredFiles': len(files)}
(folder / 'package.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
print(json.dumps(report, ensure_ascii=False, indent=2))
