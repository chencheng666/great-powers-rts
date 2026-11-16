import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { UNITS } from '../src/data.js';
import { parseSave } from '../src/savegame.js';
import { CombatSpatialIndex } from '../src/simulation-index.js';
import { transportWeight } from '../src/frontline-rules.js';
const make=()=>{const g=new Game('china','russia',{}, {mapId:'snowtosea',victoryMode:'control'});for(const p of g.players)p.controlType='human';return g;};
const advance=(g,seconds)=>{for(let i=0;i<seconds*20&&g.running;i++)g.update(.05);};
const dispatch=(g,type)=>{assert(g.queueUnit(0,type));const b=g.ownedBuildings(0).find(b=>b.queue.includes(type));g.updateReinforcementQueue(b,100);return g.units.find(u=>u.reinforcement?.type===type&&u.reinforcement.phase==='inbound');};

test('主战区新局只有四类保障建筑，工厂职责和电力迁移；旧存档保持六楼',()=>{
 const g=make();assert.deepEqual(g.ownedBuildings(0).map(b=>b.type).sort(),['airfield','dock','hq','refinery']);
 assert(g.hasPower(0));assert(g.hasBuilding(0,'radar'));assert(g.hasBuilding(0,'lab'));
 for(const t of ['power','barracks','factory','armory','radar','lab','super','nuclearSilo'])assert.equal(g.canBuild(0,t),false,t);
 const legacy=new Game('china','russia',{}, {mapId:'snowtosea',frontlineVersion:0});const saved=legacy.toSave();assert.equal(saved.config.frontlineVersion,undefined);
 const restored=Game.fromSave(saved);assert.equal(restored.frontlineVersion,0);assert.equal(restored.ownedBuildings(0).length,6);assert(restored.canBuild(0,'power'));
});

test('六机位包含排队和在途；起飞不释放，取消及确认损失释放名额',()=>{
 const g=make();g.players[0].credits=20000;
 for(let i=0;i<6;i++)assert(g.queueUnit(0,'fighter'));
 assert.equal(g.queueUnit(0,'fighter'),false);assert.equal(g.reinforcementCapacity(0,'airfield').pending,6);
 const b=g.ownedBuildings(0,'airfield')[0];g.updateReinforcementQueue(b,100);
 const plane=g.ownedUnits(0,'fighter')[0];assert(plane.reinforcement);assert(plane.y<100||plane.y>g.world.height-100);
 assert.equal(g.reinforcementCapacity(0,'airfield').free,0);plane.order={type:'move',x:3000,y:3000};assert.equal(g.queueUnit(0,'fighter'),false);
 g.cancelUnitProduction(0,b.id);assert.equal(g.reinforcementCapacity(0,'airfield').free,1);assert(g.queueUnit(0,'fighter'));
 g.damage(plane,plane.hp,1);assert.equal(g.reinforcementCapacity(0,'airfield').free,1);
});

test('舰艇占用六泊位并从外海抵达；舰载机直接转场航母且不占机场位置',()=>{
 const g=make();g.players[0].credits=20000;
 for(let i=0;i<5;i++)assert(g.queueUnit(0,'patrol'));assert.equal(g.queueUnit(0,'patrol'),false);
 const dock=g.ownedBuildings(0,'dock')[0];g.updateReinforcementQueue(dock,100);
 const ship=g.ownedUnits(0,'patrol').find(u=>u.reinforcement);assert(ship.y>g.world.height-200);assert(distance(ship,dock)>2000);
 dock.queue=[];
 const carrier=g.addUnit(0,'carrier',4100,5600);g.assignReinforcementHome(carrier,g.reinforcementHome(0,'carrier'));
 assert(g.queueUnit(0,'navalFighter'));g.updateReinforcementQueue(dock,100);
 const plane=g.ownedUnits(0,'navalFighter')[0];assert(plane);assert.equal(plane.homeCarrierId,carrier.id);assert.equal(plane.order.targetId,carrier.id);assert.equal(g.reinforcementCapacity(0,'airfield').used,0);
});
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);

test('地面增援航班可被拦截，未抵达不凭空生成坦克；正常投送只交付一次',()=>{
 const g=make();g.players[0].credits=20000;const before=g.ownedUnits(0,'tank').length;
 const lost=dispatch(g,'tank');assert.equal(lost.type,'freightPlane');assert.equal(g.ownedUnits(0,'tank').length,before);
 g.damage(lost,lost.hp,1);advance(g,40);assert.equal(g.ownedUnits(0,'tank').length,before);
 const delivery=dispatch(g,'tank');advance(g,50);assert.equal(g.ownedUnits(0,'tank').length,before+1);assert(!g.getEntity(delivery.id)||g.getEntity(delivery.id).reinforcement.phase==='outbound');advance(g,20);assert.equal(g.ownedUnits(0,'tank').length,before+1);
});

