import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { parseSave } from '../src/savegame.js';
import { reinforcementDomain } from '../src/frontline-operations.js';
import { unitRadius } from '../src/unit-spacing.js';

const quiet=()=>{
  const g=new Game('china','russia',{}, {mapId:'snowtosea',victoryMode:'annihilation'});
  for(const p of g.players)p.controlType='human';
  g.closestEnemy=()=>null;
  return g;
};
const advance=(g,seconds)=>{for(let n=0;n<seconds*20;n++)g.update(.05);};

test('六方空运和海运从地图边缘实际进场、卸货、退出，到账前不加钱且不凭增建刷班次',()=>{
  const g=quiet(),initial=g.players.map(p=>p.credits),receipts=Array.from({length:6},()=>({freightPlane:new Set(),containerShip:new Set()}));
  for(let side=0;side<6;side++){
    const entry=g.freightEntry(side,true);assert(!g.isNavalBlocked(entry.x,entry.y,unitRadius({type:'containerShip'})+12));
    assert(entry.y<200||entry.y>g.world.height-200);
    assert(Math.hypot(entry.x-g.map.harbors[side].x,entry.y-g.map.harbors[side].y)>500);
  }
  advance(g,3.1);assert(g.economicFreight(0,'freightPlane').length);assert.equal(g.players[0].credits,initial[0]);
  g.addBuilding(0,'refinery',1350,1900);g.updateLogistics(.05);assert.equal(g.economicFreight(0,'freightPlane').length,1);
  for(let n=0;n<4200;n++){
    g.update(.05);
    for(const u of g.units)if(u.freight?.phase==='outbound'&&u.freight.value===0)receipts[u.owner][u.type].add(u.id);
  }
  for(let side=0;side<6;side++){
    const r=receipts[side];assert(r.freightPlane.size>=2,`空运${side}`);assert(r.containerShip.size>=1,`海运${side}`);
    assert.equal(g.logistics[side].delivered,r.freightPlane.size*720+r.containerShip.size*900);
    assert(Math.abs(g.players[side].credits-initial[side]-g.logistics[side].delivered)<.001);
    assert(g.economicFreight(side,'freightPlane').length<=1);assert(g.economicFreight(side,'containerShip').length<=1);
  }
});

test('经济货运和部队增援独立排程，货船不占六泊位、飞机不占六机位或部队人口',()=>{
  const g=quiet();g.players[0].credits=20000;assert(g.queueUnit(0,'tank'));
  const warehouse=g.ownedBuildings(0,'refinery')[0];g.updateReinforcementQueue(warehouse,100);
  const reinforcement=g.ownedUnits(0,'freightPlane')[0];assert(reinforcement.reinforcement);
  const used=g.unitCapacityUsed(0),before=g.reinforcementCapacity(0,'dock');
  advance(g,3.1);const economic=g.economicFreight(0,'freightPlane')[0];assert(economic);assert.notEqual(economic,reinforcement);
  const ship=g.launchFreight(0,true);g.updateReinforcementArrivals(.05);
  assert.equal(reinforcementDomain('containerShip'),null);assert.equal(reinforcementDomain('freightPlane'),null);
  assert.equal(ship.assignment,undefined);assert.equal(economic.assignment,undefined);assert.equal(g.unitCapacityUsed(0),used);
  assert.deepEqual(g.reinforcementCapacity(0,'dock'),before);
  advance(g,60);assert(g.logistics[0].delivered>=720);assert(g.ownedUnits(0,'tank').length>=2);
});

test('仓库损失后空运降为应急180，港口损失后海运退出，被拦截只登记一次未交付损失',()=>{
  const g=quiet(),plane=g.launchFreight(0),ship=g.launchFreight(0,true),initial=g.players[0].credits;
  const warehouse=g.getEntity(plane.freight.homeId),dock=g.getEntity(ship.freight.homeId);
  g.damage(warehouse,warehouse.hp,1);g.updateFreight(plane,.05);assert.equal(plane.freight.value,180);assert.equal(g.getEntity(plane.freight.homeId).type,'hq');
  g.damage(dock,dock.hp,1);g.updateFreight(ship,.05);assert.equal(ship.freight.phase,'outbound');assert.equal(g.launchFreight(0,true),null);
  g.damage(plane,plane.hp,1);g.damage(plane,1000,1);assert.equal(g.logistics[0].lost,180);assert.equal(g.players[0].credits,initial);
  g.players[0].eliminated=true;assert.equal(g.launchFreight(0),null);
});

test('六方运输状态和未到账物资存读档一致，3.9采矿旧档仍保留矿车与货物',()=>{
  const g=quiet();advance(g,18);const saved=g.toSave(),restored=Game.fromSave(parseSave(JSON.stringify(saved)));
  assert.equal(restored.economyMode,'convoy');assert.deepEqual(restored.logistics,g.logistics);assert.deepEqual(restored.units,g.units);
  const old=quiet();old.economyMode='mining';old.ore=old.map.ore.map(([x,y,amount,kind],i)=>({id:`ore-${i}`,x,y,amount,max:amount,kind}));
  const miner=old.addUnit(0,'harvester',1100,1400);miner.cargo=31;miner.cargoValue=62;
  const copy=Game.fromSave(old.toSave());assert.equal(copy.economyMode,'mining');assert.equal(copy.ore.length,24);assert.equal(copy.getEntity(miner.id).cargoValue,62);assert.equal(copy.queueUnit(0,'harvester'),true);
});

test('电脑只对已侦察的补给线威胁防守，护航不覆盖返场，优先争夺可达经济据点',()=>{
  const g=quiet(),side=1,ship=g.launchFreight(side,true),plane=g.launchFreight(side);
  const enemy=g.addUnit(0,'fighter',ship.x+180,ship.y+120);g.fogs[side].visible.fill(false);
  assert.notEqual(g.frontlineObjective(side).phase,'defend');g.fogs[side].visible.fill(true);assert.equal(g.frontlineObjective(side).phase,'defend');
  enemy.hp=0;
  const fighter=g.addUnit(side,'fighter',2000,1800),frigate=g.addUnit(side,'frigate',ship.x,ship.y+300),returning=g.addUnit(side,'fighter',2200,1800);returning.order={type:'rearm'};
  g.coordinateFrontlineForces(side,{phase:'scout',x:3000,y:2900},false);
  assert(Math.hypot(fighter.order.x-plane.x,fighter.order.y-plane.y)<250);assert.equal(returning.order.type,'rearm');
  assert(Math.hypot(frigate.order.x-ship.x,frigate.order.y-ship.y)<550);
  g.fogs[side].explored.fill(true);g.updateFrontlineAI(side);const e=g.ownedUnits(side,'engineer')[0],site=g.getEntity(e.order?.targetId);assert(site);assert(g.oil.includes(site)||site.type==='depot');
});
