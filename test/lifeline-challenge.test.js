import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { CHALLENGES } from '../src/challenges.js';
import { LIFELINE, harborPlan, lifelineSummary } from '../src/maritime-logistics.js';
import { completedChallengeResult, applyChallengeResult, emptyChallengeProfile } from '../src/challenge-profile.js';
import { battleReportHTML } from '../src/battle-report.js';
import { lifelinePanelHTML } from '../src/lifeline-ui.js';
import * as THREE from 'three';
import { createHarbor } from '../src/community-visuals.js';
import { weatherMaterial } from '../src/visual-assets.js';
import { surfaceMaps } from '../src/model-craft.js';
import { sceneryClearance } from '../src/site-presentation.js';

const create = () => new Game('china','asia',{}, { challengeId:'lifeline' });
const run = (g,seconds) => { for(let i=0;i<Math.ceil(seconds*20)&&g.running;i++)g.update(.05); };

test('深蓝复用无桥海战和两座合法接收港，旧四关不开放运输，非单机不进入脚本',()=>{
  const g=create();assert.equal(g.mapId,'archipelago');assert.equal(g.map.bridges.length,0);assert.equal(g.ownedBuildings(0,'dock').length,2);
  assert.equal(g.nuclearEnabled,false);assert.equal(g.challenge.targetId,g.ownedBuildings(0,'hq')[0].id);
  assert.equal(g.queueUnit(0,'frigate'),false);assert.equal(g.startBuild(0,'dock'),false);
  run(g,4);assert.equal(g.activeUnits(0,'containerShip').length,1);assert.equal(g.activeUnits(1,'containerShip').length,0);
  const old=new Game('china','asia',{}, {challengeId:'beachhead'});run(old,15);assert.equal(old.activeUnits(0,'containerShip').length,0);
  assert.equal(new Game('china','asia',{}, {challengeId:'lifeline',multiplayer:true}).challenge,undefined);
});

test('派船暂停只影响后续批次，航路只应用下一班，改港不传送或重置补发额度',()=>{
  const g=create();run(g,4);const ship=g.activeUnits(0,'containerShip')[0],before={x:ship.x,y:ship.y},c=g.logistics[0].seaControl;
  assert.equal(g.configureFreight(1,{paused:true}),false);assert.equal(g.configureFreight(0,{lane:'unknown'}),false);
  assert.equal(g.configureFreight(0,{lane:'direct'}),true);assert.equal(ship.freight.lane,'coastal');
  assert.equal(g.configureFreight(0,{paused:true}),true);assert.equal(g.launchFreight(0,true),null);
  assert.equal(g.configureFreight(0,{homeId:g.ownedBuildings(0,'dock')[1].id}),true);
  assert.deepEqual({x:ship.x,y:ship.y},before);assert.equal(c.dispatched,1);
  assert.equal(g.configureFreight(0,{paused:false}),true);assert.equal(g.launchFreight(0,true).freight.lane,'direct');
  g.paused=true;assert.equal(g.configureFreight(0,{paused:true}),false);
});

test('货船抵港才结算，空载返航与重复调用不能重领，同批状态能存取',()=>{
  const g=create();run(g,4);const ship=g.activeUnits(0,'containerShip')[0],initial=g.players[0].credits;
  assert.equal(g.logistics[0].delivered,0);assert.equal(ship.freight.batch,1);assert.equal(ship.freight.lane,'coastal');
  const copy=Game.fromSave(g.toSave());assert.deepEqual(copy.units.find(u=>u.id===ship.id).freight,ship.freight);
  run(g,30);assert.ok(g.logistics[0].seaControl.receipts.includes(1));assert.ok(g.players[0].credits>=initial+900);
  const credits=g.players[0].credits;g.updateFreight(ship,10);assert.equal(g.players[0].credits,credits);
  assert.equal(ship.freight.value,0);assert.equal(ship.freight.phase,'outbound');
  assert.deepEqual(Game.fromSave(g.toSave()).logistics,g.logistics);
});

