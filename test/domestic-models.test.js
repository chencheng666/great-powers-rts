import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createChineseTank,createChineseDestroyer} from '../src/domestic-models.js';

for(const [name,create,budget]of [['国产坦克',createChineseTank,5000],['国产驱逐舰',createChineseDestroyer,9000]])test(`${name}保持有限面数、完整UV和独立炮塔关节`,()=>{
  const model=create();let triangles=0,meshes=0;
  model.traverse(m=>{if(!m.isMesh)return;meshes++;triangles+=(m.geometry.index?.count||m.geometry.attributes.position.count)/3;
    assert.ok(m.geometry.attributes.uv);assert.ok([...m.geometry.attributes.position.array].every(Number.isFinite));});
  assert.ok(triangles<budget);assert.ok(meshes<=18);
  const weapon=model.getObjectByName('weapon'),barrel=model.getObjectByName('barrel'),muzzle=model.getObjectByName('open_asset_muzzle');
  assert.ok(weapon&&barrel&&muzzle);assert.equal(barrel.parent,weapon);
  model.updateMatrixWorld(true);const before=muzzle.getWorldPosition(new THREE.Vector3());
  weapon.rotation.y=Math.PI/3;model.updateMatrixWorld(true);
  assert.ok(muzzle.getWorldPosition(new THREE.Vector3()).distanceTo(before)>1);
  const clone=model.clone();assert.notEqual(clone.getObjectByName('weapon'),weapon);
  const box=new THREE.Box3().setFromObject(model);assert.ok(box.max.y>box.min.y&&box.max.x>box.min.x);
});
