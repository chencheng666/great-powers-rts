import test from 'node:test';import assert from 'node:assert/strict';import * as THREE from 'three';
import {createCarrierDeck,CARRIER_DECK_OUTLINE,CARRIER_PARKING,carrierDeckPose,onCarrierDeck} from '../src/carrier-deck.js';
import {replacedNavalPart,refineNavalHull} from '../src/naval-presentation.js';
test('航母甲板保留总长和接地高度，斜角外伸、舰艏收窄，几何与绘制预算有界',()=>{
 const deck=createCarrierDeck(),bounds=new THREE.Box3().setFromObject(deck);assert.ok(Math.abs(bounds.max.x-bounds.min.x-24)<.08);assert.ok(bounds.max.y<1.36&&bounds.max.y>=1.3);
 assert.ok(Math.min(...CARRIER_DECK_OUTLINE.map(p=>p[1]))<-3.8);assert.ok(onCarrierDeck(0,-3.2));assert.equal(onCarrierDeck(11.8,-3.2),false);
 let meshes=0,vertices=0;deck.traverse(m=>{if(m.isMesh){meshes++;vertices+=m.geometry.attributes.position.count;for(const n of m.geometry.attributes.position.array)assert.ok(Number.isFinite(n));}});assert.ok(meshes<=8);assert.ok(vertices<12000);
 assert.ok(replacedNavalPart('carrier','斜角飞行甲板.004'));assert.equal(replacedNavalPart('carrier','隐身舰岛'),false);assert.equal(replacedNavalPart('destroyer','斜角飞行甲板'),false);
});
test('三个停机位与逐机滑行通道落在甲板内，避开舰岛并保留原队列终点',()=>{
 for(let i=0;i<3;i++){
  const[x,z]=CARRIER_PARKING[i];assert.ok(onCarrierDeck(x,z));assert.ok(x+1.1< -2.5||x-1.1>1.8,'停机位侵入舰岛');
  for(const phase of ['in','out'])for(let n=0;n<=100;n++){const p=carrierDeckPose(i,{phase,progress:n/100});assert.ok(onCarrierDeck(p.x,p.z));assert.ok(!(p.x> -2.5&&p.x<1.8&&p.z>.7),'滑行穿过舰岛');}
  assert.deepEqual(carrierDeckPose(i,{phase:'out',progress:1}),{x:4,z:0,yaw:0});
 }
});

test('原舰岛统一到右舷，重复整理不重复生成甲板或二次镜像',()=>{
 const model=new THREE.Group(),island=new THREE.Mesh(new THREE.BoxGeometry(4.2,3,1.2),new THREE.MeshBasicMaterial());island.name='隐身舰岛';island.position.set(-.35,2.5,-1.5);model.add(island);refineNavalHull(model,'carrier');model.updateMatrixWorld(true);
 const box=new THREE.Box3().setFromObject(island);assert.ok(box.min.z>.8);assert.ok(model.getObjectByName('carrier_flight_deck'));
 const count=model.children.length;refineNavalHull(model,'carrier');assert.equal(model.children.length,count);model.updateMatrixWorld(true);assert.ok(new THREE.Box3().setFromObject(island).min.z>.8);
});
