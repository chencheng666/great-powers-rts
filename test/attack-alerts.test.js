import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { VOICE_COOLDOWN, VOICE_LINES, VOICE_PRIORITY } from '../src/audio-data.js';

test('我方部队受击触发位置警报及高优先级中文语音，敌军和零伤害不触发', () => {
  const voices = [], g = new Game('china', 'russia', { voice: key => voices.push(key) });
  const own = g.ownedUnits(0, 'tank')[0], enemy = g.ownedUnits(1, 'tank')[0];
  g.damage(enemy, 10, 0); g.damage(own, 0, 1); g.damage(own, -10, 1);
  assert.deepEqual(voices, []); assert.equal(g.attackAlerts, undefined);
  g.damage(own, 10, 1);
  assert.deepEqual(voices, ['unitUnderAttack']);
  assert.deepEqual(g.attackAlerts[0], { id: own.id, type: 'tank', building: false, x: own.x, y: own.y, at: 0 });
  assert.ok(VOICE_LINES.unitUnderAttack[0].includes('部队遭到攻击'));
  assert.equal(VOICE_PRIORITY.unitUnderAttack, 3); assert.equal(VOICE_COOLDOWN.unitUnderAttack, 10);
});

test('同目标连续受击合并，持续交火按十秒限频，基地攻击可升级提示', () => {
  const voices = [], g = new Game('china', 'russia', { voice: key => voices.push(key) });
  const tank = g.ownedUnits(0, 'tank')[0], hq = g.ownedBuildings(0, 'hq')[0];
  g.damage(tank, 1, 1); g.time = 2; g.damage(tank, 1, 1);
  assert.equal(g.attackAlerts.length, 1); assert.equal(g.attackAlerts[0].at, 2);
  assert.equal(voices.length, 1);
  g.time = 3; g.damage(hq, 1, 1); assert.equal(voices.at(-1), 'underAttack');
  g.time = 4; g.damage(tank, 1, 1); assert.equal(voices.length, 2);
  g.time = 13; g.damage(tank, 1, 1); assert.equal(voices.at(-1), 'unitUnderAttack');
  assert.equal(g.attackAlerts.length, 1);
});

test('警报数量有上限，旧位置自动清理，恢复战局不重播历史攻击', () => {
  const g = new Game('china', 'russia');
  for (let i = 0; i < 20; i++) g.damage(g.addUnit(0, 'rifle', 700 + i, 700), 1, 1);
  assert.equal(g.attackAlerts.length, 12);
  const save = g.toSave(), voices = [], restored = Game.fromSave(save, { voice: key => voices.push(key) });
  assert.equal(restored.attackAlerts, undefined); assert.deepEqual(voices, []);
  g.time = 20; g.damage(g.ownedUnits(0, 'tank')[0], 1, 1); assert.equal(g.attackAlerts.length, 1);
});
