import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { MAPS } from '../src/data.js';
import { discoverMaps, mapBrief } from '../src/map-discovery.js';
import { islandDistance, islandIndex } from '../src/island-map.js';
import { navalPath } from '../src/island-navigation.js';
import { QUICK_PRESETS } from '../src/quick-entry.js';
import { terrainHeight } from '../src/visual-detail.js';
import { unitRadius } from '../src/unit-spacing.js';

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

test('两岸登陆舰能经过海峡到潮心岛，并将人员卸到信标所在的陆地', () => {
  const g = start(), signal = g.beacons.find(b => b.id === 'cai-tide');
  const approach = [{ x: 2140, y: 1940 }, { x: 2890, y: 1930 }];
  for (const side of [0, 1]) {
    const boat = g.ownedUnits(side, 'landing')[0], point = approach[side];
    const path = navalPath(g, boat, point);
    assert(path.length > 0);
    assert(Math.hypot(path.at(-1).x - point.x, path.at(-1).y - point.y) < 42);
    assert(!g.isNavalBlocked(point.x, point.y, unitRadius(boat)));
    const infantry = g.ownedUnits(side, 'rifle')[0];
    Object.assign(boat, point);
    boat.passengers.push(infantry.id);
    infantry.embarkedIn = boat.id;
    assert.equal(g.unloadTransport(boat, false, true), 1);
    assert.equal(islandIndex(g.map, infantry), islandIndex(g.map, signal));
  }
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
  assert.equal(restored.controlGoal, 480);
  assert.deepEqual(restored.fogs, g.fogs);
  assert.deepEqual(restored.logistics, g.logistics);
});
