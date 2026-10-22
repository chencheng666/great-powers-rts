import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ArmyBatches, armyRenderBudget } from '../src/army-batches.js';

function army(count) {
  const scene = new THREE.Scene(), geometry = new THREE.BoxGeometry(), material = new THREE.MeshStandardMaterial();
  const entries = Array.from({ length: count }, (_, id) => {
    const model = new THREE.Group(), joint = new THREE.Group(), mesh = new THREE.Mesh(geometry, material);
    model.position.x = id * 5; joint.position.y = 2; joint.add(mesh); model.add(joint); scene.add(model);
    return { entity: { id, kind: 'unit' }, model, joint, mesh };
  });
  return { scene, entries, geometry, material };
}

test('240 个共用部件合为一次绘制，独立关节世界变换不丢失', () => {
  const { scene, entries } = army(240), batcher = new ArmyBatches(scene), ids = new Set(entries.map(e => e.entity.id));
  entries[12].joint.rotation.y = .8;
  batcher.update(entries, ids);
  assert.deepEqual(batcher.stats, { sources: 240, batches: 1 });
  const batch = [...batcher.batches.values()][0].mesh, matrix = new THREE.Matrix4();
  batch.getMatrixAt(12, matrix);
  matrix.elements.forEach((value, i) => assert.ok(Math.abs(value - entries[12].mesh.matrixWorld.elements[i]) < 1e-6));
  assert.equal(entries[12].model.visible, true);
  assert.equal(entries[12].mesh.layers.mask, 2);
  batcher.dispose();
  assert.equal(entries[12].mesh.layers.mask, 1);
});

test('迷雾、视口和 LOD 变化当帧移除旧实例，死亡后无幽灵残留', () => {
  const { scene, entries } = army(10), batcher = new ArmyBatches(scene), ids = new Set(entries.map(e => e.entity.id));
  batcher.update(entries, ids);
  entries[1].model.visible = false; entries[2].joint.visible = false; ids.delete(3);
  batcher.update(entries, ids);
  assert.equal(batcher.stats.sources, 7);
  batcher.update([], new Set());
  assert.ok([...batcher.batches.values()].every(b => b.mesh.count === 0 && !b.mesh.visible));
  assert.equal(entries[0].mesh.layers.mask, 1);
  batcher.dispose();
});

test('阵营及损伤材质隔离，不透明部件合批不吞掉玻璃', () => {
  const { scene, entries } = army(6), batcher = new ArmyBatches(scene);
  entries[1].mesh.material = entries[1].mesh.material.clone(); entries[1].mesh.material.color.set('red');
  entries[2].mesh.material = entries[2].mesh.material.clone(); entries[2].mesh.material.transparent = true;
  batcher.update(entries, new Set(entries.map(e => e.entity.id)));
  assert.deepEqual(batcher.stats, { sources: 5, batches: 2 });
  assert.equal(entries[2].mesh.layers.mask, 1);
  const material = entries[0].mesh.material, geometry = entries[0].mesh.geometry;
  let destroyed = 0; material.addEventListener('dispose', () => destroyed++); geometry.addEventListener('dispose', () => destroyed++);
  batcher.dispose(); assert.equal(destroyed, 0);
});

test('流畅画质在双人和单机同样限制像素与阴影预算', () => {
  assert.equal(armyRenderBudget('standard', 12, 2).pixelRatio, 1);
  assert.equal(armyRenderBudget('high', 240, 2).pixelRatio, 1.25);
  assert.equal(armyRenderBudget('high', 120, 1).pixelRatio, 1);
  assert.equal(armyRenderBudget('high', 240, 2).shadowInterval, 50);
});
