import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FREE_AIRCRAFT_NAMES, installFreeAircraft } from '../src/free-aircraft.js';
import { syncOpenAssetLOD } from '../src/open-assets.js';
import { aircraftExhaustLayout } from '../src/aircraft-appearance.js';
import { carrierDeckPose, onCarrierDeck } from '../src/carrier-deck.js';
import { equipmentModel } from '../src/equipment.js';
import { AIRCRAFT_LENGTHS, unitModelScale } from '../src/model-scale.js';

const folder=new URL('../assets/third-party/free-aircraft-20261111/',import.meta.url);
const report=JSON.parse(readFileSync(new URL('geometry-report.json',folder)));
const assets=new Map();
for(const name of FREE_AIRCRAFT_NAMES){
  const bytes=readFileSync(new URL(`${name}.glb`,folder));
  const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  assets.set(name,gltf.scene.getObjectByName(name));
  const parked=gltf.scene.getObjectByName(`parked_${name}`);if(parked)assets.set(parked.name,parked);
}

test('免费战机真实文件具备来源、内嵌数据与近远景，摘要和面数符合预算',()=>{
  let total=0;
  for(const name of FREE_AIRCRAFT_NAMES){
    const bytes=readFileSync(new URL(`${name}.glb`,folder)),root=assets.get(name),r=report[name];total+=bytes.length;
    assert.equal(createHash('sha256').update(bytes).digest('hex'),r.sha256);
    assert.equal(root.userData.license,'CC0-1.0');assert.equal(root.userData.author,'Captain_Ahab_62');
    const json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)));
    assert.ok(json.buffers.every(b=>!b.uri));assert.equal(json.images,undefined);
    for(const level of ['near','far']){
      const part=root.getObjectByName(`airframe_${level}`);assert.ok(part);
      let triangles=0;part.traverse(m=>{if(m.isMesh){triangles+=(m.geometry.index?.count??m.geometry.attributes.position.count)/3;assert.ok([...m.geometry.attributes.position.array,...m.geometry.attributes.normal.array].every(Number.isFinite));}});
      assert.equal(triangles,r.triangles[`airframe_${level}`]);
      assert.ok(triangles<(level==='near'?2800:1100));
    }
  }
  assert.ok(total<460000);
});

test('安装保留各兵种空中尺寸、喷口与远近景互斥，克隆共享几何且失败不覆盖回退模型',()=>{
  const models=new Map();installFreeAircraft(models,assets);
  for(const [name,type]of [['bomber','bomber'],['ewPlane','ewPlane'],['navalFighter_nato','navalFighter'],['navalStrike_nato','navalStrike']]){
    const model=models.get(name),box=new THREE.Box3().setFromObject(model),size=box.getSize(new THREE.Vector3());
    assert.ok(Math.abs(unitModelScale(type,size,1)*size.x-AIRCRAFT_LENGTHS[type])<.001);
    const nozzles=aircraftExhaustLayout(type,box,model.userData.jetExhausts);assert.equal(nozzles.length,2);
    assert.ok(nozzles.every(p=>Number.isFinite(p.x)&&p.x<0&&Math.abs(p.z)<size.z/2));
    const entry={model};syncOpenAssetLOD(entry,'far');assert.equal(model.getObjectByName('airframe_near').visible,false);assert.equal(model.getObjectByName('airframe_far').visible,true);
    syncOpenAssetLOD(entry,'near');assert.equal(model.getObjectByName('airframe_far').visible,false);
    const clone=model.clone();let first;model.traverse(m=>{if(m.isMesh&&!first)first=m;});assert.equal(clone.getObjectByName(first.name).geometry,first.geometry);
  }
  const old=models.get('bomber');installFreeAircraft(models,new Map());assert.equal(models.get('bomber'),old);
  assert.equal(equipmentModel('nato','navalFighter'),'navalFighter_nato');
  assert.equal(equipmentModel('china','navalFighter'),'navalFighter_china');
  assert.equal(equipmentModel('nato','navalFighter',true),'fighter');
});

test('两种免费舰载机的24架停机简模不越界、不重叠，保留后掠和折翼轮廓且最多三批',()=>{
  const models=new Map();installFreeAircraft(models,assets);
  for(const name of ['navalFighter_nato','navalStrike_nato']){
    const source=models.get(`parked_${name}`),local=new THREE.Box3().setFromObject(source),boxes=[];
    let meshes=0;source.traverse(m=>{if(m.isMesh)meshes++;});assert.ok(meshes<=3);assert.ok(report[name].parkedTriangles<850);
    assert.ok(local.max.x-local.min.x>1.8&&local.max.x-local.min.x<1.9);
    for(let i=0;i<24;i++){
      const pose=carrierDeckPose(i),model=source.clone();
      for(const x of [local.min.x,local.max.x])for(const z of [local.min.z,local.max.z]){
        assert.ok(onCarrierDeck(pose.x+Math.cos(pose.yaw)*x+Math.sin(pose.yaw)*z,pose.z-Math.sin(pose.yaw)*x+Math.cos(pose.yaw)*z),`${name}机位${i}越界`);
      }
      model.position.set(pose.x,0,pose.z);model.rotation.y=pose.yaw;const box=new THREE.Box3().setFromObject(model);
      for(const previous of boxes)assert.equal(box.intersectsBox(previous),false,`${name}机位${i}重叠`);boxes.push(box);
    }
  }
});
