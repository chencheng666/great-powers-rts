import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { formationOffsets, separateUnits, UnitSpatialIndex, unitLayer, unitRadius } from '../src/unit-spacing.js';

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const quietGame = mapId => {
  const game = new Game('china', 'russia', {}, { mapId });
  game.units = []; game.aiTimer = Infinity; game.aiWaveTimer = Infinity;
  return game;
};

test('不同体型、地面与空中分层，空间索引包含双方而不包含死亡单位', () => {
  const units = [
    { id: 1, owner: 0, type: 'tank', hp: 100, x: 111, y: 111 },
    { id: 2, owner: 1, type: 'rifle', hp: 100, x: 113, y: 113 },
    { id: 3, owner: 0, type: 'fighter', hp: 100, x: 111, y: 111 },
    { id: 4, owner: 1, type: 'tank', hp: 0, x: 111, y: 111 }
  ];
  assert.deepEqual(new UnitSpatialIndex(units).nearby(units[0]).map(unit => unit.id), [2]);
  assert.ok(unitRadius(units[0]) > unitRadius(units[1]));
  assert.notEqual(unitLayer(units[0]), unitLayer(units[2]));
});

test('编队围绕目标重心排列，混合步兵与装甲保留足够间距', () => {
  for (const count of [1, 2, 5, 9, 16]) {
    const units = Array.from({ length: count }, (_, id) => ({ id, type: id % 2 ? 'rifle' : 'tank', x: 400, y: 600 }));
    const offsets = formationOffsets(units, { x: 800, y: 600 });
    const values = [...offsets.values()];
    assert.ok(Math.abs(values.reduce((sum, point) => sum + point.x, 0)) < 1e-8);
    assert.ok(Math.abs(values.reduce((sum, point) => sum + point.y, 0)) < 1e-8);
    for (const a of units) for (const b of units) if (a.id < b.id) assert.ok(distance(offsets.get(a.id), offsets.get(b.id)) >= unitRadius(a) + unitRadius(b) + 10);
  }
});

test('重叠坦克平滑分离，双方遵守同一约束且不推入障碍', () => {
  const units = [0, 1].map((owner, index) => ({ id: index + 1, owner, type: 'tank', hp: 100, x: 500, y: 500, stunUntil: 0 }));
  const start = units.map(unit => ({ ...unit }));
  separateUnits(units, .05, point => Boolean(point));
  assert.ok(distance(units[0], start[0]) <= 3.01);
  assert.ok(distance(units[1], start[1]) <= 3.01);
  for (let i = 0; i < 120; i++) separateUnits(units, .05, (unit, point) => point.x >= 495);
  assert.ok(distance(units[0], units[1]) >= 61.9);
  assert.ok(units.every(unit => unit.x >= 495));
});

test('高空战机不会推开地面部队，暂停与瘫痪不会造成单位位移', () => {
  const units = [
    { id: 1, type: 'tank', hp: 100, x: 500, y: 500, stunUntil: 10 },
    { id: 2, type: 'fighter', hp: 100, x: 500, y: 500, stunUntil: 0 },
    { id: 3, type: 'tank', hp: 100, x: 500, y: 500, stunUntil: 0 }
  ];
  const before = structuredClone(units);
  separateUnits(units, 0, () => true, 0);
  assert.deepEqual(units, before);
  for (let i = 0; i < 60; i++) separateUnits(units, .05, () => true, 0);
  assert.deepEqual(units[0], before[0]); assert.deepEqual(units[1], before[1]);
  assert.ok(distance(units[0], units[2]) >= 61.9);
});

test('连续出厂为车辆分配空地，不在同一出口堆叠', () => {
  const game = quietGame('valley');
  const units = [];
  for (let i = 0; i < 12; i++) {
    const point = game.findSpawn(620, 705, 'tank');
    const unit = game.addUnit(0, 'tank', point.x, point.y);
    assert.ok(game.canOccupyUnit(unit, point));
    assert.ok(units.every(other => distance(other, unit) >= unitRadius(other) + unitRadius(unit) + 3.9));
    units.push(unit);
  }
});

test('九个混合单位在三张地图行进并集结，不互相堵死或挤入裂谷', () => {
  for (const mapId of ['valley', 'canyon', 'strait']) {
    const game = quietGame(mapId);
    const units = Array.from({ length: 9 }, (_, index) => game.addUnit(0, index < 6 ? 'tank' : 'rifle', 620, 400));
    const target = { x: mapId === 'valley' ? 890 : 1430, y: 400 };
    game.selected = units.map(unit => unit.id); game.command(target.x, target.y);
    for (let i = 0; i < 1600; i++) {
      game.update(.05);
      assert.ok(units.every(unit => !game.isGroundBlocked(unit.x, unit.y, unit.type === 'rifle' ? 6 : 14)), mapId);
    }
    assert.ok(units.every(unit => distance(unit, target) < 180), `${mapId} 未完成集结`);
    for (const a of units) for (const b of units) if (a.id < b.id) assert.ok(distance(a, b) >= unitRadius(a) + unitRadius(b) - 1, `${mapId} 单位仍在重叠`);
  }
});
