import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { AdaptiveRender } from '../src/adaptive-render.js';
import { PROCEDURAL_AIRCRAFT, createProceduralAircraft, createProceduralParkedAircraft } from '../src/procedural-aircraft.js';
import { aircraftExhaustLayout } from '../src/aircraft-appearance.js';
import { syncOpenAssetLOD } from '../src/open-assets.js';
import { carrierDeckPose, onCarrierDeck } from '../src/carrier-deck.js';
import { proceduralTreeGeometry } from '../src/battle-surfaces.js';
import { AIRCRAFT_LENGTHS, unitModelScale } from '../src/model-scale.js';

const models=new Map(Object.keys(PROCEDURAL_AIRCRAFT).map(name=>[name,createProceduralAircraft(name)]));
test('现代程序飞机曲面有限且近远景互斥，保留既定兵种比例并限制材质与面数',()=>{
  for(const [name,root]of models){
    const size=new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
    const type=name.startsWith('navalFighter')?'navalFighter':name.startsWith('navalStrike')?'navalStrike':name.startsWith('ewPlane')?'ewPlane':'bomber';
    assert.ok(Math.abs(unitModelScale(type,size,1)*size.x-AIRCRAFT_LENGTHS[type])<.001,name);
    const counts={};
    for(const level of ['near','far']){
      const part=root.getObjectByName(`airframe_${level}`);let calls=0,triangles=0;
      part.traverse(mesh=>{if(!mesh.isMesh)return;calls++;triangles+=(mesh.geometry.index?.count??mesh.geometry.attributes.position.count)/3;
        assert.ok(mesh.geometry.attributes.position.array.every(Number.isFinite));
        assert.ok(mesh.geometry.attributes.normal.array.every(Number.isFinite));
        assert.equal(mesh.geometry.attributes.uv.count,mesh.geometry.attributes.position.count);
      });
      counts[level]=triangles;assert.ok(calls<=4);assert.ok(triangles<(level==='near'?2800:1100),name);
    }
    assert.ok(counts.far<counts.near*.6,name);
    syncOpenAssetLOD({model:root},'far');assert.equal(root.getObjectByName('airframe_near').visible,false);assert.equal(root.getObjectByName('airframe_far').visible,true);
    syncOpenAssetLOD({model:root},'near');assert.equal(root.getObjectByName('airframe_far').visible,false);
  }
});

test('单发、双发喷口位置与飞翼无加力焰分开处理',()=>{
  for(const[name,root]of models){
    const box=new THREE.Box3().setFromObject(root),layout=aircraftExhaustLayout('fighter',box,root.userData.jetExhausts);
    assert.equal(layout.length,name==='bomber'?0:name==='navalFighter_nato'?1:2,name);
    assert.ok(layout.every(p=>p.x<0&&p.y>=box.min.y&&p.y<=box.max.y));
  }
});

test('四款现代折翼停机模型的24机位均不越界、不重叠且最多三批',()=>{
  for(const name of Object.keys(PROCEDURAL_AIRCRAFT).filter(n=>n.startsWith('naval'))){
    const source=createProceduralParkedAircraft(name),local=new THREE.Box3().setFromObject(source),boxes=[];let calls=0;
    source.traverse(m=>{if(m.isMesh)calls++;});assert.ok(calls<=3);assert.ok(Math.abs(local.max.x-local.min.x-1.85)<.001);assert.ok(Math.abs(local.min.y)<.001);
    for(let i=0;i<24;i++){
      const pose=carrierDeckPose(i),model=source.clone();
      for(const x of [local.min.x,local.max.x])for(const z of [local.min.z,local.max.z]){
        assert.ok(onCarrierDeck(pose.x+Math.cos(pose.yaw)*x+Math.sin(pose.yaw)*z,pose.z-Math.sin(pose.yaw)*x+Math.cos(pose.yaw)*z),`${name}机位${i}越界`);
      }
      model.position.set(pose.x,0,pose.z);model.rotation.y=pose.yaw;const bounds=new THREE.Box3().setFromObject(model);
      for(const b of boxes)assert.equal(bounds.intersectsBox(b),false,`${name}机位${i}重叠`);boxes.push(bounds);
    }
  }
});

test('实例树冠保留顶点颜色、正常法线、接地树干，单树两批且预算有界',()=>{
  for(let variant=0;variant<4;variant++){
    const root=proceduralTreeGeometry(variant);assert.equal(root.children.length,2);
    const canopy=root.children[1],color=canopy.geometry.attributes.color;assert.equal(color.count,canopy.geometry.attributes.position.count);
    assert.ok(color.array.every(v=>Number.isFinite(v)&&v>.5&&v<=1.2));
    for(const mesh of root.children){assert.ok(mesh.geometry.attributes.normal.array.every(Number.isFinite));assert.ok((mesh.geometry.index?.count??mesh.geometry.attributes.position.count)/3<1600);}
    const box=new THREE.Box3().setFromObject(root);assert.ok(box.min.y>=0&&box.max.y<1.5);
  }
});

function runFrames(control,from,frames,delta,options){let time=from;for(let i=0;i<frames;i++){time+=delta;control.update(time,options);}return time;}
test('动态分辨率只在连续慢帧后降档，稳定后缓慢恢复且不越界',()=>{
  const control=new AdaptiveRender();let t=runFrames(control,0,120,16.7);assert.equal(control.scale,1);
  t=runFrames(control,t,12,40);assert.equal(control.scale,1,'短暂卡顿不立刻模糊');
  t=runFrames(control,t,100,40);assert.ok(control.scale<1&&control.scale>=.65);const low=control.scale;
  t=runFrames(control,t,180,16.7);assert.equal(control.scale,low,'不能刚变流畅就来回跳档');
  t=runFrames(control,t,2000,16.7);assert.ok(control.scale>low&&control.scale<=1);
  runFrames(control,t,5000,45);assert.ok(control.scale>=.65);
});
test('暂停、切后台和长间隔不污染负载采样，重置后不计恢复间隔',()=>{
  const control=new AdaptiveRender();let t=runFrames(control,0,100,16.7),samples=control.samples;
  t=runFrames(control,t,100,50,{hidden:true});t=runFrames(control,t,100,50,{paused:true});t=runFrames(control,t,10,1000);
  assert.equal(control.samples,samples);assert.equal(control.scale,1);
  control.reset();control.update(t+10000);assert.equal(control.samples,samples);assert.equal(control.scale,1);
});

test('高级画面初始化失败时释放部分资源并恢复基础渲染状态',async()=>{
  const {Renderer}=await import('../src/render.js');let disposed=0,target;
  const renderer={scene:{overrideMaterial:{}},webgl:{autoClear:false,setRenderTarget(value){target=value;}},composer:{passes:[{dispose(){disposed++;}}],dispose(){disposed++;}},preparePostprocessing:Renderer.prototype.preparePostprocessing,createPostprocessing(){throw new Error('模拟设备不支持高级目标');}};
  const warn=console.warn;console.warn=()=>{};
  try{renderer.preparePostprocessing();}finally{console.warn=warn;}
  assert.equal(disposed,2);assert.equal(renderer.postprocessingFailed,true);assert.equal(renderer.composer,null);assert.equal(renderer.ambientPass,null);assert.equal(renderer.scene.overrideMaterial,null);assert.equal(renderer.webgl.autoClear,true);assert.equal(target,null);
});
