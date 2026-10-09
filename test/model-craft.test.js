import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { surfaceMaps, bodyLoft, mergeParts } from '../src/model-craft.js';
import { createPersonnel } from '../src/personnel-models.js';
import { refineEquipment, hasRefinedTracks } from '../src/equipment-finishing.js';
import { weatherMaterial } from '../src/visual-assets.js';

test('程序化贴图共享缓存，颜色空间正确且颜色不会溢出为黑色', () => {
  for (const kind of ['coating','fabric','rubber']) {
    const maps = surfaceMaps(kind); assert.equal(maps, surfaceMaps(kind));
    assert.equal(maps.map.colorSpace, THREE.SRGBColorSpace); assert.equal(maps.normalMap.colorSpace, THREE.NoColorSpace);
    assert.equal(maps.roughnessMap.colorSpace, THREE.NoColorSpace);
    for (let i=0;i<maps.map.image.data.length;i+=4) assert.ok(maps.map.image.data[i]>=220);
    assert.equal(maps.normalMap.image.width,128); assert.equal(maps.map.wrapS, THREE.RepeatWrapping);
  }
  assert.notEqual(surfaceMaps('fabric').normalMap, surfaceMaps('coating').normalMap);
});

test('人物保持合理身高、膝关节与 UV，绘制调用和面数受控', () => {
  for (const type of ['rifle','engineer','scout']) {
    const model = createPersonnel(type), bounds = new THREE.Box3().setFromObject(model); let meshes=0, triangles=0;
    assert.ok(bounds.max.y > 1.8 && bounds.max.y < 2); assert.ok(bounds.min.y>=0);
    assert.ok(model.getObjectByName('knee_left') && model.getObjectByName('knee_right'));
    model.traverse(mesh => { if (!mesh.isMesh) return; meshes++; triangles+=mesh.geometry.attributes.position.count/3;
      assert.equal(mesh.geometry.attributes.uv.count, mesh.geometry.attributes.position.count);
      assert.ok([...mesh.geometry.attributes.normal.array].every(Number.isFinite));
    });
    assert.ok(meshes<=16); assert.ok(triangles<=16000);
  }
});

test('人体截面法线向外，合批保留纹理且不混合同名的不同材质', () => {
  const loft = bodyLoft([[0,.2,.3],[1,.2,.3]]);
  assert.ok(loft.attributes.normal.getX(0)>.9);
  const group = new THREE.Group(), a = new THREE.MeshStandardMaterial({name:'同名',color:'red'}), b = new THREE.MeshStandardMaterial({name:'同名',color:'blue'});
  for (const material of [a,a,b]) group.add(new THREE.Mesh(new THREE.BoxGeometry(),material));
  mergeParts(group); assert.equal(group.children.length,2); assert.equal(group.children[0].geometry.attributes.uv.count,72);
});

test('装备工艺细节幂等、随原炮塔转动，独立履带后新增网格不超过九个且面数受控', () => {
  for (const name of ['tank_china','tank_nato','tank_middleeast','fighter','strike','rocket_china','supply']) {
    const model = new THREE.Group(), weapon = new THREE.Group(); weapon.name='weapon'; model.add(weapon);
    refineEquipment(model,name); const count=model.children.length;
    assert.equal(refineEquipment(model,name),model); assert.equal(model.children.length,count);
    let calls=0,triangles=0;model.traverse(m=>{if(m.isMesh){calls++;triangles+=m.geometry.attributes.position.count/3;assert.ok(m.geometry.attributes.uv);}});
    assert.ok(calls <= (hasRefinedTracks(name) ? 9 : 6));assert.ok(triangles<10000);
    if(hasRefinedTracks(name)) assert.equal(model.getObjectByName('track_belt_1').isInstancedMesh, true);
    if(hasRefinedTracks(name))assert.ok(weapon.getObjectByName('炮塔工艺细节'));
  }
  const model=new THREE.Group();refineEquipment(model,'robot_rifle');assert.equal(model.children.length,0);
});

test('材质增强保留已有纹理，涂装与橡胶的物性不同且阵营色不被污染', () => {
  const texture = new THREE.Texture(), paint = new THREE.MeshStandardMaterial({name:'装甲钢', map:texture});
  const enhanced=weatherMaterial(paint);assert.equal(enhanced.map,texture);assert.ok(enhanced.normalMap);assert.equal(paint.normalMap,null);
  const rubber=weatherMaterial(new THREE.MeshStandardMaterial({name:'橡胶'}));assert.equal(rubber.metalness,0);assert.ok(rubber.roughness>.9);
  const team=new THREE.MeshStandardMaterial({name:'阵营标识'});assert.equal(weatherMaterial(team),team);
});
