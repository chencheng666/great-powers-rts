#!/usr/bin/env python3
"""从已核对的Poly Haven公开文件清单获取CC0地表，缩放并打包游戏所需通道。"""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import urllib.request,json,hashlib
from PIL import Image
root=Path(__file__).resolve().parent.parent
cache=root/'qa/realism-20261111/polyhaven';cache.mkdir(parents=True,exist_ok=True);out=root/'assets/third-party/polyhaven-terrain-20261111';out.mkdir(parents=True,exist_ok=True)
headers={'User-Agent':'GreatPowersRTS-AssetPreparation/1.0'}
def fetch(url):return urllib.request.urlopen(urllib.request.Request(url,headers=headers),timeout=60).read()
jobs=[];sources={}
for slug in ['leafy_grass','rock_face']:
    metadata=cache/(slug+'.json')
    if not metadata.exists():metadata.write_bytes(fetch('https://api.polyhaven.com/files/'+slug))
    data=json.loads(metadata.read_text());sources[slug]=json.loads(fetch('https://api.polyhaven.com/info/'+slug))
    for role in ['Diffuse','nor_gl','arm']:jobs.append((slug,role,data[role]['1k']['jpg']))
def download(job):
    slug,role,meta=job;path=cache/(slug+'-'+role+'.jpg')
    data=path.read_bytes()if path.exists()else fetch(meta['url'])
    if hashlib.md5(data).hexdigest()!=meta['md5']:raise RuntimeError('原始文件摘要不一致：'+slug+role)
    path.write_bytes(data)
    return {'asset':slug,'role':role,'url':meta['url'],'bytes':len(data),'md5':meta['md5'],'sha256':hashlib.sha256(data).hexdigest()}
with ThreadPoolExecutor(3)as pool:original=list(pool.map(download,jobs))
outputs=[]
for slug in sources:
    color=Image.open(cache/(slug+'-Diffuse.jpg')).convert('RGB').resize((256,256),Image.Resampling.LANCZOS)
    normal=Image.open(cache/(slug+'-nor_gl.jpg')).convert('RGB').resize((256,256),Image.Resampling.LANCZOS)
    arm=Image.open(cache/(slug+'-arm.jpg')).convert('RGB').resize((256,256),Image.Resampling.LANCZOS)
    n=normal.split();a=arm.split();surface=Image.merge('RGBA',(n[0],n[1],a[1],a[0]))
    for role,image in [('color',color),('surface',surface)]:
        path=out/(slug+'-'+role+'.webp');image.save(path,format='WEBP',lossless=True,method=6)
        outputs.append({'file':path.name,'bytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
report={'license':'CC0-1.0','licenseURL':'https://polyhaven.com/license','provider':'Poly Haven','credits':'Powered by Poly Haven','assets':[{'slug':slug,'page':'https://polyhaven.com/a/'+slug,'authors':meta.get('authors',{}),'modifications':'缩放256像素；法线RG、粗糙度B、遮蔽A打包；运行时草地RGB调色0.68/0.86/0.65，岩壁降低饱和度45%并做灰岩亮度归一；原始资产以CC0发布'}for slug,meta in sources.items()],'originalFiles':original,'outputs':outputs}
(out/'来源与修改.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'bytes':sum(o['bytes']for o in outputs),'files':outputs},ensure_ascii=False))
