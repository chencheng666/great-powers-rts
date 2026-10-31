import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Game } from '../src/game.js';
import { UNITS } from '../src/data.js';
import { DETERRENCE as R } from '../src/deterrence-rules.js';
import { validateSave } from '../src/savegame.js';
import { battleView } from '../server/battle-view.mjs';
import { executeCommand } from '../server/commands.mjs';
import { createNuclearSilo,animateStrategicEquipment } from '../src/deterrence-models.js';
import { createDeterrenceBlast,animateDeterrenceBlast } from '../src/deterrence-fx.js';
import { createStrategicModel } from '../src/strategic-models.js';

function setup(enabled=true) {
  const g=new Game('nato','nato',{}, {mapId:'strategic',nuclearEnabled:enabled,multiplayer:true,victoryMode:'annihilation'});g.units=[];
  for(const side of [0,1]) {
    for(const type of ['lab','radar','nuclearSilo'])g.addBuilding(side,type,side?5500:900,1800);
    for(let i=0;i<6;i++)g.addBuilding(side,'power',side?5400:1000,2200+i*100);
    g.players[side].credits=12000;g.players[side].nuclearCharge=R.charge;
  }
  g.recalculatePower();for(const f of g.fogs){f.visible.fill(true);f.explored.fill(true);}return g;
}
function tick(g,seconds) {
  for(let i=0;i<Math.round(seconds*20);i++) {
    g.time+=.05;g.updateDeterrence(.05);for(const u of g.units)u.fireTimer-=.05;g.updateProjectiles(.05);
  }
}

test('核威慑默认关闭、排除科幻图，关闭时不可建井、发射或从普通指令绕过',()=>{
  const old=new Game('china','nato'),wrong=new Game('china','nato',{}, {nuclearEnabled:true,mapId:'meridian'}),g=setup(false);
  assert.equal(old.nuclearEnabled,false);assert.equal(wrong.nuclearEnabled,false);assert.equal(g.canBuild(0,'nuclearSilo'),false);
  assert.equal(g.canPlace(0,'nuclearSilo',1200,1200),false);assert.equal(g.launchNuclear(3000,1800),false);assert.equal(executeCommand(g,0,{action:'nuclear',x:3000,y:1800}),false);
});

test('准备依赖真实设施与供电，断电暂停充能、毁井清零，多井不加速',()=>{
  const g=setup();g.players[0].nuclearCharge=0;g.updateDeterrence(10);assert.equal(g.players[0].nuclearCharge,10);
  g.addBuilding(0,'nuclearSilo',1200,1800);g.recalculatePower();g.updateDeterrence(10);assert.equal(g.players[0].nuclearCharge,20);
  for(const b of g.ownedBuildings(0,'power'))b.hp=0;g.recalculatePower();g.updateDeterrence(10);assert.equal(g.players[0].nuclearCharge,20);
  for(const b of g.ownedBuildings(0,'nuclearSilo'))b.hp=0;g.updateDeterrence(.05);assert.equal(g.players[0].nuclearCharge,0);
});

test('发射检查侦察、资金、充能和指令锁定，非法坐标、重复排程不扣费',()=>{
  const g=setup(),p=g.players[0],cost=p.credits;
  assert.equal(g.launchNuclear(NaN,1800),false);assert.equal(g.launchNuclear(-1,1800),false);g.fogs[0].visible.fill(false);assert.equal(g.launchNuclear(3000,1800),false);
  g.fogs[0].visible.fill(true);p.credits=R.cost-1;assert.equal(g.launchNuclear(3000,1800),false);p.credits=cost;p.nuclearCharge=R.charge-1;assert.equal(g.launchNuclear(3000,1800),false);
  p.nuclearCharge=R.charge;assert.equal(g.launchNuclear(3000,1800),true);assert.equal(p.credits,cost-R.cost);assert.equal(g.launchNuclear(3500,1800),false);assert.equal(p.credits,cost-R.cost);
});

