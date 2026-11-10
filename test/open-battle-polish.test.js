import test from 'node:test';
import assert from 'node:assert/strict';
import {airCombatPose} from '../src/aircraft-flight.js';
import {Game} from '../src/game.js';
import {parseSave} from '../src/savegame.js';
import {battleView} from '../server/battle-view.mjs';
import {executeCommand} from '../server/commands.mjs';
import {CRUISE} from '../src/submarine-cruise.js';
import {projectileFlightPose} from '../src/projectile-flight.js';
import {normalizeAudioSettings} from '../src/audio-data.js';
function setup(){const g=new Game('china','nato',{}, {mapId:'ocean',multiplayer:true});g.units=[];g.buildings=[];g.players.forEach(p=>{p.credits=10000;p.powerIn=1000;p.powerOut=0});for(const f of g.fogs){f.visible.fill(true);f.explored.fill(true)}for(const type of ['dock','radar','lab'])g.addBuilding(0,type,300,500);g.players[0].powerIn=1000;g.players[0].powerOut=0;return g;}

test('四管火箭依次发射，网络不提前显示，排程保存后按余时继续',()=>{
 const g=setup(),u=g.addUnit(0,'rocket',700,700),target=g.addUnit(1,'tank',1300,700);
 g.fire(u,target,80,'rocket');assert.equal(g.projectiles.length,4);assert.equal(g.projectiles.filter(p=>!p.queued).length,1);assert.equal(battleView(g,0).projectiles.length,1);
 g.updateProjectiles(.1);assert.equal(g.projectiles.filter(p=>!p.queued).length,1);
 const restored=Game.fromSave(parseSave(JSON.stringify(g.toSave())));restored.paused=false;
 restored.updateProjectiles(.03);assert.equal(restored.projectiles.filter(p=>!p.queued).length,2);
 for(let i=0;i<6;i++)restored.updateProjectiles(.05);assert.equal(restored.projectiles.filter(p=>!p.queued).length,4);
 assert.equal(restored.projectiles.reduce((n,p)=>n+p.amount,0),80);
 const before=restored.projectiles.map(p=>p.x);restored.paused=true;restored.update(.1);assert.deepEqual(restored.projectiles.map(p=>p.x),before);
});

test('发射车被摧毁或登载后取消未发射火箭，已离架弹继续飞行',()=>{
 for(const patch of [{hp:0},{embarkedIn:999}]){const g=setup(),u=g.addUnit(0,'rocket',700,700),target=g.addUnit(1,'tank',1300,700);g.fire(u,target,80,'rocket');Object.assign(u,patch);g.updateProjectiles(.2);assert.equal(g.projectiles.length,1);assert.equal(g.projectiles[0].amount,20);}
});

test('潜艇巡航弹独立付费和限量，普通鱼雷弹药不变，敌方不能代买代射',()=>{
 const g=setup(),u=g.addUnit(0,'submarine',1100,700),target=g.addUnit(1,'tank',1700,700),before=g.players[0].credits,torpedoes=u.ammo;
 assert.equal(u.cruiseAmmo,undefined);assert.ok(executeCommand(g,0,{action:'buy-cruise',id:u.id}));assert.ok(g.buyCruise(u));assert.equal(g.buyCruise(u),false);
 assert.equal(g.players[0].credits,before-CRUISE.cost*2);assert.equal(u.ammo,torpedoes);
 assert.equal(executeCommand(g,1,{action:'buy-cruise',id:u.id}),false);assert.equal(executeCommand(g,1,{action:'cruise',id:u.id,x:target.x,y:target.y}),false);
 assert.ok(executeCommand(g,0,{action:'cruise',id:u.id,x:target.x,y:target.y}));assert.equal(u.cruiseAmmo,1);assert.equal(g.projectiles[0].flightRole,'sub-launched');assert.equal(g.launchCruiseAt(u.id,target.x,target.y),false);
 const restored=Game.fromSave(parseSave(JSON.stringify(g.toSave())));assert.equal(restored.getEntity(u.id).cruiseAmmo,1);assert.equal(restored.projectiles[0].flightRole,'sub-launched');
});

