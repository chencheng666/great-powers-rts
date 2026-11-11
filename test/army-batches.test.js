import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ArmyBatches, armyRenderBudget } from '../src/army-batches.js';
import { Renderer } from '../src/render.js';

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

test('高分屏补足细节，团战保留流畅像素与阴影预算', () => {
  assert.equal(armyRenderBudget('standard', 12, 2).pixelRatio, 1.5);
  assert.equal(armyRenderBudget('high', 240, 2).pixelRatio, 1.25);
  assert.equal(armyRenderBudget('high', 120, 1).pixelRatio, 1);
  assert.equal(armyRenderBudget('high', 240, 2).shadowInterval, 50);
});


test('超大视口限制渲染总像素，低 DPI 不强制超采样', () => {
  for (const quality of ['standard', 'high']) {
    const budget = armyRenderBudget(quality, 12, 3, { width: 2560, height: 1440 });
    assert.ok(2560 * 1440 * budget.pixelRatio ** 2 <= Math.max(2560 * 1440, quality === 'high' ? 5_000_000 : 3_000_000) + 1);
    assert.equal(armyRenderBudget(quality, 12, 1).pixelRatio, 1);
  }
  assert.equal(armyRenderBudget('standard', 200, 3).pixelRatio, 1);
});

test('触屏高画质仍限制阴影和像素比例，避免沿用桌面昂贵预算',()=>{const b=armyRenderBudget('high',12,3,{width:844,height:390},true);assert.equal(b.shadowSize,2048);assert.ok(b.pixelRatio<=1.5);});

test('合批后仍按原模型射线点选和屏幕框选，隐藏单位不会被选中', () => {
  const { scene, entries } = army(3), batcher = new ArmyBatches(scene);
  entries.forEach((entry, id) => {
    Object.assign(entry.entity, { owner: 0, hp: 100, type: 'tank', x: id * 5, y: 0 });
    entry.model.userData.entity = entry.entity; entry.topHeight = 4;
  });
  const camera = new THREE.OrthographicCamera(-12, 12, 9, -9, 1, 100);
  camera.position.set(5, 20, 20); camera.lookAt(5, 0, 0); camera.updateMatrixWorld();
  const renderer = Object.assign(Object.create(Renderer.prototype), {
    entities: new Map(entries.map(e => [e.entity.id, e])), sites: [],
    raycaster: new THREE.Raycaster(), viewCamera: camera, viewport: { width: 800, height: 600 },
    elevation: () => 0, game: { selected: [], events: {} },
  });
  batcher.update(entries, new Set([0, 1, 2]));
  for (const entry of entries) {
    const point = renderer.selectionCenter(entry);
    assert.equal(renderer.pickEntity(point.x, point.y)?.id, entry.entity.id);
    assert.equal(renderer.pickSelection(point.x, point.y)?.id, entry.entity.id);
  }
  entries[1].model.visible = false;
  renderer.selectScreenBox({ x: 0, y: 0 }, { x: 800, y: 600 }, false);
  assert.deepEqual(renderer.game.selected, [0, 2]);
  const point = renderer.selectionCenter(entries[1]);
  assert.equal(renderer.pickSelection(point.x, point.y), null);
  batcher.dispose();
});
