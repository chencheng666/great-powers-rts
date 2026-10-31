import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Game } from '../src/game.js';
import { MAPS, UNITS } from '../src/data.js';
import { resourceLayout, battlefieldMap } from '../src/battlefield-expansion.js';
import { catalogEntry } from '../src/catalog-data.js';
import { equipmentModel, equipmentProfile } from '../src/equipment.js';
import { createStrategicModel, STRATEGIC_MODELS } from '../src/strategic-models.js';
import { projectileFlightPose } from '../src/projectile-flight.js';
import { unitLayer } from '../src/unit-spacing.js';
import { battleView } from '../server/battle-view.mjs';
import { aiCounterUnit } from '../src/tactical-ai.js';
import { OnlineGame } from '../src/online-game.js';
import { executeCommand } from '../server/commands.mjs';

const setup=()=>{const g=new Game('china','nato',{}, {mapId:'strategic',victoryMode:'annihilation',multiplayer:true});g.units=[];return g;};
const reveal=g=>{for(const f of g.fogs){f.visible.fill(true);f.explored.fill(true);}};
const tech=(g,side=0)=>{for(const t of ['radar','lab','airfield','armory'])g.addBuilding(side,t,side?5900:500,1800);for(let i=0;i<5;i++)g.addBuilding(side,'power',side?5800:600,2400+i*100);g.recalculatePower();};

test('战略图固定尺寸、资源和开局公平，不受旧纵深倍数二次放大',()=>{
  const g=new Game('china','china',{}, {mapId:'strategic',battlefieldScale:1.5});
  assert.equal(g.battlefieldScale,1);assert.equal(g.world.width,6400);assert.equal(g.world.height,4160);
  assert.equal(battlefieldMap('strategic',1.5),MAPS.strategic);assert.equal(g.ore.length,0);
  assert.equal(g.resourceSites.length,10);assert.equal(g.oil.length,4);assert.equal(g.beacons.length,3);
  for(const a of [...g.oil,...resourceLayout(g.map)])assert.ok([...g.oil,...g.resourceSites].some(b=>a.id!==b.id&&b.x===6400-a.x&&b.y===a.y));
  for(const a of g.resourceSites)assert.equal(g.isGroundBlocked(a.x,a.y,30),false);
  for(const a of g.ownedBuildings(0))assert.ok(g.ownedBuildings(1).some(b=>a.type===b.type&&b.x===6400-a.x&&b.y===4160-a.y));
  const loaded=Game.fromSave(g.toSave());assert.deepEqual(loaded.resourceSites,g.resourceSites);assert.equal(loaded.world.width,6400);
});

test('现代装备有真实原型边界、独立模型和完整图鉴，常规装备跨图可用而实验单位仍独立',()=>{
  assert.equal(equipmentModel('nato','fighter'),'fighter_nato');assert.match(equipmentProfile('china','ballistic').name,/东风-26/);
  assert.match(equipmentProfile('nato','helicopter').name,/阿帕奇/);assert.match(equipmentProfile('china','swarmCarrier').category,/公开原型/);
  for(const type of ['ballistic','abm','counterIntel','helicopter','swarmCarrier','swarmScout','swarmDecoy']) {
    const entry=catalogEntry('unit',type,'china','strategic');assert.ok(entry.tactics.length&&entry.attention.length);assert.ok(entry.model);
    assert.equal(catalogEntry('unit',type,'china','valley').availability.available,['ballistic','abm','helicopter'].includes(type));
  }
});

test('任务母机包括排队只允许一架，临时子机不可独立生产',()=>{
  const g=setup();tech(g);g.players[0].credits=10000;
  assert.equal(g.queueUnit(0,'swarmScout'),false);assert.equal(g.queueUnit(0,'swarmDecoy'),false);
  assert.equal(g.queueUnit(0,'swarmCarrier'),true);assert.equal(g.queueUnit(0,'swarmCarrier'),false);
  g.ownedBuildings(0,'airfield')[0].queue=[];g.addUnit(0,'swarmCarrier',900,2000);assert.equal(g.queueUnit(0,'swarmCarrier'),false);
  assert.equal(new Game('china','china').queueUnit(0,'ballistic'),false);
});

test('弹道武器需要真实视野和展开，不追踪且可通过机动规避，不攻击空中目标',()=>{
  const g=setup(),u=g.addUnit(0,'ballistic',1800,2080),v=g.addUnit(1,'tank',2800,2080);u.fireTimer=0;
  g.fogs[0].visible.fill(false);g.updateUnit(u,.05);assert.equal(g.projectiles.length,0);
  reveal(g);for(let i=0;i<102;i++)g.updateUnit(u,.05);
  assert.equal(g.projectiles.length,1);assert.equal(u.ammo,1);const p=g.projectiles[0];assert.equal(p.kind,'ballistic');
  v.y+=350;for(let i=0;i<180;i++){g.time+=.05;g.updateProjectiles(.05);}assert.equal(v.hp,v.maxHp);assert.equal(p.toY,2080);
  const jet=g.addUnit(1,'fighter',2600,2080);assert.equal(g.canAttack(u,jet),false);
  assert.ok(projectileFlightPose({...p,x:(p.startX+p.toX)/2,y:(p.startY+p.toY)/2}).height>400);
});

