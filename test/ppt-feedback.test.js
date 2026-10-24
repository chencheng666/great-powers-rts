import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { UNITS } from '../src/data.js';
import { aircraftTurnRate, aircraftCanFire, rotorMotion } from '../src/aircraft-flight.js';
import { airfieldApron } from '../src/airfield-rules.js';

function setup() {
  const g = new Game('china', 'china', {}, { mapId: 'frontier', victoryMode: 'annihilation' });
  g.units = []; g.time = 20; g.aiTimer = g.aiWaveTimer = Infinity;
  for (const f of g.fogs) { f.visible.fill(true); f.explored.fill(true); }
  return g;
}
const tick = (g,u,n=1) => { for(let i=0;i<n;i++){ g.time+=.05;g.updateUnit(u,.05); } };
const delta = (a,b) => Math.abs(Math.atan2(Math.sin(a-b),Math.cos(a-b)));

test('敌人在射程内时普通飞行移动优先，每帧只派一次移动且不擅自开火', () => {
  const g=setup(), u=g.addUnit(0,'fighter',1000,900); g.addUnit(1,'tank',1100,900);
  u.order={type:'move',x:1600,y:900};u.angle=0;u.fireTimer=0;
  g.collectingMoves=true;tick(g,u);
  assert.equal(g.pendingMoves.length,1); assert.equal(g.pendingMoves[0].goal.x,1600);assert.equal(g.projectiles.length,0);
  g.collectingMoves=false;g.pendingMoves=[];tick(g,u,40);
  assert.ok(u.x>1390); assert.ok(Math.abs(u.y-900)<1); assert.equal(u.ammo,UNITS.fighter.ammo);
});

test('现代飞机与直升机按有限角速度转向，固定翼不会抵达盘旋点后悬停', () => {
  for(const type of ['fighter','bomber','helicopter']) {
    const g=setup(),u=g.addUnit(0,type,1200,1000);u.angle=0;u.order={type:'move',x:700,y:1000};
    const rate=aircraftTurnRate(u);g.moveUnitNow(u,u.order,.05);
    assert.ok(delta(u.angle,0)<=rate*.05+.000001);assert.ok(u.x>1200);
  }
  const g=setup(),u=g.addUnit(0,'fighter',1000,1000);g.closestEnemy=()=>null;u.angle=0;
  let minTravel=Infinity;
  for(let i=0;i<400;i++){ const old={x:u.x,y:u.y};tick(g,u); minTravel=Math.min(minTravel,Math.hypot(u.x-old.x,u.y-old.y)); }
  assert.ok(minTravel>9);assert.equal(u.order,null);
  assert.equal(aircraftTurnRate({...u,deployment:{}}),null);assert.equal(aircraftTurnRate(u,true),null);
});

test('机鼻前方才能发射战机导弹，不能朝机尾开火，垂直落弹与地面炮塔不受限', () => {
  const g=setup(),u=g.addUnit(0,'fighter',1000,900),enemy=g.addUnit(1,'tank',900,900);u.angle=0;u.fireTimer=0;
  tick(g,u);assert.equal(g.projectiles.length,0);
  u.angle=Math.PI;tick(g,u);assert.equal(g.projectiles.length,1);
  assert.equal(aircraftCanFire({...u,type:'bomber'},enemy),true);
  assert.equal(aircraftCanFire({...u,type:'tank'},enemy),true);
});

test('轰炸机真实航线使用四枚炸弹后返场，投弹之间持续飞行，不悬停倾泻弹药', () => {
  const g=setup(),u=g.addUnit(0,'bomber',800,1000),target=g.addBuilding(1,'factory',1100,1000);
  g.addBuilding(0,'airfield',400,1000);u.angle=0;u.fireTimer=0;
  u.order={type:'attack',targetId:target.id,x:target.x,y:target.y};
  let previousAmmo=u.ammo,lastDrop=null;
  for(let i=0;i<2400 && u.order?.type!=='rearm';i++){
    const before={x:u.x,y:u.y};tick(g,u);
    if(u.order?.type!=='rearm')assert.ok(Math.hypot(u.x-before.x,u.y-before.y)>5,'投弹期间不能悬停');
    if(u.ammo<previousAmmo){
      if(lastDrop)assert.ok(g.time-lastDrop.time>UNITS.bomber.cooldown);
      lastDrop={time:g.time,x:u.x,y:u.y};previousAmmo=u.ammo;
      if(u.ammo>0)assert.notEqual(u.order?.type,'rearm');
    }
  }
  assert.equal(g.projectiles.length,4);assert.equal(u.ammo,0);assert.equal(u.order.type,'rearm');
});

