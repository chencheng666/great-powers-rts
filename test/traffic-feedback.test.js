import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { unitRadius } from '../src/unit-spacing.js';
import { battleView } from '../server/battle-view.mjs';

test('十六、二十五、三十六辆车多种时序完成集结，无法进入内圈时在可达外围停稳', () => {
  const original = Math.random;
  try {
    for (const seed of [1, 2, 3]) {
      let value = seed;
      Math.random = () => ((value = (Math.imul(value, 1664525) + 1013904223) >>> 0) / 4294967296);
      for (const count of [16, 25, 36]) {
        const g = new Game('china', 'nato', {}, { multiplayer: true });
        g.units = []; g.buildings = []; g.map.barriers = [];
        g.checkVictory = () => {}; g.updateLogistics = () => {};
        const units = Array.from({ length: count }, (_, i) => g.addUnit(0, 'tank', 400 + i % 6 * 70, 400 + Math.floor(i / 6) * 70));
        g.selected = units.map(u => u.id); g.command(1350, 650);
        for (let i = 0; i < 1600; i++) g.update(.05);
        const label = `种子${seed}，${count}辆`;
        assert(units.every(u => u.order === null), label + ' 不应无限争抢内部编队位');
        assert(units.every(u => Math.hypot(u.x - 1350, u.y - 650) < 500), label + ' 应在目标附近集结');
        for (const a of units) for (const b of units) if (a.id < b.id) assert(Math.hypot(a.x - b.x, a.y - b.y) >= unitRadius(a) + unitRadius(b), label + ' 不应穿模');
        const positions = units.map(u => ({ x: u.x, y: u.y }));
        for (let i = 0; i < 200; i++) g.update(.05);
        assert(units.every((u, i) => Math.hypot(u.x - positions[i].x, u.y - positions[i].y) < 1), label + ' 集结后应稳定');
      }
    }
  } finally { Math.random = original; }
});

test('寻路进度缓存不进入任何席位的快照，新命令清除旧的拥堵计数', () => {
  const g = new Game('china', 'nato', {}, { multiplayer: true });
  const u = g.ownedUnits(0, 'tank')[0];
  u.navigationProgress = { x: 900, y: 900, distance: 99, until: 20 };
  u.navigationStalled = true; u.navigationAttempts = 5;
  const view = battleView(g, 0).units.find(v => v.id === u.id);
  for (const key of ['navigationProgress', 'navigationStalled', 'navigationAttempts']) assert.equal(view[key], undefined);
  g.selected = [u.id]; g.command(u.x + 200, u.y);
  assert.equal(u.navigationAttempts, undefined);
  assert.equal(u.order.formation, undefined, '单车精确移动不应自动改派为编队停车');
});
