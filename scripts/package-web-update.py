#!/usr/bin/env python3
"""打包无依赖变化的网页热更新；保留旧资源并在服务器核对完整资源摘要。"""
from pathlib import Path
import hashlib,json,re,subprocess,tarfile
root=Path(__file__).resolve().parent.parent
out=root/'releases/analytics-20261026';out.mkdir(parents=True,exist_ok=True)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
commit=subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip()
build=re.search("BUILD_ID = '([^']+)'",(root/'src/version.js').read_text())[1]
assets={str(p.relative_to(root/'dist')):sha(p) for p in sorted((root/'dist/assets').rglob('*')) if p.is_file()}
for p in (root/'dist/official/assets').glob('battle-montage*'): assets[str(p.relative_to(root/'dist'))]=sha(p)
manifest={'sourceCommit':commit,'build':build,'assets':assets,'scope':'网页、国内双节点服务及鉴权统计；离线ZIP单独校验，旧安装包保留'}
(root/'dist/release.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
paths=[root/'package.json',root/'package-lock.json']
for folder in ['src','server']:
    paths.extend(p for p in (root/folder).rglob('*') if p.is_file() and '__pycache__' not in p.parts)
for p in (root/'dist').rglob('*'):
    if not p.is_file():continue
    rel=p.relative_to(root/'dist')
    if str(rel).startswith('downloads/packages/'):continue
    if str(rel).startswith('official/assets/') and not p.name.startswith('battle-montage'):continue
    if str(rel).startswith('assets/') and p.suffix in ['.glb','.wav','.mp3','.m4a','.png','.jpeg','.jpg'] and 'battle-montage' not in p.name:continue
    paths.append(p)
archive=out/'great-powers-web-20261026.tar.gz'
with tarfile.open(archive,'w:gz') as tar:
    for p in sorted(set(paths)):tar.add(p,arcname=str(p.relative_to(root)),recursive=False)
report={'sourceCommit':commit,'build':build,'archive':str(archive),'bytes':archive.stat().st_size,'sha256':sha(archive),'entries':len(paths),'requiredAssets':len(assets)}
(out/'package.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(report,ensure_ascii=False))
