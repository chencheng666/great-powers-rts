import test from 'node:test';
import assert from 'node:assert/strict';
import { BackgroundPause } from '../src/background-pause.js';

const battle = patch => ({ running: true, paused: false, winner: null, ...patch });

test('切出单机暂停，切回同一战局恢复，重复后台通知不丢失来源', () => {
  const controller = new BackgroundPause(), game = battle();
  assert.equal(controller.hide(game), true);
  assert.equal(game.paused, true);
  assert.equal(controller.hide(game), false);
  assert.equal(controller.resume(game), true);
  assert.equal(game.paused, false);
  assert.equal(controller.resume(game), false);
});

test('主动暂停和读档暂停不能因切换窗口被解除', () => {
  const controller = new BackgroundPause(), game = battle({ paused: true });
  assert.equal(controller.hide(game), false);
  assert.equal(controller.resume(game), false);
  assert.equal(game.paused, true);
});

test('后台暂停后打开手动菜单，取消自动恢复资格', () => {
  const controller = new BackgroundPause(), game = battle();
  controller.hide(game); controller.cancel();
  assert.equal(controller.resume(game), false);
  assert.equal(game.paused, true);
});

test('菜单或图鉴未关闭时不能自动恢复', () => {
  const controller = new BackgroundPause(), game = battle();
  controller.hide(game);
  assert.equal(controller.resume(game, true), false);
  assert.equal(game.paused, true);
});

test('切局、退出或已经结束的战局不会错误恢复', () => {
  const controller = new BackgroundPause(), first = battle(), next = battle({ paused: true });
  controller.hide(first);
  assert.equal(controller.resume(next), false);
  assert.equal(next.paused, true);
  controller.hide(first); first.running = false;
  assert.equal(controller.resume(first), false);
  const ended = battle(); controller.hide(ended); ended.winner = 0;
  assert.equal(controller.resume(ended), false);
  assert.equal(ended.paused, true);
  assert.equal(controller.resume(null), false);
});

test('联网重连暂停完全由服务器管理', () => {
  const controller = new BackgroundPause(), game = battle({ online: true });
  assert.equal(controller.hide(game), false);
  assert.equal(game.paused, false);
  game.paused = true;
  assert.equal(controller.resume(game), false);
  assert.equal(game.paused, true);
});
