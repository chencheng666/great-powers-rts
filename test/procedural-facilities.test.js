import { createFrontlineWarehouse, createFrontlinePiers } from '../src/frontline-presentation.js';
import { Game } from '../src/game.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createProceduralAirfield } from '../src/procedural-facilities.js';
import { createHarbor } from '../src/community-visuals.js';
import { groundAirfieldPavement } from '../src/airfield-presentation.js';
import { airfieldParking, onAirfieldPavement } from '../src/airfield-rules.js';
test('程序机场有两座拱形机库和塔台，六个真实机位在铺装上，模板几何不受贴地修改',()=>{
 const model=createProceduralAirfield();assert.deepEqual(model.userData.airfieldLayout,{hangars:2,towers:1,parking:6});let tris=0,calls=0;
 model.traverse(m=>{if(!m.isMesh)return;calls++;tris+=(m.geometry.index?.count??m.geometry.attributes.position.count)/3;assert.ok(m.geometry.attributes.position.array.every(Number.isFinite));assert.ok(m.geometry.attributes.normal.array.every(Number.isFinite));});assert.ok(tris<10500);assert.ok(calls<=12);assert(model.getObjectByName('facility_radar'));assert.equal(model.getObjectByName('facility_radar').children.length,1);
 const home={x:1000,y:1000,size:128,owner:0},scale=home.size/7.2;
 for(let i=0;i<6;i++){const p=airfieldParking(home,i);assert.equal(onAirfieldPavement((p.x-home.x)/scale,(p.y-home.y)/scale),true);}
 const clone=model.clone(),source=model.getObjectByName('固定翼跑道').children[0].geometry,original=source.attributes.position.array.slice();groundAirfieldPavement(clone,home,(x,z)=>Math.sin(x*.01)*2+Math.cos(z*.01));assert.deepEqual(source.attributes.position.array,original);
});
test('程序港机保留三座双轨桁架和24个集装箱，预算有界且重复生成一致',()=>{
 const a=createHarbor(),b=createHarbor();assert.equal(a.userData.harborLayout.trussGantry,true);assert.equal(a.userData.harborLayout.cranes,3);assert.equal(a.userData.harborLayout.containers,24);let tris=0;
 a.children.forEach((m,i)=>{tris+=(m.geometry.index?.count??m.geometry.attributes.position.count)/3;assert.deepEqual(m.geometry.attributes.position.array,b.children[i].geometry.attributes.position.array)});assert.ok(tris<6000);assert.equal(a.children.length,8);
});

test('前线仓库与三条六泊位突堤保持程序几何预算，六方港口朝向外海接近点',()=>{
 const warehouse=createFrontlineWarehouse();let triangles=0;warehouse.traverse(m=>{if(m.isMesh)triangles+=(m.geometry.index?.count??m.geometry.attributes.position.count)/3;});assert(triangles<2500);
 const g=new Game('china','russia',{}, {mapId:'snowtosea'});
 for(const home of g.buildings.filter(b=>b.type==='dock')){
   const resources=[],piers=createFrontlinePiers(g,home,r=>{resources.push(r);return r;});assert.equal(piers.children.length,3);
   piers.traverse(m=>{if(m.isMesh){assert(m.geometry.attributes.position.array.every(Number.isFinite));assert((m.geometry.index?.count??m.geometry.attributes.position.count)/3<700);}});
   const angle=g.frontlineHarborAngle(home),approach=g.map.harbors[home.owner].approach;assert(Math.cos(angle)*(approach.x-home.x)+Math.sin(angle)*(approach.y-home.y)>0);
   resources.forEach(r=>r.dispose());
 }
});
