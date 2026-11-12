import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { fixedWingPresentation, glideProfile, fixedWingHeight, refineAirfieldRunway, refineAircraftCanopy, groundAirfieldPavement, airfieldSurfaceHeight } from '../src/airfield-presentation.js';
import { AIRFIELD_LAYOUT, airfieldParking } from '../src/airfield-rules.js';
import { sceneryClearance } from '../src/site-presentation.js';

test('固定翼表现不影响垂直起降运输机、无人机、航天器和货运经济', () => {
  assert.equal(fixedWingPresentation('fighter'), true);
  assert.equal(fixedWingPresentation('bomber'), true);
  for (const type of ['drone', 'airlift', 'freightPlane', 'tank']) assert.equal(fixedWingPresentation(type), false);
  assert.equal(fixedWingPresentation('fighter', true), false);
});

test('下滑高度有界且随返场距离连续下降，地面不出现负高度', () => {
  const far = glideProfile(400, 60), near = glideProfile(120, 60), landed = glideProfile(40, 60);
  assert.equal(far.fraction, 1); assert.ok(near.fraction > 0 && near.fraction < 1 && Number.isFinite(near.pitch));
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

test('长跑道和机坪分色合批，标线与边灯保留 UV 并且不重复添加', () => {
  const model = new THREE.Group(); refineAirfieldRunway(model); refineAirfieldRunway(model);
  assert.equal(model.children.length, 1); const runway = model.getObjectByName('固定翼跑道');
  assert.equal(runway.children.length, 5);
  runway.traverse(m => { if (m.isMesh) assert.ok(m.geometry.attributes.uv); });
  const bounds = new THREE.Box3().setFromObject(runway); assert.ok(bounds.min.y > 0);
  assert.ok(bounds.max.x - bounds.min.x >= 25);
});

test('跑道按各顶点地形贴地，实例几何独立，六个机位与飞机接地使用相同表面高度', () => {
  const template = refineAirfieldRunway(new THREE.Group()), model = template.clone(true);
  const home = { x: 500, y: 700, size: 128, owner: 0 }, scale = home.size / 7.2;
  const elevation = (x, z) => Math.sin(x / 170) * 7 + Math.cos(z / 120) * 4;
  const originals = model.getObjectByName('固定翼跑道').children.map(m => m.geometry);
  const source = originals.map(g => g.attributes.position.array.slice());
  const tracked = []; assert.ok(groundAirfieldPavement(model, home, elevation, g => tracked.push(g)) > 1000);
  model.getObjectByName('固定翼跑道').children.forEach((mesh, index) => {
    assert.notEqual(mesh.geometry, originals[index]);
    assert.deepEqual(originals[index].attributes.position.array, source[index]);
    const p = mesh.geometry.attributes.position;
    for (let i = 0; i < p.count; i += 17) {
      const worldY = elevation(home.x, home.y) + p.getY(i) * scale;
      const expected = elevation(home.x + p.getX(i) * scale, home.y + p.getZ(i) * scale) + source[index][i * 3 + 1] * scale;
      assert.ok(Math.abs(worldY - expected) < .0001);
    }
  });
  assert.equal(groundAirfieldPavement(model, home, elevation), 0);
  for (let slot = 0; slot < 6; slot++) {
    const plane = { ...airfieldParking(home, slot), owner: 0 }, ground = elevation(plane.x, plane.y);
    assert.equal(airfieldSurfaceHeight({ ownedBuildings: () => [home] }, plane, ground), ground + AIRFIELD_LAYOUT.pavementTop * scale);
  }
  tracked.forEach(g => g.dispose());
});

test('延长跑道与机坪边缘保留树冠投影净空，不清除远处树林', () => {
  const home = { type: 'airfield', hp: 760, size: 128, x: 1000, y: 1550 };
  const near = { x: 981, z: 1831, width: 64, height: 86, scale: 13 };
  assert.equal(sceneryClearance(near, [home], [], true), true);
  assert.equal(sceneryClearance({ ...near, z: 2000 }, [home], [], true), false);
  assert.equal(sceneryClearance({ x: 1205, z: 1588, scale: 18 }, [home]), true);
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


test('返场末段平滑抬头拉平，接地及巡航水平且边界连续', () => {
  const radius = 60, pitch = f => glideProfile(radius + 260 * f, radius).pitch;
  assert.ok(pitch(.1) > 0); assert.ok(pitch(.5) < 0);
  assert.equal(pitch(0), 0); assert.equal(pitch(1), 0);
  for (const f of [0, .1, .3, .85, 1]) assert.ok(Math.abs(pitch(f - .00001) - pitch(f + .00001)) < .0001);
  for (let f = 0; f <= 1; f += .01) assert.ok(pitch(f) >= -.070001 && pitch(f) <= .060001);
});
