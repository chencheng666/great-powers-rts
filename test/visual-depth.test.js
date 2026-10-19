import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { battleAzimuth, battleElevation, groundPan, groundExtents } from '../src/battle-camera.js';
import { finishAirframe } from '../src/airframe-finish.js';
import { surfaceMaps } from '../src/model-craft.js';
import { createModernAircraft } from '../src/aircraft-models.js';
import { createStrategicModel } from '../src/strategic-models.js';
import { Renderer } from '../src/render.js';

test('斜向镜头露出建筑侧面，拖拽与视口边界沿相同正交基计算，战术视角保持原方向', () => {
  const yaw = battleAzimuth('immersive'), elevation = battleElevation('immersive');
  assert.equal(yaw, Math.PI / 6); assert.equal(battleAzimuth('tactical'), 0);
  const right = groundPan(100, 0, 1, elevation, yaw), down = groundPan(0, 100, 1, elevation, yaw);
  assert.ok(right.x > 0 && right.y < 0 && down.x > 0 && down.y > 0);
  assert.ok(Math.abs(right.x * down.x + right.y * down.y) < 1e-8);
  const bounds = groundExtents(1400, 900, 1, elevation, yaw);
  for (const dx of [-700, 700]) for (const dy of [-450, 450]) {
    const corner = groundPan(dx, dy, 1, elevation, yaw);
    assert.ok(Math.abs(corner.x) <= bounds.x + 1e-6 && Math.abs(corner.y) <= bounds.y + 1e-6);
  }
  assert.deepEqual(groundPan(100, 100, 1, Math.PI / 2, 0), { x: 100, y: 100 });
});

test('斜向树木面片下边缘仍接地，投影方向变化不让树浮空', () => {
  const renderer = { elevation: () => 12, cameraElevation: Math.PI / 4, cameraAzimuth: Math.PI / 6 };
  const dummy = new THREE.Object3D(), point = { x: 100, z: 200, height: 60, width: 30 };
  Renderer.prototype.placeFoliage.call(renderer, dummy, point, 'billboard', 0, true); dummy.updateMatrix();
  const foot = new THREE.Vector3(0, -.5, 0).applyMatrix4(dummy.matrix);
  assert.ok(foot.distanceTo(new THREE.Vector3(100, 12, 200)) < 1e-8);
});

test('机体纹理包含明暗分区、凹凸与粗糙度，材质和UV不修改其他共享模型，批次数不增加', () => {
  for (const model of [createModernAircraft('fighter_china'), createModernAircraft('airlift'), createStrategicModel('fighter_nato'), createStrategicModel('helicopter'), createStrategicModel('swarmCarrier')]) {
    let count = 0; const originals = new Map(); model.traverse(m => { if (m.isMesh) { count++; originals.set(m, { g: m.geometry, mat: m.material }); } });
    finishAirframe(model); let after = 0, coated = 0;
    model.traverse(m => {
      if (!m.isMesh) return; after++;
      if (m.material.map !== surfaceMaps('aircraft').map) return;
      coated++; assert.notEqual(m.geometry, originals.get(m).g); assert.notEqual(m.material, originals.get(m).mat);
      assert.ok(m.material.normalMap && m.material.roughnessMap && m.geometry.attributes.uv.count === m.geometry.attributes.position.count);
      assert.ok([...m.geometry.attributes.uv.array].every(Number.isFinite));
    });
    assert.equal(after, count); assert.ok(coated > 0);
  }
  const { map, normalMap, roughnessMap } = surfaceMaps('aircraft');
  assert.equal(map.image.width, 256); assert.equal(map.colorSpace, THREE.SRGBColorSpace);
  assert.equal(normalMap.colorSpace, THREE.NoColorSpace); assert.equal(roughnessMap.colorSpace, THREE.NoColorSpace);
  const values = map.image.data.filter((_, i) => i % 4 === 0);
  assert.ok(Math.max(...values) - Math.min(...values) > 45);
});
