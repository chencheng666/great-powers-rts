import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { fixedWingPresentation, glideProfile, fixedWingHeight, refineAirfieldRunway, refineAircraftCanopy } from '../src/airfield-presentation.js';

test('固定翼表现不影响垂直起降运输机、无人机、航天器和货运经济', () => {
  assert.equal(fixedWingPresentation('fighter'), true);
  assert.equal(fixedWingPresentation('bomber'), true);
  for (const type of ['drone', 'airlift', 'freightPlane', 'tank']) assert.equal(fixedWingPresentation(type), false);
  assert.equal(fixedWingPresentation('fighter', true), false);
});

test('下滑高度有界且随返场距离连续下降，地面不出现负高度', () => {
  const far = glideProfile(400, 60), near = glideProfile(120, 60), landed = glideProfile(40, 60);
  assert.equal(far.fraction, 1); assert.ok(near.fraction > 0 && near.fraction < 1 && near.pitch < 0);
  assert.equal(landed.fraction, 0);
  const entity = { type: 'fighter', x: 100, y: 0, owner: 0, order: { type: 'rearm' } };
  const game = { map: {}, aircraftGrounded: () => false, ownedBuildings: () => [{ x: 0, y: 0, size: 72 }] };
  const pose = fixedWingHeight(game, entity, {}, 1, 95);
  assert.ok(pose.height > 5 && pose.height < 95);
  assert.equal(entity.x, 100); assert.equal(entity.order.type, 'rearm');
  entity.homeCarrierId = 1; assert.equal(fixedWingHeight(game, entity, {}, 1, 95), null);
});

test('停驻固定翼离场先滑跑再抬升，正常巡航不被机场吸附', () => {
  const entity = { type: 'fighter', x: 0, y: 0, owner: 0, order: { type: 'move' } }, entry = { wasGrounded: true };
  const game = { map: {}, aircraftGrounded: () => false };
  assert.equal(fixedWingHeight(game, entity, entry, 1, 95).height, 5);
  entity.x = 100; const mid = fixedWingHeight(game, entity, entry, 1, 95);
  assert.ok(mid.height > 5 && mid.height < 95 && mid.pitch > 0);
  entity.x = 240; assert.equal(fixedWingHeight(game, entity, entry, 1, 95).height, 95);
  assert.equal(fixedWingHeight(game, entity, entry, 1, 95), null);
  game.aircraftGrounded = () => true; assert.equal(fixedWingHeight(game, entity, entry, 1, 95).height, 5);
});

test('跑道合批为三种材质，标线与边灯保留 UV 并且不重复添加', () => {
  const model = new THREE.Group(); refineAirfieldRunway(model); refineAirfieldRunway(model);
  assert.equal(model.children.length, 1); const runway = model.getObjectByName('固定翼跑道');
  assert.equal(runway.children.length, 3);
  runway.traverse(m => { if (m.isMesh) assert.ok(m.geometry.attributes.uv); });
  const bounds = new THREE.Box3().setFromObject(runway); assert.ok(bounds.min.y > 0);
});

test('座舱使用透明玻璃，原素材与无人机不受污染，内部细节只添加一次', () => {
  const source = new THREE.MeshStandardMaterial({ name: '玻璃', color: '#123456' });
  const model = new THREE.Group(); model.name = 'fighter'; model.add(new THREE.Mesh(new THREE.SphereGeometry(), source));
  refineAircraftCanopy(model); refineAircraftCanopy(model);
  assert.ok(model.children[0].material.isMeshPhysicalMaterial); assert.equal(model.children[0].material.transparent, true);
  assert.ok(model.children[0].material.opacity < .6); assert.equal(model.children[0].material.depthWrite, false);
  assert.equal(model.children[0].material.transmission, 0);
  assert.equal(source.name, '玻璃'); assert.equal(source.transmission, undefined);
  assert.equal(model.children.length, 2); assert.ok(model.getObjectByName('座舱内部'));
  const drone = new THREE.Group(); drone.name = 'drone'; refineAircraftCanopy(drone); assert.equal(drone.children.length, 0);
});
