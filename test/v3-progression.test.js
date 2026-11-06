import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { OPERATION_ROUTES, operationProgress, nextOperation } from '../src/operation-routes.js';
import { CHALLENGES } from '../src/challenges.js';
import { createTutorial, updateTutorial } from '../src/tutorial.js';
import { battleSuggestions } from '../src/battle-report.js';
import { renderRecovery } from '../src/render-recovery.js';
import { HONOR_KEY, emptyHonors, applyHonorResult } from '../src/player-honors.js';
import { recoverRelatedHonors } from '../src/honor-recovery.js';

test('作战路线衔接旧挑战成绩，全部通关后推荐低星任务且不修改原档案', () => {
  const records = { corridor: { wins: 1, bestStars: 3 }, airshield: { wins: 2, bestStars: 2 } };
  const original = JSON.stringify(records);
  assert(OPERATION_ROUTES.every(route => route.missions.every(id => CHALLENGES[id])));
  assert.equal(operationProgress(records)[0].next, 'passwatch');
  assert.equal(nextOperation('airshield', records), 'passwatch');
  assert.equal(JSON.stringify(records), original);
  records.passwatch = { wins: 1, bestStars: 3 };
  assert.equal(operationProgress(records)[0].next, 'airshield');
  assert.equal(nextOperation('airshield', records), null);
  assert.equal(nextOperation('unknown', records), null);
});

test('维修和接管教学只计算开始教学后的真实进展', () => {
  const game = {
    running: true, online: false, selected: [],
    battleStats: { sides: [{ repairHP: 100, resupplies: 2, unitsProduced: 8 }] },
    ownedUnits: () => [], ownedBuildings: () => [],
    oil: [{ id: 'old', owner: 0 }, { id: 'new', owner: -1 }], beacons: []
  };
  const progress = createTutorial(game);
  updateTutorial(progress, game);
  assert.deepEqual(progress.done.slice(4), [false, false]);
  game.battleStats.sides[0].repairHP++;
  updateTutorial(progress, game);
  assert.deepEqual(progress.done.slice(4), [true, false]);
  game.oil[1].owner = 0;
  updateTutorial(progress, game);
  assert.deepEqual(progress.done.slice(4), [true, true]);
});

test('复盘按实际数据提供多个建议，空数据与旧存档不猜测失败原因', () => {
  const game = { time: 240, winner: 1 };
  const report = { sides: [{ losses: 6, kills: 1, resupplies: 0, intercepted: 900, delivered: 0, oilSeconds: 0, beaconSeconds: 0, unitsProduced: 1 }] };
  const suggestions = battleSuggestions(game, report);
  assert.equal(suggestions.length, 3);
  assert(suggestions.some(item => item.title === '保护补给线'));
  assert(suggestions.some(item => item.title === '把受损部队带回来'));
  assert.deepEqual(battleSuggestions(game, null), []);
  assert.match(battleSuggestions({ ...game, challenge: { id: 'recon' } }, report)[0].detail, /停稳/);
});

function win(profile, battleId = randomUUID()) {
  return applyHonorResult(profile, { battleId, winner: 0, difficulty: 'recruit', mode: 'quick', mapId: 'valley', faction: 'china', time: 240 }).profile;
}
function storage(profile) {
  const values = new Map(profile ? [[HONOR_KEY, JSON.stringify(profile)]] : []);
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}

test('旧域名荣誉可恢复到空档案，重复恢复幂等，分叉和损坏数据不覆盖本机', () => {
  const remote = win(emptyHonors()), local = storage();
  assert.equal(recoverRelatedHonors(local, JSON.stringify(remote)), true);
  assert.equal(recoverRelatedHonors(local, JSON.stringify(remote)), false);
  assert.deepEqual(JSON.parse(local.getItem(HONOR_KEY)), remote);
  const divergent = win(emptyHonors()), target = storage(divergent), before = target.getItem(HONOR_KEY);
  assert.equal(recoverRelatedHonors(target, JSON.stringify(remote)), false);
  assert.equal(target.getItem(HONOR_KEY), before);
  assert.throws(() => recoverRelatedHonors(target, '{"points":999}'));
  assert.equal(target.getItem(HONOR_KEY), before);
  const newer = win(divergent);
  assert.equal(recoverRelatedHonors(target, JSON.stringify(newer)), true);
});

test('不支持WebGL时给出图形加速指引，连接中断仍可尝试恢复', () => {
  assert.equal(renderRecovery(new Error('Error creating WebGL context')).available, false);
  assert.match(renderRecovery(new Error('WebGL not supported')).detail, /图形加速/);
  assert.equal(renderRecovery(new Error('图形设备连接中断')).available, true);
});
