import test from 'node:test';
import assert from 'node:assert/strict';
import { loadChallengeThumbnails } from '../src/challenge-thumbnails.js';

test('挑战缩略图等待素材加载后再生成', async () => {
  let resolve, calls = 0;
  const image = { dataset: { challengeModel: 'tank' } };
  const result = loadChallengeThumbnails({ prepare: () => new Promise(done => { resolve = done; }), images: [image], thumbnail: model => { calls++; return model; }, isCurrent: () => true, onFailure: () => assert.fail() });
  assert.equal(calls, 0);
  resolve();
  assert.equal(await result, true);
  assert.equal(image.src, 'tank');
});

test('关闭或切换挑战面板后不写入旧面板', async () => {
  assert.equal(await loadChallengeThumbnails({ prepare: async () => {}, images: [{}], thumbnail: () => assert.fail(), isCurrent: () => false, onFailure: () => assert.fail() }), false);
});

test('加载失败被接管并显示可恢复提示', async () => {
  const error = new Error('离线'); let received;
  assert.equal(await loadChallengeThumbnails({ prepare: async () => { throw error; }, images: [], thumbnail: () => assert.fail(), isCurrent: () => true, onFailure: value => { received = value; } }), false);
  assert.equal(received, error);
});

test('过期请求失败不覆盖新面板', async () => {
  assert.equal(await loadChallengeThumbnails({ prepare: async () => { throw new Error('离线'); }, images: [], isCurrent: () => false, onFailure: () => assert.fail() }), false);
});
