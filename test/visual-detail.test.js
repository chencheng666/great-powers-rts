import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { terrainHeight, tracerEndpoints, impactProfile, REALISM_BUILDINGS } from '../src/visual-detail.js';

const game = { world: { width: 4480 }, homeY: 1440, map: { barriers: [], future: false } };

test('地表起伏保持基地和主路平整，双方横向镜像且高度有界', () => {
  assert.equal(terrainHeight(game, 350, 900), 0);
  assert.equal(terrainHeight(game, 1300, 1440), 0);
  for (let x = 0; x <= 4480; x += 80) for (let z = 0; z <= 2880; z += 120) {
    const h = terrainHeight(game, x, z);
    assert.ok(Number.isFinite(h) && Math.abs(h) <= 28);
    assert.equal(h, terrainHeight(game, 4480 - x, z));
  }
});

test('水底与峡谷凹地分开处理，月表不出现常规裂谷下沉', () => {
  assert.equal(terrainHeight({ ...game, map: { water: { x1: 1900, x2: 2580 }, barriers: [] } }, 2100, 1000), -15);
  const map = { barriers: [{ x1: 900, x2: 1100, y1: 500, y2: 900 }] };
  assert.equal(terrainHeight({ ...game, map }, 1000, 700), -28);
  assert.ok(terrainHeight({ ...game, map: { ...map, future: true } }, 1000, 700) > -5);
});

test('动能曳光是短段飞行，能量束保持连续，枪口闪光快速衰减', () => {
  const effect = { x: 0, y: 0, toX: 500, toY: 0, sourceType: 'tank', age: .1, duration: .2, style: 'tank' };
  const shot = tracerEndpoints(effect), beam = tracerEndpoints({ ...effect, style: 'laser' });
  assert.ok(shot.head > shot.tail && (shot.head - shot.tail) * 500 <= 18.001);
  assert.equal(shot.flash, 0); assert.equal(beam.head, 1); assert.equal(beam.tail, beam.muzzle);
  for (const age of [-1, 0, .1, .3]) {
    const p = tracerEndpoints({ ...effect, age, toX: 5 });
    assert.ok(p.head >= p.tail && p.head <= 1 && p.tail >= 0);
  }
});

test('命中特效区分步兵、装甲、能量与海面，爆炸规模有上限', () => {
  assert.ok(impactProfile({ type: 'hit', targetType: 'rifle' }).radius < impactProfile({ type: 'hit', targetType: 'tank' }).radius);
  assert.equal(impactProfile({ type: 'hit', targetType: 'destroyer' }).water, true);
  assert.equal(impactProfile({ type: 'hit', style: 'robotPulse' }).energy, true);
  assert.equal(impactProfile({ type: 'explosion', size: 10000 }).radius, 170);
});

test('细化 GLB 包含十类设施、五阵营坦克及两类飞机，兵工厂独立建模', () => {
  const bytes = readFileSync(new URL('../assets/models/realism-library.glb', import.meta.url));
  const gltf = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
  const roots = gltf.scenes[gltf.scene || 0].nodes.map(i => gltf.nodes[i]);
  const names = roots.map(n => n.name);
  assert.equal(roots.length, 17);
  for (const name of [...REALISM_BUILDINGS, ...REALISM_BUILDINGS.map(n => `future_${n}`), ...['china','russia','nato','asia','middleeast'].map(n => `tank_${n}`), 'fighter','strike']) assert.ok(names.includes(name), name);
  assert.ok(gltf.nodes.some(n => n.name.startsWith('兵工电子设备舱')));
  assert.ok(gltf.nodes.some(n => n.name.startsWith('炮塔全景观瞄')));
  assert.ok(gltf.materials.some(m => m.name === '阵营标识'));
});