test('从地图边缘飞来的战机完成真实进场和停机，出击仍保留机位',()=>{
 const g=make();g.players[0].credits=20000;const plane=dispatch(g,'fighter');advance(g,100);
 assert.equal(plane.airfieldOps?.phase,'parked');assert.equal(plane.reinforcement,undefined);assert(g.aircraftGrounded(plane));assert.equal(g.reinforcementCapacity(0,'airfield').used,1);
 plane.order={type:'move',x:2800,y:2500};advance(g,18);assert(!g.aircraftGrounded(plane));assert.equal(g.reinforcementCapacity(0,'airfield').used,1);
});

test('机场毁坏后飞机转场有空位的基地，缺少替代基地时撤出而非瞬间死亡',()=>{
 const g=make();g.players[0].credits=20000;const plane=dispatch(g,'fighter'),old=g.ownedBuildings(0,'airfield')[0];
 const next=g.addBuilding(0,'airfield',old.x+500,old.y+100);g.damage(old,old.hp,1);g.update(.05);assert.equal(plane.assignment.homeId,next.id);assert.equal(plane.reinforcement.homeId,next.id);
 g.damage(next,next.hp,1);g.update(.05);assert(plane.hp>0);assert.equal(plane.reinforcement.phase,'withdraw');
});

test('增援途中存读档保留订单、付款、编制及航路；拒绝重复机位和无效投送',()=>{
 const g=make();g.players[0].credits=20000;dispatch(g,'fighter');dispatch(g,'tank');advance(g,2);
 const save=g.toSave(),restored=Game.fromSave(save);assert.equal(restored.frontlineVersion,1);assert.deepEqual(restored.toSave().state,save.state);
 const bad=structuredClone(save),plane=bad.state.units.find(u=>u.assignment?.domain==='airfield');const copy={...plane,id:999999};bad.state.units.push(copy);assert.throws(()=>parseSave(JSON.stringify(bad)));
 const invalid=structuredClone(save);invalid.state.units.find(u=>u.reinforcement).reinforcement.type='unknown';assert.throws(()=>parseSave(JSON.stringify(invalid)));
});

test('运输机使用重轻载重：一辆坦克或三辆轻车，旧档仍是两辆坦克',()=>{
 const g=make(),t=g.addUnit(0,'airlift',2400,3440),tank=g.ownedUnits(0,'tank')[0];assert.equal(transportWeight(g,tank,t),8);
 t.passengers=[tank.id];tank.embarkedIn=t.id;assert.equal(g.canBoardTransport(g.addUnit(0,'aa',2300,3300),t),false);
 t.passengers=[];tank.embarkedIn=null;
 for(let i=0;i<3;i++){const light=g.addUnit(0,'aa',2300,3300);assert(g.canBoardTransport(light,t));light.embarkedIn=t.id;t.passengers.push(light.id);}
 assert(Math.abs(g.transportLoad(t)-8)<1e-8);assert.equal(g.canBoardTransport(g.ownedUnits(0,'rifle')[0],t),false);assert.doesNotThrow(()=>g.toSave());
 assert.equal(transportWeight({frontlineVersion:0},tank,t),4);
});

test('目标空间索引保持全量扫描的目标顺序，索引仅存活于当前模拟步',()=>{
 const g=make();for(const f of g.fogs)f.visible.fill(true);const source=g.ownedUnits(0,'tank')[0];
 for(let i=0;i<80;i++)g.addUnit(1,'tank',source.x+300+i*20,source.y+Math.sin(i)*160);
 const plain=g.closestEnemy(source,650,0);g.combatIndex=new CombatSpatialIndex([...g.units,...g.buildings]);assert.equal(g.closestEnemy(source,650,0),plain);
 g.combatIndex=null;g.update(.05);assert.equal(g.combatIndex,null);assert.equal(g.entityLookup,null);
});

test('电脑护航保留返航、装载与既有路径，不读取迷雾中的敌方单位',()=>{
 const g=make(),side=1;const home=g.ownedBuildings(side,'hq')[0],fighter=g.addUnit(side,'fighter',home.x+300,home.y);
 fighter.order={type:'rearm'};fighter.path=[{x:1,y:2}];g.coordinateFrontlineForces(side,{phase:'advance',x:3000,y:2900},true);assert.equal(fighter.order.type,'rearm');assert.deepEqual(fighter.path,[{x:1,y:2}]);
 const target={phase:'advance',x:3000,y:2900};fighter.order={type:'attackMove',x:3000,y:2900};fighter.path=[{x:600,y:700}];g.frontlineAIOrder(fighter,'attackMove',target);assert.deepEqual(fighter.path,[{x:600,y:700}]);
 const invisible=g.addUnit(0,'tank',home.x+100,home.y);g.fogs[side].visible.fill(false);assert.notEqual(g.frontlineObjective(side).phase,'defend');g.fogs[side].visible.fill(true);assert.equal(g.frontlineObjective(side).phase,'defend');
});