test('8秒准备期有公开28秒预警，断网或毁源井取消且投入不退款，不消耗实际发射次数',()=>{
  for(const reason of ['power','source']) {
    const g=setup();g.launchNuclear(3000,1800);assert.equal(g.nuclearWarnings()[0].remaining,28);const credits=g.players[0].credits;
    tick(g,2);if(reason==='source')g.getEntity(g.players[0].nuclearPending.sourceId).hp=0;else for(const b of g.ownedBuildings(0,'power'))b.hp=0;
    g.recalculatePower();tick(g,.1);assert.equal(g.players[0].nuclearPending,null);assert.equal(g.projectiles.length,0);assert.equal(g.players[0].credits,credits);assert.equal(g.players[0].nuclearSpent,false);
  }
});

test('实际发射后每方仅一次，源井被毁不凭空删除飞行弹头，固定落区与20秒飞行',()=>{
  const g=setup();g.launchNuclear(3000,1800);tick(g,8.1);const p=g.projectiles.find(p=>p.kind==='nuclear');assert.ok(p);assert.equal(g.players[0].nuclearSpent,true);
  g.getEntity(p.sourceId).hp=0;g.players[0].nuclearCharge=240;assert.equal(g.launchNuclear(4000,1800),false);tick(g,10);assert.ok(g.projectiles.includes(p));assert.equal(p.toX,3000);tick(g,11);assert.equal(g.projectiles.length,0);assert.ok(g.effects.some(e=>e.type==='nuclearBlast'));
});

test('反导只在末段拦截，通常四发消耗完成，不产生落地伤害；普通防空和干扰不能反核',()=>{
  const g=setup(),target=g.addUnit(1,'tank',3000,1800),abm=g.addUnit(1,'abm',2600,1830),aa=g.addUnit(1,'aa',2600,1810);abm.fireTimer=aa.fireTimer=0;
  g.addUnit(1,'jammer',2600,1790);g.launchNuclear(3000,1800);tick(g,18);assert.equal(abm.ammo,4);tick(g,12);
  assert.equal(g.projectiles.length,0);assert.equal(abm.ammo,0);assert.equal(aa.ammo,UNITS.aa.ammo);assert.equal(target.hp,target.maxHp);assert.equal(g.effects.some(e=>e.type==='nuclearBlast'),false);assert.ok(g.effects.some(e=>e.style==='nuclearIntercept'));
});

test('反导断电或缺弹会失守，伤害覆盖敌我、随距离衰减，满血核心保留且无永久污染',()=>{
  const g=setup(),enemy=g.addUnit(1,'tank',3000,1800),ally=g.addUnit(0,'tank',3000,1810),far=g.addUnit(1,'tank',3290,1800),outside=g.addUnit(1,'tank',3350,1800);
  const hq=g.addBuilding(1,'hq',3010,1800),abm=g.addUnit(1,'abm',2600,1830);abm.ammo=0;
  g.launchNuclear(3000,1800);tick(g,29);assert.ok(enemy.hp<=0&&ally.hp<=0);assert.ok(far.hp>0&&far.hp<far.maxHp);assert.equal(outside.hp,outside.maxHp);assert.ok(hq.hp>=hq.maxHp*.55-.01);assert.equal(g.hazards,undefined);
  assert.equal(g.battleStats.sides[0].kills,1);assert.equal(g.battleStats.sides[0].losses,1);
});

test('核警报不泄漏迷雾内单位、经济和生产，双方都收到公开落区及飞行警报',()=>{
  const g=setup(),secret=g.addUnit(0,'tank',1500,1500);g.launchNuclear(3000,1800);g.fogs[1].visible.fill(false);
  const view=battleView(g,1);assert.equal(view.nuclearWarnings.length,1);assert.equal(view.nuclearWarnings[0].owner,1);assert.equal(view.units.some(u=>u.id===secret.id),false);assert.equal(view.players[1].credits,0);assert.equal(view.players[1].nuclearPending,undefined);
  tick(g,8.1);const flight=battleView(g,1).projectiles.find(p=>p.kind==='nuclear');assert.ok(flight);assert.equal(flight.sourceId,null);assert.equal(flight.targetId,null);
});

