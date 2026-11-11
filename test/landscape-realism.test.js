import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { landscapeNoise,landscapeMaterials,coastDistance,coastalField } from '../src/terrain-materials.js';
import { ridgeHeight,ridgeGLSL } from '../src/theater-scenery.js';
import { oceanWavePose } from '../src/ocean-motion.js';
import { VolumetricSmoke } from '../src/volumetric-smoke.js';

const water={x1:400,y1:0,x2:800,y2:1000},map={water,world:{width:1200,height:1000}};
test('材质数组四层独立、纹理缓存复用，法线/粗糙度/遮蔽打包有界',()=>{
  const a=landscapeMaterials();assert.equal(landscapeMaterials(),a);assert.equal(a.bytes,2097152);
  for(const t of [a.albedo,a.surface]){assert.equal(t.image.depth,4);assert.equal(t.image.width,256);assert.ok(t.image.data.every(Number.isFinite));assert.equal(t.generateMipmaps,true);}
  const data=a.albedo.image.data,span=256*256*4;
  for(let n=0;n<4;n++){const p=data.subarray(n*span,(n+1)*span);assert.ok(new Set(p).size>50);assert.ok(p.every((v,i)=>i%4!==3||v===255));}
  assert.notDeepEqual(data.subarray(0,span),data.subarray(span,span*2));
});
test('地表周期噪声边界一致，山体连续接地、峰谷分明且不超出射线求交高度',()=>{
  for(const p of [[-.2,3.7],[0,0],[7.8,1.2]]){assert.ok(Math.abs(landscapeNoise(...p,8)-landscapeNoise(p[0]+8,p[1],8))<1e-10);}
  const map={ridges:[{x1:100,y1:200,x2:900,y2:800}]};let low=400,high=0;
  for(let y=200;y<=800;y+=20)for(let x=100;x<=900;x+=20){const h=ridgeHeight(map,x,y);assert.ok(Number.isFinite(h)&&h>=8&&h<300);low=Math.min(low,h);high=Math.max(high,h);if([100,900].includes(x)||[200,800].includes(y))assert.ok(Math.abs(h-8)<1e-5);}
  assert.ok(high-low>150);assert.equal(ridgeHeight(map,50,600),null);assert.ok(ridgeGLSL(map).includes('geoNoise'));
});
test('海岸距离与水域几何对应，深度场分辨率有界且按地图缓存',()=>{
  assert.equal(coastDistance(map,600,500),-200);assert.equal(coastDistance(map,350,500),50);assert.equal(coastDistance(map,900,500),100);
  const islands={islands:[{points:[[0,0],[100,0],[100,100],[0,100]]}]};assert.equal(coastDistance(islands,50,50),50);assert.equal(coastDistance(islands,150,50),-50);
  const field=coastalField({map,world:map.world});assert.equal(coastalField({map,world:map.world}),field);assert.ok(field.bytes<700000);
  const {data,width,height}=field.texture.image;const pixel=(x,z)=>data[(Math.floor(z/1000*height)*width+Math.floor(x/1200*width))*4];assert.ok(pixel(350,500)>127&&pixel(600,500)<127);
});
test('岸边波幅平滑归零，外海船体起伏与海面同源，倾角与位移保持安全',()=>{
  for(let t=0;t<30;t+=.23){assert.deepEqual(oceanWavePose(200,300,t,0),{height:0,pitch:0,roll:0});const p=oceanWavePose(200,300,t,500);assert.ok(Math.abs(p.height)<2.15&&Math.abs(p.pitch)<.06&&Math.abs(p.roll)<.06);const edge=oceanWavePose(200,300,t,.01);assert.ok(Math.abs(edge.height)<1e-5);}
  assert.notEqual(oceanWavePose(200,300,1).height,oceanWavePose(200,300,2).height);
});
test('体积烟雾固定容量与一次绘制，迷雾隐藏和来源熄烟不泄露，过期后清空',()=>{
  const scene=new THREE.Scene(),field=new VolumetricSmoke(scene,{capacity:12});
  for(let i=0;i<30;i++)field.emit({x:i,y:5,z:2,start:0,source:i%2?{id:i}:null});
  assert.equal(field.particles.length,12);assert.equal(field.update(.5,{visible:()=>false}),0);
  assert.equal(field.update(.6,{sourceAlive:()=>false,high:true}),6);assert.equal(field.mesh.geometry.instanceCount,6);assert.equal(field.material.uniforms.smokeSteps.value,5);
  assert.ok(field.center.array.every(Number.isFinite));assert.equal(field.update(10),0);assert.equal(field.particles.length,0);
  field.burst(10,20,5,50,10,9);assert.equal(field.update(10.3)>0,true);assert.equal(scene.children.length,1);
  field.dispose();assert.equal(scene.children.length,0);
});

