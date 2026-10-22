import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { MAPS } from '../src/data.js';
import { islandDistance, islandHeight, legalIslandLanding } from '../src/island-map.js';
import { navalPath } from '../src/island-navigation.js';
import { WATCH_NODES, WATCH, watchSummary, watchPanelHTML, watchDepot } from '../src/island-watch.js';
import { createIslandShore, createIslandInfrastructure } from '../src/island-scenery.js';
import { completedChallengeResult } from '../src/challenge-profile.js';

const create=()=>new Game('china','asia',{}, {challengeId:'islandwatch'});
const run=(g,seconds)=>{for(let i=0;i<Math.ceil(seconds*20)&&g.running;i++)g.update(.05);};
const command=(g,units,x,y,attack=false)=>{g.selected=units.map(u=>u.id);g.command(x,y,attack);};

test('独立五岛地图共享可视海岸和碰撞，不将任务规则开放到遭遇战或联机',()=>{
  const g=create();assert.equal(g.map.islands.length,5);assert.equal(g.map.bridges.length,0);assert.equal(g.battlefieldScale,1);
  assert.ok(islandDistance(g.map,2600,1560)>100);assert.ok(islandDistance(g.map,1600,1560)<-100);
  assert.equal(g.isGroundBlocked(2600,1560,14),false);assert.equal(g.isNavalBlocked(2600,1560,60),true);
  assert.equal(g.isGroundBlocked(1600,1560,6),true);assert.equal(g.isNavalBlocked(1600,1560,60),false);
  assert.equal(islandHeight(g.map,2600,1560),8);assert.equal(islandHeight(g.map,1600,1560),-15);
  assert.equal(new Game('china','asia',{}, {mapId:'islandwatch',multiplayer:true}).mapId,'valley');
  assert.equal(new Game('china','asia',{}, {mapId:'islandwatch'}).mapId,'valley');assert.equal(MAPS.islandwatch.missionOnly,true);
});

test('舰船使用现有 A 星库绕过主岛，压缩航段仍保留舰体海岸净距',()=>{
  const g=create(),ship=g.activeUnits(0,'patrol')[0];ship.x=1800;ship.y=1600;
  const path=navalPath(g,ship,{x:3500,y:1600});assert.ok(path.length>=3);
  let previous=ship;
  for(const p of path){const length=Math.hypot(p.x-previous.x,p.y-previous.y);for(let i=0;i<=Math.ceil(length/10);i++){
    const t=i/Math.ceil(length/10);assert.equal(g.isNavalBlocked(previous.x+(p.x-previous.x)*t,previous.y+(p.y-previous.y)*t,36),false);
  }previous=p;}
  assert.ok(!g.isNavalBlocked(g.navalGoal(2600,1560,80).x,g.navalGoal(2600,1560,80).y,80));
});

test('合法沙滩分批卸载不重叠，可取消，途中保存恢复不复制载员',()=>{
  const g=create(),ship=g.activeUnits(0,'landing')[0];ship.x=2020;ship.y=1570;ship.order=null;
  assert.equal(g.transportLoad(ship),12);g.unloadTransport(ship);run(g,.1);assert.equal(ship.passengers.length,5);
  const loaded=Game.fromSave(g.toSave());loaded.paused=false;const t=loaded.getEntity(ship.id);run(loaded,4.5);assert.equal(t.passengers.length,0);
  const landed=loaded.activeUnits(0).filter(u=>['tank','supply','engineer','rifle'].includes(u.type));assert.equal(landed.length,6);
  assert.ok(landed.every(u=>!loaded.isGroundBlocked(u.x,u.y,6)&&legalIslandLanding(loaded.map,u)));
  assert.equal(new Set(loaded.units.map(u=>u.id)).size,loaded.units.length);
  const blocked=create(),b=blocked.activeUnits(0,'landing')[0];b.x=1700;b.y=1570;blocked.unloadTransport(b);run(blocked,2);assert.equal(b.passengers.length,6);
  blocked.unloadTransport(b);assert.equal(b.unloadQueue,false);b.x=2020;run(blocked,1);assert.equal(b.passengers.length,6);
});