test('准备与飞行存档恢复不重复扣费、不重复发射，旧存档默认关闭并拒绝损坏字段',()=>{
  const g=setup();g.launchNuclear(3000,1800);tick(g,2);const save=g.toSave(),loaded=Game.fromSave(save);loaded.paused=false;
  assert.equal(loaded.nuclearEnabled,true);assert.equal(loaded.players[0].credits,g.players[0].credits);tick(loaded,7);assert.equal(loaded.projectiles.filter(p=>p.kind==='nuclear').length,1);
  const flight=Game.fromSave(loaded.toSave());flight.paused=false;tick(flight,21);assert.equal(flight.effects.filter(e=>e.type==='nuclearBlast').length,1);
  const old=new Game('china','nato').toSave();delete old.config.nuclearEnabled;delete old.state.pendingNuclear;for(const p of old.state.players){delete p.nuclearCharge;delete p.nuclearSpent;delete p.nuclearPending;}assert.equal(Game.fromSave(old).nuclearEnabled,false);
  for(const mutate of [s=>s.config.nuclearEnabled='true',s=>s.state.players[0].nuclearCharge=241,s=>s.state.players[0].nuclearPending.x=-100]){const s=structuredClone(save);mutate(s);assert.throws(()=>validateSave(s));}
});

test('AI只用公开预警疏散，不透视隐藏目标发射，双方同样受准备条件限制',()=>{
  const g=setup();g.players[1].controlType='ai';const unit=g.addUnit(1,'tank',3000,1800);g.fogs[1].visible.fill(false);
  g.updateDeterrence(.05);assert.equal(g.players[1].nuclearPending,null);g.launchNuclear(3000,1800);g.updateDeterrence(.05);assert.equal(unit.order.type,'move');assert.ok(Math.hypot(unit.order.x-3000,unit.order.y-1800)>R.radius);
});

test('发射井为独立有界三维模型，舱门与举升机构单独运动，原模板不被修改',()=>{
  const silo=createNuclearSilo(),bounds=new THREE.Box3().setFromObject(silo);let count=0;const materials=new Set();
  silo.traverse(m=>{if(m.isMesh){count++;materials.add(m.material.name);assert.ok([...m.geometry.attributes.position.array].every(Number.isFinite));}});assert.ok(count<24);assert.ok(materials.size>=5);assert.ok(bounds.min.y>=-.01);
  const g=setup(),entity=g.ownedBuildings(0,'nuclearSilo')[0],copy=silo.clone();g.players[0].nuclearPending={sourceId:entity.id};animateStrategicEquipment({model:copy},entity,g,.5);assert.ok(copy.getObjectByName('silo_door_left').position.x<0);assert.equal(silo.getObjectByName('silo_door_left').position.x,0);
  const vehicle={model:createStrategicModel('ballistic'),topHeight:30};animateStrategicEquipment(vehicle,{type:'ballistic',deployProgress:5},g,.05);assert.equal(vehicle.model.getObjectByName('strategic_launcher').rotation.z,.8);
});

test('核打击效果几何与透明度有界，不用无限粒子或全屏白闪，也不修改游戏伤害',()=>{
  const group=new THREE.Group();createDeterrenceBlast(group);const effect={age:0,duration:7,size:320};
  for(const age of [0,.5,2,5,7]){effect.age=age;animateDeterrenceBlast(effect,group);group.traverse(o=>{if(o.isMesh){assert.ok([o.position.x,o.position.y,o.position.z,o.scale.x,o.scale.y,o.scale.z].every(Number.isFinite));assert.ok(o.material.opacity>=0&&o.material.opacity<=1);}});}
  assert.equal(group.children.length,20);assert.equal(group.userData.deterrence.smoke.opacity,0);
});
