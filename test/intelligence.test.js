import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Game } from '../src/game.js';
import { MAPS,UNITS,BUILDINGS } from '../src/data.js';
import { battlefieldMap,resourceLayout } from '../src/battlefield-expansion.js';
import { INTELLIGENCE_RULES } from '../src/intelligence.js';
import { validateSave } from '../src/savegame.js';
import { orderRoutes } from '../src/order-routes.js';
import { createPersonnel,createResourceModel } from '../src/personnel-models.js';
import { VOICE_LINES,normalizeAudioSettings } from '../src/audio-data.js';

const quiet=(mapId='valley',scale=1)=>{const g=new Game('china','russia',{}, {mapId,battlefieldScale:scale});g.aiTimer=g.aiWaveTimer=100000;g.updateLogistics=()=>{};return g;};
const reveal=g=>{for(const fog of g.fogs){fog.visible.fill(true);fog.explored.fill(true);}g.fogTimer=100000;};
const tick=(g,seconds)=>{for(let i=0;i<Math.ceil(seconds/.05);i++)g.update(.05);};
const station=(g,side)=>{for(let i=0;i<4;i++)g.addBuilding(side,'power',side?g.world.width-100-i*80:100+i*80,100);const b=g.addBuilding(side,'super',side?g.world.width-200:200,250);g.players[side].credits=3000;return b;};

test('七张地图可扩大到 2.25 倍面积，目标、通道、港口镜像且旧版尺寸不变',()=>{
  for(const mapId of Object.keys(MAPS)){
    const original=JSON.stringify(MAPS[mapId]),small=quiet(mapId),large=quiet(mapId,1.5);
    assert.equal(large.world.width,small.world.width*1.5);assert.equal(large.world.height,small.world.height*1.5);
    assert.equal(JSON.stringify(MAPS[mapId]),original);assert.equal(battlefieldMap(mapId,1),MAPS[mapId]);
    const units=large.ownedUnits(0),enemy=large.ownedUnits(1);for(const u of units){const v=enemy.find(e=>e.type===u.type&&Math.abs(e.x-(large.world.width-u.x))<.01&&Math.abs(e.y-(large.world.height-u.y))<.01);assert.ok(v,mapId);}
    for(const s of resourceLayout(large.map)){const opposite=large.resourceSites.find(v=>v.id!==s.id&&v.type===s.type);assert.equal(s.x+opposite.x,large.world.width);assert.equal(s.y+opposite.y,large.world.height);assert.ok(!large.isGroundBlocked(s.x,s.y,14),`${mapId} ${s.id}`);}
    for(const b of large.ownedBuildings(0,'dock')){const zone=large.map.dockZones[0];assert.ok(b.x>=zone.x1&&b.x<=zone.x2&&b.y>=zone.y1&&b.y<=zone.y2);}
    const loaded=Game.fromSave(large.toSave());assert.equal(loaded.world.width,large.world.width);assert.deepEqual(loaded.resourceSites,large.resourceSites);
  }
});

test('间谍保留侦察与反隐、无武装；一次潜入不能重复使用，倒计时长于工程师生产',()=>{
  const g=quiet(),b=g.ownedBuildings(1,'factory')[0];for(const u of g.ownedUnits(1))u.hp=0;const spy=g.addUnit(0,'scout',b.x-60,b.y);reveal(g);g.selected=[spy.id];g.command(b.x,b.y);
  assert.equal(spy.order.type,'infiltrate');assert.equal(UNITS.scout.damage,0);assert.equal(UNITS.scout.sight,480);assert.equal(g.detectionRange(0,spy),260);
  tick(g,1);assert.ok(b.sabotage);assert.equal(b.sabotage.detonateAt-b.sabotage.plantedAt,45);assert.ok(INTELLIGENCE_RULES.bombDelay>UNITS.engineer.time);assert.equal(g.getEntity(spy.id),undefined);
  const planted=b.sabotage.plantedAt;tick(g,1);assert.equal(b.sabotage.plantedAt,planted);
});

test('工程师拆弹需接近并停驻三秒，完成保留机体；攻击或错误目标不能瞬间解除',()=>{
  const g=quiet(),b=g.ownedBuildings(0,'factory')[0];b.sabotage={owner:1,plantedAt:0,detonateAt:45};const engineer=g.addUnit(0,'engineer',b.x+55,b.y);g.selected=[engineer.id];g.command(b.x,b.y);assert.equal(engineer.order.type,'defuse');
  engineer.lastDamageAt=0;tick(g,.5);assert.ok(b.sabotage);tick(g,4);assert.equal(b.sabotage,undefined);assert.ok(engineer.hp>0);assert.equal(engineer.order,null);
  const enemy=g.ownedBuildings(1,'factory')[0];enemy.sabotage={owner:0,plantedAt:g.time,detonateAt:g.time+45};engineer.order={type:'defuse',targetId:enemy.id,x:enemy.x,y:enemy.y};g.updateSpecialOrder(engineer,.05);assert.ok(enemy.sabotage);assert.equal(engineer.order,null);
});

