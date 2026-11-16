import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Game } from '../src/game.js';
import { UNITS } from '../src/data.js';
import { FUEL, FUEL_SUPPORT, fuelProfile } from '../src/fuel-rules.js';
import { airfieldParking } from '../src/airfield-rules.js';
import { createFuelSupportModel } from '../src/fuel-support-models.js';
import { parseSave } from '../src/savegame.js';

const quiet=(options={})=>{
 const g=new Game('china','russia',{}, {mapId:'snowtosea',victoryMode:'annihilation',...options});
 for(const p of g.players){p.controlType='human';p.credits=10000;}
 for(const r of g.logistics)r.nextAir=r.nextSea=1e9;
 g.units=[];g.closestEnemy=()=>null;return g;
};
const advance=(g,seconds)=>{for(let i=0;i<seconds*20&&g.running;i++)g.update(.05);};
const parked=(g,type='fighter')=>{const home=g.ownedBuildings(0,'airfield')[0],p=airfieldParking(home,0),u=g.addUnit(0,type,p.x,p.y);g.assignReinforcementHome(u,home);u.airfieldOps={homeId:home.id,slot:0,phase:'parked'};return u;};

test('动力只用于新主战区载具；旧存档、科幻电池、步兵、无人机和经济货运不被改写',()=>{
 const g=quiet();assert.equal(g.fuelVersion,1);
 for(const type of ['tank','fighter','patrol','airlift','tanker','supplyShip'])assert.equal(g.addUnit(0,type,2200,1800).fuel,100,type);
 for(const type of ['rifle','engineer','drone','freightPlane','containerShip'])assert.equal(g.addUnit(0,type,2200,1800).fuel,undefined,type);
 const old=quiet({fuelVersion:0}),u=old.addUnit(0,'tank',2200,1800);assert.equal(u.fuel,undefined);assert.equal(Game.fromSave(old.toSave()).fuelVersion,0);assert.equal(old.queueUnit(0,'tanker'),false);
 const moon=new Game('china','asia',{}, {mapId:'meridian'});assert.equal(moon.fuelVersion,0);assert.equal(fuelProfile(moon,moon.units[0]),null);
});

test('按实际路程独立扣油，暂停与地面停驻不耗油，满弹也不能让零油载具移动',()=>{
 const g=quiet(),tank=g.addUnit(0,'tank',2200,1800),plane=g.addUnit(0,'fighter',2200,1800),ship=g.addUnit(0,'patrol',4200,5600);
 for(const u of [tank,plane,ship]){const ammo=u.ammo,hp=u.hp;g.moveUnitNow(u,{x:u.x+200,y:u.y},1,0);assert(u.fuel<100&&u.fuel>95,u.type);assert.equal(u.ammo,ammo);assert.equal(u.hp,hp);}
 const fuel=tank.fuel;tank.order=null;advance(g,1);assert.equal(tank.fuel,fuel);
 g.paused=true;const air=plane.fuel;advance(g,1);assert.equal(plane.fuel,air);g.paused=false;
 for(const u of [tank,ship]){u.fuel=0;const before={x:u.x,y:u.y};g.moveUnitNow(u,{x:u.x+500,y:u.y},1,0);assert.deepEqual({x:u.x,y:u.y},before);assert(u.ammo>0);}
});

test('低油按返程距离提前预警并真实返场，补满后解除返航状态，预警不会逐帧刷屏',()=>{
 const g=quiet(),messages=[];g.events.notice=m=>messages.push(m);const home=g.ownedBuildings(0,'airfield')[0],u=g.addUnit(0,'fighter',home.x+900,home.y+250);u.fuel=29;
 g.update(.05);assert.equal(u.order.type,'rearm');assert.equal(u.fuelReturn,true);assert(messages.some(m=>m.includes('动力不足')));
 advance(g,65);assert(u.hp>0);assert.equal(u.airfieldOps?.phase,'parked');assert(u.fuel>=99.5);assert.equal(u.fuelReturn,undefined);assert.equal(messages.filter(m=>m.includes('动力不足')).length,1);
});

test('机场先付费供油再补弹，断电与缺钱不能免费补油',()=>{
 const g=quiet(),u=parked(g);u.fuel=10;u.ammo=0;g.requestResupply(u);const cash=g.players[0].credits;
 advance(g,3);assert(u.fuel>35);assert.equal(u.ammo,0);assert(g.players[0].credits<cash);
 advance(g,20);assert(u.fuel>=99.5);assert.equal(u.ammo,UNITS.fighter.ammo);
 u.fuel=10;g.players[0].credits=0;advance(g,1);assert.equal(u.fuel,10);
 g.players[0].credits=10000;for(const b of g.ownedBuildings(0))if(b.type!=='airfield')b.hp=0;advance(g,1);assert.equal(u.fuel,10);
});

