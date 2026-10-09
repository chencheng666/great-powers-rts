import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Game } from '../src/game.js';
import { OnlineGame } from '../src/online-game.js';
import { battleView } from '../server/battle-view.mjs';
import { unitAnimation, snapshotMotion, interpolateMotion } from '../src/unit-animation.js';
import { createMovingTracks, animateTracks } from '../src/track-motion.js';
import { createPersonnel } from '../src/personnel-models.js';
import { personnelLOD, syncPersonnelLOD } from '../src/personnel-lod.js';
import { weatherMaterial } from '../src/visual-assets.js';
import { aiCounterUnit, retreatAIUnits } from '../src/tactical-ai.js';
import { battleReport, battleReportHTML, validateBattleStats } from '../src/battle-report.js';

test('人物上身围绕腰部瞄准，手臂与枪一起后坐，双腿不随上身转动', () => {
  const model = createPersonnel('rifle'), upper = model.getObjectByName('upper_body'), weapon = model.getObjectByName('weapon_pose');
  assert.equal(upper.position.y, 1); assert.equal(weapon.parent, upper);
  assert.equal(model.getObjectByName('leg_left').parent, model);
  const before = new THREE.Box3().setFromObject(model); upper.rotation.y = .6; weapon.position.x -= .025;
  assert.ok(new THREE.Box3().setFromObject(model).max.y > 1.8); assert.ok(before.min.y >= 0);
  assert.ok(weapon.children.length >= 2);
});

test('步态依据实际位移，后坐和炮塔在两次快照之间连续变化，暂停不推进', () => {
  const e = { scale: 1 }, u = { x: 0, y: 0, angle: 0, turretAngle: 0, lastFireAt: -100 };
  unitAnimation(e, u, .016, 0); u.x = 1; u.turretAngle = 1; u.lastFireAt = .1;
  const a = unitAnimation(e, u, .016, .1); assert.ok(a.phase > 0 && a.turret > 0 && a.turret < 1);
  const first = a.recoil; unitAnimation(e, u, .03, .1); assert.ok(a.recoil > first);
  const phase = a.phase; unitAnimation(e, u, .3, .1); assert.ok(a.recoil < .1); assert.equal(a.phase, phase);
  const state = { ...a }; u.x += 10; unitAnimation(e, u, 0, 1); assert.deepEqual(a, state);
  u.x += 400; unitAnimation(e, u, .016, 1); assert.equal(a.phase, phase);
});

test('快照不先跳到终点再拉回，位置与跨越正负π的炮塔角度平滑插值', () => {
  const g = new Game('china', 'nato', {}, { multiplayer: true }), payload = () => ({ seat: 0, config: { mapId: g.mapId, battlefieldScale: 1.5 }, view: battleView(g, 0) });
  const c = new OnlineGame(payload(), {}, { send() {} }), s = g.ownedUnits(0, 'tank')[0], u = c.getEntity(s.id), x = u.x;
  s.x += 10; g.time += .1; c.apply(payload()); assert.equal(u.x, x);
  c.update(.05); assert.ok(u.x > x && u.x < x + 10); c.update(.05); assert.equal(u.x, x + 10);
  const a = { x: 0, y: 0, angle: 3.1, turretAngle: 3.1 }, b = { ...a, x: 20, angle: -3.1, turretAngle: -3.1 };
  a._motion = snapshotMotion(a, b); interpolateMotion(a, .05); assert.ok(a.angle > 3.1 && a.angle < 3.2);
  assert.equal(snapshotMotion(a, { ...b, x: 800 }), null); assert.equal(snapshotMotion(a, { ...b, embarkedIn: 5 }), null);
});

test('循环履带采用两侧实例化网格，共享几何但每辆车矩阵独立，静止不重复上传', () => {
  const tracks = createMovingTracks(1.5, new THREE.MeshStandardMaterial(), new THREE.MeshStandardMaterial()), copy = tracks.clone(true);
  const a = tracks.children[0], b = copy.children[0]; assert.equal(tracks.children.length, 2); assert.ok(a.count > 30 && a.count < 60);
  assert.notEqual(a.instanceMatrix.array, b.instanceMatrix.array); assert.equal(a.geometry, b.geometry);
  const old = [...b.instanceMatrix.array]; animateTracks(tracks.children, .07); assert.deepEqual([...b.instanceMatrix.array], old);
  const version = a.instanceMatrix.version; animateTracks(tracks.children, .07); assert.equal(a.instanceMatrix.version, version);
  assert.ok(a.geometry.groups.length === 2 && a.material.length === 2);
});

