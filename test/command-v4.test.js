import { encodeStoredSave,parseSave } from '../src/savegame.js';
import { airfieldParking,airfieldRunwayAvailable } from '../src/airfield-rules.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Game } from '../src/game.js';
import { UNITS } from '../src/data.js';
import { COMMAND_DOCTRINES,doctrineFactor } from '../src/command-doctrines.js';
import { missionFuelNeed } from '../src/joint-operations.js';
import { createAmphibiousModel } from '../src/amphibious-model.js';
import { campaignSummary } from '../src/snow-campaign.js';
const fresh=(options={})=>new Game('china','russia',{}, {mapId:'snowtosea',...options});
const step=(g,seconds,fn)=>{for(let i=0;i<Math.ceil(seconds/.05);i++){g.time+=.05;fn(.05);}};

test('五阵营的两个作战方向互斥、付费准备，断电暂停，生效后修正实际作战数值',()=>{
 for(const faction of Object.keys(COMMAND_DOCTRINES))for(const d of COMMAND_DOCTRINES[faction]){
  const g=new Game(faction,'russia',{}, {mapId:'snowtosea'}),p=g.players[0],u=g.ownedUnits(0,'tank')[0],before=p.credits;
  assert.equal(g.chooseDoctrine(0,d.id),true);assert.equal(p.credits,before-900);assert.equal(g.chooseDoctrine(0,d.id),false);assert.equal(doctrineFactor(g,u,'speed'),1);
  const power=g.hasPower;g.hasPower=()=>false;step(g,5,dt=>g.updateDoctrines(dt));assert.equal(p.doctrinePending.progress,0);g.hasPower=power;
  step(g,50.1,dt=>g.updateDoctrines(dt));assert.equal(p.doctrine.id,d.id);assert.equal(g.chooseDoctrine(0,d.id),false);assert.ok(doctrineFactor(g,u,'speed')>0);
  assert.equal(Game.fromSave(g.toSave()).players[0].doctrine.id,d.id);
 }
});

test('新作战方向改变真实伤害、视野和移动，旧档不会自动迁移到4.0',()=>{
 const g=fresh(),tank=g.ownedUnits(0,'tank')[0],enemy=g.ownedUnits(1,'tank')[0],before=g.unitDamage(tank,enemy);
 g.players[0].doctrine={id:'mobility',completedAt:0};const start={x:tank.x,y:tank.y};g.moveUnitPowered(tank,{x:tank.x+200,y:tank.y},.05,0);assert.ok(tank.x>start.x);assert.equal(doctrineFactor(g,tank,'speed'),1.1);assert.equal(g.unitDamage(tank,enemy),before);
 const save=g.toSave();delete save.config.commandVersion;delete save.state.players[0].doctrine;const old=Game.fromSave(save);assert.equal(old.commandVersion,0);assert.equal(old.chooseDoctrine(0,'bastion'),false);assert.equal(old.queueUnit(0,'amphibious'),false);
 const wrong=g.toSave();wrong.state.players[0].doctrine.id='unknown';assert.throws(()=>Game.fromSave(wrong));
});

test('编队推进为低油成员安排整补，保存归队任务，手动命令可立即退出联合任务',()=>{
 const g=fresh(),tank=g.ownedUnits(0,'tank')[0],low=g.addUnit(0,'tank',tank.x-80,tank.y+50);low.fuel=10;g.selected=[tank.id,low.id];
 assert.ok(missionFuelNeed(g,tank,{x:2900,y:1400})>30);assert.equal(g.commandJointMove(2900,1400),true);assert.equal(low.fuelReturn,true);assert.ok(low.jointMission);assert.equal(low.order.type,'rearm');
 const restored=Game.fromSave(g.toSave());assert.ok(restored.getEntity(low.id).jointMission);restored.paused=false;restored.selected=[low.id];restored.command(low.x+200,low.y);assert.equal(restored.getEntity(low.id).jointMission,undefined);
 g.time=40;g.updateJointMissions();assert.equal(tank.jointMission.stage,'advance');assert.equal(tank.order.type,'attackMove');g.selected=[tank.id];g.stopSelected();assert.equal(tank.jointMission,undefined);
});

test('联合推进不能越海传送陆军，电脑先集结并保留整补命令',()=>{
 const g=fresh(),u=g.ownedUnits(0,'tank')[0];g.selected=[u.id];g.commandJointMove(4020,5030);assert.equal(u.jointMission,undefined);
 const objective={phase:'advance',x:2900,y:2730},a=g.ownedUnits(1,'tank')[0];a.fuel=15;const decision=g.prepareJointTask(1,objective,[a],false);assert.equal(decision.advance,false);assert.equal(a.order.type,'rearm');assert.equal(a.fuelReturn,true);
});

