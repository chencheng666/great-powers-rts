import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { AIR_DEFENSE_FACTIONS, createAirDefense } from '../src/air-defense-models.js';
import { equipmentModel } from '../src/equipment.js';

test('各阵营防空与反导使用独立模型并保留关节和有限渲染预算', () => {
  for (const faction of AIR_DEFENSE_FACTIONS) for (const type of ['aa', 'abm']) {
    const model = createAirDefense(faction, type), bounds = new THREE.Box3().setFromObject(model);
    assert.equal(equipmentModel(faction, type), model.name);
    const muzzle = model.getObjectByName('open_asset_muzzle');
    assert.equal(muzzle.parent, model.getObjectByName('barrel'));
    assert.ok(model.getObjectByName('weapon') && model.getObjectByName('air_defense_radar'));
    const size = bounds.getSize(new THREE.Vector3());
    assert.ok(size.x > 6 && size.x < 9 && size.y > 3 && size.y < 6 && size.z < 4);
    let meshes = 0, triangles = 0;
    model.traverse(mesh => { if (mesh.isMesh) { meshes++; triangles += (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) / 3; } });
    assert.ok(meshes <= 16, `${model.name}合批数${meshes}`);
    assert.ok(triangles < 18000, `${model.name}三角形数${triangles}`);
    assert.equal(model.userData.airDefenseDesign.axles, 4);
  }
});

test('月表防空保留机器人模型，不混入现代轮式车', () => {
  assert.notEqual(equipmentModel('china', 'aa', true), 'aa_china');
});
