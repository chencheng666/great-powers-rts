import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { canCrush } from '../src/vehicle-crush.js';
import { airfieldParking } from '../src/airfield-rules.js';
import { createTandemTransport } from '../src/aircraft-models.js';
import { equipmentModel } from '../src/equipment.js';
import { movementKind } from '../src/battle-sound.js';
import { validateSave } from '../src/savegame.js';
import { sceneryClearance } from '../src/site-presentation.js';
import { battleView } from '../server/battle-view.mjs';
function game(mapId='valley') { const g=new Game('china','nato',{}, {mapId});g.units=[];g.aiTimer=g.aiWaveTimer=1e9;g.hasPower=()=>true;g.fogs.forEach(f=>{f.visible.fill(true);f.explored.fill(true);});return g; }
test('履带坦克沿实际移动轨迹碾压敌方人员和月表机器人，不伤友军、载具或装载人员',()=>{
  for(const map of ['valley','meridian']){
    const g=game(map),tank=g.addUnit(0,'tank',800,800),enemy=g.addUnit(1,'rifle',830,800),friend=g.addUnit(0,'rifle',800,850),vehicle=g.addUnit(1,'tank',800,900),cargo=g.addUnit(1,'engineer',800,800);cargo.embarkedIn=99;
    assert.equal(canCrush(tank,enemy),true);assert.equal(canCrush(tank,friend),false);assert.equal(canCrush(tank,vehicle),false);assert.equal(canCrush(tank,cargo),false);
    for(let n=0;n<20&&enemy.hp>0;n++)g.moveWithAvoidance(tank,{x:1000,y:800},.05,0);assert.equal(enemy.hp,0);assert.equal(friend.hp,friend.maxHp);assert.equal(vehicle.hp,vehicle.maxHp);assert.equal(cargo.hp,cargo.maxHp);
    const stationary=g.addUnit(1,'rifle',tank.x,tank.y);g.moveWithAvoidance(tank,{x:tank.x,y:tank.y},.05,0);assert.equal(stationary.hp,stationary.maxHp);
  }
});
test('飞机返回机场依次滑行到不同机位，按45度停放，出动时滑回跑道，状态可存档',()=>{
  const g=game(), home=g.addBuilding(0,'airfield',1000,1000),planes=[g.addUnit(0,'fighter',700,900),g.addUnit(0,'fighter',740,900)];
  for(const u of planes){u.ammo=0;u.order={type:'rearm'};}
  for(let n=0;n<6000&&planes.some(u=>u.airfieldOps?.phase!=='parked');n++){g.time+=.05;for(const u of planes)g.updateRearm(u,.05);}
  assert.ok(planes.every(u=>u.airfieldOps?.phase==='parked'));
  assert.notEqual(planes[0].airfieldOps.slot,planes[1].airfieldOps.slot);
  for(const u of planes){const p=airfieldParking(home,u.airfieldOps.slot);assert.ok(Math.hypot(u.x-p.x,u.y-p.y)<12);assert.equal(u.angle,Math.PI/4);assert.equal(g.aircraftGrounded(u),true);}
  validateSave(g.toSave());const view=battleView(g,1);assert.equal(view.units.find(u=>u.id===planes[0].id).airfieldOps,undefined);
  const u=planes[0];u.order={type:'move',x:1500,y:1000};g.time+=.05;g.updateUnit(u,.05);assert.equal(u.airfieldOps.phase,'taxiOut');
  for(let n=0;n<300&&u.airfieldOps;n++){g.time+=.05;g.updateUnit(u,.05);}assert.equal(u.airfieldOps,null);assert.ok(u.deployment);assert.equal(g.aircraftGrounded(u),false);
});
test('西陆运输机与货运机均使用可转动的前后双旋翼，月表和其他阵营保留原模型',()=>{
  const model=createTandemTransport();assert.ok(model.getObjectByName('rotor_0_tandem'));assert.ok(model.getObjectByName('rotor_1_tandem'));
  assert.equal(equipmentModel('nato','airlift'),'nato_tandem');assert.equal(equipmentModel('nato','freightPlane'),'nato_tandem');assert.equal(equipmentModel('china','airlift'),'airlift');assert.equal(equipmentModel('nato','airlift',true),'space_airlift');
  const g=game();assert.equal(movementKind(g.addUnit(1,'airlift',900,900),g),'rotor');
});