test('空中加油机真实接近并转移有限油料，不增加弹药，也不提供收入',()=>{
 const g=quiet(),tanker=g.addUnit(0,'tanker',2200,2000),fighter=g.addUnit(0,'fighter',2310,2000);fighter.fuel=15;fighter.ammo=2;
 const cash=g.players[0].credits;let transfer=false;
 for(let i=0;i<600;i++){g.update(.05);transfer ||= g.effects.some(e=>e.type==='fuelTransfer');}
 assert(transfer);assert(tanker.fuelStock<FUEL_SUPPORT.tanker.stock-40);assert(fighter.fuel>50);assert.equal(fighter.ammo,2);assert(fighter.hp>0);assert.equal(g.players[0].credits,cash);
});

test('补给舰双方停航脱战后先供油再补弹，供油和弹药库存分别扣减',()=>{
 const g=quiet(),ship=g.addUnit(0,'destroyer',4200,5600),supply=g.addUnit(0,'supplyShip',4400,5600);ship.fuel=0;ship.ammo=0;
 advance(g,6);assert(ship.fuel>35);assert.equal(ship.ammo,0);assert(supply.fuelStock<680);assert.equal(supply.ammoStock,90);
 advance(g,20);assert(ship.fuel>=95);assert.equal(ship.ammo,UNITS.destroyer.ammo);assert(supply.ammoStock<90);assert.equal(ship.fuelServiceId,undefined);
});

test('满油缺弹舰艇也会与补给舰会合，航母自卫弹可补充且照常扣库存和资金',()=>{
 const g=quiet(),carrier=g.addUnit(0,'carrier',4200,5600),supply=g.addUnit(0,'supplyShip',4400,5600);carrier.fuel=100;carrier.defenseAmmo=0;
 const cash=g.players[0].credits;advance(g,20);assert.equal(carrier.defenseAmmo,12);assert.equal(supply.ammoStock,78);assert.equal(supply.fuelStock,680);assert(g.players[0].credits<cash);
});

test('补给车可救援零油坦克，先加油后补弹，不能靠光环无限复制油料',()=>{
 const g=quiet(),tank=g.addUnit(0,'tank',2200,1800),truck=g.addUnit(0,'supply',2300,1800);tank.fuel=0;tank.ammo=0;
 advance(g,8);assert(tank.fuel>40);assert.equal(tank.ammo,0);assert(truck.fuelStock<220);
 advance(g,18);assert(tank.fuel>=95);assert(tank.ammo>0);assert(truck.fuelStock<130);
 truck.fuelStock=0;tank.fuel=0;truck.autoSupply=false;g.players[0].credits=0;advance(g,1);assert.equal(tank.fuel,0);
});

test('隔空、敌军、经济运输、近期受袭与行进中的舰艇不能获得移动供油',()=>{
 const g=quiet(),s=g.addUnit(0,'supplyShip',4200,5600),enemy=g.addUnit(1,'patrol',4250,5600),remote=g.addUnit(0,'patrol',5000,5600),own=g.addUnit(0,'patrol',4300,5600);
 for(const u of [enemy,remote,own])u.fuel=10;
 assert.equal(g.transferFuel(s,enemy,1),0);assert.equal(g.transferFuel(s,remote,1),0);
 own.lastMovedAt=g.time;assert.equal(g.transferFuel(s,own,1),0);own.lastMovedAt=-10;own.lastDamageAt=g.time;assert.equal(g.transferFuel(s,own,1),0);
 assert.equal(s.fuelStock,680);
});

test('缺货加油机实际返机场付费补库存，取消自动保障后手动命令优先',()=>{
 const g=quiet(),u=parked(g,'tanker');u.fuelStock=0;const cash=g.players[0].credits;
 advance(g,25);assert(u.fuelStock>400);assert(g.players[0].credits<cash-500);assert(u.fuel>=99.5);
 assert(g.toggleAutoFuel(u));assert.equal(u.autoFuel,false);u.order={type:'move',x:2200,y:2000};g.updateFuelSupport(u,.05);assert.equal(u.order.type,'move');
});

