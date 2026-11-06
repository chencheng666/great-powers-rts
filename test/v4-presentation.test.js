import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { groundPresentationFactor, nearestScreenSelection, readPresentation, selectionTolerance } from '../src/unit-presentation.js';
import { createFactionElite } from '../src/faction-models.js';
import { FACTION_DOCTRINES } from '../src/faction-doctrine.js';
import { FACTIONS, UNITS } from '../src/data.js';
import { equipmentModel, equipmentProfile } from '../src/equipment.js';
import { Game } from '../src/game.js';
import { unitModelScale } from '../src/model-scale.js';

test('易读比例只增强地面显示，远景补偿有上限，飞机舰船和月表保持原尺度', () => {
  const unit = { kind: 'unit' };
  assert.equal(groundPresentationFactor(unit, ['infantry'], 1), 1.5);
  assert.equal(groundPresentationFactor(unit, ['armor'], 1), 1.2);
  for (let zoom = .45; zoom <= 2.4; zoom += .05) {
    const person = groundPresentationFactor(unit, ['infantry'], zoom);
    assert.ok(person >= 1.5 && person <= 1.9);
    assert.ok(groundPresentationFactor(unit, ['armor'], zoom) <= 1.4);
    for (const tags of [['air'], ['ship'], ['submerged']]) assert.equal(groundPresentationFactor(unit, tags, zoom), 1);
    assert.equal(groundPresentationFactor(unit, ['infantry'], zoom, 'reference'), 1);
    assert.equal(groundPresentationFactor(unit, ['infantry'], zoom, 'readable', true), 1);
  }
  assert.equal(groundPresentationFactor({ kind: 'building' }, [], .45), 1);
  assert.equal(readPresentation({ getItem: () => { throw Error('存储禁用'); } }), 'readable');
  assert.equal(readPresentation({ getItem: () => 'reference' }), 'reference');
});

test('屏幕容差优先最近的可见己方单位，敌军、迷雾、登载、死亡与边界外不会被吸附', () => {
  const entries = [
    { entity: { id: 1, owner: 0, hp: 100 }, visible: true, x: 0, y: 0 },
    { entity: { id: 2, owner: 0, hp: 100 }, visible: true, x: 12, y: 0 },
    ...['敌军', '迷雾', '登载', '死亡'].map((s, i) => ({ entity: { id: 10 + i, owner: s === '敌军' ? 1 : 0, hp: s === '死亡' ? 0 : 100, embarkedIn: s === '登载' ? 1 : null }, visible: s !== '迷雾', x: 5, y: 0 })),
  ];
  const selectable = e => e.visible && e.entity.owner === 0 && e.entity.hp > 0 && !e.entity.embarkedIn;
  const pick = (x, touch = false) => nearestScreenSelection(entries, x, 0, selectionTolerance(touch), e => e, selectable);
  assert.equal(pick(5).id, 1); assert.equal(pick(10).id, 2);
  assert.equal(pick(31), null); assert.equal(pick(31, true).id, 2); assert.equal(pick(50, true), null);
});

test('五阵营特色模型有独立轮廓、有限面数和有效关节，图鉴与实际模型一致', () => {
  const signatures = new Set();
  for (const faction of Object.keys(FACTIONS)) {
    const model = createFactionElite(faction), dimensions = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
    let triangles = 0, meshes = 0;
    model.traverse(m => { if (!m.isMesh) return; meshes++; triangles += (m.geometry.index?.count ?? m.geometry.attributes.position.count) / 3; });
    assert.ok(triangles < 4000, `${faction} 面数 ${triangles}`); assert.ok(meshes <= 14, `${faction} 批次 ${meshes}`);
    assert.ok(dimensions.toArray().every(n => n > 0 && Number.isFinite(n)));
    assert.equal(model.name, equipmentModel(faction, 'elite'));
    assert.ok(model.getObjectByName('weapon')); assert.ok(model.getObjectByName('barrel')); assert.ok(model.getObjectByName('open_asset_muzzle'));
    assert.ok(equipmentProfile(faction, 'elite').description.includes(FACTION_DOCTRINES[faction].silhouette));
    assert.ok(FACTION_DOCTRINES[faction].squad.every(type => UNITS[type]));
    signatures.add(`${triangles}:${dimensions.toArray().join(',')}`);
    assert.ok(Math.abs(dimensions.x * unitModelScale('elite', dimensions, 10) - 38.6) < 1e-6);
  }
  assert.equal(signatures.size, 5);
});

test('新表现保留五阵营生产、数值、存档和特色克制规则', () => {
  for (const faction of Object.keys(FACTIONS)) {
    const game = new Game(faction, 'china', {}, { mapId: 'valley' });
    const unit = game.addUnit(0, 'elite', 300, 300), before = JSON.stringify(unit);
    for (const mode of ['readable', 'reference']) groundPresentationFactor(unit, UNITS.elite.tags, .5, mode);
    assert.equal(JSON.stringify(unit), before);
    const restored = Game.fromSave(game.toSave());
    const again = restored.getEntity(unit.id);
    assert.equal(again.hp, unit.hp); assert.equal(again.type, 'elite'); assert.equal(restored.players[0].faction, faction);
  }
});
