import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import * as base from '../src/data.js';
import { makeScifiData } from '../variants/taptap/config.mjs';
import plugin from '../variants/taptap/build-plugin.mjs';

test('科幻发行数据独立且不改动官网数据', () => {
  const before = JSON.stringify(base), data = makeScifiData(base);
  assert.deepEqual(Object.keys(data.MAPS), ['meridian', 'moonsea']);
  assert.equal(data.BUILDINGS.nuclearSilo, undefined);
  assert.deepEqual(Object.keys(data.FACTIONS), ['aegis', 'forge', 'citadel', 'swarm', 'pulse']);
  assert.ok(Object.values(data.MAPS).every(map => map.future && map.singleplayerOnly));
  assert.ok(!/中国装备|北约|以色列|T-90|F-22|国际歌|核武器/.test(JSON.stringify(data)));
  assert.equal(JSON.stringify(base), before);
});

test('独立构建的真实游戏引擎支持十种阵营地图组合、禁止核武器并兼容本版存档', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gp-starport-test-')), entry = join(dir, 'engine.cjs');
  try {
    await build({ entryPoints: [resolve('src/game.js')], bundle: true, platform: 'node', format: 'cjs', outfile: entry, logLevel: 'silent', plugins: [{ name: 'same-scifi-source', setup(b) {
      b.onLoad({ filter: /[\\/]src[\\/].*\.js$/ }, async args => {
        const original = await plugin.load(args.path) ?? await readFile(args.path, 'utf8');
        return { contents: plugin.transform(original, args.path) ?? original, loader: 'js', resolveDir: dirname(args.path) };
      });
    } }] });
    const { Game } = createRequire(import.meta.url)(entry);
    for (const mapId of ['meridian', 'moonsea']) for (const faction of ['aegis', 'forge', 'citadel', 'swarm', 'pulse']) {
      const g = new Game(faction, faction === 'forge' ? 'aegis' : 'forge', {}, { mapId, nuclearEnabled: true, difficulty: 'recruit' });
      assert.equal(g.nuclearEnabled, false);
      assert.equal(g.launchNuclear(600, 600), false);
      assert.equal(g.startBuild(0, 'nuclearSilo'), false);
      assert.equal(g.mapId, mapId);
      for (let i = 0; i < 800; i++) g.update(.05);
      assert.ok(g.players.every(p => Number.isFinite(p.credits)));
      const restored = Game.fromSave(g.toSave());
      assert.equal(restored.mapId, mapId);
      assert.equal(restored.players[0].faction, faction);
      assert.equal(restored.units.length, g.units.length);
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});