test('两栖登陆舰使用真实港口编制、20格载重、有限弹药与岸边分批卸载',()=>{
 const g=fresh(),dock=g.ownedBuildings(0,'dock')[0],ship=g.addUnit(0,'amphibious',3610,5000);g.assignReinforcementHome(ship,dock);
 assert.equal(g.reinforcementCapacity(0,'dock').used,2);assert.equal(ship.ammo,16);assert.equal(ship.fuel,100);
 for(let i=0;i<5;i++){const u=g.addUnit(0,'tank',ship.x,ship.y);ship.passengers.push(u.id);u.embarkedIn=ship.id;}
 assert.equal(g.transportLoad(ship),20);const extra=g.addUnit(0,'rifle',3700,5000);assert.equal(g.canBoardTransport(extra,ship),false);
 g.unloadTransport(ship);assert.equal(ship.unloadQueue,true);step(g,4,()=>g.updateLandingUnload(ship));assert.ok(ship.passengers.length<5);
 const reloaded=Game.fromSave(g.toSave());assert.equal(reloaded.getEntity(ship.id).type,'amphibious');
 const deep=g.addUnit(0,'amphibious',7000,5500),p=g.addUnit(0,'tank',7000,5500);deep.passengers=[p.id];p.embarkedIn=deep.id;g.unloadTransport(deep,false,true);assert.equal(p.embarkedIn,deep.id);
});

test('新增两栖舰模型具有有限网格、可动画艉门与有效轮廓',()=>{
 const model=createAmphibiousModel(),box=new THREE.Box3().setFromObject(model);assert.ok(model.getObjectByName('landing_ramp'));assert.ok(box.max.x-box.min.x>25);let meshes=0;model.traverse(o=>{if(o.isMesh){meshes++;for(const n of o.geometry.attributes.position.array)assert.ok(Number.isFinite(n));}});assert.ok(meshes<=12);
});

test('连续战役三章保留部队、损伤、作战方向与资金，阶段收入独立计算，完整通关',()=>{
 const g=fresh({campaignId:'snowline'}),u=g.ownedUnits(0,'tank')[0];u.hp=210;u.fuel=55;g.players[0].doctrine={id:'bastion',completedAt:0};const credits=g.players[0].credits;
 g.beacons.find(b=>b.id==='snow-pass').owner=0;g.oil[0].owner=0;step(g,30.1,dt=>g.updateSnowCampaign(dt));assert.equal(g.campaign.chapter,1);assert.equal(g.paused,true);assert.equal(g.campaign.status,'intermission');assert.equal(u.hp,210);assert.equal(u.fuel,55);assert.equal(g.players[0].credits,credits);
 let restored=Game.fromSave(g.toSave());assert.equal(restored.campaign.chapter,1);assert.equal(restored.players[0].doctrine.id,'bastion');assert.equal(restored.continueSnowCampaign(),true);
 restored.beacons.filter(b=>['snow-valley','snow-marsh'].includes(b.id)).forEach(b=>b.owner=0);restored.oil[1].owner=0;step(restored,46,dt=>restored.updateSnowCampaign(dt));assert.equal(restored.campaign.chapter,1);
 restored.logistics[0].delivered+=2160;restored.updateSnowCampaign(.05);assert.equal(restored.campaign.chapter,2);assert.equal(campaignSummary(restored).sea,0);restored.continueSnowCampaign();restored.beacons.find(b=>b.id==='snow-port').owner=0;restored.logistics[0].seaDelivered=1800;step(restored,60.1,dt=>restored.updateSnowCampaign(dt));assert.equal(restored.campaign.status,'complete');assert.equal(restored.winner,0);assert.deepEqual(restored.campaign.completed,[0,1,2]);
});

test('战役检查点能恢复撤退，失去目标重算驻守，损失指挥中心明确失败',()=>{
 const g=fresh({campaignId:'snowline'});g.campaign.hold=12;assert.equal(g.retreatSnowCampaign(),true);const c=Game.fromSave(g.toSave());assert.equal(c.campaign.retreats,1);assert.equal(c.campaign.hold,0);c.continueSnowCampaign();c.campaign.hold=12;c.updateSnowCampaign(.05);assert.equal(c.campaign.hold,0);c.ownedBuildings(0,'hq')[0].hp=0;c.updateSnowCampaign(.05);assert.equal(c.campaign.status,'failed');assert.equal(c.winner,1);
 const s=g.toSave();s.state.campaign.chapter=4;assert.throws(()=>Game.fromSave(s));const t=g.toSave();delete t.config.commandVersion;assert.throws(()=>Game.fromSave(t));
});