test('首船被击沉可补发，最多五批，超过损失预算明确失败而非无限刷船',()=>{
  const g=create();run(g,4);const ship=g.activeUnits(0,'containerShip')[0];g.damage(ship,ship.maxHp*2,1);
  g.checkVictory();assert.equal(g.running,true);assert.deepEqual(g.logistics[0].seaControl.lostBatches,[1]);
  assert.equal(Game.fromSave(g.toSave()).logistics[0].seaControl.lostBatches[0],1);
  for(let n=0;n<2;n++){const next=g.launchFreight(0,true);g.damage(next,next.maxHp*2,1);}
  g.checkVictory();assert.equal(g.winner,1);assert.match(g.challenge.reason,/补发额度/);
  const h=create();for(let i=0;i<LIFELINE.batches;i++)assert.ok(h.launchFreight(0,true));assert.equal(h.launchFreight(0,true),null);
});

test('接收港损毁后真实改派友港，断电或受袭停卸，两个港全毁明确失败',()=>{
  const g=create();run(g,4);const ship=g.activeUnits(0,'containerShip')[0],home=g.getEntity(ship.freight.homeId),position={x:ship.x,y:ship.y};
  g.damage(home,home.maxHp*2,1);g.updateFreight(ship,.05);assert.notEqual(ship.freight.homeId,home.id);assert.ok(Math.hypot(ship.x-position.x,ship.y-position.y)<10);
  const other=g.getEntity(ship.freight.homeId);Object.assign(ship,g.navalGoal(other.x,other.y,100));ship.freight.leg=3;ship.lastMovedAt=-10;
  const power=g.ownedBuildings(0,'power')[0];power.hp=0;g.recalculatePower();const before=g.players[0].credits;g.updateFreight(ship,.05);
  assert.equal(ship.freight.blockedReason,'power');assert.equal(g.players[0].credits,before);
  power.hp=power.maxHp;g.recalculatePower();other.lastDamageAt=g.time;g.updateFreight(ship,.05);assert.equal(ship.freight.blockedReason,'combat');
  g.damage(other,other.maxHp*2,1);g.checkVictory();assert.equal(g.winner,1);assert.match(g.challenge.reason,/接收港全部损失/);
});

test('零资金可有限恢复，不能负数或通过改港重置；空运不计海运任务',()=>{
  const g=create(),c=g.logistics[0].seaControl;g.players[0].credits=0;
  for(let i=0;i<20;i++)g.updateLogistics(.05);assert.ok(Math.abs(g.players[0].credits-2)<1e-8);
  c.recoverySpent=LIFELINE.reserve;g.updateLogistics(.05);assert.ok(Math.abs(g.players[0].credits-2)<1e-8);
  g.logistics[0].delivered=180;assert.equal(lifelineSummary(g).delivered,0);
  g.configureFreight(0,{homeId:g.ownedBuildings(0,'dock')[1].id});assert.equal(c.recoverySpent,LIFELINE.reserve);
});

test('每港只有两个维修泊位，后船外海等候不扣钱，撤销任务及时释放',()=>{
  const g=create(),home=g.ownedBuildings(0,'dock')[0];
  const ships=['destroyer','frigate','submarine'].map((type,i)=>g.addUnit(0,type,1800,600+i*180));
  ships.forEach(u=>{u.hp-=100;g.requestResupply(u,home);});
  assert.equal(harborPlan(g,ships[0],home).waiting,false);assert.equal(harborPlan(g,ships[1],home).waiting,false);assert.equal(harborPlan(g,ships[2],home).waiting,true);
  const waiting=ships[2],initial=g.players[0].credits;Object.assign(waiting,harborPlan(g,waiting,home));g.updateGroundRearm(waiting,.05);
  assert.equal(waiting.hp,waiting.maxHp-100);assert.equal(g.players[0].credits,initial);
  ships[0].order=null;assert.equal(harborPlan(g,waiting,home).waiting,false);
  Object.assign(waiting,harborPlan(g,waiting,home));g.serviceShip(waiting,1,home);assert.ok(waiting.hp>waiting.maxHp-100);
  assert.ok(g.battleStats.sides[0].portRepairCost>0);
});

test('拒绝重复批号、重复回执、虚假航道与补发数量，旧普通存档不被新规则破坏',()=>{
  const g=create();run(g,4);const save=g.toSave();
  for(const change of [s=>s.state.logistics[0].seaControl.dispatched=6,s=>s.state.logistics[0].seaControl.receipts=[1,1],s=>s.state.logistics[0].seaControl.recoverySpent=-1,s=>s.state.logistics[0].seaControl.lane='bad',s=>s.state.units.find(u=>u.freight).freight.leg=4,s=>{const u=structuredClone(s.state.units.find(u=>u.freight));u.id+=10000;s.state.units.push(u);}]){
    const bad=structuredClone(save);change(bad);assert.throws(()=>Game.fromSave(bad));
  }
  const old=new Game('china','asia');assert.equal(Game.fromSave(old.toSave()).challenge,undefined);
  for(const value of [0,899]){const bad=structuredClone(save);bad.state.units.find(u=>u.freight).freight.value=value;assert.throws(()=>Game.fromSave(bad));}
});

