import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { UNITS } from '../src/data.js';
import { buildingInformation, placeBuildingPanel, productionDuration, productionExit } from '../src/battlefield-details.js';

const quietGame = (mapId = 'valley') => {
  const game = new Game('china', 'nato', {}, { mapId });
  game.aiTimer = Infinity; game.aiWaveTimer = Infinity;
  return game;
};
const advance = (game, seconds) => { for (let frame = 0; frame < seconds * 20; frame++) game.update(.05); };

test('纵深战区面积为旧陆图四倍，开局设施、矿区和中立目标严格镜像', () => {
  const game = quietGame('frontier');
  assert.equal(game.world.width * game.world.height, 2240 * 1440 * 4);
  assert.equal(quietGame().world.width, 2240);
  for (const list of [game.ore, game.oil, game.beacons]) for (const item of list) {
    assert.ok(list.some(other => other.x === game.world.width - item.x && other.y === game.world.height - item.y && other.kind === item.kind && other.amount === item.amount));
  }
  for (const building of game.ownedBuildings(0)) {
    assert.ok(game.ownedBuildings(1).some(other => other.type === building.type && other.x === game.world.width - building.x && other.y === game.world.height - building.y));
  }
  assert.equal(game.players[0].credits, game.players[1].credits);
});

test('建筑信息使用实际生产时长，敌方队列和集结点不泄露，迷雾建筑不显示', () => {
  const game = quietGame(), factory = game.ownedBuildings(0, 'factory')[0];
  factory.active = { type: 'tank', progress: 3, paid: 0 };
  const info = buildingInformation(game, factory);
  assert.equal(info.production.remaining, Math.ceil(productionDuration(game, factory, 'tank') - 3));
  assert.equal(info.production.progress, 3 / UNITS.tank.time);
  const enemy = game.ownedBuildings(1, 'factory')[0];
  assert.equal(buildingInformation(game, enemy), null);
  game.fogs[0].visible.fill(true);
  enemy.active = { type: 'tank', progress: 3, paid: 0 }; enemy.queue = ['tank']; enemy.rallyPoint = { x: 1000, y: 500 };
  const intel = buildingInformation(game, enemy);
  assert.equal(intel.production, null); assert.equal(intel.queue, null); assert.equal(intel.rally, null);
  assert.equal(productionDuration(game, enemy, 'tank'), UNITS.tank.time * 1.06);
  const airfield = game.addBuilding(0, 'airfield', 600, 1000);
  game.players[0].powerUse = game.players[0].powerMax + 1;
  assert.equal(productionDuration(game, airfield, 'fighter'), UNITS.fighter.time * 2);
});

test('建筑浮窗约束在小视口内，并避开可避让的操作区域', () => {
  const viewport = { width: 600, height: 500 }, obstacle = { x: 0, y: 0, width: 180, height: 300 };
  const result = placeBuildingPanel({ x: 220, y: 200 }, { width: 278, height: 298 }, viewport, [obstacle]);
  assert.ok(result.x >= obstacle.width);
  assert.ok(result.x + result.width <= viewport.width - 8);
  const small = placeBuildingPanel({ x: 10, y: 10 }, { width: 278, height: 298 }, { width: 220, height: 180 });
  assert.ok(small.x >= 8 && small.y >= 8 && small.x + small.width <= 212 && small.y + small.height <= 172);
  const controls = [{ x: 8, y: 204, width: 239, height: 108 }, { x: 474, y: 258, width: 350, height: 54 }];
  const landscape = placeBuildingPanel({ x: 422, y: 120 }, { width: 224, height: 254 }, { width: 844, height: 332 }, controls);
  assert.ok(controls.every(other => landscape.x >= other.x + other.width || landscape.x + landscape.width <= other.x || landscape.y >= other.y + other.height || landscape.y + landscape.height <= other.y));
});

