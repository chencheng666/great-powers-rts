import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { UNITS } from '../src/data.js';
import { OnlineGame } from '../src/online-game.js';
import { CARRIER_SORTIE_LIMIT } from '../src/carrier-operations.js';
import { executeCommand } from '../server/commands.mjs';
import { battleView } from '../server/battle-view.mjs';
import { validateSave } from '../src/savegame.js';

const setup = () => {
  const g = new Game('china', 'nato', {}, { mapId: 'ocean' });
  g.units = []; g.aiTimer = g.aiWaveTimer = 1e9;
  g.logistics.forEach(r => { r.nextAir = r.nextSea = 1e9; });
  g.players.forEach(p => { p.credits = 10000; });
  return g;
};
const board = (g, plane, carrier) => {
  plane.order = { type: 'board', targetId: carrier.id };
  for (let i = 0; i < 160; i++) { g.time += .05; g.updateCarrierAirGroup(carrier,.05);g.boardTransport(plane, .05); if (plane.embarkedIn) break; }
  if(plane.embarkedIn)for(let n=0;n<45;n++){g.time+=.05;g.updateCarrierAirGroup(carrier,.05);}
};

test('只有兼容舰载型能够着舰，甲板容量按真实机体计算，敌军及地面车辆不能登舰', () => {
  const g = setup(), carrier = g.addUnit(0, 'carrier', 1400, 1000);
  carrier.airGroupHold=true;
  for (const type of ['fighter', 'strike', 'bomber', 'airlift', 'rifle', 'tank']) assert.equal(g.canBoardTransport(g.addUnit(0, type, 1400, 1000), carrier), false);
  assert.equal(g.canBoardTransport(g.addUnit(1, 'navalFighter', 1400, 1000), carrier), false);
  for (let n = 0; n < 24; n++) {
    const plane = g.addUnit(0, n % 2 ? 'navalFighter' : 'navalStrike', 1400, 1000);
    board(g, plane, carrier); assert.equal(plane.embarkedIn, carrier.id);
  }
  assert.equal(g.transportLoad(carrier), 24);
  assert.equal(g.canBoardTransport(g.addUnit(0, 'navalStrike', 1400, 1000), carrier), false);
  const save = g.toSave(); validateSave(save);
  assert.equal(Game.fromSave(save).ownedUnits(0, 'carrier')[0].passengers.length, 24);
});

test('真实飞机弹射起飞，不复制机体；舰载机耗弹受伤后返舰、付费整备并恢复任务', () => {
  const g = setup(), carrier = g.addUnit(0, 'carrier', 1400, 1000), plane = g.addUnit(0, 'navalStrike', 1400, 1000);
  board(g, plane, carrier);
  assert.equal(g.launchDeckAircraft(carrier), 1);
  assert.equal(plane.embarkedIn, carrier.id);
  for (let n = 0; n < 100 && plane.embarkedIn; n++) { g.time += .05; g.updateCarrierAirGroup(carrier, .05); }
  assert.equal(plane.embarkedIn, null); assert.equal(carrier.passengers.length, 0);
  assert.ok(plane.deployment); assert.equal(g.ownedUnits(0, 'navalStrike').length, 1);
  plane.deployment = null; plane.x = carrier.x; plane.y = carrier.y;
  plane.hp -= 54; plane.ammo = 0;
  plane.order = { type: 'attackMove', x: 2200, y: 1000 };
  g.requestResupply(plane);
  for (let n = 0; n < 60 && !plane.embarkedIn; n++) { g.time += .05; g.updateRearm(plane, .05); }
  assert.equal(plane.embarkedIn, carrier.id);
  const initial = g.players[0].credits;
  for (let n = 0; n < 350; n++) { g.time += .05; g.updateCarrierAirGroup(carrier, .05); }
  assert.equal(plane.hp, plane.maxHp); assert.equal(plane.ammo, UNITS.navalStrike.ammo);
  assert.equal(plane.embarkedIn, null); assert.equal(plane.order.type, 'attackMove');
  assert.ok(Math.abs(initial - g.players[0].credits - (54 * .35 + 40)) < .001);
});

