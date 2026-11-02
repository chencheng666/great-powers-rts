import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Renderer } from '../src/render.js';

test('近景树木按镜头层级显示，战术与拉远视角保持低开销', () => {
  const volume = { foliage: 'volume', mesh: { visible: false } };
  const billboard = { foliage: 'billboard', mesh: { visible: true } };
  const renderer = { quality: 'high', viewMode: 'immersive', camera: { zoom: 1 }, environment: [volume, billboard] };
  Renderer.prototype.updateFoliageLayers.call(renderer);
  assert.equal(volume.mesh.visible, true);
  renderer.camera.zoom = .7;
  Renderer.prototype.updateFoliageLayers.call(renderer);
  assert.equal(volume.mesh.visible, false);
  renderer.camera.zoom = 1.2; renderer.viewMode = 'tactical';
  Renderer.prototype.updateFoliageLayers.call(renderer);
  assert.equal(volume.mesh.visible, false);
  renderer.viewMode = 'immersive'; renderer.quality = 'standard';
  Renderer.prototype.updateFoliageLayers.call(renderer);
  assert.equal(volume.mesh.visible, false);
  assert.equal(billboard.mesh.visible, true);
});

test('树木贴地，迷雾隐藏时两种层级都缩为零', () => {
  const renderer = { elevation: () => 12, cameraElevation: Math.PI / 4 };
  const point = { x: 40, z: 60, height: 50, width: 24, angle: .8 };
  const dummy = new THREE.Object3D();
  Renderer.prototype.placeFoliage.call(renderer, dummy, point, 'billboard', 0, true);
  assert.ok(dummy.position.y > 12);
  Renderer.prototype.placeFoliage.call(renderer, dummy, point, 'volume', .58, false);
  assert.equal(dummy.scale.x, 0);
  assert.equal(dummy.scale.y, 0);
  assert.equal(dummy.position.y, 12 + point.height * .55);
});

test('建筑地面过渡复用实例槽位，迷雾隐藏及拆除及时回收', () => {
  const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial(), 4);
  mesh.count = 0;
  const renderer = { foundationMesh: mesh, foundationSlots: new Map(), foundationVisible: new Map(), foundationFree: [], foundationNext: 0, foundationDummy: new THREE.Object3D(), elevation: () => 5 };
  const building = { id: 7, type: 'power', x: 40, y: 60, size: 70 };
  Renderer.prototype.updateFoundation.call(renderer, building, true);
  const matrix = new THREE.Matrix4(); mesh.getMatrixAt(0, matrix);
  assert.equal(mesh.count, 1);
  assert.equal(matrix.elements[12], 40);
  assert.ok(matrix.elements[0] > 90);
  Renderer.prototype.updateFoundation.call(renderer, building, false);
  mesh.getMatrixAt(0, matrix); assert.equal(matrix.elements[0], 0);
  Renderer.prototype.removeFoundation.call(renderer, building.id);
  assert.equal(renderer.foundationSlots.has(building.id), false);
  Renderer.prototype.updateFoundation.call(renderer, { ...building, id: 8 }, true);
  assert.equal(renderer.foundationSlots.get(8), 0);
  mesh.geometry.dispose(); mesh.material.dispose();
});

test('树影直立接地并朝向太阳，旋转镜头不改变树影，迷雾下不泄露轮廓', () => {
  const renderer = { elevation: () => 12, cameraElevation: Math.PI / 4, cameraAzimuth: .5, sun: { position: new THREE.Vector3(-1750,1850,-1050), target: { position: new THREE.Vector3() } } };
  const point = { x: 40, z: 60, height: 50, width: 24, angle: .8 }, dummy = new THREE.Object3D();
  Renderer.prototype.placeFoliage.call(renderer,dummy,point,'shadow',0,true);dummy.updateMatrix();
  const matrix=dummy.matrix.clone();assert.equal(dummy.position.x,point.x);assert.equal(dummy.position.z,point.z);
  assert.equal(dummy.position.y-dummy.scale.y/2,12);
  const normal=new THREE.Vector3(0,0,1).applyQuaternion(dummy.quaternion);const light=renderer.sun.position.clone().setY(0).normalize();assert.ok(normal.dot(light)>.9999);
  renderer.cameraElevation=.2;renderer.cameraAzimuth=2.4;Renderer.prototype.placeFoliage.call(renderer,dummy,point,'shadow',0,true);dummy.updateMatrix();assert.ok(matrix.equals(dummy.matrix));
  Renderer.prototype.placeFoliage.call(renderer,dummy,point,'shadow',0,false);assert.equal(dummy.scale.x,0);assert.equal(dummy.scale.y,0);
});
