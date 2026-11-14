import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createProceduralAirfield } from '../src/procedural-facilities.js';
import { createHarbor } from '../src/community-visuals.js';
import { groundAirfieldPavement } from '../src/airfield-presentation.js';
import { airfieldParking, onAirfieldPavement } from '../src/airfield-rules.js';
test('程序机场有两座拱形机库和塔台，六个真实机位在铺装上，模板几何不受贴地修改',()=>{
 const model=createProceduralAirfield();assert.deepEqual(model.userData.airfieldLayout,{hangars:2,towers:1,parking:6});let tris=0,calls=0;
 model.traverse(m=>{if(!m.isMesh)return;calls++;tris+=(m.geometry.index?.count??m.geometry.attributes.position.count)/3;assert.ok(m.geometry.attributes.position.array.every(Number.isFinite));assert.ok(m.geometry.attributes.normal.array.every(Number.isFinite));});assert.ok(tris<10500);assert.ok(calls<=11);
 const home={x:1000,y:1000,size:128,owner:0},scale=home.size/7.2;
 for(let i=0;i<6;i++){const p=airfieldParking(home,i);assert.equal(onAirfieldPavement((p.x-home.x)/scale,(p.y-home.y)/scale),true);}
 const clone=model.clone(),source=model.getObjectByName('固定翼跑道').children[0].geometry,original=source.attributes.position.array.slice();groundAirfieldPavement(clone,home,(x,z)=>Math.sin(x*.01)*2+Math.cos(z*.01));assert.deepEqual(source.attributes.position.array,original);
});
test('程序港机保留三座双轨桁架和24个集装箱，预算有界且重复生成一致',()=>{
 const a=createHarbor(),b=createHarbor();assert.equal(a.userData.harborLayout.trussGantry,true);assert.equal(a.userData.harborLayout.cranes,3);assert.equal(a.userData.harborLayout.containers,24);let tris=0;
 a.children.forEach((m,i)=>{tris+=(m.geometry.index?.count??m.geometry.attributes.position.count)/3;assert.deepEqual(m.geometry.attributes.position.array,b.children[i].geometry.attributes.position.array)});assert.ok(tris<6000);assert.equal(a.children.length,8);
});
