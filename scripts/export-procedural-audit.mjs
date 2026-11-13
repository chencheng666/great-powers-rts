// 导出游戏实际生成的几何供 Blender 检查；验收文件只写入忽略目录。
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createChineseTank, createChineseDestroyer } from '../src/domestic-models.js';
import { PROCEDURAL_AIRCRAFT, createProceduralAircraft } from '../src/procedural-aircraft.js';
import * as THREE from 'three';

const folder=resolve(process.argv[2]??'qa/procedural-audit');await mkdir(folder,{recursive:true});
const models=new Map([['tank_china',createChineseTank()],['destroyer_china',createChineseDestroyer()],...Object.keys(PROCEDURAL_AIRCRAFT).map(name=>[name,createProceduralAircraft(name)])]);
const report={};
for(const[name,model]of models){
  const stats={meshes:0,triangles:0,vertices:0,bytes:0,visibleCalls:0,visibleTriangles:0};
  const buffers=new Set();
  model.traverse(mesh=>{
    if(!mesh.isMesh)return;
    const g=mesh.geometry,triangles=(g.index?.count??g.attributes.position.count)/3;
    stats.meshes++;stats.triangles+=triangles;stats.vertices+=g.attributes.position.count;
    for(const a of [...Object.values(g.attributes),g.index].filter(Boolean))if(!buffers.has(a.array)){buffers.add(a.array);stats.bytes+=a.array.byteLength;}
    let visible=true;for(let p=mesh;p;p=p.parent)visible&&=p.visible;
    if(visible){stats.visibleCalls+=Array.isArray(mesh.material)?g.groups.length:1;stats.visibleTriangles+=triangles*(mesh.isInstancedMesh?mesh.count:1);}
  });
  stats.bounds=new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3()).toArray();report[name]=stats;
  await writeFile(resolve(folder,name+'.json'),JSON.stringify(model.toJSON()));
}
await writeFile(resolve(folder,'geometry-report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