test('岩体连续曲面与三平面材质预算受控，模型保持接地',async()=>{
  const{createRockLandform,createRockMaterial}=await import('../src/rock-landforms.js');
  for(let n=0;n<2;n++){const g=createRockLandform(n);assert.ok(g.attributes.position.array.every(Number.isFinite));assert.ok(g.attributes.normal.array.every(Number.isFinite));assert.ok(g.boundingBox.min.y>=0);assert.ok(g.index.count/3<1000);assert.ok(createRockMaterial().isMeshStandardMaterial);}
});
test('车辆悬挂在平地稳定、随坡面俯仰横滚，低帧率和刹车仍有界',async()=>{
  const{vehicleSuspension,criticalSpring}=await import('../src/vehicle-suspension.js');
  const state={};let p;
  for(let i=0;i<180;i++)p=vehicleSuspension(state,{x:0,z:0,heading:0,speed:0,dt:1/60,ground:(x,z)=>x*.12+z*.08});
  assert.ok(Math.abs(p.pitch-Math.atan(.12))<.002);assert.ok(Math.abs(p.roll+Math.atan(.08))<.002);
  for(let i=0;i<200;i++)p=vehicleSuspension(state,{x:i,z:0,heading:0,speed:i%2,dt:i%3?.016:1,ground:()=>0});
  assert.ok(Math.abs(p.pitch)<.08&&Math.abs(p.roll)<.01&&Math.abs(p.lift)<.01);
  assert.deepEqual(criticalSpring(1,2,0,12,0),{position:1,velocity:2});
});

test('阵营标记合批保留敌我区别、缩放与迷雾状态，原选择对象不变',async()=>{
  const{IdentityBatches}=await import('../src/identity-batches.js');const scene=new THREE.Scene(),batcher=new IdentityBatches(scene),material=new THREE.LineBasicMaterial(),geometry=new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,1,0,1],3));
  const entries=Array.from({length:180},(_,id)=>{const identity=new THREE.Group();identity.position.set(id*3,2,id);identity.scale.set(7,1,8);identity.add(new THREE.LineSegments(geometry,material));scene.add(identity);return{entity:{id,kind:'unit'},identity};}),ids=new Set(entries.map(e=>e.entity.id));
  batcher.update(entries,ids);assert.deepEqual(batcher.stats,{sources:180,batches:1});const batch=[...batcher.batches.values()][0];assert.equal(batch.mesh.geometry.instanceCount,180);assert.equal(batch.position.getX(17),51);assert.equal(batch.scale.getY(17),8);assert.equal(entries[0].identity.visible,true);assert.equal(entries[0].identity.children[0].layers.mask,2);
  entries[0].identity.visible=false;ids.delete(1);batcher.update(entries,ids);assert.equal(batch.mesh.geometry.instanceCount,178);batcher.update([],ids);assert.equal(batch.mesh.visible,false);
  batcher.dispose();assert.equal(entries[1].identity.children[0].layers.mask,1);assert.equal(entries[1].identity.children[0].geometry,geometry);
});

test('连续尾烟连接真实弹体位置，瞬移不拉线，固定预算并随迷雾和寿命清理',async()=>{
  const{BallisticTrails}=await import('../src/ballistic-trails.js');const scene=new THREE.Scene(),trails=new BallisticTrails(scene,{capacity:10});
  for(let n=0;n<25;n++)trails.sample(7,{x:n*3,y:n*2,z:0},n*.03);
  assert.equal(trails.segments.length,10);assert.equal(trails.update(.73,{active:new Set([7])}),10);
  assert.equal(trails.mesh.geometry.instanceCount,10);assert.equal(trails.from.array.every(Number.isFinite),true);
  trails.sample(7,{x:900,y:200,z:0},.75);assert.equal(trails.segments.length,10);
  assert.equal(trails.update(.8,{active:new Set([7]),visible:()=>false}),0);
  trails.update(5);assert.equal(trails.segments.length,0);assert.equal(trails.previous.size,0);trails.dispose();assert.equal(scene.children.length,0);
});
test('体积烟雾保留预定发射，烟尘与黑烟分色，修复来源后不会持续冒烟',()=>{
  const field=new VolumetricSmoke(new THREE.Scene(),{capacity:8}),source={id:1};
  field.emit({x:0,y:1,z:0,start:2,color:[.4,.3,.2]});field.emit({x:0,y:1,z:0,start:0,source});
  assert.equal(field.update(1,{sourceAlive:()=>false}),0);assert.equal(field.particles.length,1);
  assert.equal(field.update(2.2),1);assert.ok(Math.abs(field.color.getX(0)-.4)<1e-6);field.dispose();
});

