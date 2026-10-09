import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Game } from '../src/game.js';
import { UNITS } from '../src/data.js';
import { validateSave } from '../src/savegame.js';
import { submarinePose, refineNavalHull, refineTransportBody, replacedNavalPart } from '../src/naval-presentation.js';
import { refinePowerFans, animateFacility, drawRepairBadge } from '../src/facility-motion.js';
import { BATTLE_VIEWS } from '../src/battle-camera.js';
import { OnlineGame } from '../src/online-game.js';
import { battleView } from '../server/battle-view.mjs';
import { executeCommand } from '../server/commands.mjs';

const quiet = () => {
  const g = new Game('china', 'china', {}, { mapId: 'ocean' });
  g.aiTimer = g.aiWaveTimer = g.fogTimer = 1e9; g.closestEnemy = () => null; g.units = [];
  g.logistics.forEach(r => { r.nextAir = r.nextSea = 1e9; });
  for (const f of g.fogs) f.visible.fill(true);
  return g;
};
const advance = (g, seconds) => { for (let i = 0; i < seconds * 20; i++) g.update(.05); };

test('右键己方港口为整支舰队分配返港整备，不将部分耗弹潜艇仅当普通移动', () => {
  for (const side of [0, 1]) {
    const g = quiet(), dock = g.ownedBuildings(side, 'dock')[0];
    const fleet = ['destroyer', 'submarine', 'submarine', 'landing'].map((type, i) => g.addUnit(side, type, 1500 + i * 130, 600 + i * 190));
    fleet.forEach(u => { u.hp -= 90; if (UNITS[u.type].ammo) u.ammo = 1; });
    g.selected = fleet.map(u => u.id); g.command(dock.x, dock.y, false, side);
    fleet.forEach(u => { assert.equal(u.order.type, 'rearm'); assert.equal(u.order.homeId, dock.id); });
    advance(g, 120);
    fleet.forEach(u => { assert.equal(u.hp, u.maxHp, u.type); if (UNITS[u.type].ammo) assert.equal(u.ammo, UNITS[u.type].ammo, u.type); assert.notEqual(u.order?.type, 'rearm'); });
  }
});

test('指定整备港口随存档恢复，港口被摧毁后改投存活己方港口', () => {
  const g = quiet(), first = g.ownedBuildings(0, 'dock')[0], second = g.addBuilding(0, 'dock', first.x, first.y + 500);
  const sub = g.addUnit(0, 'submarine', 1400, 1100); sub.ammo = 1; g.requestResupply(sub, second);
  const save = g.toSave(), restored = Game.fromSave(save);
  assert.equal(restored.getEntity(sub.id).order.homeId, second.id);
  g.damage(second, second.maxHp * 2, 1); g.updateGroundRearm(sub, .05); assert.equal(sub.order.homeId, first.id);
  const bad = structuredClone(save); bad.state.units[0].order.homeId = '港口'; assert.throws(() => validateSave(bad));
});

test('港口浮航潜艇须停靠己方港口且不能穿透战争迷雾，驶离后恢复潜航', () => {
  const g = quiet(), sub = g.addUnit(1, 'submarine', 1400, 1100), dock = g.ownedBuildings(1, 'dock')[0];
  g.requestResupply(sub); Object.assign(sub, g.shipBerth(sub, dock));
  assert.equal(g.submarineSurfaced(sub), true); assert.equal(g.canSeeEntity(0, sub), true);
  g.fogs[0].visible.fill(false); assert.equal(g.canSeeEntity(0, sub), false);
  sub.order = { type: 'move', x: 1500, y: 1100 }; assert.equal(g.submarineSurfaced(sub), false);
  g.fogs[0].visible.fill(true); assert.equal(g.canSeeEntity(0, sub), false);
});

test('不同己方港口的舰船整备不互相占用泊位', () => {
  const g = quiet(), first = g.ownedBuildings(0, 'dock')[0], second = g.addBuilding(0, 'dock', first.x, first.y + 500);
  const a = g.addUnit(0, 'submarine', 1400, 1000), b = g.addUnit(0, 'submarine', 1400, 1100);
  g.requestResupply(a, first); g.requestResupply(b, second);
  const position = g.shipBerth(b, second); assert.equal(position.y, second.y);
});

