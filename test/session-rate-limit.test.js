import test from 'node:test';
import assert from 'node:assert/strict';
import { SessionRateLimit } from '../server/session-rate-limit.mjs';

test('会话限流记录严格有界且不淘汰有效记录放行旧来源', () => {
  const limiter = new SessionRateLimit();
  for (let i = 0; i < 1000; i++) assert.equal(limiter.accept(`来源${i}`, 0), true);
  for (let i = 1000; i < 5000; i++) assert.equal(limiter.accept(`来源${i}`, 1), false);
  assert.equal(limiter.entries.size, 1000);
  for (let i = 1; i < 30; i++) assert.equal(limiter.accept('来源0', 2), true);
  assert.equal(limiter.accept('来源0', 3), false);
  assert.equal(limiter.accept('新来源', 60000), true);
  assert.equal(limiter.entries.size, 1);
  assert.equal(limiter.accept('来源0', 60000), true);
});

test('不同来源独立计数，时间窗内请求不能延长窗口', () => {
  const limiter = new SessionRateLimit({ capacity: 2, limit: 2, windowMs: 100 });
  assert.equal(limiter.accept('甲', 10), true);
  assert.equal(limiter.accept('甲', 90), true);
  assert.equal(limiter.accept('甲', 109), false);
  assert.equal(limiter.accept('乙', 109), true);
  assert.equal(limiter.accept('甲', 110), true);
  assert.equal(limiter.accept('丙', 111), false);
  assert.equal(limiter.entries.size, 2);
});