test('舰载机在甲板上不耗油，先付费补油再补弹，低油不能强行正常起飞',()=>{
 const g=quiet(),carrier=g.addUnit(0,'carrier',4200,5600),plane=g.addUnit(0,'navalFighter',4200,5600);carrier.airGroupHold=true;
 g.assignReinforcementHome(carrier,g.reinforcementHome(0,'carrier'));g.assignReinforcementHome(plane,carrier);plane.embarkedIn=carrier.id;carrier.passengers=[plane.id];plane.fuel=10;plane.ammo=0;
 assert.equal(g.launchDeckAircraft(carrier,false,plane.id),0);advance(g,3);assert(plane.fuel>35);assert.equal(plane.ammo,0);
 advance(g,25);assert.equal(plane.fuel,100);assert.equal(plane.ammo,UNITS.navalFighter.ammo);assert(g.launchDeckAircraft(carrier,false,plane.id)>0);
});

test('补给单位损失后解除会合并改返固定基地，不遗留无效引用或复制库存',()=>{
 const g=quiet(),provider=g.addUnit(0,'tanker',2200,2000),plane=g.addUnit(0,'fighter',2310,2000);plane.fuel=25;advance(g,1);assert.equal(plane.fuelServiceId,provider.id);
 const fuel=plane.fuel;g.damage(provider,provider.hp*4,1);g.update(.05);assert.equal(plane.fuelServiceId,undefined);assert.equal(plane.order.type,'rearm');assert(plane.fuel<=fuel);assert.doesNotThrow(()=>g.toSave());
});

test('飞机耗尽后有20秒应急救援窗口，未获供油才坠毁，不为敌方凭空记击杀',()=>{
 const g=quiet(),u=g.addUnit(0,'fighter',2200,2000);u.fuel=0;advance(g,10);assert(u.hp>0);assert(u.fuelEmergencyAt!==undefined);
 advance(g,11);assert.equal(u.hp,0);assert.equal(g.battleStats.sides[1].kills,0);
 const landed=g.addUnit(0,'airlift',2200,2100);landed.fuel=0;advance(g,22);assert(landed.hp>0,'已安全着陆的运输机等待救援而非在地面坠毁');
});

test('油量、库存、返航与会合存读档一致，拒绝越界、敌方供油和旧档伪造动力字段',()=>{
 const g=quiet(),provider=g.addUnit(0,'tanker',2200,2000),u=g.addUnit(0,'fighter',2310,2000);u.fuel=15;advance(g,1);
 const save=g.toSave(),copy=Game.fromSave(parseSave(JSON.stringify(save)));assert.equal(copy.fuelVersion,1);assert.deepEqual(copy.units,g.units);
 for(const mutate of [s=>{s.state.units[0].fuel=-1;},s=>{s.state.units[0].fuelStock=9999;},s=>{s.state.units[1].fuelServiceId=s.state.units[1].id;},s=>{delete s.config.fuelVersion;}]){const bad=structuredClone(save);mutate(bad);assert.throws(()=>parseSave(JSON.stringify(bad)));}
 provider.owner=1;assert.throws(()=>g.toSave());
});

test('加油机和补给舰遵守机场/港口编制、真实资金与旧规则开关，电脑会采购保障单位',()=>{
 const g=quiet();assert(g.queueUnit(0,'tanker'));assert(g.queueUnit(0,'supplyShip'));assert.equal(g.reinforcementCapacity(0,'airfield').pending,1);assert.equal(g.reinforcementCapacity(0,'dock').pending,1);
 for(const type of ['tanker','supplyShip']){const b=g.ownedBuildings(0).find(b=>b.queue.includes(type));g.updateReinforcementQueue(b,100);assert(g.ownedUnits(0,type)[0].reinforcement);}
 const ai=quiet();ai.time=150;const home=ai.ownedBuildings(1,'hq')[0];for(const type of ['rifle','tank','aa','fighter','frigate'])ai.addUnit(1,type,home.x+200,home.y+150);
 ai.updateFrontlineAI(1);assert(ai.ownedBuildings(1,'airfield')[0].queue.includes('tanker'));ai.ownedBuildings(1,'airfield')[0].queue=[];ai.addUnit(1,'tanker',home.x,home.y);ai.updateFrontlineAI(1);assert(ai.ownedBuildings(1,'dock')[0].queue.includes('supplyShip'));
});

test('两个保障模型为可合批的原创程序几何，轮廓、供油部件与材质有效',()=>{
 for(const type of ['tanker','supplyShip']){const model=createFuelSupportModel(type),box=new THREE.Box3().setFromObject(model),size=box.getSize(new THREE.Vector3());let calls=0;model.traverse(m=>{if(m.isMesh){calls++;assert([...m.geometry.attributes.position.array].every(Number.isFinite));}});assert(size.x>10&&size.z>4&&size.y>1);assert(calls<=12);assert.equal(model.userData.fuelSupport,true);}
});