test('普通单机和联机不混入连续战役状态，旧地图保持原编制',()=>{
 const normal=fresh();assert.equal(normal.campaign,undefined);const old=new Game('china','russia',{}, {mapId:'valley'});assert.equal(old.commandVersion,0);assert.equal(old.chooseDoctrine(0,'bastion'),false);assert.equal(old.queueUnit(0,'amphibious'),false);
});


test('随队补给车充足时不误判为必须返基地，供油到95后恢复原推进任务',()=>{
 const g=fresh(),u=g.addUnit(0,'tank',2000,3000),truck=g.addUnit(0,'supply',2100,3000);u.fuel=30;u.order={type:'attackMove',x:2800,y:3000};g.beginFuelReturn(u);assert.equal(u.fuelReturn,true);assert.equal(g.nearbyFuelAnchor(truck),null);
 step(g,12,dt=>g.updateFuelSystem(dt));assert.ok(u.fuel>=95);assert.equal(u.fuelReturn,undefined);assert.equal(u.order.type,'attackMove');assert.equal(u.order.x,2800);assert.ok(truck.fuelStock<220);assert.ok(g.commandStats[0].transferred>=64);
});

test('玩家手动命令和停止会取消联合任务与自动返场，短时保留操作优先权',()=>{
 const g=fresh(),u=g.ownedUnits(0,'tank')[0];u.fuel=25;g.beginFuelReturn(u);g.selected=[u.id];g.command(1500,2100);assert.equal(u.fuelReturn,undefined);g.updateFuelSystem(.05);assert.equal(u.order.type,'move');g.stopSelected();assert.equal(u.order,null);assert.ok(u.fuelOverrideUntil>g.time);
});

test('正在移动的两栖舰不能装卸兵，海运阶段计数越界与联合任务损坏不能读入',()=>{
 const g=fresh(),s=g.addUnit(0,'amphibious',3610,5000),u=g.addUnit(0,'rifle',3700,5000);s.lastMovedAt=g.time;u.order={type:'board',targetId:s.id};g.boardTransport(u,.05);assert.equal(u.embarkedIn,null);
 const a=g.toSave();a.state.logistics[0].seaDelivered=1;assert.throws(()=>Game.fromSave(a));const b=g.toSave();b.state.units[0].jointMission={x:1e9,y:3,side:0,since:0,stage:'advance',rally:{x:10,y:10},group:[]};assert.throws(()=>Game.fromSave(b));
});


test('标称230范围内立即空中供油，不必绕到更小的隐藏会合半径',()=>{
 const g=fresh(),p=g.addUnit(0,'tanker',2300,2100),u=g.addUnit(0,'fighter',2510,2100);u.fuel=20;u.fuelReturn=true;u.fuelServiceId=p.id;p.fuelTargetId=u.id;u.order={type:'rearm'};g.updateFuelRecipient(u,.05);assert.ok(u.fuel>20);assert.ok(p.fuelStock<420);
});

test('低油返场机优先于尚未离开机位的出场机，取消低油出场会真实退回停机位',()=>{
 const g=fresh(),home=g.ownedBuildings(0,'airfield')[0],a=g.addUnit(0,'fighter',home.x-330,home.y-150),b=g.addUnit(0,'tanker',home.x,home.y);a.fuel=20;a.order={type:'rearm'};a.airfieldOps={homeId:home.id,slot:0,phase:'approach'};b.airfieldOps={homeId:home.id,slot:1,phase:'taxiOut'};Object.assign(b,airfieldParking(home,1));b.order={type:'move',x:2200,y:2200};assert.equal(airfieldRunwayAvailable(g,a,home),true);assert.equal(airfieldRunwayAvailable(g,b,home),false);b.order={type:'rearm'};g.updateFuelSystem(.05);assert.equal(b.airfieldOps.phase,'taxiIn');
});