test('固定翼返场仍能停驻补弹，机场待命不会自动起飞，支援机在野外持续巡航', () => {
  const g=setup(),home=g.addBuilding(0,'airfield',600,900),apron=airfieldApron(home);
  g.closestEnemy=()=>null;g.addBuilding(0,'power',300,600);
  const parked=g.addUnit(0,'fighter',apron.x,apron.y);tick(g,parked,20);assert.equal(parked.x,apron.x);assert.equal(g.aircraftGrounded(parked),true);
  // 分别验证待命与返场，不在单停机位中叠放两架飞机。
  g.units=[];
  const u=g.addUnit(0,'fighter',1600,900);u.angle=0;u.ammo=0;u.order={type:'rearm'};
  for(let i=0;i<1800 && u.ammo<UNITS.fighter.ammo;i++)tick(g,u);
  assert.equal(u.ammo,UNITS.fighter.ammo);assert.ok(Math.hypot(u.x-apron.x,u.y-apron.y)<16);
  const support=g.addUnit(0,'ewPlane',1300,1300);const before=support.x;tick(g,support,10);assert.notEqual(support.x,before);
});

test('桨叶落地后逐渐减速直至停转，再起飞逐渐加速，动画无须写入存档', () => {
  const entry={};assert.equal(rotorMotion(entry,true,.05),47);
  assert.ok(rotorMotion(entry,false,.05)>46);
  for(let i=0;i<100;i++)rotorMotion(entry,false,.05);
  assert.equal(entry.rotorSpeed,0);assert.ok(Math.abs(rotorMotion(entry,true,.05)-1.2)<1e-9);
});


test('机场被摧毁后的空弹固定翼继续盘旋，不在空中停住，保留返场状态等待设施', () => {
  const g=setup(),u=g.addUnit(0,'fighter',1000,900);u.angle=0;u.ammo=0;u.order={type:'rearm'};
  const before={x:u.x,y:u.y};tick(g,u,20);assert.ok(Math.hypot(u.x-before.x,u.y-before.y)>100);assert.equal(u.order.type,'rearm');
});

test('间谍定时破坏有爆炸事件及音效，存活或摧毁建筑都只引爆一次', () => {
  for(const shield of [false,true]) {
    const g=setup(),building=g.addBuilding(1,'factory',1600,1200),shots=[];
    g.events.shot=(style,owner)=>shots.push({style,owner});
    building.sabotage={owner:0,plantedAt:0,detonateAt:1};
    if(shield)g.players[1].shieldUntil=g.time+10;
    g.updateIntelligence(.05);g.updateIntelligence(.05);
    assert.equal(building.sabotage,undefined);assert.deepEqual(shots,[{style:'sabotageBlast',owner:0}]);
    assert.ok(g.effects.some(e=>e.type==='explosion'&&e.x===building.x&&e.y===building.y));
  }
});


test('战机前向射界仍可持续多轮攻击，目标落在机后时先拉开再转回，不绕切线圆而永久停火', () => {
  for(const type of ['fighter','strike'])for(const explicit of [false,true]){
    const g=setup(),u=g.addUnit(0,type,800,1000),target=g.addBuilding(1,'factory',1200,1000);
    u.angle=0;u.fireTimer=0;u.order=explicit?{type:'attack',targetId:target.id,x:target.x,y:target.y}:null;
    for(let i=0;i<2400 && u.ammo>0;i++){
      const before={x:u.x,y:u.y};tick(g,u);assert.ok(Math.hypot(u.x-before.x,u.y-before.y)>5,type+' 攻击期间不能悬停');
    }
    assert.equal(u.ammo,0,type);assert.equal(g.projectiles.length,UNITS[type].ammo,type);
  }
});
