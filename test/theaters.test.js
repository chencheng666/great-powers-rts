import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { UNITS, MAPS } from '../src/data.js';
import { THEATER_CHALLENGES as DEFINITIONS, THEATER_RULES } from '../src/theater-data.js';
import { theaterFacilities, theaterNetwork, theaterFreightReady, updateTheater, updateTheaterEngineer, theaterServiceSites } from '../src/theater-operations.js';
import { theaterPanelHTML } from '../src/theater-ui.js';
import { ridgeHeight, ridgeGLSL } from '../src/theater-scenery.js';
import { validateBattleStats } from '../src/battle-report.js';
import { freightApproach } from '../src/maritime-logistics.js';
import { unitRadius } from '../src/unit-spacing.js';

const create=id=>new Game('china','asia',{}, {challengeId:id});
const run=(g,seconds)=>{for(let i=0;i<seconds*20&&g.running;i++)g.update(.05);};
const restoreNodes=g=>{for(const {entity:e} of theaterFacilities(g)){e.owner=0;e.hp=e.maxHp;}g.recalculatePower();};

for(const id of Object.keys(DEFINITIONS))test(`${id}：独立战区开局位置合法，存档往返且任务目标可识别`,()=>{
  const g=create(id),d=DEFINITIONS[id];
  assert.equal(g.mapId,d.mapId);assert.equal(g.battlefieldScale,1);assert.equal(g.nuclearEnabled,false);
  assert.ok(MAPS[d.mapId].missionOnly);
  for(const u of g.units.filter(u=>!u.embarkedIn))assert.ok(g.canOccupyUnit(u,u),`${u.type} 初始位置被阻挡`);
  for(const {entity:e}of theaterFacilities(g))assert.equal(g.isGroundBlocked(e.x,e.y,10),false);
  assert.equal(g.hasPower(0),true);run(g,.1);
  assert.deepEqual(Game.fromSave(g.toSave()).challenge,g.challenge);
  assert.ok(validateBattleStats(g.battleStats,g.time));
  if(d.operation)assert.ok(theaterPanelHTML(g,()=>'' ).includes(d.name));
});

test('工程师接管、付费修复、毁坏遗址重建，不能在敌军争夺时工作',()=>{
  const g=create('ironworks'),b=theaterFacilities(g)[0].entity,u=g.ownedUnits(0,'engineer')[0];
  u.x=b.x-50;u.y=b.y;u.order={type:'capture',targetId:b.id,x:b.x,y:b.y,progress:0};
  const money=g.players[0].credits,enemy=g.addUnit(1,'rifle',b.x+80,b.y);
  for(let i=0;i<140;i++)updateTheaterEngineer(g,u,b,.05);
  assert.equal(b.owner,1);assert.equal(g.players[0].credits,money);
  enemy.hp=0;
  for(let i=0;i<400&&u.order;i++)updateTheaterEngineer(g,u,b,.05);
  assert.equal(b.owner,0);assert.ok(b.hp>.9*b.maxHp);assert.ok(g.players[0].credits<money);assert.ok(u.hp>0);
  b.hp=0;g.update(.05);assert.equal(g.getEntity(b.id),b);
  u.order={type:'capture',targetId:b.id,x:b.x,y:b.y,progress:0};updateTheaterEngineer(g,u,b,.05);assert.ok(b.hp>0);
  assert.deepEqual(Game.fromSave(g.toSave()).challenge,g.challenge);
});

test('工业交付受电站、货场、完好度和争夺约束，修复及易主不刷新上限',()=>{
  const g=create('ironworks');restoreNodes(g);const s=g.challenge.operation;
  updateTheater(g,1);assert.equal(s.value,36);
  const power=theaterFacilities(g)[0].entity;power.hp=0;g.recalculatePower();updateTheater(g,1);assert.equal(s.value,36);
  power.hp=power.maxHp;g.recalculatePower();
  const factory=theaterFacilities(g)[2].entity,enemy=g.addUnit(1,'rifle',factory.x+80,factory.y);
  updateTheater(g,1);assert.equal(s.value,54);enemy.hp=0;
  for(let i=0;i<200;i++)updateTheater(g,1);
  assert.equal(s.produced[2],THEATER_RULES.industryCap);assert.equal(s.produced[3],THEATER_RULES.industryCap);
  const total=s.value;factory.owner=1;updateTheater(g,1);factory.owner=0;updateTheater(g,1);assert.equal(s.value,total);
});

test('海峡前哨恢复前不发海运，链路中断暂停卸货，接收后开放整备',()=>{
  const g=create('seabreach');assert.equal(theaterFreightReady(g),false);assert.equal(g.launchFreight(0,true),null);
  restoreNodes(g);assert.equal(theaterFreightReady(g),true);assert.equal(theaterServiceSites(g,0).length,0);
  const ship=g.launchFreight(0,true);assert.ok(ship);
  g.logistics[0].seaControl.receipts.push(1);g.logistics[0].delivered=900;
  assert.equal(theaterServiceSites(g,0).length,1);
  theaterFacilities(g)[0].entity.hp=0;assert.equal(theaterFreightReady(g),false);assert.equal(theaterServiceSites(g,0).length,0);
});

