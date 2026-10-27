import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { UNITS } from '../src/data.js';
import { MovementSounds } from '../src/battle-sound.js';
import { impactProfile } from '../src/visual-detail.js';
import { destructionEvent, confirmedAircraftLoss, aircraftCrashPose, aircraftShadowOpacity } from '../src/destruction-presentation.js';
import { updateCarrierDefense } from '../src/carrier-defense.js';
import { validateSave } from '../src/savegame.js';
import { battleView } from '../server/battle-view.mjs';
const setup = () => {
  const g = new Game('china','nato',{}, {mapId:'ocean'});
  g.units=[]; g.effects=[];g.projectiles=[];
  g.closestEnemy=()=>null; g.players.forEach(p=>p.credits=10000);
  g.fogs.forEach(f=>{f.visible.fill(true);f.explored.fill(true);});
  return g;
};
test('全图同型只选己方存活且未装载的相同型号，不受屏幕范围影响',()=>{
  const g=setup(),a=g.addUnit(0,'fighter',500,500),b=g.addUnit(0,'fighter',3000,1700);
  g.addUnit(0,'strike',510,500);g.addUnit(1,'fighter',520,500);
  const passenger=g.addUnit(0,'fighter',530,500);passenger.embarkedIn=123;
  const dead=g.addUnit(0,'fighter',540,500);dead.hp=0;
  g.selected=[a.id];g.selectSelectedType();assert.deepEqual(g.selected.sort((a,b)=>a-b),[a.id,b.id]);
  g.selected=[];assert.equal(g.selectSelectedType(),false);
});
test('脚步跟随真实移动；起落声只对状态变化播放，重连首帧及重置不补播',()=>{
  const g=setup(),u=g.addUnit(0,'fighter',500,500),foot=g.addUnit(0,'rifle',500,510),sound=new MovementSounds();
  let grounded=true;g.aircraftGrounded=()=>grounded;
  sound.sample(g,null,.1);assert.equal(sound.drainTransitions().length,0);
  u.x+=10;foot.x+=10;grounded=false;const loops=sound.sample(g,null,.1);
  assert.ok(loops.some(s=>s.kind==='footsteps'));assert.deepEqual(sound.drainTransitions().map(s=>s.style),['airTakeoff']);
  sound.sample(g,null,.1);assert.equal(sound.drainTransitions().length,0);
  grounded=true;sound.sample(g,null,.1);assert.deepEqual(sound.drainTransitions().map(s=>s.style),['airLanding']);
  sound.reset();grounded=false;sound.sample(g,null,.1);assert.equal(sound.drainTransitions().length,0);
});
test('五种常规损毁分层，空中无地面焦痕判定，数量和范围有上限',()=>{
  for(const [targetType,surface,kind] of [['tank','ground','armor'],['factory','ground','structure'],['fighter','air','air'],['destroyer','water','water'],['rifle','ground','infantry']]){
    const p=impactProfile({type:'explosion',targetType,surface,size:1e6});assert.equal(p.kind,kind);assert.ok(p.radius<=170);assert.ok(p.fragments<=14);assert.ok(p.particles<=48);
  }
  assert.equal(impactProfile({type:'explosion',targetType:'fighter',surface:'ground'}).air,false);
});
test('坠机只认确切可见损毁，不把出迷雾、同型邻机或停机当坠毁',()=>{
  const g=setup(),u=g.addUnit(1,'fighter',900,900);g.aircraftGrounded=()=>false;
  const e=destructionEvent(g,u,0);assert.equal(e.surface,'air');assert.equal(e.entityId,u.id);
  const entry={entity:u,model:{visible:true}};g.effects=[{...e,entityId:u.id+1}];assert.equal(confirmedAircraftLoss(entry,g),false);
  g.effects=[e];assert.equal(confirmedAircraftLoss(entry,g),true);g.isVisibleFor=()=>false;assert.equal(confirmedAircraftLoss(entry,g),false);
  g.aircraftGrounded=()=>true;assert.equal(destructionEvent(g,u,0).surface,'ground');
  for(const rotor of [false,true])for(let age=0;age<=4;age+=.1){const pose=aircraftCrashPose(age,100,.8,3,rotor);assert.ok(pose.height>=0);assert.ok(Math.hypot(pose.x,pose.y)<160);}
  assert.equal(aircraftCrashPose(4,100,0).complete,true);assert.equal(aircraftShadowOpacity(100),0);assert.ok(aircraftShadowOpacity(100,true)>0);
});
test('航母有限近防逐发耗弹和冷却，不能清空饱和来袭，不拦战略弹道',()=>{
  const g=setup(),c=g.addUnit(0,'carrier',1500,1000);g.ownedBuildings=()=>[];g.time=10;
  const missile={id:900,hp:60,owner:1,kind:'missile',x:1600,y:1000},strategic={id:901,hp:60,owner:1,kind:'ballistic',x:1550,y:1000};g.projectiles=[missile,strategic];
  updateCarrierDefense(g,c,.05);assert.equal(c.defenseAmmo,11);assert.equal(missile.hp,38);assert.equal(strategic.hp,60);
  updateCarrierDefense(g,c,.05);assert.equal(missile.hp,38);
  for(let i=0;i<14;i++){g.time+=1;missile.hp=60;updateCarrierDefense(g,c,.05);}
  assert.equal(c.defenseAmmo,0);assert.equal(missile.hp,60);
});
test('航母港口补弹付费，老存档兼容，自卫弹药不泄露给敌方',()=>{
  const g=setup(),dock=g.ownedBuildings(0,'dock')[0],c=g.addUnit(0,'carrier',1500,1000);Object.assign(c,g.shipBerth(c,dock));
  c.defenseAmmo=0;c.lastMovedAt=-100;c.lastDamageAt=-100;g.time=10;const credits=g.players[0].credits;
  updateCarrierDefense(g,c,1.2);assert.equal(c.defenseAmmo,1);assert.equal(g.players[0].credits,credits-8);
  validateSave(g.toSave());const bad=g.toSave();bad.state.units.find(u=>u.id===c.id).defenseAmmo=13;assert.throws(()=>validateSave(bad));
  const enemy=battleView(g,1).units.find(u=>u.id===c.id);assert.ok(enemy);assert.equal(enemy.defenseAmmo,undefined);assert.equal(enemy.defenseReadyAt,undefined);
});