test('未拆除的炸弹按战局时间引爆，暂停不推进；潜入方和防守方使用相同规则',()=>{
  for(const side of [0,1]){const g=quiet(),b=g.ownedBuildings(side,'power')[0];b.sabotage={owner:1-side,plantedAt:0,detonateAt:45};g.paused=true;tick(g,46);assert.equal(b.hp,b.maxHp);g.paused=false;tick(g,44);assert.ok(b.hp>0);tick(g,2);assert.ok(b.hp<=0);}
});

test('网络战需战略站、供电、120秒充能与500资金，预警12秒、干扰4秒且不能叠加',()=>{
  const g=quiet();assert.equal(g.launchCyber(0),false);const b=station(g,0);tick(g,119);assert.equal(g.launchCyber(0),false);tick(g,2);const credits=g.players[0].credits;assert.equal(g.launchCyber(0),true);assert.equal(g.players[0].credits,credits-500);assert.equal(g.launchCyber(0),false);assert.ok(!g.isControlLocked(1));tick(g,11);assert.ok(!g.isControlLocked(1));tick(g,1.1);assert.ok(g.isControlLocked(1));assert.equal(g.players[1].cyberSourceId,b.id);tick(g,4.1);assert.ok(!g.isControlLocked(1));
});

test('网络干扰只锁新指令，既有行军、反击与生产继续；摧毁源站立即解除',()=>{
  const g=quiet(),b=station(g,1),tank=g.ownedUnits(0,'tank')[0];for(const u of g.ownedUnits(1))u.hp=0;g.selected=[tank.id];g.command(1500,790);const initial=g.ownedUnits(0,'rifle').length;g.queueUnit(0,'rifle');g.players[1].cyberCharge=120;g.launchCyber(1);tick(g,12.1);assert.equal(g.isControlLocked(0),true);assert.ok(g.ownedUnits(0,'rifle').length>initial);
  const order=structuredClone(tank.order),x=tank.x;assert.equal(g.command(700,500),false);assert.deepEqual(tank.order,order);assert.equal(g.startBuild(0,'power'),false);assert.equal(g.queueUnit(0,'tank'),false);assert.equal(g.stopSelected(),false);tick(g,.5);assert.notEqual(tank.x,x);
  const enemy=g.addUnit(1,'rifle',tank.x+50,tank.y);reveal(g);tank.fireTimer=0;tick(g,.1);assert.ok(enemy.hp<enemy.maxHp||g.projectiles.length>0);
  b.hp=0;assert.equal(g.isControlLocked(0),false);assert.equal(g.command(700,500),undefined);
});

test('断电能取消预警和正在进行的网络干扰，不因增建源站叠加充能',()=>{
  const g=quiet();station(g,1);g.addBuilding(1,'super',g.world.width-350,250);tick(g,10);assert.ok(g.players[1].cyberCharge<=10.01);g.players[1].cyberCharge=120;g.launchCyber(1);for(const b of g.ownedBuildings(1,'power'))b.hp=0;tick(g,.1);assert.equal(g.players[1].cyberPending,null);assert.equal(g.isControlLocked(0),false);
});

test('物资箱有限回收，设备回收限定支援单位；不在常规战场挖矿或重复领钱',()=>{
  const g=quiet(),site=g.resourceSites.find(s=>s.type==='cache'),u=g.addUnit(0,'rifle',site.x-10,site.y);reveal(g);g.selected=[u.id];g.command(site.x,site.y);assert.equal(u.order.type,'collect');const before=g.players[0].credits;tick(g,5);assert.ok(Math.abs(g.players[0].credits-before-300)<.01);assert.equal(site.amount,0);tick(g,3);assert.ok(Math.abs(g.players[0].credits-before-300)<.01);assert.equal(g.ore.length,0);
  const salvage=g.resourceSites.find(s=>s.type==='salvage');g.selected=[u.id];g.command(salvage.x,salvage.y);assert.equal(u.order.type,'move');const supply=g.addUnit(0,'supply',salvage.x-10,salvage.y);g.selected=[supply.id];g.command(salvage.x,salvage.y);assert.equal(supply.order.type,'collect');tick(g,1);assert.ok(salvage.amount<900);
});

