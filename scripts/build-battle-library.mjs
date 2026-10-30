import { readFile,writeFile } from 'node:fs/promises';
import { Scene } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { BATTLE_MODEL_NAMES } from '../src/battle-model-manifest.js';
// 离线合并实际使用的最高优先级模型，剔除被后续库覆盖的旧模型，保持名称与关节。
globalThis.FileReader=class { readAsArrayBuffer(blob){blob.arrayBuffer().then(data=>{this.result=data;this.onloadend?.();});} };
const scenes=[];
for(const name of ['realism','robot','convoy','logistics','equipment','drone','military','modern']){
 const bytes=await readFile(new URL(`../assets/models/${name}-library.glb`,import.meta.url));
 const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
 gltf.scene.updateMatrixWorld(true);scenes.push(gltf.scene);
}
const scene=new Scene();
for(const name of BATTLE_MODEL_NAMES){
 const source=scenes.map(s=>s.getObjectByName(name)).find(Boolean);
 if(!source)throw new Error(`缺少模型：${name}`);
 const model=source.clone(true);source.matrixWorld.decompose(model.position,model.quaternion,model.scale);scene.add(model);
}
const result=await new GLTFExporter().parseAsync(scene,{binary:true,onlyVisible:false});
await writeFile(new URL('../assets/models/battle-library.glb',import.meta.url),Buffer.from(result));
console.log(`合并${BATTLE_MODEL_NAMES.length}种模型：${(result.byteLength/1024/1024).toFixed(2)} MiB`);
