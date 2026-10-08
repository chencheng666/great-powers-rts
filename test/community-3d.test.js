import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { lunarCraters, lunarRelief, lunarReliefGLSL, craterBowl } from '../src/lunar-terrain.js';
import { terrainHeight } from '../src/visual-detail.js';
import { conformGroundMark } from '../src/community-visuals.js';
import { damagePresentation, damagedMaterial, structuralDamage, confirmedShipLoss, sinkingPose } from '../src/damage-presentation.js';
import { BATTLE_VIEWS, battleElevation } from '../src/battle-camera.js';
import { Game } from '../src/game.js';

const moon = { map: { future: true, barriers: [], bridges: [] }, mapId: 'meridian', world: { width: 4800, height: 3120 }, homeY: 1560 };
test('月表陨石坑稳定且左右镜像，基地与主通道保持平坦', () => {
  const craters = lunarCraters(moon); assert.ok(craters.length >= 16);
  assert.equal(craters, lunarCraters(moon)); assert.deepEqual(lunarCraters({ ...moon, map: { future: false } }), []);
  for (const c of craters) {
    assert.ok(craters.some(other => Math.abs(other.x - (moon.world.width - c.x)) < 1e-9 && other.y === c.y && other.radius === c.radius));
    assert.ok(Math.abs(c.y - moon.homeY) > c.radius + 140);
    assert.ok(lunarRelief(moon, c.x, c.y) < 0);
    assert.ok(Math.abs(terrainHeight(moon, c.x, c.y) - terrainHeight(moon, moon.world.width - c.x, c.y)) < 1e-9);
  }
  assert.equal(terrainHeight(moon, 350, 900), 0); assert.equal(terrainHeight(moon, 2000, moon.homeY), 0);
});
test('陨石坑为有低矮坑缘的连续凹地，焦痕着色使用同一高度公式', () => {
  assert.ok(craterBowl(0, 100, 10) < -9.9); assert.ok(craterBowl(93, 100, 10) > 0);
  assert.equal(craterBowl(130, 100, 10), 0);
  for (let d = 0; d < 140; d += .1) assert.ok(Math.abs(craterBowl(d, 100, 10) - craterBowl(d + .1, 100, 10)) < .05);
  const shader = { vertexShader: '#include <project_vertex>' }, material = conformGroundMark(new THREE.MeshBasicMaterial(), moon);
  material.onBeforeCompile(shader); assert.ok(shader.vertexShader.includes(lunarReliefGLSL(moon))); assert.ok(shader.vertexShader.includes('moonRelief(p)'));
});
test('实际月图坑体避让矿区、据点和固定设施，不改变资源与通行规则', () => {
  for (const scale of [1, 1.5]) {
    const g = new Game('china', 'china', {}, { mapId: 'meridian', battlefieldScale: scale });
    const before = JSON.stringify({ map: g.map, ore: g.ore, oil: g.oil, units: g.units }), craters = lunarCraters(g);
    assert.ok(craters.length >= 12);
    for (const c of craters) {
      for (const s of [...g.ore, ...g.oil, ...g.beacons]) assert.ok(Math.hypot(c.x - s.x, c.y - s.y) > c.radius * 1.3);
      for (const r of [...g.map.cover, ...g.map.barriers]) assert.ok(Math.hypot(c.x - Math.max(r.x1, Math.min(r.x2, c.x)), c.y - Math.max(r.y1, Math.min(r.y2, c.y))) > c.radius * 1.3);
    }
    assert.equal(JSON.stringify({ map: g.map, ore: g.ore, oil: g.oil, units: g.units }), before);
  }
});
test('损伤分两级，维修恢复；潜艇和步兵不生成燃烧烟柱', () => {
  const u = { type: 'tank', kind: 'unit', hp: 60, maxHp: 100 };
  assert.equal(damagePresentation(u).stage, 1); assert.equal(damagePresentation({ ...u, hp: 29 }).stage, 2);
  assert.equal(damagePresentation({ ...u, hp: 100 }).stage, 0); assert.equal(damagePresentation({ ...u, hp: 0 }).stage, 0);
  assert.equal(damagePresentation({ ...u, type: 'rifle' }).smoke, false);
  assert.equal(damagePresentation({ ...u, type: 'submarine' }).smoke, false);
  assert.equal(damagePresentation({ ...u, type: 'destroyer' }).smoke, true);
});
test('受损材质独立、保留纹理与着色回调，阵营标识和玻璃不被烧黑', () => {
  const source = new THREE.MeshStandardMaterial({ color: '#9ea8a1' }), texture = new THREE.Texture(); source.map = texture;
  source.onBeforeCompile = shader => { shader.fragmentShader += '战场轮廓'; };
  const original = source.color.clone(), damaged = damagedMaterial(source, 2);
  assert.notEqual(damaged, source); assert.ok(source.color.equals(original)); assert.equal(damaged.map, texture); assert.equal(damaged.onBeforeCompile, source.onBeforeCompile);
  assert.equal(damagedMaterial(source, 0), source);
  const glass = new THREE.MeshPhysicalMaterial({ transparent: true }); assert.equal(damagedMaterial(glass, 2), glass);
  source.name = '阵营标识'; assert.equal(damagedMaterial(source, 2), source);
});
test('建筑破损为合批三维碎片，不改动原模型几何或公共材质', () => {
  const model = new THREE.Group(), geometry = new THREE.BoxGeometry(7, 3, 6), material = new THREE.MeshStandardMaterial();
  model.add(new THREE.Mesh(geometry, material)); const detail = structuralDamage(model);
  assert.equal(detail.visible, false); assert.equal(detail.children.length, 1);
  const meshes = []; detail.traverse(m => { if (m.isMesh) meshes.push(m); }); assert.equal(meshes.length, 1);
  assert.equal(model.children[0].geometry, geometry); assert.equal(model.children[0].material, material);
  assert.ok(meshes[0].geometry.attributes.position.count > 0);
});
test('舰船仅在确认损毁时下沉，迷雾消失、潜航、运载和胜负清场不触发', () => {
  const entry = { model: { visible: true }, entity: { type: 'destroyer', hp: 100, x: 100, y: 100 } };
  const game = { isVisibleFor: () => true, effects: [] };
  assert.equal(confirmedShipLoss(entry, game), false);
  entry.entity.hp = 0; assert.equal(confirmedShipLoss(entry, game), true);
  assert.equal(confirmedShipLoss(entry, { ...game, isVisibleFor: () => false }), false);
  assert.equal(confirmedShipLoss({ ...entry, entity: { ...entry.entity, type: 'submarine' } }, game), false);
  entry.entity.hp = 100; game.effects = [{ type: 'explosion', targetType: 'destroyer', x: 101, y: 100, age: .2 }];
  assert.equal(confirmedShipLoss(entry, game), true); game.effects[0].targetType = 'fighter'; assert.equal(confirmedShipLoss(entry, game), false);
});
test('沉船逐渐侧倾、低头并下降，动画有明确结束时间且暂停不推进', () => {
  const initial = sinkingPose(0, 40), middle = sinkingPose(3.75, 40), end = sinkingPose(7.5, 40);
  assert.equal(initial.depth, 0); assert.ok(middle.depth > initial.depth && end.depth > middle.depth);
  assert.ok(middle.roll > 0 && middle.pitch < 0); assert.equal(middle.complete, false); assert.equal(end.complete, true);
  assert.deepEqual(sinkingPose(3.75, 40), middle); assert.ok(sinkingPose(20, 1).depth >= 34);
});
test('立体镜头角度更低但保留正交战术镜头，未知模式回退', () => {
  assert.ok(BATTLE_VIEWS.immersive < BATTLE_VIEWS.tactical); assert.ok(BATTLE_VIEWS.immersive > Math.PI / 6);
  assert.equal(battleElevation('未知'), BATTLE_VIEWS.tactical);
});