test('运输机装载点和投送点避开指挥中心，带载后由制空机护航',()=>{
 const g=make(),side=1,home=g.ownedBuildings(side,'airfield')[0];
 const t=g.addUnit(side,'airlift',home.x,home.y);g.assignReinforcementHome(t,home);
 g.players[side].frontlineObjective={x:3000,y:2900};g.updateAITransports(side);
 assert(t.order);const pickup={x:t.order.x,y:t.order.y};t.x=pickup.x;t.y=pickup.y;t.lastMovedAt=g.time-2;assert(g.transportGrounded(t));
 const rifle=g.ownedUnits(side,'rifle')[0];rifle.embarkedIn=t.id;t.passengers=[rifle.id];t.transportStage='depart';
 const fighter=g.addUnit(side,'fighter',pickup.x+500,pickup.y);g.coordinateFrontlineForces(side,{phase:'advance',x:3000,y:2900},true);
 assert.equal(fighter.order.type,'attackMove');assert(distance(fighter.order,t)<250);
 g.updateAITransports(side);assert(t.order);assert.equal(g.isGroundBlocked(t.order.x,t.order.y,35),false);
 assert(g.buildings.every(b=>b.hp<=0||distance(b,t.order)>b.size*.5+35));
});

test('巡逻艇实际完成从外海到所属泊位的航行，舰载机实际着舰',()=>{
 const g=make();g.units=g.units.filter(u=>u.owner===0);g.players[0].credits=20000;const ship=dispatch(g,'patrol');advance(g,180);assert.equal(ship.reinforcement,undefined);assert(ship.assignment);assert(distance(ship,g.shipBerth(ship,g.getEntity(ship.assignment.homeId)))<110);
 const carrier=g.addUnit(0,'carrier',4100,5600);g.assignReinforcementHome(carrier,g.reinforcementHome(0,'carrier'));carrier.airGroupHold=true;
 const plane=dispatch(g,'navalFighter');advance(g,50);assert.equal(plane.embarkedIn,carrier.id);assert.equal(plane.reinforcement,undefined);
});

test('登陆装载只查询近岸，重复装载复用地形，远海不扫描整张地图',()=>{
 const g=make(),side=0,harbor=g.map.harbors[side],point=g.navalGoal(harbor.x,harbor.y,70),t=g.addUnit(side,'landing',point.x,point.y),u=g.ownedUnits(side,'rifle')[0];
 let calls=0;const original=g.isGroundBlocked.bind(g);g.isGroundBlocked=(...a)=>{calls++;return original(...a);};
 const first=g.landingBoardingPoint(u,t);assert(first);assert(distance(first,t)<=145);assert(calls<220);
 calls=0;g.landingBoardingPoint(u,t);assert(calls<40);
 const remote=g.addUnit(side,'landing',4300,5600);assert.equal(g.landingBoardingPoint(u,remote),null);assert(calls<200);
});


test('航母损失后的舰载机撤离清理旧甲板编号，下一步仍能保存',()=>{
 const g=make(),carrier=g.addUnit(0,'carrier',4100,5600),plane=g.addUnit(0,'navalFighter',4100,5500);
 g.assignReinforcementHome(carrier,g.reinforcementHome(0,'carrier'));g.assignReinforcementHome(plane,carrier);
 assert.equal(plane.carrierSlot,0);g.damage(carrier,carrier.hp,1);g.update(.05);
 assert.equal(plane.homeCarrierId,null);assert.equal(plane.carrierSlot,undefined);assert(plane.hp>0);assert.doesNotThrow(()=>g.toSave());
});

test('在途增援不能被提前指挥；所有敌方席位攻击均提示我方受袭',()=>{
 const g=make();g.players[0].credits=10000;const plane=dispatch(g,'fighter');assert.equal(g.selectEntity(plane),null);g.selectAllCombat();assert(!g.selected.includes(plane.id));
 const notices=[];g.events.voice=type=>notices.push(type);const tank=g.ownedUnits(0,'tank')[0];g.damage(tank,1,4);assert(notices.includes('unitUnderAttack'));
});