test('双方同时回收争夺点时不按更新顺序抢领，能源仓可夺取但总库存不刷新',()=>{
  const g=quiet(),cache=g.resourceSites.find(s=>s.type==='cache');for(const side of [0,1]){const u=g.addUnit(side,'engineer',cache.x+(side?10:-10),cache.y);u.order={type:'collect',targetId:cache.id,x:cache.x,y:cache.y};}tick(g,1);assert.equal(cache.amount,300);
  const depot=g.resourceSites.find(s=>s.type==='depot'),e=g.addUnit(0,'engineer',depot.x-10,depot.y);e.order={type:'capture',targetId:depot.id,x:depot.x,y:depot.y};tick(g,.1);assert.equal(depot.owner,0);assert.equal(g.getEntity(e.id),undefined);assert.equal(g.players[0].powerIn,140);const amount=depot.amount;tick(g,1);assert.ok(depot.amount<amount);assert.ok(g.canPlace(0,'power',depot.x+120,depot.y));
  const opponent=g.addUnit(1,'engineer',depot.x+10,depot.y);opponent.order={type:'capture',targetId:depot.id,x:depot.x,y:depot.y};const remaining=depot.amount;tick(g,.1);assert.equal(depot.owner,1);assert.ok(depot.amount<=remaining);assert.equal(g.players[0].powerIn,100);
});

test('新增尺寸、炸弹、网络排程和回收命令均可保存恢复，非法状态拒绝',()=>{
  const g=quiet('meridian',1.5),b=station(g,1);g.players[1].cyberCharge=120;g.launchCyber(1);const target=g.ownedBuildings(0,'factory')[0];target.sabotage={owner:1,plantedAt:0,detonateAt:45};const e=g.addUnit(0,'engineer',700,800),site=g.resourceSites[0];e.order={type:'collect',targetId:site.id,x:site.x,y:site.y,progress:2};const save=g.toSave(),loaded=Game.fromSave(save);assert.deepEqual(loaded.players[1].cyberPending,g.players[1].cyberPending);assert.deepEqual(loaded.getEntity(target.id).sabotage,target.sabotage);assert.deepEqual(loaded.getEntity(e.id).order,e.order);
  for(const mutate of [s=>s.config.battlefieldScale=3,s=>s.state.resourceSites[0].amount=999999,s=>s.state.players[0].cyberLockedUntil=9999,s=>s.state.buildings.find(v=>v.id===target.id).sabotage.detonateAt=1]){const bad=structuredClone(save);mutate(bad);assert.throws(()=>validateSave(bad));}
  const old=quiet().toSave();delete old.config.battlefieldScale;delete old.state.resourceSites;assert.equal(Game.fromSave(old).resourceSites.length,0);
});

test('行军虚线跟随己方实际寻路与目的地，不显示敌方命令或未侦察目标现位置',()=>{
  const g=quiet(),tank=g.ownedUnits(0,'tank')[0];g.selected=[tank.id];g.command(800,650);tank.path=[{x:680,y:730},{x:740,y:650}];const routes=orderRoutes(g);assert.equal(routes.length,1);assert.deepEqual(routes[0].points[0],{x:tank.x,y:tank.y});assert.deepEqual(routes[0].destination,{x:800,y:650});
  const enemy=g.ownedUnits(1,'tank')[0];tank.order={type:'attack',targetId:enemy.id,x:1100,y:900};g.fogs[0].visible.fill(false);assert.deepEqual(orderRoutes(g)[0].destination,{x:1100,y:900});g.selected=[enemy.id];assert.equal(orderRoutes(g).length,0);
});

test('人物比例、独立步态、黑西装公文包及资源站模型有效，合批限制绘制调用',()=>{
  for(const type of ['rifle','engineer','scout']){const model=createPersonnel(type);assert.ok(model.getObjectByName('leg_left')&&model.getObjectByName('leg_right'));let count=0;model.traverse(m=>{if(m.isMesh){count++;assert.ok([...m.geometry.attributes.position.array].every(Number.isFinite));}});assert.ok(count<=16);}
  for(const type of ['cache','salvage','depot']){const model=createResourceModel(type);assert.ok(model.children.length>0);}
});

test('内置男女声均覆盖全部原创台词，新警报包含设施名称，音色设置可持久化',()=>{
  const manifest=JSON.parse(readFileSync(new URL('../assets/audio/portable/manifest.json',import.meta.url))),count=Object.values(VOICE_LINES).reduce((n,v)=>n+v.length,0);assert.equal(manifest.files.length,count);assert.equal(manifest.femaleFiles.length,count);assert.equal(manifest.femaleVoice,'cmn+f3');assert.equal(normalizeAudioSettings({voiceURI:'portable-female'}).voiceURI,'portable-female');
  for(const type of Object.keys(BUILDINGS))assert.ok(VOICE_LINES[`spyInfiltrated_${type}`][0].includes(BUILDINGS[type].name));
});
