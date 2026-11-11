import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { loadAsset } from './asset-loading.js';
import { finishAirframe } from './airframe-finish.js';

const urls = {
  bomber: new URL('../assets/third-party/free-aircraft-20261111/bomber.glb', import.meta.url).href,
  ewPlane: new URL('../assets/third-party/free-aircraft-20261111/ewPlane.glb', import.meta.url).href,
  navalFighter_nato: new URL('../assets/third-party/free-aircraft-20261111/navalFighter_nato.glb', import.meta.url).href,
  navalStrike_nato: new URL('../assets/third-party/free-aircraft-20261111/navalStrike_nato.glb', import.meta.url).href,
};
export const FREE_AIRCRAFT_NAMES = Object.freeze(Object.keys(urls));

export async function loadFreeAircraft() {
  const results = await Promise.allSettled(Object.entries(urls).map(async ([name,url])=>{
    const gltf=await loadAsset(url,()=>new GLTFLoader().loadAsync(url));
    const model=gltf.scene.getObjectByName(name);
    if (!model?.getObjectByName('airframe_near') || !model.getObjectByName('airframe_far')) throw new Error(`开放飞机缺少远近景：${name}`);
    const parked=gltf.scene.getObjectByName(`parked_${name}`);
    return [[name,model],...(parked?[[parked.name,parked]]:[])];
  }));
  return new Map(results.filter(r=>r.status==='fulfilled').flatMap(r=>r.value));
}

export function installFreeAircraft(models, aircraft) {
  for (const [name,source] of aircraft) {
    const model=source.clone(true);
    for(const level of name.startsWith('parked_')?[]:['near','far']) {
      const part=model.getObjectByName(`airframe_${level}`);
      part.userData.openAssetLOD=level;part.visible=level==='near';
    }
    model.traverse(mesh=>{
      if(!mesh.isMesh)return;
      mesh.castShadow=mesh.receiveShadow=true;
      if(mesh.material.name==='座舱玻璃')mesh.material=new THREE.MeshPhysicalMaterial({name:'座舱玻璃',color:'#528598',roughness:.16,metalness:.25,clearcoat:1});
    });
    // 识别条贴合真实蒙皮，避免在高低不同的机体上悬空。
    model.updateMatrixWorld(true);
    const size=name.startsWith('parked_')?.2:1;
    const shell=[];model.traverse(mesh=>{if(mesh.isMesh&&mesh.material.name==='航空涂层'&&!mesh.parent.name.includes('far'))shell.push(mesh);});
    const hit=new THREE.Raycaster(new THREE.Vector3(-.9*size,5*size,0),new THREE.Vector3(0,-1,0)).intersectObjects(shell,false)[0];
    if(hit){
      const mark=new THREE.Mesh(new THREE.BoxGeometry(.55*size,.025*size,.18*size),new THREE.MeshStandardMaterial({name:'阵营标识',color:'#59d7ec',emissive:'#59d7ec',emissiveIntensity:.1}));
      mark.position.copy(hit.point);mark.position.y+=.018*size;model.add(mark);
    }
    if(!name.startsWith('parked_'))finishAirframe(model);
    models.set(name,model);
  }
  return aircraft.size;
}
