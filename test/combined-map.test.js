import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { supportsMap, UNITS } from '../src/data.js';
import { legalIslandLanding } from '../src/island-map.js';
import { navalPath } from '../src/island-navigation.js';
import { unitRadius } from '../src/unit-spacing.js';
import { terrainHeight } from '../src/visual-detail.js';
import { mapSketch } from '../src/map-discovery.js';

const setup = () => new Game('china', 'nato', {}, { mapId:'confluence', multiplayer:true, victoryMode:'control' });

test('山海会战的两个陆路通过真实寻路抵达，山体拦截通行，港岛不能走陆路直达', () => {
  const game = setup();
  assert.equal(game.world.width, 6400);
  assert.ok(terrainHeight(game, 3200, 730) > 120);
  assert.equal(game.isGroundBlocked(3200, 730, 14), true);
  const tank = game.ownedUnits(0, 'tank')[0];
  for (const beacon of game.beacons.slice(0, 2)) {
    assert.equal(game.isGroundBlocked(beacon.x, beacon.y, 14), false);
    const path = game.findPath(tank, beacon, 8);
    assert.ok(path.length && Math.hypot(path.at(-1).x - beacon.x, path.at(-1).y - beacon.y) < 65);
  }
  assert.equal(game.findPath(tank, game.beacons[2], 8).length, 0);
  assert.match(mapSketch('confluence'), /<polygon.*<polyline/);
  const save = Game.fromSave(game.toSave());
  assert.equal(save.mapId, game.mapId);
  assert.equal(save.beacons[2].name, '港岛信标');
});

test('双方港口允许生产航母、潜艇、登陆舰和舰载机，出港水域与跨海航路均留足舰宽', () => {
  const game = setup();
  const harbor = game.ownedBuildings(0, 'dock')[0], destination = game.map.harbors[1].approach;
  for (const type of ['carrier','submarine','landing','navalFighter','navalStrike','helicopter','counterIntel']) {
    assert.equal(supportsMap(UNITS[type].map, game.mapId), true);
  }
  for (const type of ['carrier','submarine','landing','containerShip']) {
    const point = game.findNavalSpawn(harbor, type);
    assert.ok(point, type);
    assert.equal(game.isNavalBlocked(point.x, point.y, unitRadius({ type })), false);
    assert.ok(navalPath(game, { ...point, type, owner:0, hp:1 }, destination).length, type);
  }
  assert.equal(game.canPlace(0, 'power', 1680, 2480), false);
});

test('山海会战两侧货船分别走外海入口并卸货，登陆舰可在港岛合法卸载', () => {
  const game = setup();
  const cargo = [0, 1].map(side => game.launchFreight(side, true));
  assert.deepEqual(cargo.map(ship => ship.freight.entry), game.map.seaEntries);
  for (let i = 0; i < 1500 && game.logistics.some(route => route.delivered < 900); i++) {
    game.time += .05;
    cargo.forEach(ship => game.updateFreight(ship, .05));
  }
  assert.ok(game.logistics.every(route => route.delivered === 900));
  const landing = game.addUnit(0, 'landing', 2670, 2620);
  const engineer = game.addUnit(0, 'engineer', landing.x, landing.y);
  landing.passengers.push(engineer.id);
  engineer.embarkedIn = landing.id;
  game.unloadTransport(landing);
  game.updateLandingUnload(landing);
  assert.equal(engineer.embarkedIn, null);
  assert.ok(legalIslandLanding(game.map, engineer));
  assert.equal(game.isGroundBlocked(engineer.x, engineer.y, 6), false);
});

test('综合战区真实生产航母、潜艇和舰载机，舰载机自动着舰，积分目标为600', () => {
  const game = setup();
  game.addBuilding(0, 'airfield', 830, 2130);
  game.addBuilding(0, 'lab', 570, 1900);
  game.addBuilding(0, 'radar', 700, 1870);
  for (const [x,y] of [[320,1870],[610,2320],[770,2370]]) game.addBuilding(0, 'power', x, y);
  game.players[0].credits = 10000;
  assert.equal(game.queueUnit(0, 'carrier'), true);
  assert.equal(game.queueUnit(0, 'submarine'), true);
  for (let i=0; i<2400 && !game.ownedUnits(0,'carrier').length; i++) game.update(.05);
  const carrier = game.ownedUnits(0,'carrier')[0];
  assert.ok(carrier);
  carrier.airGroupHold = true;
  assert.equal(game.queueUnit(0, 'navalFighter'), true);
  for (let i=0; i<2400 && !carrier.passengers.length; i++) game.update(.05);
  const sub = game.ownedUnits(0,'submarine')[0];
  assert.ok(sub && game.canOccupyUnit(sub, sub));
  assert.equal(game.getEntity(carrier.passengers[0])?.type, 'navalFighter');
  game.players[0].controlScore = 599;
  game.checkVictory();
  assert.equal(game.running, true);
  game.players[0].controlScore = 600;
  game.checkVictory();
  assert.equal(game.winner, 0);
});
