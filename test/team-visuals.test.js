import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { teamVisual, healthVisual, showHealthBar } from '../src/team-visuals.js';
import { FACTIONS } from '../src/data.js';
import { Game } from '../src/game.js';

test('五个阵营均可镜像开局，双方生命、生产费用与电力条件保持一致', () => {
  for (const faction of Object.keys(FACTIONS)) {
    const game = new Game(faction, faction);
    assert.equal(game.players[0].credits, game.players[1].credits);
    assert.equal(game.players[0].powerIn, game.players[1].powerIn);
    assert.equal(game.players[0].powerOut, game.players[1].powerOut);
    const snapshot = owner => game.units.filter(unit => unit.owner === owner).map(unit => [unit.type, unit.hp, unit.maxHp]);
    assert.deepEqual(snapshot(0), snapshot(1), faction);
    for (const type of ['tank', 'drone', 'elite']) assert.equal(game.unitCost(0, type), game.unitCost(1, type));
  }
});

test('敌我配色与阵营选择解耦，同阵营对战仍保持蓝青与红色区别', () => {
  for (const faction of Object.keys(FACTIONS)) {
    assert.notEqual(teamVisual(0).color, teamVisual(1).color, faction);
    assert.equal(teamVisual(0).marker, 'square'); assert.equal(teamVisual(1).marker, 'diamond');
  }
  assert.equal(teamVisual(null).marker, 'circle');
  assert.equal(teamVisual(1, 1).color, teamVisual(0).color);
  assert.equal(teamVisual(0, 1).color, teamVisual(1).color);
});

test('低血量保留敌我主色，危急提示独立，不把双方血条都改成同一种颜色', () => {
  const fills = [];
  for (const ratio of [1, .5, .25, .01, 0, NaN]) {
    const own = healthVisual(0, ratio), enemy = healthVisual(1, ratio);
    assert.notEqual(own.fill, enemy.fill); assert.notEqual(own.echo, enemy.echo);
    assert.equal(enemy.hostile, true); assert.equal(own.hostile, false);
    fills.push(own.fill);
  }
  assert.equal(new Set(fills).size, 3);
  assert.equal(healthVisual(1, .25).warning, true);
  assert.equal(healthVisual(0, .26).warning, false);
});

test('可见满血敌军显示血条，迷雾、死亡和车内乘员不泄露', () => {
  const enemy = { owner: 1, hp: 100, maxHp: 100 };
  assert.equal(showHealthBar(enemy, true, false, false), true);
  assert.equal(showHealthBar(enemy, false, true, true), false);
  assert.equal(showHealthBar({ ...enemy, hp: 0 }, true, false, false), false);
  assert.equal(showHealthBar({ ...enemy, embarkedIn: 2 }, true, true, true), false);
  const friend = { ...enemy, owner: 0 };
  assert.equal(showHealthBar(friend, true, false, false), false);
  assert.equal(showHealthBar(friend, true, true, false), true);
  assert.equal(showHealthBar(friend, true, false, false, true), true);
  assert.equal(showHealthBar({ ...friend, hp: 30 }, true, false, false), true);
});

test('无人机库包含三种独立机体与四/六旋翼关节，旋翼相对电机轴心安装', () => {
  const buffer = readFileSync(new URL('../assets/models/drone-library.glb', import.meta.url));
  assert.equal(buffer.toString('utf8', 0, 4), 'glTF');
  const json = JSON.parse(buffer.toString('utf8', 20, 20 + buffer.readUInt32LE(12)).trim());
  const nodes = json.nodes;
  for (const [name, count] of [['drone', 4], ['ghost', 0], ['elite_asia', 6]]) {
    const root = nodes.find(node => node.name === name);
    assert.ok(root, name);
    const children = [];
    const visit = node => { children.push(node); for (const child of node.children || []) visit(nodes[child]); };
    visit(root);
    const rotors = children.filter(node => /^rotor_\d+_/.test(node.name));
    assert.equal(rotors.length, count, name);
    for (const rotor of rotors) { assert.equal(rotor.children.length, 2); assert.ok(rotor.translation.some(value => Math.abs(value) > .5)); }
  }
});