test('甲板滑行逐机排队，航母移动时暂停，存档恢复后继续并且不会复制飞机', () => {
  const g = setup(), carrier = g.addUnit(0, 'carrier', 1400, 1000);
  const planes = [g.addUnit(0, 'navalStrike', 1400, 1000), g.addUnit(0, 'navalFighter', 1400, 1000)];
  planes.forEach(plane => board(g, plane, carrier));
  assert.equal(g.launchDeckAircraft(carrier), 2);
  for (let n = 0; n < 20; n++) { g.time += .05; g.updateCarrierAirGroup(carrier, .05); }
  const progress = planes[0].deckTaxi.progress;
  assert.ok(progress > 0 && progress < 1);
  assert.equal(planes[1].deckTaxi.progress, 0);
  carrier.lastMovedAt = g.time;
  g.updateCarrierAirGroup(carrier, .05);
  assert.equal(planes[0].deckTaxi.progress, progress);
  const save = g.toSave(); validateSave(save);
  const restored = Game.fromSave(save), restoredCarrier = restored.getEntity(carrier.id);
  for (let n = 0; n < 240; n++) { restored.time += .05; restored.updateCarrierAirGroup(restoredCarrier, .05); }
  assert.equal(restoredCarrier.passengers.length, 0);
  assert.equal(restored.units.filter(u => planes.some(p => p.id === u.id)).length, 2);
  assert.ok(planes.every(p => restored.getEntity(p.id).deployment));
});

test('编入真实舰载机后航母自带攻击组停用；移动、断电和受击不允许免费着舰整备', () => {
  const g = setup(), carrier = g.addUnit(0, 'carrier', 1400, 1000), plane = g.addUnit(0, 'navalStrike', 1400, 1000), enemy = g.addUnit(1, 'patrol', 1700, 1000);
  assert.equal(g.canAttack(carrier, enemy), true);
  carrier.lastMovedAt = g.time;plane.order={type:'board',targetId:carrier.id};g.boardTransport(plane,.05);
  assert.equal(plane.embarkedIn, null);
  g.time += 4; board(g, plane, carrier);
  assert.equal(g.canAttack(carrier, enemy), false);
  plane.hp -= 20; plane.ammo = 0;
  carrier.lastDamageAt = g.time;
  g.updateCarrierAirGroup(carrier, 10); assert.equal(plane.hp, plane.maxHp - 20);
  g.time += 4; g.ownedBuildings(0, 'power')[0].hp = 0; g.recalculatePower();
  g.updateCarrierAirGroup(carrier, 10); assert.equal(plane.ammo, 0);
  assert.equal(g.launchDeckAircraft(carrier), 0);
});

test('航母沉没后甲板飞机紧急撤离受损，空中飞机可改回机场，不保留无敌隐藏机体', () => {
  const g = setup(), carrier = g.addUnit(0, 'carrier', 1400, 1000), plane = g.addUnit(0, 'navalFighter', 1400, 1000);
  board(g, plane, carrier); g.damage(carrier, carrier.maxHp * 2, 1);
  assert.equal(plane.embarkedIn, null); assert.equal(plane.hp, plane.maxHp * .5);
  assert.equal(plane.homeCarrierId, null); assert.ok(plane.deployment);
});

test('舰载机遵守空地克制，飞弹实际飞行后命中，不是瞬间扣血', () => {
  const g = setup(), fighter = g.addUnit(0, 'navalFighter', 1400, 1000), strike = g.addUnit(0, 'navalStrike', 1400, 1200), enemyAir = g.addUnit(1, 'fighter', 1640, 1000), enemyShip = g.addUnit(1, 'patrol', 1640, 1200);
  g.fogs[0].visible.fill(true);
  assert.equal(g.canAttack(fighter, enemyShip), true); assert.equal(g.canAttack(strike, enemyAir), true);
  assert.ok(g.unitDamage(fighter, enemyShip) < g.unitDamage(fighter, enemyAir));
  assert.ok(g.unitDamage(strike, enemyAir) < g.unitDamage(strike, enemyShip));
  assert.equal(g.canAttack(fighter, enemyAir), true); assert.equal(g.canAttack(strike, enemyShip), true);
  g.fire(strike, enemyShip, 50, 'navalStrike'); assert.equal(enemyShip.hp, enemyShip.maxHp);
  assert.equal(g.projectiles[0].kind, 'missile');
  for (let n = 0; n < 30; n++) g.updateProjectiles(.05);
  assert.equal(enemyShip.hp, enemyShip.maxHp - 50);
});