test('专用反导消耗弹药且依赖雷达供电；普通防空和干扰无法拦截常规弹道弹',()=>{
  const g=setup();tech(g,1);reveal(g);
  const source=g.addUnit(0,'ballistic',1600,2080),target=g.addUnit(1,'tank',2600,2080),abm=g.addUnit(1,'abm',2300,2130);
  const aa=g.addUnit(1,'aa',2300,2030),jammer=g.addUnit(1,'jammer',2300,2080);aa.fireTimer=abm.fireTimer=0;
  g.launchProjectile(source,target,230,'ballistic');
  for(let i=0;i<180;i++){g.time+=.05;abm.fireTimer-=.05;g.updateProjectiles(.05);}
  assert.equal(target.hp,target.maxHp);assert.equal(abm.ammo,2);assert.equal(aa.ammo,UNITS.aa.ammo);assert.equal(g.projectiles.length,0);
  assert.equal(g.canAttack(abm,target),false);assert.ok(jammer.hp>0);
  for(const b of g.ownedBuildings(1,'radar'))b.hp=0;
  abm.fireTimer=0;g.launchProjectile(source,target,230,'ballistic');
  for(let i=0;i<180;i++){g.time+=.05;abm.fireTimer-=.05;g.updateProjectiles(.05);}
  assert.ok(target.hp<target.maxHp);assert.equal(abm.ammo,2);
});

test('反侦察只遮蔽卫星，近距侦察仍揭露，移动和断电失效且网络视图不泄漏单位',()=>{
  const g=setup();tech(g,1);g.time=10;
  const shield=g.addUnit(1,'counterIntel',3200,2080),target=g.addUnit(1,'tank',3240,2080);shield.lastMovedAt=0;
  g.players[0].satelliteUntil=30;g.updateFog();assert.equal(g.canSeeEntity(0,target),false);assert.equal(g.hasExploredFor(0,target.x,target.y),true);
  assert.equal(battleView(g,0).units.some(u=>u.id===target.id),false);
  const scout=g.addUnit(0,'scout',3020,2080);g.updateFog();assert.equal(g.canSeeEntity(0,target),true);
  scout.hp=0;shield.lastMovedAt=10;g.updateFog();assert.equal(g.canSeeEntity(0,target),true);
  shield.lastMovedAt=0;for(const p of g.ownedBuildings(1,'power'))p.hp=0;g.recalculatePower();g.updateFog();assert.equal(g.canSeeEntity(0,target),true);
});

test('异构蜂群必须接到攻击移动、发现目标并花任务舱，子机限时有上限且可保存恢复',()=>{
  const g=setup();reveal(g);const mother=g.addUnit(0,'swarmCarrier',1800,2080);g.addUnit(1,'tank',2350,2080);mother.fireTimer=0;
  g.updateUnit(mother,.05);assert.equal(g.units.length,2);
  mother.order={type:'attackMove',x:2400,y:2080};g.fogs[0].visible.fill(false);g.updateUnit(mother,.05);assert.equal(mother.ammo,2);
  reveal(g);g.updateUnit(mother,.05);assert.equal(mother.ammo,1);assert.equal(g.units.filter(u=>u.swarmParentId===mother.id).length,3);
  mother.fireTimer=0;g.updateUnit(mother,.05);assert.equal(mother.ammo,0);assert.equal(g.units.filter(u=>u.swarmParentId===mother.id).length,6);
  const copy=Game.fromSave(g.toSave());assert.equal(copy.units.filter(u=>u.swarmParentId===mother.id).length,6);
  const child=g.units.find(u=>u.type==='swarmScout');assert.equal(g.serviceReady(child),false);
  g.time=25;g.updateUnit(child,.05);assert.equal(child.hp,0);
});

test('直升机有独立空中层和反装甲职责，防空能打、坦克和激光不能对空打直升机',()=>{
  const g=setup(),h=g.addUnit(0,'helicopter',1800,2080),tank=g.addUnit(1,'tank',2000,2080),aa=g.addUnit(1,'aa',2000,2100),laser=g.addUnit(1,'laser',2000,2130),fighter=g.addUnit(1,'fighter',2000,2180);
  assert.equal(unitLayer(h),'rotorcraft');assert.equal(g.canAttack(h,tank),true);assert.equal(g.canAttack(h,fighter),false);
  assert.equal(g.canAttack(tank,h),false);assert.equal(g.canAttack(aa,h),true);assert.equal(g.canAttack(laser,h),false);assert.equal(g.canAttack(fighter,h),true);
  assert.ok(g.unitDamage(h,tank)>UNITS.helicopter.damage);
  g.addBuilding(0,'airfield',h.x,h.y);h.order=null;assert.equal(g.aircraftGrounded(h),true);assert.equal(g.canAttack(tank,h),true);
});