test('两栖舰港口付费补弹数值有限，空弹仍响应玩家手动移动',()=>{
 const g=fresh(),home=g.ownedBuildings(0,'dock')[0],s=g.addUnit(0,'amphibious',home.x,home.y);g.assignReinforcementHome(s,home);Object.assign(s,g.shipBerth(s,home));s.ammo=0;s.order={type:'rearm',homeId:home.id};const cash=g.players[0].credits;step(g,31,dt=>g.refillStationAmmo(s,dt));assert.equal(s.ammo,16);assert.ok(g.players[0].credits<cash);assert.ok(Number.isFinite(s.rearmProgress));s.ammo=0;g.selected=[s.id];g.command(s.x+300,s.y);g.updateUnit(s,.05);assert.equal(s.order.type,'move');assert.doesNotThrow(()=>g.toSave());const cargo=g.addUnit(0,'rifle',s.x,s.y);cargo.embarkedIn=s.id;s.passengers=[cargo.id];s.ammo=0;s.order=null;g.players[0].credits=0;g.updateUnit(s,.05);assert.notEqual(s.order?.type,'rearm');
});


test('AI只为已侦察港岛预留登陆工程师，船只损失释放预留，岸边卸载后实际接管航标',()=>{
 const g=fresh(),side=4,ship=g.addUnit(side,'amphibious',3610,5000),eng=g.addUnit(side,'engineer',3600,4900);assert.equal(g.knownIslandObjective(side),null);g.hasExploredFor=()=>true;g.reserveLandingTeams(side);assert.equal(eng.landTransportId,ship.id);assert.equal(Game.fromSave(g.toSave()).getEntity(eng.id).landTransportId,ship.id);
 Object.assign(ship,g.navalGoal(3660,5030,87));eng.embarkedIn=ship.id;ship.passengers=[eng.id];ship.transportStage='depart';g.activeUnits(side).filter(u=>u!==ship).forEach(u=>{if(u!==eng)u.order={type:'rearm'};});g.updateAITransports(side);assert.equal(eng.embarkedIn,null);assert.equal(eng.order.type,'capture');assert.equal(eng.order.targetId,'snow-port');
 const spare=g.addUnit(side,'engineer',3600,4900);spare.landTransportId=ship.id;ship.hp=0;g.reserveLandingTeams(side);assert.equal(spare.landTransportId,undefined);
});


test('海上缺钱补弹时等待计时有界，长时间等待仍能保存且恢复资金不会突发复制弹药',()=>{
 const g=fresh(),ship=g.addUnit(0,'supplyShip',4400,5500),u=g.addUnit(0,'destroyer',4200,5500);u.fuel=95;u.ammo=0;g.requestResupply(u);u.fuelServiceId=ship.id;ship.fuelTargetId=u.id;g.players[0].credits=0;step(g,12,dt=>g.updateFuelRecipient(u,dt));assert.equal(u.ammo,0);assert.ok(u.mobileAmmoProgress<=1);assert.doesNotThrow(()=>Game.fromSave(g.toSave()));g.players[0].credits=100;step(g,2,dt=>g.updateFuelRecipient(u,dt));assert.equal(u.ammo,2);assert.equal(ship.ammoStock,88);
});


test('侦察按公开地图的未探索出生区展开，进攻使用实见基地记忆且过期清理，不读取迷雾敌军',()=>{
 const g=fresh({victoryMode:'annihilation'});g.time=300;const p=g.players[1],enemy=g.ownedBuildings(0,'hq')[0];g.hasExploredFor=()=>false;const scout=g.frontlineScoutObjective(1,{x:0,y:0});assert.ok(g.map.spawns.some(s=>s.x===scout.x&&s.y===scout.y&&s.side!==1));
 g.canSeeEntity=()=>false;g.isVisibleFor=()=>false;g.frontlineObjective(1);assert.equal(p.frontlineContacts.length,0);g.canSeeEntity=(side,e)=>e.id===enemy.id;g.frontlineObjective(1);assert.equal(p.frontlineContacts.length,1);g.canSeeEntity=()=>false;assert.equal(g.frontlineObjective(1).x,enemy.x);assert.equal(Game.fromSave(g.toSave()).players[1].frontlineContacts.length,1);g.time+=181;g.frontlineObjective(1);assert.equal(p.frontlineContacts.length,0);
});


test('战役检查点共用迷雾压缩，在已有普通存档的受限空间仍保留完整状态',()=>{
 const g=fresh({campaignId:'snowline'}),save=g.toSave(),text=encodeStoredSave(save);
 assert.ok(text.length<JSON.stringify(save).length/4);assert.equal(JSON.parse(text).storageEncoding,'fog-bits-v1');
 const restored=parseSave(text);assert.deepEqual(restored.state,save.state);assert.deepEqual(restored.config,save.config);
 assert.equal(Game.fromSave(restored).campaign.chapter,0);
});