test('玻璃、金属与橡胶物性不同，不改写公共原材质', () => {
  const original = new THREE.MeshStandardMaterial({ name: '玻璃' }), glass = weatherMaterial(original);
  const metal = weatherMaterial(new THREE.MeshStandardMaterial({ name: '深色钢' })), rubber = weatherMaterial(new THREE.MeshStandardMaterial({ name: '橡胶' }));
  assert.ok(glass.isMeshPhysicalMaterial && glass.transparent && glass.clearcoat === 1); assert.equal(original.transparent, false);
  assert.ok(metal.metalness > .6 && rubber.metalness === 0 && rubber.roughness > metal.roughness);
});

test('远景人物保留几何外形、颜色和六个动作分组，不修改近景模型或共享几何', () => {
  const source = createPersonnel('rifle'), lod = personnelLOD(source); let meshes = 0;
  lod.traverse(m => { if (m.isMesh) { meshes++; assert.ok(m.geometry.attributes.color); } }); assert.equal(meshes, 6);
  const before = new THREE.Box3().setFromObject(source), after = new THREE.Box3().setFromObject(lod);
  assert.ok(before.min.distanceTo(after.min) < .0001 && before.max.distanceTo(after.max) < .0001);
  const upper = source.getObjectByName('upper_body'), target = lod.getObjectByName('upper_body'); source.add(lod);
  upper.rotation.y = .7; const entry = { model: source, personnelLOD: lod, lodJoints: [[upper, target]] };
  syncPersonnelLOD(entry, true); assert.equal(target.rotation.y, upper.rotation.y); assert.equal(upper.visible, false); assert.equal(lod.visible, true);
  syncPersonnelLOD(entry, false); assert.equal(upper.visible, true); assert.equal(lod.visible, false);
});

test('AI 只反制已侦察威胁，并将正在生产的反制单位计入配额', () => {
  const g = new Game('china', 'nato', {}, { multiplayer: true }); g.canSeeEntity = () => false;
  g.addBuilding(0, 'radar', 200, 400); g.addBuilding(0, 'armory', 200, 600);
  const target = g.addUnit(1, 'fighter', 500, 600);
  assert.equal(aiCounterUnit(g, 0, ['aa']), null); g.canSeeEntity = (_, u) => u === target;
  assert.equal(aiCounterUnit(g, 0, ['aa']), 'aa'); g.ownedBuildings(0, 'armory')[0].queue.push('aa');
  assert.equal(aiCounterUnit(g, 0, ['aa']), null);
});

test('AI 重伤和缺弹撤回真实设施整备，正在整备与载客单位不被覆盖', () => {
  const g = new Game('china', 'nato', {}, { multiplayer: true }), tank = g.ownedUnits(1, 'tank')[0];
  tank.hp = tank.maxHp * .2; tank.order = { type: 'move', x: 500, y: 700 }; retreatAIUnits(g, 1);
  assert.equal(tank.order.type, 'rearm'); const order = tank.order; retreatAIUnits(g, 1); assert.equal(tank.order, order);
  tank.order = null; g.players[1].credits = 0; retreatAIUnits(g, 1); assert.equal(tank.order, null);
});

test('复盘只计有效伤害，不刷溢出伤害或重复击毁，旧存档不补造历史', () => {
  const g = new Game('china', 'nato', {}, { multiplayer: true }), u = g.ownedUnits(1, 'rifle')[0], hp = u.hp;
  g.damage(u, hp * 10, 0); g.damage(u, hp * 10, 0); const report = battleReport(g);
  assert.equal(report.sides[0].kills, 1); assert.equal(report.sides[0].damageDealt, hp); assert.equal(report.sides[1].losses, 1);
  assert.equal(validateBattleStats(g.battleStats, g.time), true);
  const save = g.toSave(); assert.equal(Game.fromSave(save).battleStats.sides[0].kills, 1);
  delete save.state.battleStats; save.state.time = 20; const old = Game.fromSave(save);
  assert.equal(old.battleStats.complete, false); assert.match(battleReportHTML(old), /前段数据未计入/);
  assert.equal(validateBattleStats({ ...g.battleStats, since: 100 }, 0), false);
});

test('战后统计不在联机战斗中泄漏，第二席位结算按我方重排', () => {
  const g = new Game('china', 'nato', {}, { multiplayer: true }); g.battleStats.sides[1].kills = 7;
  assert.equal(battleView(g, 0).battleReport, null); g.running = false; g.winner = 1;
  assert.equal(battleView(g, 1).battleReport.sides[0].kills, 7); assert.equal(battleView(g, 0).battleReport.sides[1].kills, 7);
  assert.match(battleReportHTML(g), /战后复盘/);
});