test('两辆坦克穿越己方、敌方坦克的碰撞边界，不把车辆当作碾压对象',()=>{
 const g=game(),a=g.addUnit(0,'tank',800,800),b=g.addUnit(1,'tank',865,800);for(let i=0;i<40;i++)g.moveWithAvoidance(a,{x:1100,y:800},.05,0);assert.equal(b.hp,b.maxHp);assert.ok(Math.hypot(a.x-b.x,a.y-b.y)>=58);
});
test('取消进场释放机位，滑行中取消则安全停好，损坏存档不能给坦克伪造机场状态',()=>{
 const g=game(),home=g.addBuilding(0,'airfield',1000,1000),u=g.addUnit(0,'fighter',700,900);u.ammo=0;u.order={type:'rearm'};g.updateRearm(u,.05);assert.equal(u.airfieldOps.phase,'approach');u.ammo=1;u.order={type:'move',x:1500,y:900};g.time+=.05;g.updateUnit(u,.05);assert.equal(u.airfieldOps,null);
 u.order={type:'rearm'};for(let n=0;n<1500&&u.airfieldOps?.phase!=='taxiIn';n++){g.time+=.05;g.updateUnit(u,.05);}assert.equal(u.airfieldOps.phase,'taxiIn');u.order=null;
 for(let n=0;n<1000&&u.airfieldOps.phase!=='parked';n++){g.time+=.05;g.updateUnit(u,.05);}assert.equal(u.airfieldOps.phase,'parked');assert.equal(g.aircraftGrounded(u),true);
 const tank=g.addUnit(0,'tank',800,800);tank.airfieldOps={homeId:home.id,slot:1,phase:'parked'};assert.equal(g.aircraftGrounded(tank),false);assert.throws(()=>validateSave(g.toSave()));
});
test('完整游戏帧中敌方人员不会被分离算法提前推走，坦克确实能接触并碾压',()=>{
 const g=game(),tank=g.addUnit(0,'tank',1400,900),target=g.addUnit(1,'rifle',1440,900);g.closestEnemy=()=>null;tank.order={type:'move',x:1600,y:900};
 for(let n=0;n<120&&target.hp>0;n++)g.update(.05);assert.equal(target.hp,0);assert.ok(tank.x>1400);
});

test('机场跑道与新增机位的树石净空覆盖完整铺装',()=>{const airfield={type:'airfield',x:1000,y:1000,size:128,hp:100};const parking=airfieldParking(airfield,5);assert.equal(sceneryClearance({x:parking.x,z:parking.y,scale:16},[airfield]),true);assert.equal(sceneryClearance({x:1800,z:1800,scale:16},[airfield]),false);});
test('六个机位占满时第七架飞机继续盘旋，释放机位后可返场',()=>{
 const g=game(),home=g.addBuilding(0,'airfield',1000,1000);for(let i=0;i<6;i++){const p=airfieldParking(home,i),u=g.addUnit(0,'fighter',p.x,p.y);u.airfieldOps={homeId:home.id,slot:i,phase:'parked'};}
 const waiting=g.addUnit(0,'fighter',1000,1060);waiting.order={type:'rearm'};const x=waiting.x,y=waiting.y;g.updateRearm(waiting,.05);assert.ok(Math.hypot(waiting.x-x,waiting.y-y)>0);assert.equal(waiting.airfieldOps,undefined);
 g.units[2].airfieldOps=null;g.updateRearm(waiting,.05);assert.equal(waiting.airfieldOps.slot,2);
});
