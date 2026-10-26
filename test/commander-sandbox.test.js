import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { BUILDINGS, UNITS } from '../src/data.js';
import { productionDuration } from '../src/battlefield-details.js';
import { CommanderLoyalty, SANDBOX_KEY, LOYALTY_MS, applySandbox, sandboxSpeed, unlimitedAmmo, validSandbox } from '../src/commander-sandbox.js';
import { settleHonors } from '../src/player-honors.js';
import { settleChallengeResult } from '../src/challenge-profile.js';
import { telemetryContext } from '../src/player-telemetry.js';
const storage = () => {const data = new Map();return {getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};};
const settings = { credits: 100000, speed: 3, unlimitedAmmo: true };
const game = options => new Game('china','russia',{},options);

test('忠实玩家满两小时才解锁，前台有效时间、暂停、后台、观战和时钟倒退有界', () => {
  let now=0;const store=storage(),g={running:true,paused:false},loyalty=new CommanderLoyalty(store,()=>now);
  loyalty.tick(g); for(let i=0;i<7199;i++){now+=1000;assert.equal(loyalty.tick(g),false);}
  assert.equal(loyalty.unlocked,false); now+=1000;assert.equal(loyalty.tick(g),true);assert.equal(loyalty.activeMs,LOYALTY_MS);
  assert.equal(new CommanderLoyalty(store,()=>0).unlocked,true);assert.equal(new CommanderLoyalty(storage(),()=>0).activeMs,0);
  const l=new CommanderLoyalty(storage(),()=>now); l.tick(g);now+=1000;l.tick(g);g.paused=true;l.tick(g);now+=600000;l.tick(g);assert.equal(l.activeMs,1000);
  g.paused=false;l.tick(g);now+=5000;l.tick(g,false);assert.equal(l.activeMs,1000);l.tick(g,false);now+=9000;l.tick(g);assert.equal(l.activeMs,1000);
  l.tick({...g,spectator:true});now+=1000;l.tick({...g,spectator:true});assert.equal(l.activeMs,1000);
  now-=2000;l.tick(g);assert.equal(l.activeMs,1000);
});
test('参数有界、默认关闭、持久化失败仍可本次使用',()=>{
  for(const item of [{...settings,speed:0},{...settings,speed:Infinity},{...settings,credits:Infinity},{...settings,credits:1e12},{...settings,unlimitedAmmo:1}])assert.equal(validSandbox(item),false);
  const s=storage(),l=new CommanderLoyalty(s,()=>0);assert.equal(l.settings,null);assert.throws(()=>l.configure(settings));
  l.unlocked=true;l.configure(settings);assert.deepEqual(new CommanderLoyalty(s,()=>0).settings,settings);l.configure(null);assert.equal(JSON.parse(s.getItem(SANDBOX_KEY)).settings,null);
  const noStore=new CommanderLoyalty({getItem(){throw Error();},setItem(){throw Error();}},()=>0);noStore.unlocked=true;noStore.configure(settings);assert.equal(noStore.storageError,true);
});
test('单机资金、生产提速保持花费与进度比例，敌军不变，非法与联网挑战不可用',()=>{
  const g=game(); const b=g.addBuilding(0,'barracks',500,500);b.active={type:'rifle',paid:UNITS.rifle.cost/2,progress:UNITS.rifle.time/2};
  g.players[0].buildQueue={type:'power',paid:BUILDINGS.power.cost/2,progress:BUILDINGS.power.time/2};
  const original=productionDuration(g,b,'rifle');applySandbox(g,settings);
  assert.equal(g.players[0].credits,100000);assert.equal(sandboxSpeed(g,0),3);assert.equal(sandboxSpeed(g,1),1);
  assert.equal(productionDuration(g,b,'rifle'),original/3);assert.ok(Math.abs(b.active.progress-UNITS.rifle.time/6)<1e-9);
  assert.ok(Math.abs(g.players[0].buildQueue.progress-BUILDINGS.power.time/6)<1e-9);
  let paid=g.players[0].buildQueue.paid;g.updateBuildQueue(g.players[0],.05);assert.ok(Math.abs(g.players[0].buildQueue.paid-paid-BUILDINGS.power.cost/BUILDINGS.power.time*3*.05)<1e-6);
  g.players[0].credits=200000;applySandbox(g,{...settings,speed:2});assert.equal(g.players[0].credits,200000);
  for(const altered of [{multiplayer:true},{online:true},{challenge:{}},{playerCount:6}])assert.throws(()=>applySandbox(Object.assign(game(),altered),settings));
});
test('无限弹药不恢复机体、载机数量或机器人电量，普通局仍消耗弹药',()=>{
  const g=game();const u=g.addUnit(0,'tank',600,600),enemy=g.addUnit(1,'tank',650,600);u.ammo=0;u.hp-=30;const health=u.hp;applySandbox(g,settings);g.update(.01);
  assert.equal(u.ammo,UNITS.tank.ammo);assert.equal(u.hp,health);assert.equal(unlimitedAmmo(g,enemy),false);
  const carrier=g.addUnit(0,'carrier',600,600);carrier.wing=0;carrier.hp=10;g.update(0);assert.equal(carrier.wing,0);assert.equal(carrier.hp,10);
  const normal=game();assert.equal(unlimitedAmmo(normal,normal.addUnit(0,'tank',600,600)),false);
  const moon=game({mapId:'meridian'});const robot=moon.addUnit(0,'tank',600,600);robot.battery=33;applySandbox(moon,settings);moon.update(0);assert.equal(robot.battery,33);
});
test('沙盘存档标记持久、旧档可读、无效标记拒绝、成绩和统计独立',()=>{
  const g=game();applySandbox(g,settings);const save=g.toSave();const restored=Game.fromSave(save);assert.deepEqual(restored.sandbox,settings);assert.equal(restored.players[0].credits,100000);
  const old=game().toSave();assert.equal(Game.fromSave(old).sandbox,null);const bad=structuredClone(save);bad.config.sandbox.speed=0;assert.throws(()=>Game.fromSave(bad));
  assert.throws(()=>settleHonors(storage(),{sandbox:settings}));assert.throws(()=>settleChallengeResult(storage(),g));assert.equal(telemetryContext(g).mode,'sandbox');
});
