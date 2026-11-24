import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { MAPS } from '../src/data.js';
import { discoverMaps, mapBrief } from '../src/map-discovery.js';
import { islandDistance, islandIndex } from '../src/island-map.js';
import { QUICK_PRESETS } from '../src/quick-entry.js';
import { terrainHeight } from '../src/visual-detail.js';

const start = () => new Game('china', 'russia', {}, { ...QUICK_PRESETS.cai, victoryMode: 'control' });

test('CAI 专属地图能从海战分类搜索，陆地、山脊和海峡使用同一位置定义', () => {
  const g = start();
  assert.equal(g.mapId, 'caiStrait');
  assert.equal(g.players.length, 2);
  assert(g.isAI(1));
  assert.deepEqual(discoverMaps(Object.keys(MAPS), 'sea', 'CAI'), ['caiStrait']);
  assert.match(mapBrief(g.mapId).special, /赠予 CAI/);
  assert.throws(() => new Game('china', 'russia', {}, { mapId: g.mapId, multiplayer: true }), /仅供单机/);
  for (const b of g.buildings.filter(b => b.type !== 'dock')) {
    assert(islandDistance(g.map, b.x, b.y) > b.size);
    assert(!g.isGroundBlocked(b.x, b.y, b.size * .6));
  }
  assert(terrainHeight(g, 4440, 2250) > 100);
  assert(g.isGroundBlocked(4440, 2250));
  assert(terrainHeight(g, 2880, 1200) < 0);
  assert(g.isGroundBlocked(2880, 1200, 6));
  assert(!g.isNavalBlocked(2880, 1200, 36));
});

test('两岸工程师能按正常指令登船、驶抵潮心岛、卸载并接管信标', () => {
  const advance = (g, done, seconds) => {
    for (let i = 0; i < seconds * 20 && !done(); i++) g.update(.05);
    return done();
  };
  const approaches = [{ x: 2140, y: 1940 }, { x: 2890, y: 1930 }];
  const players = [{ faction: 'china', controlType: 'human' }, { faction: 'russia', controlType: 'human' }];
  for (const side of [0, 1]) {
    const g = new Game('china', 'russia', {}, { mapId: 'caiStrait', players });
    const signal = g.beacons.find(b => b.id === 'cai-tide');
    const boat = g.ownedUnits(side, 'landing')[0], point = approaches[side];
    const engineer = g.ownedUnits(side, 'engineer')[0];
    g.selected = [engineer.id]; g.command(boat.x, boat.y, false, side);
    assert(advance(g, () => engineer.embarkedIn === boat.id, 90), `阵营 ${side} 登船`);
    g.selected = [boat.id]; g.command(point.x, point.y, false, side);
    assert(advance(g, () => !boat.order && g.transportGrounded(boat) &&
      Math.hypot(boat.x - point.x, boat.y - point.y) < 32, 60));
    g.unloadTransport(boat);
    assert(advance(g, () => !engineer.embarkedIn, 8));
    assert.equal(islandIndex(g.map, engineer), islandIndex(g.map, signal));
    g.selected = [engineer.id];
    if (!g.hasExploredFor(side, signal.x, signal.y)) {
      g.command(signal.x, signal.y, false, side);
      assert(advance(g, () => g.hasExploredFor(side, signal.x, signal.y), 18));
    }
    g.command(signal.x, signal.y, false, side);
    assert(advance(g, () => signal.owner === side, 40));
  }
});

test('收复台岛需要集齐三座信标并连续驻守，失守清零且可保存驻守进度', () => {
  const g = start(), ids = g.map.islandObjective.beacons;
  assert.equal(g.victoryMode, 'control');
  for (const site of g.beacons) site.owner = site.id === ids[1] ? null : 0;
  g.buildings = g.buildings.filter(b => b.owner === 0);
  g.checkVictory(30);
  assert(g.running);
  assert.equal(g.players[0].controlScore, 0);
  const north = g.beacons.find(site => site.id === ids[1]);
  north.owner = 0;
  g.checkVictory(12);
  const loaded = Game.fromSave(g.toSave());
  assert.equal(loaded.players[0].controlScore, 12);
  g.checkVictory(17);
  north.owner = 1;
  g.checkVictory(1);
  assert.equal(g.players[0].controlScore, 0);
  north.owner = 0;
  g.checkVictory(29.95);
  assert.equal(g.winner, null);
  g.checkVictory(.05);
  assert.equal(g.winner, 0);
});

test('两岸空运和海运实际到账，电脑能扩建并保留新版地图的存档', () => {
  const g = start();
  for (let step = 0; step < 2500; step++) g.update(.05);
  for (const route of g.logistics) {
    assert(route.seaDelivered >= 900);
    assert(route.delivered - route.seaDelivered >= 720);
  }
  assert(g.ownedBuildings(1).length > 6);
  const restored = Game.fromSave(g.toSave());
  assert.equal(restored.mapId, g.mapId);
  assert.equal(restored.controlGoal, 30);
  assert.deepEqual(restored.fogs, g.fogs);
  assert.deepEqual(restored.logistics, g.logistics);
});