test('24架真实机体固定机位，最多6架同时出动，留空机位不被返舰以外的飞机抢占',()=>{
  const g=setup(),carrier=g.addUnit(0,'carrier',1400,1000);carrier.airGroupHold=true;
  const planes=Array.from({length:24},(_,i)=>g.addUnit(0,i%2?'navalFighter':'navalStrike',1400,1000));
  planes.forEach(p=>board(g,p,carrier));
  const slots=planes.map(p=>p.carrierSlot);assert.equal(new Set(slots).size,24);
  assert.equal(g.launchDeckAircraft(carrier),24);
  for(let i=0;i<500;i++){g.time+=.05;g.updateCarrierAirGroup(carrier,.05);}
  assert.equal(planes.filter(p=>!p.embarkedIn).length,CARRIER_SORTIE_LIMIT);
  assert.equal(carrier.passengers.length,18);assert.equal(planes.filter(p=>p.deckTaxi?.launch).length,18);
  assert.deepEqual(planes.map(p=>p.carrierSlot),slots);
  assert.equal(g.canBoardTransport(g.addUnit(0,'navalFighter',1400,1000),carrier),false);
  const restored=Game.fromSave(g.toSave());assert.equal(restored.carrierAircraft(restored.getEntity(carrier.id)).length,24);
  assert.deepEqual(planes.map(p=>restored.getEntity(p.id).carrierSlot),slots);
});

test('一键召回清除后续出动，空中飞机逐架返舰，满载且附近有敌人也不会自行再次起飞',()=>{
  const g=setup(),carrier=g.addUnit(0,'carrier',1400,1000);carrier.airGroupHold=true;
  const planes=Array.from({length:24},()=>g.addUnit(0,'navalStrike',1400,1000));planes.forEach(p=>board(g,p,carrier));
  g.launchDeckAircraft(carrier);for(let i=0;i<300;i++){g.time+=.05;g.updateCarrierAirGroup(carrier,.05);}
  assert.equal(planes.filter(p=>!p.embarkedIn).length,6);g.recallCarrierAircraft(carrier);
  for(const p of planes.filter(p=>!p.embarkedIn)){p.deployment=null;p.x=carrier.x;p.y=carrier.y;}
  for(let i=0;i<1000;i++){g.time+=.05;g.updateCarrierAirGroup(carrier,.05);for(const p of planes)if(!p.embarkedIn)g.updateRearm(p,.05);}
  assert.equal(carrier.passengers.length,24);assert(planes.every(p=>!p.deckTaxi&&!p.resumeOrder));
  g.addUnit(1,'patrol',1500,1000);g.fogs[0].visible.fill(true);g.updateCarrierAirGroup(carrier,5);
  assert.equal(carrier.passengers.length,24);assert.equal(carrier.airGroupHold,true);
  g.launchDeckAircraft(carrier);assert.equal(carrier.airGroupHold,false);
});

test('甲板滑行中召回沿原通道退回，旧三机存档补机位，重复和越界机位拒绝',()=>{
  const g=setup(),carrier=g.addUnit(0,'carrier',1400,1000),planes=Array.from({length:3},()=>g.addUnit(0,'navalFighter',1400,1000));
  planes.forEach(p=>board(g,p,carrier));g.launchDeckAircraft(carrier);g.time+=.5;g.updateCarrierAirGroup(carrier,.5);
  const progress=planes[0].deckTaxi.progress;g.recallCarrierAircraft(carrier);assert.equal(planes[0].deckTaxi.progress,1-progress);assert.equal(planes[0].deckTaxi.reversing,true);
  const save=g.toSave();for(const p of save.state.units)delete p.carrierSlot;
  const restored=Game.fromSave(save);assert.equal(new Set(restored.carrierAircraft(restored.getEntity(carrier.id)).map(p=>p.carrierSlot)).size,3);
  for(const mutate of [s=>s.state.units.find(p=>p.id===planes[0].id).carrierSlot=24,s=>s.state.units.find(p=>p.id===planes[1].id).carrierSlot=0]){const bad=g.toSave();mutate(bad);assert.throws(()=>validateSave(bad));}
});

