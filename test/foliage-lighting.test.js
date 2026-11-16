import test from 'node:test';
import assert from 'node:assert/strict';
import { proceduralTreeGeometry, foliageMaterial } from '../src/battle-surfaces.js';

test('立体树冠与远景贴片有受叶片纹理约束的补光，透明孔洞不被填满', () => {
  const group = proceduralTreeGeometry(0), leaves = group.children[1];
  const material = leaves.material, billboard = foliageMaterial(material.map);
  for (const m of [material, billboard]) {
    assert.equal(m.emissiveMap, m.map);
    assert.ok(m.emissive.g * m.emissiveIntensity > .03);
    assert.ok(m.emissiveIntensity < 1);
    assert.equal(m.transparent, false);
    assert.ok(m.alphaTest > 0);
    assert.equal(m.depthWrite, true);
  }
  assert.equal(material.vertexColors, true);
  const color = leaves.geometry.attributes.color;
  assert.ok(color.count > 0);
  for (let i = 0; i < color.count; i++) assert.ok(Number.isFinite(color.getY(i)) && color.getY(i) > 0);
  group.children.forEach(mesh => { mesh.geometry.dispose(); mesh.material.dispose(); });
  billboard.dispose();
});