test('归航真实乘员自动登舰，安全出口结算一次，手动命令不能控制保护目标',()=>{
  const g=create('homebound'),d=DEFINITIONS.homebound,s=g.challenge.operation,ship=g.activeUnits(0,'landing')[0],batch=s.evacuation[0];
  ship.x=2580;ship.y=1900;ship.order=null;
  for(let i=0;i<121;i++)updateTheater(g,.05);
  assert.equal(batch.status,'aboard');assert.deepEqual(ship.passengers,batch.ids);
  const person=g.getEntity(batch.ids[0]);assert.equal(person.embarkedIn,ship.id);
  ship.x=d.objective.x;ship.y=d.objective.y;
  for(let i=0;i<101;i++)updateTheater(g,.05);
  assert.equal(batch.status,'saved');assert.equal(s.value,3);assert.equal(ship.passengers.length,0);
  for(let i=0;i<200;i++)updateTheater(g,.05);
  assert.equal(s.value,3);assert.equal(g.battleStats.sides[0].evacuated,3);assert.equal(g.battleStats.sides[0].losses,0);
  const waiting=g.getEntity(s.evacuation[1].ids[0]);g.selected=[waiting.id];g.command(500,600);assert.equal(waiting.order,null);
});

test('月海采集实物到账，电网、矿物和储能都必须满足，低电仍可恢复',()=>{
  const g=create('moonsea'),s=g.challenge.operation;restoreNodes(g);assert.ok(theaterNetwork(g).connected.every(Boolean));
  updateTheater(g,.05);assert.equal(s.hold,0);
  const miner=g.ownedUnits(0,'harvester')[0],home=g.ownedBuildings(0,'refinery')[0];
  miner.x=home.x+55;miner.y=home.y;miner.cargo=210;miner.cargoValue=210;miner.harvestState='return';
  g.updateHarvester(miner,.05);assert.equal(s.mined,210);g.updateHarvester(miner,.05);assert.equal(s.mined,210);
  s.energy=0;assert.equal(theaterNetwork(g).powered,false);updateTheater(g,1);assert.ok(s.energy>0);
  s.mined=1800;s.energy=180;updateTheater(g,1);assert.equal(s.hold,1);
  theaterFacilities(g)[1].entity.hp=0;updateTheater(g,1);assert.equal(s.hold,0);
});

test('非整除帧长达到月海驻守上限后，任务存档仍可恢复',()=>{
  const g=create('moonsea');run(g,31);restoreNodes(g);
  const s=g.challenge.operation;s.mined=1800;s.energy=180;s.hold=29.99;
  const result=updateTheater(g,.04);
  assert.equal(result.win,true);assert.equal(s.hold,30);
  assert.equal(Game.fromSave(g.toSave()).challenge.operation.hold,30);
});

test('海峡阶段随前哨中断回退，恢复后重新驻守且不会复制货运',()=>{
  const g=create('seabreach');restoreNodes(g);
  g.logistics[0].seaControl.receipts=[1,2];g.logistics[0].delivered=1800;
  const d=DEFINITIONS.seabreach;g.addUnit(0,'rifle',d.objective.x,d.objective.y);
  updateTheater(g,1);assert.equal(g.challenge.operation.phase,2);assert.equal(g.challenge.operation.hold,1);
  const b=theaterFacilities(g)[0].entity;b.hp=0;g.recalculatePower();updateTheater(g,1);
  assert.equal(g.challenge.operation.phase,0);assert.equal(g.challenge.operation.hold,0);
  b.hp=b.maxHp;g.recalculatePower();updateTheater(g,1);
  assert.equal(g.challenge.operation.phase,2);assert.equal(g.challenge.operation.hold,1);
  assert.deepEqual(g.logistics[0].seaControl.receipts,[1,2]);
});

test('归航失去两批乘员明确失败，不能通过击毁敌军绕过撤离',()=>{
  const g=create('homebound'),s=g.challenge.operation;
  assert.equal(updateTheater(g,.05),null);
  for(const batch of s.evacuation.slice(0,2))g.getEntity(batch.ids[0]).hp=0;
  const result=updateTheater(g,.05);
  assert.equal(result.win,false);assert.equal(s.value,0);
  assert.equal(s.evacuation.filter(b=>b.status==='lost').length,2);
});

test('任务存档拒绝重复设施、虚假资源、伪造乘员和核开关，仍保留遗址',()=>{
  for(const id of ['ironworks','homebound','moonsea']){
    const save=create(id).toSave();
    for(const mutate of [s=>s.state.challenge.operation.facilities[0]=-1,s=>s.state.challenge.operation.energy=301,s=>s.state.challenge.operation.value=NaN,s=>s.config.nuclearEnabled=true]){
      const copy=structuredClone(save);mutate(copy);assert.throws(()=>Game.fromSave(copy));
    }
  }
  const save=create('homebound').toSave();save.state.challenge.operation.evacuation[0].status='saved';assert.throws(()=>Game.fromSave(save));
});

