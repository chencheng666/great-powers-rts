import test from 'node:test';
import assert from 'node:assert/strict';
import { createAssetLoader } from '../src/asset-loading.js';

test('大量模型请求遵守并发上限，失败不阻塞队列', async () => {
  const load = createAssetLoader({ concurrency: 2, attempts: 1 });
  let active = 0, peak = 0;
  const results = await Promise.allSettled(Array.from({ length: 8 }, (_, i) => load(`模型${i}.glb`, async () => {
    active++; peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, 5));
    active--;
    if (i === 1) throw new Error('连接中断');
    return i;
  })));
  assert.equal(peak, 2);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 7);
  assert.match(results[1].reason.message, /模型1.glb：连接中断/);
});
test('断流自动重试，图片事件错误有文件名，后续请求可继续', async () => {
  const load = createAssetLoader({ wait: async () => {} });
  let calls = 0;
  assert.equal(await load('舰船.glb', () => { if (++calls < 3) throw new Error('断流'); return '完成'; }), '完成');
  assert.equal(calls, 3);
  await assert.rejects(load('/assets/地面.png', () => { throw {}; }), /地面.png：网络中断或图片解码失败/);
  assert.equal(await load('下一项.glb', async () => 42), 42);
});