test('联机两席位返港指令由服务器执行，浮航外观不依赖被隐藏的敌方订单或港口', () => {
  for (const side of [0, 1]) {
    const g = quiet(), dock = g.ownedBuildings(side, 'dock')[0], sub = g.addUnit(side, 'submarine', 1400, 1100), observer = 1 - side;
    assert.equal(executeCommand(g, side, { action: 'move', x: dock.x, y: dock.y, selected: [sub.id] }), true);
    assert.equal(sub.order.homeId, dock.id); Object.assign(sub, g.shipBerth(sub, dock));
    g.fogs[observer].visible.fill(false);
    const fog = g.fogs[observer]; fog.visible[Math.floor(sub.y / g.world.fog) * fog.cols + Math.floor(sub.x / g.world.fog)] = true;
    const payload = () => ({ seat: observer, config: { mapId: 'ocean', battleId: g.battleId, victoryMode: 'quick', battlefieldScale: 1.5 }, view: battleView(g, observer) });
    const initial = payload(), visible = initial.view.units.find(u => u.id === sub.id);
    assert.equal(visible.order, null); assert.equal(visible.surfaced, true);
    assert.equal(initial.view.buildings.some(b => b.id === dock.id), false);
    const client = new OnlineGame(initial, {}, { send: () => true }), copy = client.getEntity(sub.id);
    assert.equal(client.submarineSurfaced(copy), true); assert.equal(client.canSeeEntity(0, copy), true);
    assert.equal(submarinePose(client, copy).surfaced, true);
    sub.order = { type: 'move', x: sub.x + 200, y: sub.y }; client.apply(payload());
    assert.equal(client.getEntity(sub.id), undefined);
  }
});

test('潜艇浮航只露出上半艇体；潜航轮廓低于水面且缩薄，不叠在水面军舰上', () => {
  const g = quiet(), sub = g.addUnit(0, 'submarine', 1400, 1100);
  const hidden = submarinePose(g, sub); assert.equal(hidden.detected, false); assert.equal(hidden.verticalScale, .16); assert.ok(hidden.height < 0);
  sub.exposedUntil = 5; const detected = submarinePose(g, sub); assert.equal(detected.verticalScale, 1); assert.ok(detected.height < 0);
  sub.exposedUntil = 0; g.requestResupply(sub); Object.assign(sub, g.shipBerth(sub, g.ownedBuildings(0, 'dock')[0]));
  const surfaced = submarinePose(g, sub); assert.equal(surfaced.surfaced, true); assert.ok(surfaced.height < 0);
});

test('鱼雷沿艇首方向出管，再转向侧后方目标，仍保持追踪和有限转弯', () => {
  const g = quiet(), sub = g.addUnit(0, 'submarine', 1500, 1100), target = g.addUnit(1, 'destroyer', 1250, 1200);
  sub.angle = Math.PI / 2; g.launchProjectile(sub, target, 20, 'submarine'); const p = g.projectiles[0];
  assert.ok(Math.abs(p.x - sub.x) < .001); assert.ok(p.y > sub.y + 40); assert.equal(p.angle, sub.angle);
  g.updateProjectiles(.05); assert.ok(Math.abs(p.angle - sub.angle) <= .101); assert.ok(p.y > p.startY);
  for (let i = 0; i < 600 && !p.finished; i++) g.updateProjectiles(.05);
  assert.equal(p.finished, true); assert.ok(target.hp < target.maxHp);
});

test('同侧后勤单线放行，包含返程中载具，退出后补发一班且不追补多班', () => {
  const g = quiet();
  for (const side of [0, 1]) for (const sea of [false, true]) {
    const type = sea ? 'containerShip' : 'freightPlane', channel = sea ? 'Sea' : 'Air';
    const old = g.launchFreight(side, sea); old.freight.phase = 'outbound'; old.freight.value = 0;
    g.logistics[side][`next${channel}`] = 0;
    g.time = 200; g.updateLogistics(.05); assert.equal(g.activeUnits(side, type).length, 1);
    old.hp = 0; g.updateLogistics(.05); assert.equal(g.activeUnits(side, type).length, 1);
    g.updateLogistics(.05); assert.equal(g.activeUnits(side, type).length, 1);
  }
});

