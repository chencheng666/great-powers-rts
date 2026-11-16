import test from 'node:test';
import assert from 'node:assert/strict';
import { createBattleFogGeometry } from '../src/battle-fog.js';
import { OCEAN_LEVEL, OCEAN_MAX_WAVE_HEIGHT, oceanWavePose } from '../src/ocean-motion.js';

const world = { width: 600, height: 400 };
test('海面迷雾覆盖海床和所有波峰，陆岸及桥面仍贴合实际表面', () => {
  const height = (x, z) => x < 200 ? 14 : x > 400 ? 38 : z < 100 ? 27 : -15;
  for (const mobile of [true, false]) {
    const geometry = createBattleFogGeometry(world, height, { water: true, mobile });
    const p = geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i), ground = height(x, z), y = p.getY(i);
      assert.ok(y > OCEAN_LEVEL + OCEAN_MAX_WAVE_HEIGHT);
      if (ground > OCEAN_LEVEL + OCEAN_MAX_WAVE_HEIGHT) assert.equal(y, ground + 2);
    }
    for (let time = 0; time < 50; time += .5) {
      const wave = oceanWavePose(310, 210, time);
      assert.ok(geometry.boundingBox.min.y > OCEAN_LEVEL + wave.height);
    }
    assert.ok(geometry.boundingSphere.radius > 0);
    geometry.dispose();
  }
});
test('纯陆地的谷底不被抬成海面，模型包围体包括高地迷雾', () => {
  const geometry = createBattleFogGeometry(world, x => x < 300 ? -28 : 120);
  assert.equal(geometry.boundingBox.min.y, -26);
  assert.equal(geometry.boundingBox.max.y, 122);
  geometry.dispose();
});
