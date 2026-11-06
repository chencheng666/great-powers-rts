import test from 'node:test';
import assert from 'node:assert/strict';
import { healthBarPresentation, healthBarBudget } from '../src/health-bar-presentation.js';
import { layoutHealthBars } from '../src/health-layout.js';

test('小横血条固定屏幕尺寸，单选显示数字，整队选中不堆叠弹药与文字', () => {
  const unit = { kind: 'unit', hp: 80, maxHp: 100 };
  const soldier = healthBarPresentation(unit, { infantry: true, selected: true, selectedCount: 80 });
  assert.equal(soldier.width, 28); assert.equal(soldier.trackHeight, 5);
  assert.equal(soldier.numeric, false); assert.equal(soldier.detailed, false);
  const focus = healthBarPresentation(unit, { selected: true, selectedCount: 1 });
  assert.equal(focus.numeric, true); assert.equal(focus.detailed, true);
  assert.equal(healthBarPresentation(unit, { ship: true }).width, 42);
  assert.equal(healthBarPresentation({ ...unit, kind: 'building' }).trackHeight, 7);
});

test('240单位密集受伤时限制血条数量与错位距离，关注单位优先且不遮操作区', () => {
  const viewport = { width: 1500, height: 750 }, obstacle = { x: 100, y: 200, width: 180, height: 160 };
  const bars = Array.from({ length: 240 }, (_, id) => {
    const p = healthBarPresentation({ kind: 'unit', hp: id % 2 ? 20 : 80, maxHp: 100 }, { infantry: true, selected: id === 239, selectedCount: 1 });
    return { ...p, id, anchorX: 100 + id % 20 * 25, anchorY: 200 + Math.floor(id / 20) * 15, height: 7 };
  });
  const result = layoutHealthBars(bars, viewport, [obstacle], healthBarBudget(viewport));
  assert.ok(result.length > 20 && result.length <= 120); assert.equal(result[0].id, 239);
  const intersects = (a, b) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
  for (const bar of result) {
    assert.ok(Math.abs(bar.x + bar.width / 2 - bar.anchorX) + Math.abs(bar.y + bar.height - bar.anchorY) <= bar.maxOffset);
    assert.equal(intersects(bar, obstacle), false);
    assert.equal(result.some(other => other.id !== bar.id && intersects(bar, other)), false);
  }
  assert.equal(healthBarBudget({ width: 390 }), 64);
});
