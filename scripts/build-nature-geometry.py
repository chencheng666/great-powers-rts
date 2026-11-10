#!/usr/bin/env python3
"""将已核验的 Kenney CC0 OBJ 转为单材质、顶点着色的轻量场景几何。"""
from pathlib import Path
import json

ROOT=Path(__file__).resolve().parent.parent
SOURCE=ROOT/'assets/third-party/kenney-nature'
NAMES=['tree_pineRoundA','tree_pineTallA_detailed','rock_largeB','rock_largeD']
result={}
for name in NAMES:
    vertices=[];faces=[];palette=[];material='_defaultMat'
    for line in (SOURCE/(name+'.obj')).read_text().splitlines():
        parts=line.split()
        if not parts:continue
        if parts[0]=='v':vertices.append([float(v)for v in parts[1:4]])
        elif parts[0]=='usemtl':
            material=parts[1]
            if material not in palette:palette.append(material)
        elif parts[0]=='f':
            if material not in palette:palette.append(material)
            indices=[int(p.split('/')[0])-1 for p in parts[1:]]
            for i in range(1,len(indices)-1):faces.append(([indices[0],indices[i],indices[i+1]],palette.index(material)))
    tree=name.startswith('tree_')
    if tree:faces=[(triangle,index)for triangle,index in faces if 'wood' in palette[index].lower() or 'bark' in palette[index].lower()]
    used=[vertices[i]for triangle,_ in faces for i in triangle]
    low=[min(v[a]for v in used)for a in range(3)];high=[max(v[a]for v in used)for a in range(3)];size=[high[a]-low[a]for a in range(3)];center=[(high[a]+low[a])/2 for a in range(3)]
    sy=.8/size[1];sx=1.4/max(size[0],size[2]);factor=1.8/size[1];positions=[];materials=[]
    for triangle,index in faces:
        for i in triangle:
            v=vertices[i]
            point=[(v[1]-center[1])*factor,(v[0]-low[0])*factor,(v[2]-center[2])*factor] if tree else [(v[0]-center[0])*sx,(v[1]-low[1])*sy,(v[2]-center[2])*sx]
            positions.extend(round(n,5)for n in point)
        materials.append(index)
    key='log_pineA' if name=='tree_pineRoundA' else 'log_pineB' if tree else name
    result[key]={'positions':positions,'materials':materials,'palette':palette,'sourceModel':name,'triangles':len(faces)}
    print(name,len(faces),'三角形',len(positions)//3,'顶点')
output=ROOT/'src/nature-kit-mesh-data.js'
output.write_text('// Kenney Nature Kit 2.1，CC0。由 scripts/build-nature-geometry.py 生成，保留原始 OBJ 与许可。\nexport const NATURE_MESH_DATA = '+json.dumps(result,separators=(',',':'))+';\n')
print('几何数据',output.stat().st_size,'字节')