test('山口高度与阻挡一致，主通道保持开放，寒境存在南北两条路线',()=>{
  for(const id of ['passwatch','farshore']){
    const g=create(id),r=g.map.ridges[0],x=(r.x1+r.x2)/2,y=(r.y1+r.y2)/2;
    assert.ok(ridgeHeight(g.map,x,y)>140);assert.ok(g.isGroundBlocked(x,y,14));assert.ok(ridgeGLSL(g.map).includes('165.0'));
    const paths=id==='passwatch'?[[1700,760],[1700,1830]]:[[1770,1010],[1770,2280]];
    for(const [px,py]of paths){assert.equal(ridgeHeight(g.map,px,py),null);assert.equal(g.isGroundBlocked(px,py,14),false);}
  }
});

test('同一登陆舰可连续接运三批，已撤离批次释放船位，不重复计数',()=>{
  const g=create('homebound'),ship=g.activeUnits(0,'landing')[0];
  g.units=g.units.filter(u=>u.type!=='landing'||u===ship);
  for(let batch=0;batch<3;batch++){
    ship.x=2580;ship.y=1900;ship.order=null;
    for(let i=0;i<121;i++)updateTheater(g,.05);
    assert.equal(ship.passengers.length,3);
    ship.x=DEFINITIONS.homebound.objective.x;ship.y=DEFINITIONS.homebound.objective.y;
    for(let i=0;i<101;i++)updateTheater(g,.05);
    assert.equal(ship.passengers.length,0);assert.equal(g.challenge.operation.value,(batch+1)*3);
    assert.equal(g.challenge.operation.evacuation[batch].shipId,null);
  }
});

test('独立海峡地图的登陆卸载队列持续执行，重新航行会取消',()=>{
  const g=create('seabreach'),ship=g.activeUnits(0,'landing')[0];
  ship.x=2542;ship.y=1900;ship.order=null;
  g.unloadTransport(ship);assert.equal(ship.unloadQueue,true);
  for(let i=0;i<140;i++){g.time+=.05;g.updateLandingUnload(ship);}
  assert.equal(ship.passengers.length,0);assert.equal(ship.unloadQueue,false);
  for(const u of g.activeUnits(0).filter(u=>['tank','rifle','engineer','supply'].includes(u.type)))assert.ok(g.canOccupyUnit(u,u));
  ship.unloadQueue=true;ship.order={type:'move',x:2100,y:1800};g.updateLandingUnload(ship);assert.equal(ship.unloadQueue,false);
});

test('列岛侧翼机场只增援一次，断电不服务，旧存档保留原规则',()=>{
  const g=create('islandwatch'),nodes=theaterFacilities(g),airport=nodes[0].entity;
  assert.equal(nodes.length,2);assert.equal(g.aircraftServiceSites({owner:0,type:'fighter'}).length,0);
  airport.owner=0;airport.hp=airport.maxHp;g.getEntity('island-power').owner=0;g.recalculatePower();
  updateTheater(g,.05);assert.equal(g.ownedUnits(0,'fighter').length,1);
  updateTheater(g,.05);assert.equal(g.ownedUnits(0,'fighter').length,1);
  assert.ok(g.aircraftServiceSites({owner:0,type:'fighter'}).some(b=>b.id===airport.id));
  for(const b of g.ownedBuildings(0,'power'))b.hp=0;g.getEntity('island-power').owner=null;g.recalculatePower();
  assert.equal(g.aircraftServiceSites({owner:0,type:'fighter'}).length,0);
  const old=create('islandwatch').toSave();
  const ids=old.state.challenge.operation.facilities;delete old.state.challenge.operation;
  old.state.buildings=old.state.buildings.filter(b=>!ids.includes(b.id));
  assert.equal(Game.fromSave(old).challenge.operation,undefined);
});

test('货船能识别碰撞距离内的水面阻挡，空闲卸货泊点避开护航舰',()=>{
  const g=create('deepblue');g.units=[];
  const ship=g.addUnit(0,'containerShip',2632,1087),enemy=g.addUnit(1,'frigate',2578,958);
  enemy.order={type:'rearm'};g.updateFog();assert.equal(g.canSeeEntity(0,enemy),true);
  for(let i=0;i<600;i++){
    g.time+=.05;if(i%10===0)g.updateFog();g.moveUnitNow(ship,{x:4820,y:1700},.05,18);
    assert.ok(g.canOccupyUnit(ship,ship));
    assert.ok(Math.hypot(ship.x-enemy.x,ship.y-enemy.y)>unitRadius(ship)+unitRadius(enemy)-1);
  }
  assert.ok(ship.x>3500,'货船应脱离岸边阻挡并继续返航');
  const coast=create('seabreach');restoreNodes(coast);
  const cargo=coast.launchFreight(0,true),home=coast.getEntity(cargo.freight.homeId);
  coast.addUnit(0,'destroyer',2300,2190);
  const point=freightApproach(coast,cargo,home);
  assert.ok(point);assert.ok(Math.hypot(point.x-2300,point.y-2190)>150);
  assert.equal(coast.isNavalBlocked(point.x,point.y,unitRadius(cargo)),false);
});