test('母机右键可见敌人进入任务状态，未侦察目标不会通过右键透视启动',()=>{
  const g=setup(),mother=g.addUnit(0,'swarmCarrier',1800,2080),target=g.addUnit(1,'tank',2250,2080);
  g.selected=[mother.id];g.fogs[0].visible.fill(false);g.command(target.x,target.y);assert.equal(mother.order.type,'move');
  reveal(g);g.command(target.x,target.y);assert.equal(mother.order.type,'attackMove');mother.fireTimer=0;g.updateUnit(mother,.05);assert.equal(mother.ammo,1);
});

test('蜂群容量不足不扣任务舱，临时子机受干扰且不能靠机场回血或补弹',()=>{
  const g=setup();reveal(g);const mother=g.addUnit(0,'swarmCarrier',1800,2080);g.addUnit(1,'tank',2250,2080);
  mother.order={type:'attackMove',x:2400,y:2080};mother.fireTimer=0;g.unitCapacityUsed=()=>119;
  g.updateUnit(mother,.05);assert.equal(mother.ammo,2);g.unitCapacityUsed=()=>2;g.updateUnit(mother,.05);
  const child=g.units.find(u=>u.type==='drone');g.addBuilding(0,'airfield',child.x,child.y);child.hp=30;child.ammo=1;g.players[0].credits=10000;
  g.serviceAircraft(child,10);g.refillStationAmmo(child,10);assert.equal(child.hp,30);assert.equal(child.ammo,1);
  g.addUnit(1,'jammer',child.x+40,child.y);g.updateElectronicWarfare(.05);assert.ok(child.jammedUntil>g.time);
});

test('新装备几何有效、材质有层次、合批开销有界，直升机有独立主尾旋翼',()=>{
  for(const type of STRATEGIC_MODELS) {
    const model=createStrategicModel(type),bounds=new THREE.Box3().setFromObject(model);let triangles=0,meshes=0;const materials=new Set();
    model.traverse(m=>{if(m.isMesh){meshes++;materials.add(m.material.name);const p=m.geometry.attributes.position;triangles+=(m.geometry.index?.count||p.count)/3;assert.ok([...p.array].every(Number.isFinite));}});
    assert.ok(bounds.max.x>bounds.min.x&&bounds.max.y>bounds.min.y&&bounds.max.z>bounds.min.z,type);
    assert.ok(meshes<=20,`${type} ${meshes}`);assert.ok(triangles<24000,`${type} ${triangles}`);assert.ok(materials.size>=3,type);
    if(type==='helicopter'){assert.ok(model.getObjectByName('rotor_0_main'));assert.equal(model.getObjectByName('rotor_1_tail').userData.rotationAxis,'z');}
  }
});

test('AI 反导配兵只根据已侦察发射车，不透视敌军，敌方蜂群来源编号不外泄',()=>{
  const g=setup();tech(g,1);const launcher=g.addUnit(0,'ballistic',1800,2080);g.fogs[1].visible.fill(false);
  assert.equal(aiCounterUnit(g,1,['abm']),null);reveal(g);assert.equal(aiCounterUnit(g,1,['abm']),'abm');
  const child=g.addUnit(0,'swarmDecoy',2000,2080,true);child.swarmParentId=launcher.id;assert.equal(battleView(g,1).units.find(u=>u.id===child.id).swarmParentId,undefined);
});

test('战略图双席位快照保持固定尺寸，新装备使用服务端生产和指令校验',()=>{
  const g=setup();tech(g,0);tech(g,1);reveal(g);const packets=[];
  const mother=g.addUnit(1,'swarmCarrier',2800,2080),enemy=g.addUnit(0,'tank',2400,2080);
  const payload=()=>({seat:1,config:{mapId:'strategic',battleId:g.battleId,victoryMode:'annihilation',battlefieldScale:1},view:battleView(g,1)});
  const client=new OnlineGame(payload(),{}, {send:p=>{packets.push(p);return true;}});
  assert.equal(client.world.width,6400);assert.equal(client.battlefieldScale,1);assert.equal(client.players[0].faction,'nato');
  assert.equal(client.getEntity(mother.id).owner,0);client.queueUnit(0,'helicopter');assert.equal(packets[0].unitType,'helicopter');
  assert.equal(executeCommand(g,0,{action:'move',selected:[mother.id],x:enemy.x,y:enemy.y}),false);
  assert.equal(executeCommand(g,1,{action:'move',selected:[mother.id],x:enemy.x,y:enemy.y}),true);assert.equal(mother.order.type,'attackMove');
  mother.fireTimer=0;
  g.updateUnit(mother,.05);client.apply(payload());assert.equal(client.units.filter(u=>u.swarmParentId===mother.id).length,3);
  assert.equal(client.projectiles.length,g.projectiles.length);assert.throws(()=>client.toSave());
});
