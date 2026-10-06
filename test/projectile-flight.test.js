import test from 'node:test';
import assert from 'node:assert/strict';
import { projectileFlightPose, turnToward } from '../src/projectile-flight.js';

test('火箭具有上升、顶点和俯冲姿态，制导导弹逐渐贴近目标高度，鱼雷保持水线', () => {
  const p = { startX: 0, startY: 0, toX: 600, toY: 0, x: 0, y: 0, kind: 'rocket' };
  assert.ok(projectileFlightPose(p).pitch > 0);
  p.x = 300; assert.equal(projectileFlightPose(p).height, 157);
  p.x = 600; assert.ok(projectileFlightPose(p).pitch < 0);
  p.kind = 'missile'; p.sourceHeight = 35; p.targetHeight = 95;
  assert.ok(Math.abs(projectileFlightPose(p).height - 95) < .001);
  p.kind = 'torpedo'; assert.deepEqual(projectileFlightPose(p), { height: 2, pitch: 0 });
});

test('导弹与飞机转向角速度受限，并跨越正负 PI 选择短路径，不瞬间反向', () => {
  assert.equal(turnToward(0, Math.PI, .1), .1);
  const start = Math.PI - .05, end = -Math.PI + .05;
  assert.ok(Math.abs(turnToward(start, end, .2) - start - .1) < .001);
});
