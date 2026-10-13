import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Game } from '../src/game.js';
import { battleView } from '../server/battle-view.mjs';
import { projectileFlightPose } from '../src/projectile-flight.js';
import { submarinePose } from '../src/naval-presentation.js';
import { createModernAircraft } from '../src/aircraft-models.js';

test('空空导弹平直追踪、空地俯冲、地面发射保留高弧线；职责随存档保存',()=>{
  const g=new Game('china','russia',{}, {multiplayer:true}),a=g.addUnit(0,'fighter',100,500),b=g.addUnit(1,'fighter',500,500),t=g.addUnit(1,'tank',500,600);
  g.launchProjectile(a,b,10,'fighter');g.launchProjectile(a,t,10,'fighter');
  const [aa,ag]=g.projectiles;assert.equal(aa.flightRole,'air-to-air');assert.equal(ag.flightRole,'air-to-ground');
  const p={kind:'missile',startX:0,startY:0,toX:600,toY:0,x:300,y:0,sourceHeight:95,targetHeight:95};
  assert.equal(projectileFlightPose({...p,flightRole:'air-to-air'}).height,101);
  assert.equal(projectileFlightPose({...p,flightRole:'surface'}).height,150);
  assert.ok(projectileFlightPose({...p,flightRole:'air-to-ground',targetHeight:12}).pitch<0);
  assert.equal(Game.fromSave(g.toSave()).projectiles[0].flightRole,'air-to-air');
  const bad=g.toSave();bad.state.projectiles[0].flightRole='未知弹道';assert.throws(()=>Game.fromSave(bad));
});

test('驻留间谍只揭示目标建筑且不泄露队列或附近部队，拆弹后情报结束',()=>{
  const g=new Game('china','russia',{}, {multiplayer:true}),b=g.ownedBuildings(1,'factory')[0],u=g.addUnit(1,'tank',b.x+10,b.y);
  b.sabotage={owner:0,plantedAt:0,detonateAt:45};b.queue=['tank'];g.fogs[0].visible.fill(false);
  assert.equal(g.canSeeEntity(0,b),true);assert.equal(g.canSeeEntity(0,u),false);
  const memory=new Map(),v=battleView(g,0,memory);assert.ok(v.buildings.find(e=>e.id===b.id).sabotage);assert.deepEqual(v.buildings.find(e=>e.id===b.id).queue,[]);assert.ok(!v.units.find(e=>e.id===u.id));
  delete b.sabotage;assert.equal(g.canSeeEntity(0,b),false);assert.equal(battleView(g,0,memory).buildings.find(e=>e.id===b.id).sabotage,undefined);
});

test('多用途任务保留主业优势、自动优先主业、各任务共享弹药；反潜限制不变',()=>{
  const g=new Game('china','russia',{}, {mapId:'ocean',multiplayer:true});g.units=[];g.buildings=[];for(const f of g.fogs)f.visible.fill(true);
  const f=g.addUnit(0,'fighter',1000,900),s=g.addUnit(0,'strike',1000,900),ground=g.addUnit(1,'tank',1100,900),air=g.addUnit(1,'fighter',1180,900),sub=g.addUnit(1,'submarine',1100,950);
  assert.equal(g.closestEnemy(f,275,0),air);assert.equal(g.closestEnemy(s,245,0),ground);
  assert.ok(g.unitDamage(f,ground)<g.unitDamage(f,air)*.4);assert.ok(g.unitDamage(s,air)<g.unitDamage(s,ground)*.4);
  assert.equal(g.canAttack(f,sub),false);assert.equal(g.canAttack(s,sub),false);
  const ammo=f.ammo;f.fireTimer=0;g.updateUnit(f,0);assert.equal(f.ammo,ammo-1);
});

test('六方潜艇可被任何敌方声呐发现，不使用双人索引推算',()=>{
  const g=new Game('china','russia',{}, {mapId:'sixfront',multiplayer:true});g.units=[];
  const sub=g.addUnit(4,'submarine',1500,1500);g.submarineSurfaced=()=>false;
  assert.equal(submarinePose(g,sub).detected,false);const sonar=g.addUnit(2,'destroyer',1520,1500);assert.equal(submarinePose(g,sub).detected,true);
  sonar.hp=0;assert.equal(submarinePose(g,sub).detected,false);
});

test('原创高翼运输机和鸭翼制空机几何有效、材质有区别、合批有界',()=>{
  for(const type of ['fighter_china','freightPlane','airlift']){
    const model=createModernAircraft(type),box=new THREE.Box3().setFromObject(model),size=box.getSize(new THREE.Vector3());let draws=0;
    model.traverse(m=>{if(m.isMesh){draws++;assert.ok([...m.geometry.attributes.position.array].every(Number.isFinite));}});
    assert.ok(draws<=6);assert.ok(size.x>9&&size.z>7&&size.y>1);assert.equal(model.userData.aircraftVersion,1);
  }
});