test('设施出口按双方方向镜像，兵营、工厂生产后先出门再前往集结点', () => {
  for (const type of ['rifle', 'tank']) {
    const game = quietGame(); game.units = []; game.players[0].credits = 10000;
    const building = game.ownedBuildings(0, UNITS[type].producer)[0], enemy = game.ownedBuildings(1, UNITS[type].producer)[0];
    const exit = productionExit(building, type), mirror = productionExit(enemy, type);
    assert.equal(exit.x + mirror.x, game.world.width); assert.equal(exit.y + mirror.y, game.world.height);
    assert.ok(game.setRallyPoint(0, building.id, 780, 700));
    assert.equal(game.setRallyPoint(0, enemy.id, 780, 700), false);
    assert.ok(game.queueUnit(0, type));
    for (let frame = 0; frame < 1000 && !game.ownedUnits(0, type).length; frame++) game.update(.05);
    const unit = game.ownedUnits(0, type)[0];
    assert.ok(unit.deployment); assert.equal(unit.deployment.buildingId, building.id);
    assert.ok(game.canOccupyUnit(unit, unit));
    assert.equal(unit.order.type, 'move');
    const start = { x: unit.x, y: unit.y };
    advance(game, 1);
    assert.ok(Math.hypot(unit.x - start.x, unit.y - start.y) > 20);
    assert.ok(building.exitUntil > game.time);
    advance(game, 12);
    assert.equal(unit.deployment, null);
    assert.ok(Math.hypot(unit.x - 780, unit.y - 700) < 35);
  }
});

test('采矿车在碰到前方车辆之前开始侧向绕行，不穿过障碍，持续采矿卸货', () => {
  const game = quietGame('meridian'); game.units = [];
  const harvester = game.addUnit(0, 'harvester', 650, 450), blocker = game.addUnit(0, 'tank', 745, 450);
  blocker.stunUntil = 999;
  game.ore = [{ ...game.ore[0], x: 950, y: 450, amount: 6000 }];
  const initial = game.players[0].credits;
  advance(game, .3);
  assert.ok(Math.abs(harvester.y - 450) > 12, '应当提前侧向绕行');
  assert.ok(Math.hypot(harvester.x - blocker.x, harvester.y - blocker.y) > 65);
  for (let frame = 0; frame < 1800; frame++) {
    game.update(.05);
    assert.ok(game.canOccupyUnit(harvester, harvester), '不得穿入建筑或不可通行地形');
  }
  assert.ok(game.players[0].credits - initial > 400, '避障后仍需完成多次卸货');
  assert.equal(blocker.x, 745); assert.equal(blocker.y, 450);
});

test('多辆采矿车共享矿区与卸货区时，能持续生产收入且不会每帧切换矿区', () => {
  const game = quietGame('meridian'); game.units = [];
  for (let index = 0; index < 6; index++) {
    const point = game.findSpawn(400, 940, 'harvester'); game.addUnit(0, 'harvester', point.x, point.y);
  }
  advance(game, .05);
  const targets = game.units.map(unit => unit.oreTargetId);
  advance(game, .5);
  assert.deepEqual(game.units.map(unit => unit.oreTargetId), targets);
  const initial = game.players[0].credits;
  advance(game, 100);
  assert.ok(game.players[0].credits - initial > 3000);
  assert.ok(game.units.every(unit => game.canOccupyUnit(unit, unit)));
});

test('动态绕行不预知迷雾敌军，只有已知同层单位影响绕行路径', () => {
  const game = quietGame(); game.units = [];
  const harvester = game.addUnit(0, 'harvester', 650, 450), enemy = game.addUnit(1, 'tank', 745, 450), goal = { x: 950, y: 450 };
  game.fogs[0].visible.fill(false);
  const direct = game.findPath(harvester, goal, 48);
  assert.deepEqual(game.findPath(harvester, goal, 48, [enemy]), direct);
  game.fogs[0].visible.fill(true);
  assert.notDeepEqual(game.findPath(harvester, goal, 48, [enemy]), direct);
  const aircraft = game.addUnit(0, 'fighter', 745, 450);
  assert.deepEqual(game.findPath(harvester, goal, 48, [aircraft]), direct);
});

test('新建筑挡住采矿车缓存路线时，立即重新规划而不是等待原寻路计时', () => {
  const game = quietGame('meridian'); game.units = [];
  const harvester = game.addUnit(0, 'harvester', 650, 450);
  game.ore = [{ ...game.ore[0], x: 950, y: 450 }];
  harvester.path = [{ x: 950, y: 450 }]; harvester.pathTimer = 10; harvester.pathGoal = '23,11';
  game.addBuilding(0, 'power', 745, 450);
  advance(game, .3);
  assert.ok(Math.abs(harvester.y - 450) > 12);
  assert.ok(harvester.pathTimer < 2);
  advance(game, 8);
  assert.ok(game.canOccupyUnit(harvester, harvester));
  assert.ok(harvester.cargo > 0);
});