test('巡航弹拒绝迷雾、空海目标和射程外目标，不扣弹，出水后可被舰载防空拦截',()=>{
 const g=setup(),u=g.addUnit(0,'submarine',1100,700),land=g.addUnit(1,'tank',1700,700),ship=g.addUnit(1,'frigate',1600,850),air=g.addUnit(1,'fighter',1500,500);
 g.buyCruise(u);g.fogs[0].visible.fill(false);assert.equal(g.launchCruiseAt(u.id,land.x,land.y),false);g.fogs[0].visible.fill(true);
 for(const target of [ship,air,{x:4000,y:4000}])assert.equal(g.launchCruiseAt(u.id,target.x,target.y),false);assert.equal(u.cruiseAmmo,1);
 assert.ok(g.launchCruiseAt(u.id,land.x,land.y));const p=g.projectiles[0],position=[p.x,p.y];g.updateProjectiles(.4);assert.deepEqual([p.x,p.y],position);assert.ok(projectileFlightPose(p).height>0);
 const aa=g.addUnit(1,'destroyer',1120,720);aa.fireTimer=0;g.updateProjectiles(.1);assert.equal(g.projectiles.length,1);g.updateProjectiles(.4);g.updateProjectiles(.02);assert.equal(g.projectiles.length,0);
});

test('旧存档不凭空获得巡航弹，新增弹药与火箭排程拒绝非法存档值',()=>{
 const g=setup(),u=g.addUnit(0,'submarine',1100,700),save=g.toSave();assert.equal(Game.fromSave(parseSave(JSON.stringify(save))).getEntity(u.id).cruiseAmmo,undefined);
 for(const value of [-1,3,1.5,Infinity]){const copy=structuredClone(save);copy.state.units.find(v=>v.id===u.id).cruiseAmmo=value;assert.throws(()=>parseSave(JSON.stringify(copy)));}
});

test('新配乐默认迁移一次，音量静音保留，之后允许用户选择旧曲',()=>{
 const first=normalizeAudioSettings({musicTrack:'iron-tide',master:.3,music:.25,muted:true});assert.equal(first.musicTrack,'war-theme');assert.equal(first.master,.3);assert.equal(first.music,.25);assert.equal(first.muted,true);
 const chosen=normalizeAudioSettings({...first,musicTrack:'internationale'});assert.equal(chosen.musicTrack,'internationale');
 assert.equal(normalizeAudioSettings({...first,musicTrack:'final-battle'}).musicTrack,'final-battle');
});

test('战机切入和拉起姿态有边界，运输、起降及月面飞行不套用',()=>{
 const jet={type:'fighter',x:0,y:0,angle:0,hp:100,lastFireAt:10},target={type:'fighter',x:100,y:0,hp:100};
 const lift=airCombatPose(jet,target,11);assert.ok(lift.height>0&&lift.height<=16);assert.ok(lift.pitch>0);
 const dive=airCombatPose({...jet,lastFireAt:0},target,11);assert.equal(dive.height,-7);
 for(const patch of [{type:'freightPlane'},{deployment:{}},{deckApproach:{}},{embarkedIn:7},{order:{type:'rearm'}}])assert.deepEqual(airCombatPose({...jet,...patch},target,11),{height:0,pitch:0});
 assert.deepEqual(airCombatPose(jet,target,11,true),{height:0,pitch:0});
});

test('电脑巡航打击遵守同样的付费和侦察限制，敌方视图不泄漏库存与冷却',()=>{
 const g=setup(),u=g.addUnit(0,'submarine',1100,700),t=g.addUnit(1,'tank',1700,700),before=g.players[0].credits;
 g.updateCruiseAI(0);assert.equal(g.projectiles.length,1);assert.equal(g.players[0].credits,before-CRUISE.cost);
 const own=battleView(g,0).units.find(e=>e.id===u.id);assert.equal(own.cruiseAmmo,0);
 const enemy=battleView(g,1).units.find(e=>e.id===u.id);assert.ok(enemy);assert.equal(enemy.cruiseAmmo,undefined);assert.equal(enemy.cruiseReadyAt,undefined);
 const fresh=setup(),sub=fresh.addUnit(0,'submarine',1100,700);fresh.addUnit(1,'tank',1700,700);fresh.fogs[0].visible.fill(false);fresh.updateCruiseAI(0);assert.equal(sub.cruiseAmmo,undefined);assert.equal(fresh.projectiles.length,0);
});
