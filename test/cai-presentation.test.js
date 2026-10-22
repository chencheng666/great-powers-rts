import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { facilityRotation, sceneryClearance, shorelineWidth } from '../src/site-presentation.js';
import { productionExit } from '../src/battlefield-details.js';
import { airfieldApron } from '../src/airfield-rules.js';
import { Game } from '../src/game.js';

test('现代设施正门与实际出兵方向一致，覆盖两方及六方角度', () => {
  for (const type of ['barracks', 'factory', 'armory']) for (const angle of [0, Math.PI, Math.PI / 3, -Math.PI / 3]) {
    const b = { type, owner: 0, x: 500, y: 600, size: 80, spawnAngle: angle };
    const exit = productionExit(b, type === 'barracks' ? 'rifle' : 'tank');
    const front = new THREE.Vector3(type === 'armory' ? 1 : 0, 0, type === 'armory' ? 0 : 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), facilityRotation(b));
    assert.ok(Math.abs(front.x - exit.forwardX) < 1e-9);
    assert.ok(Math.abs(front.z - exit.forwardY) < 1e-9);
    assert.ok(Math.abs((exit.x - b.x) * exit.forwardY - (exit.y - b.y) * exit.forwardX) < 1e-9);
  }
  assert.equal(facilityRotation({type:'factory'}, true), 0);
});

test('建筑施工清理完整基座范围，装饰树石不盖住经过的车辆', () => {
  const rock = { x: 100, z: 100, scale: 22 };
  assert.equal(sceneryClearance(rock, [{ x: 170, y: 100, size: 80, hp: 100 }]), true);
  assert.equal(sceneryClearance(rock, [{ x: 170, y: 100, size: 80, hp: 0 }]), false);
  const tank = { x: 110, y: 110, type: 'tank', hp: 100 };
  assert.equal(sceneryClearance(rock, [], [tank]), true);
  assert.equal(sceneryClearance(rock, [], [{ ...tank, embarkedIn: 1 }]), false);
  assert.equal(sceneryClearance(rock, [], [{ ...tank, x: 500 }]), false);
});

test('潮线仅在水域内变化，宽度连续且有上限', () => {
  for (let z = 0; z < 6000; z += 10) {
    assert.ok(shorelineWidth(z) >= 18 && shorelineWidth(z) <= 36);
    assert.ok(Math.abs(shorelineWidth(z + .01) - shorelineWidth(z)) < .01);
  }
});

test('现代固定翼从跑道端部出发，返场停机目标避开机库中心', () => {
  const home = { type: 'airfield', owner: 0, x: 700, y: 900, size: 92 };
  const exit = productionExit(home, 'fighter'), apron = airfieldApron(home);
  assert.equal(exit.y, apron.y); assert.ok(exit.x < home.x - 60); assert.ok(exit.distance > 120);
  assert.ok(productionExit({ ...home, owner: 1 }, 'fighter').x > home.x + 60);
  assert.notEqual(productionExit(home, 'fighter', true).y, apron.y);
  const g = new Game('china', 'nato', {}, { multiplayer: true });
  g.units = []; const field = g.addBuilding(0, 'airfield', 700, 900);
  const plane = g.addUnit(0, 'fighter', 950, 1000); plane.order = { type: 'rearm' }; plane.ammo = 0;
  let goal; g.moveUnit = (u, target) => { goal = target; };
  g.updateRearm(plane, .05);
  assert.deepEqual(goal, airfieldApron(field)); assert.ok(goal.y > field.y + 20);
});