test('召回命令验证所属权；可见敌舰只公开甲板外观，迷雾与观战不泄露编队任务',()=>{
  const g=setup(),carrier=g.addUnit(0,'carrier',1400,1000),plane=g.addUnit(0,'navalFighter',1400,1000);board(g,plane,carrier);
  assert.equal(executeCommand(g,1,{action:'carrier-recall',id:carrier.id}),false);
  assert.equal(executeCommand(g,0,{action:'carrier-recall',id:carrier.id}),true);
  g.canSeeEntity=()=>true;const view=battleView(g,1),shown=view.units.find(u=>u.id===carrier.id);
  assert.deepEqual(shown.deckAircraft,[{id:plane.carrierSlot+1,type:plane.type,carrierSlot:plane.carrierSlot}]);
  assert.equal(shown.airGroupHold,undefined);assert.equal(view.units.some(u=>u.id===plane.id),false);
  g.canSeeEntity=(side,e)=>e.owner===side;assert.equal(battleView(g,1).units.some(u=>u.id===carrier.id),false);
});


test('权威快照保留24机位与召回状态，客户端只发召回命令、不本地修改飞机',()=>{
 const g=setup(),carrier=g.addUnit(0,'carrier',1400,1000),p=g.addUnit(0,'navalFighter',1400,1000);board(g,p,carrier);
 const messages=[],client=new OnlineGame({seat:0,config:{mapId:'ocean'},view:battleView(g,0)},{},{send:m=>{messages.push(m);return true;}});
 const shown=client.getEntity(carrier.id);client.recallCarrierAircraft(shown);assert.equal(shown.airGroupHold,undefined);assert.deepEqual(JSON.parse(JSON.stringify(messages)),[{type:'command',action:'carrier-recall',id:carrier.id}]);
 executeCommand(g,0,{action:'carrier-recall',id:carrier.id});client.apply({view:battleView(g,0)});assert.equal(client.getEntity(carrier.id).airGroupHold,true);assert.equal(client.getEntity(p.id).carrierSlot,p.carrierSlot);
});

test('取消进场不会永久锁死起飞通道',()=>{
 const g=setup(),carrier=g.addUnit(0,'carrier',1400,1000),parked=g.addUnit(0,'navalFighter',1400,1000);board(g,parked,carrier);
 const arrival=g.addUnit(0,'navalStrike',1400,1000);arrival.order={type:'board',targetId:carrier.id};g.boardTransport(arrival,.05);assert.ok(arrival.deckApproach);
 arrival.order={type:'move',x:1800,y:1000};g.launchDeckAircraft(carrier);
 for(let i=0;i<60;i++){g.time+=.05;g.updateCarrierAirGroup(carrier,.05);}
 assert.equal(parked.embarkedIn,null);assert.equal(arrival.deckApproach,null);assert.equal(carrier.landingId,null);
});


test('完整模拟中24架编队出动6架后全部实际返舰，不因固定翼转弯半径绕圈',()=>{
const g=new Game('china','nato',{}, {mapId:'ocean',multiplayer:true});g.units=[];g.aiTimer=g.aiWaveTimer=1e9;g.logistics.forEach(r=>{r.nextAir=r.nextSea=1e9;});g.players[0].credits=50000;
const c=g.addUnit(0,'carrier',1400,1000);c.airGroupHold=true;
for(let i=0;i<24;i++){const p=g.addUnit(0,i%2?'navalFighter':'navalStrike',c.x,c.y);p.order={type:'board',targetId:c.id};for(let n=0;n<180&&!p.embarkedIn;n++){g.time+=.05;g.updateCarrierAirGroup(c,.05);g.boardTransport(p,.05);}for(let n=0;n<42;n++){g.time+=.05;g.updateCarrierAirGroup(c,.05);}}
g.launchDeckAircraft(c);for(let i=0;i<600;i++)g.update(.05);
const airborne=g.carrierAircraft(c).filter(p=>!p.embarkedIn).length;if(airborne!==6)throw Error('出动限制异常:'+airborne);
g.recallCarrierAircraft(c);let steps=0;for(;steps<2400;steps++){g.update(.05);if(c.passengers.length===24&&g.carrierAircraft(c).every(p=>!p.deckTaxi))break;}
if(c.passengers.length!==24)throw Error('未全部返舰:'+JSON.stringify(g.carrierAircraft(c).filter(p=>!p.embarkedIn).map(p=>({x:p.x,y:p.y,order:p.order,deploy:p.deployment}))));
assert.equal(c.passengers.length,24);assert.equal(c.airGroupHold,true);
});