test('旧存档积压货船在外海排队，前船返程退出前后船不靠同一泊位', () => {
  const g = quiet(), a = g.launchFreight(0, true), b = g.launchFreight(0, true);
  a.freight.phase = 'outbound'; a.freight.value = 0;
  const dock = g.getEntity(b.freight.homeId); Object.assign(b, g.navalGoal(dock.x, dock.y, 100));
  g.updateFreight(b, .05); assert.equal(b.freight.holding, true); assert.equal(b.freight.progress, 0);
  a.hp = 0; g.updateFreight(b, .05); assert.equal(b.freight.holding, false);
});

test('六类舰体采用连续贝塞尔曲面，保留航母飞行甲板并限制网格数量', () => {
  for (const name of ['patrol', 'frigate', 'destroyer', 'destroyer_china', 'containerShip', 'carrier']) {
    const model = refineNavalHull(new THREE.Group(), name), hull = model.getObjectByName('连续曲面舰体');
    assert.ok(hull); assert.ok(hull.children.length <= 2);
    hull.traverse(m => { if (m.isMesh) { assert.ok(m.geometry.attributes.normal); assert.ok([...m.geometry.attributes.position.array].every(Number.isFinite)); assert.ok(m.geometry.attributes.position.count < 20000); } });
  }
  assert.equal(replacedNavalPart('destroyer_china', '驱逐舰船体.001'), true);
  assert.equal(replacedNavalPart('carrier', '斜角飞行甲板'), false);
  assert.equal(replacedNavalPart('submarine', '流线型潜艇耐压艇体'), false);
});

test('运输机宽体流线机身有体积，不放大翼展或其他武器模型', () => {
  const model = new THREE.Group(); model.name = 'freightPlane'; refineTransportBody(model);
  const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
  assert.ok(size.z > 3 && size.y > 2.4); assert.ok(size.x <= 14.5);
  const bands = model.children.filter(child => child.material?.name === '阵营标识');
  assert.equal(bands.length, 3); assert.ok(bands.some(band => band.position.y > 2.5));
  const jet = new THREE.Group(); jet.name = 'fighter'; refineTransportBody(jet); assert.equal(jet.children.length, 0);
});

test('发电机风扇与雷达部件可动，暂停时间不动、断电雷达停扫，统一四十五度视角', () => {
  const model = refinePowerFans(new THREE.Group()), radar = new THREE.Group(); radar.name = 'facility_radar'; model.add(radar);
  const game = { time: 3, hasPower: () => true }, entity = { kind: 'building', type: 'radar', owner: 0, hp: 100 };
  animateFacility(model, entity, game); assert.ok(radar.rotation.y > 0);
  const angle = radar.rotation.y; animateFacility(model, entity, game); assert.equal(radar.rotation.y, angle);
  game.time = 5; game.hasPower = () => false; animateFacility(model, entity, game); assert.equal(radar.rotation.y, angle);
  assert.ok(model.getObjectByName('facility_fan_-1.65').rotation.y > 0); assert.equal(BATTLE_VIEWS.immersive, Math.PI / 4);
});

test('建筑维修徽标具有完整开口扳手、呼吸透明度和缺钱等待色', () => {
  const alpha = [], strokes = [], ctx = { save() {}, restore() {}, translate() {}, beginPath() {}, arc() {}, fill() {}, stroke() { strokes.push(this.strokeStyle); }, moveTo() {}, lineTo() {}, closePath() {}, set globalAlpha(v) { alpha.push(v); } };
  drawRepairBadge(ctx, { x: 100, y: 100 }, 0); drawRepairBadge(ctx, { x: 100, y: 100 }, 1, true);
  assert.notEqual(alpha[0], alpha[1]); assert.ok(strokes.includes('#9af0cd')); assert.ok(strokes.includes('#efc573'));
});
