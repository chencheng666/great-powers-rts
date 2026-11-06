import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createBattleServer } from '../server/index.mjs';

test('仅荣誉恢复页允许本站两个域名嵌入，管理后台保持禁止嵌入', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'gp-profile-bridge-'));
  const app = createBattleServer({ directory, root: resolve('public'), dev: false });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + app.server.address().port;
  try {
    const bridge = await fetch(base + '/official/profile-bridge/index.html');
    assert.equal(bridge.status, 200);
    assert.equal(bridge.headers.get('x-frame-options'), null);
    assert.match(bridge.headers.get('content-security-policy'), /frame-ancestors https:\/\/www\.daguojueqi\.site https:\/\/daguojueqi\.site;/);
    const admin = await fetch(base + '/admin/');
    assert.equal(admin.headers.get('x-frame-options'), 'DENY');
    assert.match(admin.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  } finally {
    await new Promise(resolve => app.server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
});
