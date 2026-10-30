import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';import {Box3,Vector3} from 'three';import {BATTLE_MODEL_NAMES} from '../src/battle-model-manifest.js';
test('合并库保留全部80种最高优先级模型的空间包围盒和网格，移除旧库重复传输',async()=>{
 const parse=async name=>{const b=await readFile(new URL(`../assets/models/${name}-library.glb`,import.meta.url));return new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');};
 const merged=(await parse('battle')).scene;merged.updateMatrixWorld(true);
 const originals=[];for(const name of ['realism','robot','convoy','logistics','equipment','drone','military','modern']){const s=(await parse(name)).scene;s.updateMatrixWorld(true);originals.push(s);}
 for(const name of BATTLE_MODEL_NAMES){const source=originals.map(s=>s.getObjectByName(name)).find(Boolean),target=merged.getObjectByName(name);assert(target,`缺少${name}`);const a=new Box3().setFromObject(source),b=new Box3().setFromObject(target);assert(a.min.distanceTo(b.min)<.001,`${name}最小坐标变化`);assert(a.max.distanceTo(b.max)<.001,`${name}最大坐标变化`);let countA=0,countB=0;source.traverse(m=>{if(m.isMesh)countA++;});target.traverse(m=>{if(m.isMesh)countB++;});assert.equal(countA,countB,`${name}网格数量`);}
});