test('战场早反射为有界短脉冲，双声道不同，月表关闭混响且不触碰音乐总线',async()=>{
  const{terrainImpulse,BattleReverb}=await import('../src/battle-reverb.js');const a=terrainImpulse(8000);assert.equal(a.length,2);assert.equal(a[0].length,3840);assert.ok(a[0].every(Number.isFinite));assert.notDeepEqual(a[0],a[1]);assert.ok(a[0].every(v=>Math.abs(v)<.4));
  const nodes=[],gain=()=>({value:0,setTargetAtTime(v){this.value=v;}}),node=()=>{const n={gain:gain(),links:[],connect(to){this.links.push(to);},disconnect(){this.disconnected=true;}};nodes.push(n);return n;},ctx={sampleRate:8000,currentTime:0,createGain:node,createConvolver:node,createBuffer(_,n){const c=[new Float32Array(n),new Float32Array(n)];return{getChannelData:i=>c[i]};}},bus={};
  const r=new BattleReverb(ctx,bus);assert.equal(r.dry.links[0],bus);assert.equal(r.wet.links[0],bus);r.setTerrain({future:true});assert.equal(r.wet.gain.value,0);r.setTerrain({industrial:true});assert.equal(r.wet.gain.value,.12);r.dispose();assert.ok(nodes.every(n=>n.disconnected));
});

test('退出战场释放共享贴图、阴影与实例缓冲，每项只释放一次且仍可复用JS源对象',async()=>{
  const{releaseBattleResources}=await import('../src/battle-resource-release.js');const scene=new THREE.Scene(),texture=new THREE.Texture(),geometry=new THREE.BoxGeometry(),material=new THREE.MeshStandardMaterial({map:texture,normalMap:texture}),a=new THREE.InstancedMesh(geometry,material,2),b=new THREE.Mesh(geometry,material),sun=new THREE.DirectionalLight();
  const calls={g:0,m:0,t:0,i:0};geometry.addEventListener('dispose',()=>calls.g++);material.addEventListener('dispose',()=>calls.m++);texture.addEventListener('dispose',()=>calls.t++);a.addEventListener('dispose',()=>calls.i++);scene.add(a,b,sun);
  assert.deepEqual(releaseBattleResources(scene),{geometries:1,materials:1,textures:1,instances:1,shadows:1});assert.deepEqual(calls,{g:1,m:1,t:1,i:1});assert.equal(geometry.attributes.position.count,24);assert.equal(material.map,texture);
});

test('触屏窗口重排沿用三维像素上限，文字叠加层保持高分屏清晰度',async()=>{
  const{Renderer}=await import('../src/render.js'),priorDpr=Object.getOwnPropertyDescriptor(globalThis,'devicePixelRatio'),priorDoc=Object.getOwnPropertyDescriptor(globalThis,'document');let ratio;
  Object.defineProperty(globalThis,'devicePixelRatio',{value:2,configurable:true});Object.defineProperty(globalThis,'document',{value:{},configurable:true});
  const r={mobileBudget:true,quality:'high',adaptiveRender:{scale:.8},canvas:{isConnected:true,parentElement:{},getBoundingClientRect:()=>({width:844,height:390})},webgl:{setPixelRatio(v){ratio=v;},setSize(){}},overlayCanvas:{},overlay:{setTransform(){}},clampCamera(){},updateCamera(){}};
  try{Renderer.prototype.resize.call(r);assert.ok(Math.abs(ratio-1.2)<1e-6);assert.equal(r.overlayCanvas.width,1688);assert.equal(r.overlayCanvas.height,780);}finally{for(const[key,prior]of[['devicePixelRatio',priorDpr],['document',priorDoc]])if(prior)Object.defineProperty(globalThis,key,prior);else delete globalThis[key];}
});