test('深蓝正常模拟从开局抵港至胜利，不改任务值或金钱；结算可录入档案和复盘',()=>{
  const g=create();run(g,400);assert.equal(g.winner,0);assert.ok(g.time>=CHALLENGES.lifeline.earliestWin);assert.equal(lifelineSummary(g).delivered,2700);
  const result=completedChallengeResult(g);assert.equal(applyChallengeResult(emptyChallengeProfile(),result).status,'recorded');
  assert.match(battleReportHTML(g),/深蓝生命线 · 任务完成/);assert.match(battleReportHTML(g),/港口维修支出/);
});

test('航运面板使用当前真实状态和标准控件，不暴露敌方信息',()=>{
  const g=create(),html=lifelinePanelHTML(g,()=>'',true);
  assert.match(html,/data-freight="lane"/);assert.match(html,/data-freight="homeId"/);assert.match(html,/type="checkbox"/);assert.match(html,/0 \/ 2700/);
  assert.match(html,/来袭波次/);
  assert.ok(!html.includes('敌方货船'));
});

test('排队次序随存档恢复，缺钱或断电不扣弹，维修港被毁不会永久占原泊位',()=>{
  const g=create(),home=g.ownedBuildings(0,'dock')[0];
  const ships=['destroyer','frigate','submarine'].map((type,i)=>g.addUnit(0,type,1800,500+i*200));
  ships.forEach(u=>{u.ammo=0;g.requestResupply(u,home);});
  const copy=Game.fromSave(g.toSave()),last=copy.getEntity(ships[2].id);assert.equal(harborPlan(copy,last,copy.getEntity(home.id)).position,1);
  const first=ships[0];Object.assign(first,harborPlan(g,first,home));g.players[0].credits=0;g.updateGroundRearm(first,1);assert.equal(first.ammo,0);assert.equal(g.players[0].credits,0);
  const power=g.ownedBuildings(0,'power')[0];power.hp=0;g.recalculatePower();g.players[0].credits=100;g.updateGroundRearm(first,1);assert.equal(first.ammo,0);
  g.damage(home,home.maxHp*2,1);g.updateGroundRearm(first,.05);assert.equal(first.order.homeId,g.ownedBuildings(0,'dock')[0].id);
});

test('港口表面和货箱共享细节贴图，合批数量受限，不污染原材质',()=>{
  const harbor=createHarbor(weatherMaterial);let meshes=0,triangles=0;
  harbor.traverse(m=>{if(m.isMesh){meshes++;triangles+=(m.geometry.index?.count||m.geometry.attributes.position.count)/3;assert.ok(m.geometry.attributes.uv);}});
  assert.ok(meshes<=8);assert.ok(triangles<6000);
  const source=new THREE.MeshStandardMaterial({name:'货箱蓝灰涂层',color:'#335566'}),a=weatherMaterial(source,'naval'),b=weatherMaterial(source,'naval');
  assert.equal(source.map,null);assert.equal(a.map,b.map);assert.equal(a.normalMap,surfaceMaps('coating').normalMap);assert.ok(a.roughness>.7);
});

test('港口长码头清除完整沿岸轮廓内装饰，镜像与易主后朝向一致，不清除远处石头',()=>{
  const west={type:'dock',x:950,y:900,size:92,hp:800,owner:0},rock={x:1100,z:1020,scale:16};
  assert.equal(sceneryClearance(rock,[west],[],false,3520),true);
  assert.equal(sceneryClearance(rock,[{...west,owner:1}],[],false,3520),true);
  assert.equal(sceneryClearance({...rock,x:2420},[{...west,x:2570,owner:1}],[],false,3520),true);
  assert.equal(sceneryClearance({...rock,x:700},[west],[],false,3520),false);
  assert.equal(sceneryClearance(rock,[{...west,hp:0}],[],false,3520),false);
});