test('接管需工程师持续作业，敌军争夺会中断，工程师保留以便夺回',()=>{
  const g=create(),engineer=g.ownedUnits(0,'engineer')[0],site=g.getEntity('island-signal');
  const ship=g.activeUnits(0,'landing')[0];ship.passengers=ship.passengers.filter(id=>id!==engineer.id);engineer.embarkedIn=null;engineer.x=site.x;engineer.y=site.y;
  engineer.order={type:'capture',targetId:site.id,x:site.x,y:site.y};run(g,3);assert.equal(site.owner,null);assert.ok(engineer.order.progress>2);
  const save=g.toSave(),loaded=Game.fromSave(save);assert.equal(loaded.getEntity(engineer.id).order.progress,engineer.order.progress);
  const enemy=g.addUnit(1,'rifle',site.x+150,site.y);run(g,.1);assert.equal(engineer.order.progress,0);enemy.hp=0;run(g,9);
  assert.equal(site.owner,0);assert.ok(engineer.hp>0);assert.equal(engineer.order,null);
});

test('三节点与供电共同开放航运；失守暂停、重新接管恢复，回执只结算一次',()=>{
  const g=create();assert.equal(g.launchFreight(0,true),null);assert.equal(g.launchFreight(0,false),null);
  for(const n of WATCH_NODES)g.getEntity(n.id).owner=0;g.recalculatePower();assert.equal(watchSummary(g).connected,true);
  const ship=g.launchFreight(0,true),home=g.ownedBuildings(0,'dock')[0];ship.x=1900;ship.y=1920;ship.freight.leg=3;
  const power=g.getEntity('island-power');power.owner=null;g.recalculatePower();g.updateFreight(ship,10);assert.equal(ship.freight.progress,0);assert.equal(ship.freight.blockedReason,'network');
  power.owner=0;g.recalculatePower();g.updateFreight(ship,9);assert.equal(g.logistics[0].seaControl.receipts.length,1);
  const money=g.players[0].credits;g.updateFreight(ship,9);assert.equal(g.players[0].credits,money);assert.equal(g.logistics[0].delivered,900);
  const enemy=g.addUnit(1,'rifle',power.x+20,power.y);run(g,12.2);assert.equal(power.owner,null);assert.equal(watchSummary(g).connected,false);enemy.hp=0;
  assert.ok(home.hp>0);assert.equal(Game.fromSave(g.toSave()).getEntity(power.id).owner,null);
});

test('拒绝伪造驻守、节点坐标、卸载队列和接管时长，旧挑战存档仍可用',()=>{
  const save=create().toSave();
  for(const mutate of [s=>delete s.state.challenge.watch,s=>s.state.challenge.watch.hold=20,s=>s.state.challenge.watch.hold=.1,s=>s.state.challenge.watch.raids=[0,0,13],s=>s.state.beacons[0].x=2400,s=>s.state.units[1].unloadQueue=true,s=>s.state.units[0].nextUnloadAt=999]){
    const copy=structuredClone(save);mutate(copy);assert.throws(()=>Game.fromSave(copy));
  }
  for(const challengeId of ['lifeline','beachhead','recon'])assert.equal(Game.fromSave(new Game('china','asia',{}, {challengeId}).toSave()).challenge.id,challengeId);
});

test('群岛海岸与能源设施使用共享材质并限制几何预算，界面展示实时链路',()=>{
  const g=create();let meshes=0,triangles=0;
  for(const group of [createIslandShore(g.map),createIslandInfrastructure(g.map)])group.traverse(o=>{if(o.isMesh){meshes++;triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;}});
  assert.ok(meshes<=5);assert.ok(triangles<6000);const html=watchPanelHTML(g,()=> '');assert.match(html,/接管节点 0 \/ 3/);assert.match(html,/能源节点/);assert.match(html,/最终驻守/);
});

