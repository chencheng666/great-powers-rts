import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PERSONNEL_STYLES } from '../src/personnel-identity.js';
import { createPersonnel } from '../src/personnel-models.js';
import { personnelLOD } from '../src/personnel-lod.js';
import { QUICK_PRESETS } from '../src/quick-entry.js';
import { discoverMaps } from '../src/map-discovery.js';
import { MAPS } from '../src/data.js';
import { Game } from '../src/game.js';
import { parseSave } from '../src/savegame.js';
import { realisticEffects } from '../src/realistic-fx.js';

test('三种人员近远景保留各自服色和轮廓，不以职责色覆盖敌我标识', () => {
  const signatures = new Set();
  for (const type of ['rifle', 'engineer', 'scout']) {
    const model = createPersonnel(type), style = PERSONNEL_STYLES[type];
    let fabric, team;
    model.traverse(mesh => { if (mesh.isMesh && mesh.material.name === style.material) fabric = mesh.material; if (mesh.isMesh && mesh.material.name === '阵营标识') team = mesh.material; });
    assert.ok(fabric); assert.ok(fabric.color.equals(new THREE.Color(style.fabric)));
    signatures.add(`${fabric.color.getHexString()}:${new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3()).toArray()}`);
    const lod = personnelLOD(model); assert.ok(lod.getObjectByName('weapon_pose'));
    const positions = []; lod.traverse(mesh => { if(mesh.isMesh) positions.push(...mesh.geometry.attributes.position.array); });
    assert.ok(positions.length && positions.every(Number.isFinite));
    if (team) assert.notEqual(team.color.getHexString(), new THREE.Color(style.color).getHexString());
  }
  assert.equal(signatures.size, 3);
});

test('四个推荐玩法能真实开局和存档恢复，推荐列表不删除原地图', () => {
  assert.equal(discoverMaps(Object.keys(MAPS), 'recommended').length, 4);
  const all = discoverMaps(Object.keys(MAPS));
  assert.ok(all.includes('strategic') && all.includes('sixfront') && all.includes('meridian'));
  for (const preset of Object.values(QUICK_PRESETS)) {
    const game = new Game('china', 'nato', {}, {mapId:preset.mapId,difficulty:preset.difficulty,victoryMode:preset.victory});
    for(let i=0;i<20;i++)game.update(.05);
    const restored = Game.fromSave(parseSave(JSON.stringify(game.toSave())));
    assert.equal(restored.mapId, preset.mapId); assert.equal(restored.victoryMode, preset.victory);
    assert.equal(restored.players[0].credits, game.players[0].credits); assert.equal(restored.sandbox, null);
  }
});

test('加粗动能曳光与连续能量束均能处理零距离和各缩放，不产生无效几何', () => {
  for (const style of ['tank', 'rifle', 'laser', 'repair']) for (const distance of [0, 5, 500]) {
    const effect={x:0,y:0,toX:distance,toY:0,sourceType:'tank',targetType:'tank',style,duration:.2,age:0};
    const context={entities:new Map(),camera:{zoom:.45},scene:new THREE.Scene(),trails:[],game:{time:0},effectHeight:()=>20,combatFlash:()=>{},effectSprite:()=>new THREE.Sprite(new THREE.SpriteMaterial())};
    const group=new THREE.Group(); realisticEffects.createWeaponEffect.call(context,effect,group);
    assert.equal(group.children[0].isLine===true,['laser','repair'].includes(style));
    for (const age of [0,.05,.1,.2]) {
      effect.age=age; realisticEffects.animateWeaponEffect.call(context,effect,group);
      group.traverse(item=>{assert.ok([...item.position.toArray(),...item.scale.toArray(),...item.quaternion.toArray()].every(Number.isFinite));});
    }
  }
});

import { createRadarArray, refineRadarStation, weaponMountYaw } from '../src/radar-models.js';
import { createAirDefense } from '../src/air-defense-models.js';
import { sceneryClearance } from '../src/site-presentation.js';
import { projectileFlightPose } from '../src/projectile-flight.js';
import { shipWakePose } from '../src/ship-wake.js';
import { synthesizeMovement } from '../src/sound-effects.js';

test('建筑预警阵列和车载雷达保留旋转关节，网格合批避免逐单元绘制', () => {
  const station = new THREE.Group(), old = new THREE.Group(); old.name='facility_radar'; station.add(old);
  refineRadarStation(station); refineRadarStation(station);
  assert.equal(station.children.filter(n=>n.name==='facility_radar').length,1);
  assert.equal(station.getObjectByName('相控阵预警天线').userData.radarCells,84);
  for(const model of [createRadarArray(),createAirDefense('china'),createAirDefense('nato','abm')]){
    const array=model.name==='相控阵预警天线'?model:model.getObjectByName('相控阵预警天线');
    assert.ok(array); assert.ok(array.children.length<=4);
    assert.ok(new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3()).toArray().every(v=>v>0&&Number.isFinite(v)));
  }
  assert.equal(weaponMountYaw('ballistic',1,2),0);
  assert.equal(weaponMountYaw('tank',1,2),-1);
});

test('放大后的地面模型提前清除装饰穿模，登载、飞行及死亡目标不清除', () => {
  const unit={type:'engineer',kind:'unit',hp:100,x:70,y:0,sceneryRadius:65};
  assert.equal(sceneryClearance({x:0,z:0,scale:16},[],[unit]),true);
  for(const patch of [{hp:0},{airborne:true},{embarkedIn:7}])assert.equal(sceneryClearance({x:0,z:0,scale:16},[],[{...unit,...patch}]),false);
});

test('齐射分层弧线不修改权威落点，起点和终点高度一致', () => {
  const base={kind:'rocket',startX:0,startY:0,toX:600,toY:0,x:300,y:0};
  const heights=[0,1,2,3].map(id=>projectileFlightPose({...base,id}).height);
  assert.equal(new Set(heights).size,4);
  for(let id=0;id<4;id++)for(const x of [0,600])assert.ok(Math.abs(projectileFlightPose({...base,id,x}).height-22)<.001);
  assert.deepEqual(base,{kind:'rocket',startX:0,startY:0,toX:600,toY:0,x:300,y:0});
});

test('舰艉尾流始终在后方，八个航向及大小舰船均不越过船艉', () => {
  for(const stern of [35,80,200])for(let i=0;i<8;i++){
    const heading=i*Math.PI/4,wake=shipWakePose(500,500,heading,stern);
    const behind=(500-wake.x)*Math.cos(heading)+(500-wake.y)*Math.sin(heading);
    assert.ok(behind>=stern&&Number.isFinite(wake.rotation)); assert.ok(wake.length<=100&&wake.width<=42);
  }
});

test('飞机与舰艇移动声分开合成，长循环无爆音、无无效值并保持声道预算', () => {
  const signatures=new Set();
  for(const kind of ['jet','ship','submerged']){
    const samples=synthesizeMovement(kind,24000);assert.equal(samples.length,48000);
    let sum=0,peak=0;for(const v of samples){assert.ok(Number.isFinite(v));sum+=v*v;peak=Math.max(peak,Math.abs(v));}
    assert.ok(peak<.15&&Math.sqrt(sum/samples.length)>.002);
    assert.ok(Math.abs(samples[0]-samples.at(-1))<.00001);
    signatures.add(samples.slice(2400,2410).join(','));
  }
  assert.equal(signatures.size,3); assert.equal(synthesizeMovement('不存在'),null);
});