test('首批海运才开放付费前线整备，补给车能就地补库存，断链停止而不追跨海基地',()=>{
  const g=create(),supply=g.ownedUnits(0,'supply')[0],tank=g.ownedUnits(0,'tank')[0],ship=g.activeUnits(0,'landing')[0];
  for(const u of [supply,tank]){ship.passengers=ship.passengers.filter(id=>id!==u.id);u.embarkedIn=null;u.x=2600;u.y=1600;}
  for(const n of WATCH_NODES)g.getEntity(n.id).owner=0;g.recalculatePower();assert.equal(watchDepot(g,0),null);
  const c=g.logistics[0].seaControl;c.dispatched=1;c.receipts=[1];g.logistics[0].delivered=900;
  supply.stock=0;tank.hp-=100;tank.ammo=0;g.requestResupply(tank);const money=g.players[0].credits;run(g,10);
  assert.ok(supply.stock>0);assert.ok(tank.hp>tank.maxHp-100);assert.ok(tank.ammo>0);assert.ok(g.players[0].credits<money);
  g.getEntity('island-power').owner=null;g.recalculatePower();assert.equal(watchDepot(g,0),null);
  supply.stock=0;supply.order=null;g.updateSupply(supply,.05);assert.equal(supply.order,null);
});

test('正常指挥串起跨海登陆、三节点接管、护航和驻守，不改钱或任务计数通关',()=>{
  const original=Math.random;
  try{for(let seed=1;seed<=3;seed++){
  let value=seed;Math.random=()=>((value=Math.imul(value,1664525)+1013904223>>>0)/4294967296);
  let g=create();let ship=g.activeUnits(0,'landing')[0];
  if(seed===2)g.configureFreight(0,{lane:'direct'});
  command(g,[ship],2020,1570);
  command(g,g.activeUnits(0,'destroyer'),1920,1700,true);command(g,g.activeUnits(0,'frigate'),1940,1260,true);command(g,g.activeUnits(0,'patrol'),1690,1610,true);
  let unloaded=false,nodeIndex=0,restored=false;
  for(let i=0;i<12000&&g.running;i++){
    if(!unloaded&&!ship.order&&Math.hypot(ship.x-2020,ship.y-1570)<40){g.unloadTransport(ship);unloaded=true;}
    if(unloaded&&!ship.passengers.length&&i%40===0){
      const infantry=g.activeUnits(0).filter(u=>['tank','rifle','supply'].includes(u.type));
      command(g,infantry,2320,1630,true);
      while(nodeIndex<3&&g.getEntity(WATCH_NODES[nodeIndex].id).owner===0)nodeIndex++;
      const node=WATCH_NODES[nodeIndex]||WATCH_NODES.find(n=>g.getEntity(n.id).owner!==0);
      if(node){const p=g.getEntity(node.id),engineer=g.activeUnits(0,'engineer')[0];if(engineer?.order?.type!=='capture')command(g,engineer?[engineer]:[],p.x,p.y);}
    }
    g.update(.05);
    if(seed===3 && !restored && g.running && g.logistics[0].seaControl.receipts.length===1){g=Game.fromSave(g.toSave());g.paused=false;ship=g.activeUnits(0,'landing')[0];restored=true;}
  }
  assert.equal(g.winner,0,JSON.stringify({reason:g.challenge.reason,time:g.time,unloaded,nodeIndex,ship:[ship.x,ship.y,ship.order],watch:watchSummary(g).status,receipts:g.logistics[0].seaControl.receipts,units:g.units.map(u=>[u.type,u.owner,Math.round(u.x),Math.round(u.y),u.order?.type])}));
  assert.ok(g.battleStats.sides[0].damageDealt>0);assert.ok(g.logistics[0].seaControl.receipts.length>=2);assert.ok(completedChallengeResult(g).stars>=1);assert.equal(g.challenge.watch.hold,WATCH.hold);
  if(seed===3)assert.equal(restored,true);
  }}finally{Math.random=original;}
});
