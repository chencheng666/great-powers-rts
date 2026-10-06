import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { CORE_BUILDINGS, MAPS, ORE_LAYOUT, WORLD } from '../src/data.js';

const advance = (game, seconds) => {
  for (let i = 0; i < seconds * 20 && game.running; i++) game.update(0.05);
};

test('双方以同等经济、产能和部队开局', () => {
  const game = new Game('china', 'russia');
  assert.equal(game.players[0].credits, game.players[1].credits);
  assert.equal(game.ownedUnits(0).length, game.ownedUnits(1).length);
  assert.deepEqual(game.ownedBuildings(0).map(b => b.type), game.ownedBuildings(1).map(b => b.type));
  assert.equal(game.players[0].powerIn, game.players[1].powerIn);
  assert.equal(game.players[0].powerOut, game.players[1].powerOut);
});

test('三档难度不改变开局资源与单位属性，只调整 AI 战术节奏', () => {
  const easy = new Game('china', 'russia', {}, { difficulty: 'recruit' });
  const standard = new Game('china', 'russia', {}, { difficulty: 'standard' });
  const hard = new Game('china', 'russia', {}, { difficulty: 'veteran' });
  for (const game of [easy, standard, hard]) {
    assert.equal(game.players[0].credits, game.players[1].credits);
    assert.deepEqual(game.ownedUnits(0).map(u => [u.type, u.maxHp]), game.ownedUnits(1).map(u => [u.type, u.maxHp]));
  }
  assert.ok(easy.aiWaveTimer > standard.aiWaveTimer);
  assert.ok(standard.aiWaveTimer > hard.aiWaveTimer);
  assert.ok(easy.difficulty.waveSize < standard.difficulty.waveSize);
  assert.ok(standard.difficulty.waveSize < hard.difficulty.waveSize);
});

test('生产、分期扣费、部署与单位寻路正常运作', () => {
  const game = new Game('china', 'nato');
  assert.equal(game.queueUnit(0, 'rifle'), true);
  advance(game, 1);
  assert.ok(game.players[0].credits < 1550);
  advance(game, 8);
  assert.equal(game.ownedUnits(0).length, 7);

  assert.equal(game.startBuild(0, 'power'), true);
  advance(game, 15);
  assert.equal(game.pendingBuilding, 'power');
  assert.equal(game.canPlace(0, 'power', 650, 550), true);
  assert.equal(game.placeBuilding(0, 'power', 650, 550), true);
  assert.equal(game.players[0].powerIn, 200);

  const rifle = game.ownedUnits(0, 'rifle')[0];
  const startX = rifle.x;
  rifle.order = { type: 'move', x: 860, y: 625 };
  advance(game, 4);
  assert.ok(rifle.x > startX + 70);
});

test('建造与单位生产可取消，已支付费用完整返还', () => {
  const game = new Game('china', 'russia');
  assert.equal(game.startBuild(0, 'power'), true);
  advance(game, 3);
  const beforeCancel = game.players[0].credits;
  const paid = game.players[0].buildQueue.paid;
  assert.ok(paid > 0);
  assert.equal(game.cancelBuilding(0), true);
  assert.ok(Math.abs(game.players[0].credits - beforeCancel - paid) < .01);
  assert.equal(game.players[0].buildQueue, null);

  assert.equal(game.startBuild(0, 'power'), true);
  advance(game, 15);
  assert.equal(game.pendingBuilding, 'power');
  const beforeReadyCancel = game.players[0].credits;
  assert.equal(game.cancelBuilding(0), true);
  assert.equal(game.players[0].credits, beforeReadyCancel + 350);
  assert.equal(game.pendingBuilding, null);

  const barracks = game.ownedBuildings(0, 'barracks')[0];
  assert.equal(game.queueUnit(0, 'rifle'), true);
  advance(game, 2);
  const unitPaid = barracks.active.paid;
  const beforeUnitCancel = game.players[0].credits;
  assert.equal(game.cancelUnitProduction(0, barracks.id), true);
  assert.ok(Math.abs(game.players[0].credits - beforeUnitCancel - unitPaid) < .01);
  assert.equal(barracks.active, null);
  assert.equal(game.cancelUnitProduction(0, barracks.id), false);
});

test('地图矿区对称，采矿自动结算，AI 有开局集结期', () => {
  let winner = null;
  const game = new Game('asia', 'middleeast', { end: side => { winner = side; } });
  for (const [x, y, amount, kind] of ORE_LAYOUT) {
    assert.ok(ORE_LAYOUT.some(([otherX, otherY, otherAmount, otherKind]) => otherX === 2240 - x && otherY === 1440 - y && otherAmount === amount && otherKind === kind));
  }
  advance(game, 75);
  assert.ok(game.players[0].credits > 1550);
  assert.ok(game.ownedUnits(1).every(unit => unit.order?.type !== 'attackMove'));
  const enemyHQ = game.ownedBuildings(1, 'hq')[0];
  game.damage(enemyHQ, enemyHQ.hp, 0);
  game.update(0.05);
  assert.equal(winner, null);
  for (const building of game.ownedBuildings(1).filter(b => CORE_BUILDINGS.includes(b.type))) game.damage(building, building.hp, 0);
  game.update(0.05);
  assert.equal(winner, 0);
  assert.equal(game.running, false);
});

test('双桥裂谷资源、通道和中立目标严格镜像', () => {
  const map = MAPS.canyon;
  for (const [x, y, amount, kind] of map.ore) {
    assert.ok(map.ore.some(([otherX, otherY, otherAmount, otherKind]) => otherX === WORLD.width - x && otherY === WORLD.height - y && otherAmount === amount && otherKind === kind));
  }
  for (const sites of [map.oil, map.beacons]) {
    for (const site of sites) assert.ok(sites.some(other => other.x === WORLD.width - site.x && other.y === WORLD.height - site.y));
  }
  for (const barrier of map.barriers) {
    assert.ok(map.barriers.some(other => other.x1 === WORLD.width - barrier.x2 && other.x2 === WORLD.width - barrier.x1 && other.y1 === WORLD.height - barrier.y2 && other.y2 === WORLD.height - barrier.y1));
  }
  const game = new Game('china', 'russia', {}, { mapId: 'canyon' });
  assert.equal(game.map.name, '双桥裂谷');
  assert.equal(game.beacons.length, 2);
  game.addBuilding(0, 'power', 900, 410);
  assert.equal(game.canPlace(0, 'power', 1020, 410), false);
  assert.equal(new Game('china', 'russia', {}, { mapId: 'unknown' }).mapId, 'valley');

  const west = game.addUnit(0, 'tank', 900, 720);
  game.selected = [west.id];
  game.command(1120, 720);
  assert.ok(west.order.x < 1040);
  for (let i = 0; i < 100; i++) game.moveUnitNow(west, west.order, 0.05, 8);
  game.updateUnit(west, 0.05);
  assert.equal(west.order, null);
  const east = game.addUnit(1, 'tank', 1340, 720);
  assert.ok(game.resolveMoveGoal(east, 1120, 720).x > 1200);
});

test('海峡前线资源、桥梁和船坞区域严格镜像，双方同条件开局', () => {
  const map = MAPS.strait;
  for (const [x, y, amount, kind] of map.ore) {
    assert.ok(map.ore.some(([otherX, otherY, otherAmount, otherKind]) => otherX === WORLD.width - x && otherY === WORLD.height - y && otherAmount === amount && otherKind === kind));
  }
  for (const sites of [map.oil, map.beacons]) {
    for (const site of sites) assert.ok(sites.some(other => other.x === WORLD.width - site.x && other.y === WORLD.height - site.y));
  }
  for (const zones of [map.barriers, map.dockZones]) {
    for (const rect of zones) assert.ok(zones.some(other => other.x1 === WORLD.width - rect.x2 && other.x2 === WORLD.width - rect.x1 && other.y1 === WORLD.height - rect.y2 && other.y2 === WORLD.height - rect.y1));
  }
  assert.ok(map.bridges.every(bridge => map.bridges.some(other => other.y1 === WORLD.height - bridge.y2 && other.y2 === WORLD.height - bridge.y1)));
  const game = new Game('china', 'russia', {}, { mapId: 'strait' });
  assert.equal(game.players[0].credits, game.players[1].credits);
  assert.equal(game.players[0].powerIn, game.players[1].powerIn);
  assert.equal(game.players[0].powerOut, game.players[1].powerOut);
  assert.deepEqual(game.ownedBuildings(0).map(b => b.type), game.ownedBuildings(1).map(b => b.type));
  assert.equal(game.ownedBuildings(0, 'dock').length, 1);
  assert.ok(CORE_BUILDINGS.includes('dock'));
  assert.equal(new Game('china', 'russia').canBuild(0, 'dock'), false);
  assert.equal(new Game('china', 'russia').queueUnit(0, 'patrol'), false);
});

test('船坞只能在海岸部署，舰艇从水域下水并保持水域行动', () => {
  const game = new Game('china', 'russia', {}, { mapId: 'strait' });
  const map = game.map;
  game.updateAI = () => {};
  game.aiWaveTimer = Infinity;
  // 本例验证下水与边界，不让出生后随机开火影响生命值断言。
  game.closestEnemy = () => null;
  assert.equal(game.canPlace(0, 'power', 1120, 720), false);
  assert.equal(game.canPlace(0, 'dock', 1100, 720), false);
  const oldDock = game.ownedBuildings(0, 'dock')[0];
  game.damage(oldDock, oldDock.hp, 1);
  assert.equal(game.canPlace(0, 'dock', 850, 720), true);
  assert.equal(game.placeBuilding(0, 'dock', 850, 720), true);
  assert.equal(game.findNavalSpawn(game.ownedBuildings(0, 'dock')[0]).x, map.water.x1 + 38);
  assert.equal(game.findNavalSpawn(game.ownedBuildings(1, 'dock')[0]).x, map.water.x2 - 38);
  assert.equal(game.queueUnit(0, 'patrol'), true);
  assert.equal(game.queueUnit(1, 'patrol'), true);
  advance(game, 19);
  const friendly = game.ownedUnits(0, 'patrol')[0];
  const enemy = game.ownedUnits(1, 'patrol')[0];
  assert.ok(friendly && enemy);
  assert.equal(friendly.hp, enemy.hp);
  assert.equal(game.isNavalBlocked(friendly.x, friendly.y, 18), false);
  assert.equal(game.isNavalBlocked(enemy.x, enemy.y, 18), false);
  assert.ok(friendly.x < WORLD.width / 2);
  assert.ok(enemy.x > WORLD.width / 2);
  assert.deepEqual(game.resolveMoveGoal(friendly, 200, 720), { x: map.water.x1 + 36, y: 720 });
  for (let i = 0; i < 300; i++) game.moveUnitNow(friendly, { x: 200, y: 420 }, 0.05, 0);
  assert.equal(game.isNavalBlocked(friendly.x, friendly.y, 18), false);
  assert.ok(friendly.y < 500);
  assert.equal(game.isGroundBlocked(1120, 720), true);
  assert.equal(game.isGroundBlocked(1120, 420), false);
  assert.equal(game.isNavalBlocked(1120, 420), false);
});

test('舰艇有明确的海岸射界、制空短板和对舰克制', () => {
  const game = new Game('china', 'russia', {}, { mapId: 'strait' });
  const patrol = game.addUnit(0, 'patrol', 998, 720);
  const frigate = game.addUnit(0, 'frigate', 1000, 760);
  const hostileShip = game.addUnit(1, 'patrol', 1242, 720);
  const hostileJet = game.addUnit(1, 'fighter', 1120, 720);
  const fighter = game.addUnit(0, 'fighter', 1100, 700);
  const strike = game.addUnit(0, 'strike', 1100, 740);
  const tank = game.addUnit(0, 'tank', 915, 720);
  const dock = game.ownedBuildings(1, 'dock')[0];
  const hq = game.ownedBuildings(1, 'hq')[0];
  assert.equal(game.canAttack(patrol, hostileJet), false);
  assert.equal(game.canAttack(frigate, hostileJet), true);
  assert.equal(game.canAttack(patrol, dock), true);
  assert.equal(game.canAttack(patrol, hq), false);
  assert.equal(game.canAttack(fighter, hostileShip), false);
  assert.equal(game.canAttack(strike, hostileShip), true);
  assert.equal(game.canAttack(tank, hostileShip), true);
  assert.equal(game.hasLineOfFire(tank, hostileShip), true);
  assert.ok(game.unitDamage(strike, hostileShip) > game.unitDamage(strike, tank));
  assert.ok(game.unitDamage(patrol, hostileShip) > game.unitDamage(patrol, tank));
  assert.ok(game.unitDamage(patrol, dock) < game.unitDamage(patrol, hostileShip));
  assert.ok(game.unitDamage(frigate, hostileJet) > game.unitDamage(frigate, hostileShip));
});

test('船坞是核心建筑，存活时不会被提前判负，AI 会生产海军', () => {
  const game = new Game('china', 'russia', {}, { mapId: 'strait' });
  const dock = game.ownedBuildings(1, 'dock')[0];
  game.time = 20;
  game.players[1].credits = 2000;
  game.updateAI();
  assert.equal(dock.queue[0], 'patrol');
  for (const building of game.ownedBuildings(1).filter(b => b.id !== dock.id && CORE_BUILDINGS.includes(b.type))) game.damage(building, building.hp, 0);
  game.updateAI = () => {};
  game.update(0.05);
  assert.equal(game.winner, null);
  game.damage(dock, dock.hp, 0);
  game.update(0.05);
  assert.equal(game.winner, 0);
});

test('电脑船坞被击毁后可按本方岸位重新部署', () => {
  const game = new Game('china', 'russia', {}, { mapId: 'strait' });
  const dock = game.ownedBuildings(1, 'dock')[0];
  game.damage(dock, dock.hp, 0);
  game.time = 25;
  game.players[1].credits = 3000;
  game.updateAI();
  assert.equal(game.players[1].buildQueue?.type, 'dock');
  advance(game, 28);
  assert.equal(game.ownedBuildings(1, 'dock').length, 1);
  assert.ok(game.ownedBuildings(1, 'dock')[0].x > WORLD.width / 2);
});

test('裂谷地面部队经桥通行，空军越障，山体阻挡地面火力', () => {
  const game = new Game('china', 'russia', {}, { mapId: 'canyon' });
  const tank = game.addUnit(0, 'tank', 900, 720);
  let crossed = false;
  for (let i = 0; i < 700 && tank.x < 1330; i++) {
    game.moveUnitNow(tank, { x: 1340, y: 720 }, 0.05, 8);
    assert.equal(game.isGroundBlocked(tank.x, tank.y, 14), false);
    if (tank.x > 1040 && tank.x < 1200) {
      crossed = true;
      assert.ok(tank.y >= 320 && tank.y <= 500 || tank.y >= 940 && tank.y <= 1120);
    }
  }
  assert.equal(crossed, true);
  assert.ok(tank.x > 1330);

  const north = game.addUnit(0, 'rifle', 900, 200);
  let usedNorthBridge = false;
  for (let i = 0; i < 650 && north.x < 1330; i++) {
    game.moveUnitNow(north, { x: 1340, y: 200 }, 0.05, 8);
    if (north.x > 1040 && north.x < 1200) {
      usedNorthBridge = true;
      assert.ok(north.y >= 320 && north.y <= 500);
    }
  }
  assert.equal(usedNorthBridge, true);
  assert.ok(north.x > 1330);

  const fighter = game.addUnit(0, 'fighter', 900, 720);
  game.moveUnitNow(fighter, { x: 1340, y: 720 }, 1, 8);
  assert.ok(game.isGroundBlocked(fighter.x, fighter.y));

  const shooter = game.addUnit(0, 'tank', 1020, 720);
  const target = game.addUnit(1, 'tank', 1220, 720);
  game.updateFog();
  assert.equal(game.hasLineOfFire(shooter, target), false);
  shooter.fireTimer = 0;
  game.updateUnit(shooter, 0.05);
  assert.equal(target.hp, target.maxHp);
  assert.ok(shooter.path.length > 0);
  const turret = game.addBuilding(0, 'turret', 1010, 720);
  assert.notEqual(game.closestEnemy(turret, 250, 0)?.id, target.id);
});

test('裂谷遮挡普通地面视野，桥头、空军和雷达可越障侦察', () => {
  const game = new Game('china', 'russia', {}, { mapId: 'canyon' });
  const enemy = game.addUnit(1, 'tank', 1330, 720);
  const scout = game.addUnit(0, 'scout', 900, 720);
  game.updateFog();
  assert.equal(game.canSeeEntity(0, enemy), false);
  scout.y = 410; enemy.y = 410;
  game.updateFog();
  assert.equal(game.canSeeEntity(0, enemy), true);
  scout.y = 720; enemy.y = 720;
  const fighter = game.addUnit(0, 'fighter', 900, 720);
  game.updateFog();
  assert.equal(game.canSeeEntity(0, enemy), true);
  fighter.hp = 0;
  game.updateFog();
  assert.equal(game.canSeeEntity(0, enemy), false);
  game.addBuilding(0, 'radar', 900, 720);
  game.updateFog();
  assert.equal(game.canSeeEntity(0, enemy), true);
});

test('全域歼灭必须清除全部建筑与单位', () => {
  const game = new Game('china', 'russia', {}, { victoryMode: 'annihilation' });
  for (const building of game.ownedBuildings(1)) game.damage(building, building.hp, 0);
  game.update(0.05);
  assert.equal(game.winner, null);
  for (const unit of game.ownedUnits(1)) game.damage(unit, unit.hp, 0);
  game.update(0.05);
  assert.equal(game.winner, 0);
});

test('AI 只能锁定自身视野内的目标', () => {
  const game = new Game('china', 'russia');
  const playerHQ = game.ownedBuildings(0, 'hq')[0];
  const seeker = game.addUnit(1, 'rifle', playerHQ.x + 85, playerHQ.y);
  assert.equal(game.isVisibleFor(1, playerHQ.x, playerHQ.y), false);
  assert.equal(game.closestEnemy(seeker, 200, 1), null);
  game.updateFog();
  assert.equal(game.isVisibleFor(1, playerHQ.x, playerHQ.y), true);
  assert.equal(game.closestEnemy(seeker, 200, 1)?.id, playerHQ.id);
});

test('侦察兵、防空车和供电雷达能够识破隐形侦察机', () => {
  const game = new Game('russia', 'middleeast');
  game.units = [];
  const ghost = game.addUnit(1, 'ghost', 1000, 700);
  const rifle = game.addUnit(0, 'rifle', 900, 700);
  game.updateFog();
  assert.equal(game.isVisibleFor(0, ghost.x, ghost.y), true);
  assert.equal(game.canSeeEntity(0, ghost), false);
  assert.equal(game.closestEnemy(rifle, 220, 0), null);

  const scout = game.addUnit(0, 'scout', 900, 700);
  assert.equal(game.canSeeEntity(0, ghost), true);
  scout.hp = 0;
  const aa = game.addUnit(0, 'aa', 900, 700);
  assert.equal(game.canSeeEntity(0, ghost), true);
  aa.hp = 0;
  game.addBuilding(0, 'radar', 700, 700);
  assert.equal(game.canSeeEntity(0, ghost), true);
  const power = game.ownedBuildings(0, 'power')[0];
  game.damage(power, power.hp, 1);
  assert.equal(game.canSeeEntity(0, ghost), false);
  game.beacons[0].owner = 0;
  game.updateFog();
  assert.equal(game.canSeeEntity(0, ghost), true);
  assert.equal(game.hasRadarIntel(0), true);
});

test('中央雷达信标可由双方工程师争夺，提供同等视野和小地图接入', () => {
  const game = new Game('china', 'russia');
  const beacon = game.beacons[0];
  assert.equal(beacon.x, 1120);
  assert.equal(beacon.y, 720);
  assert.equal(game.hasRadarIntel(0), false);
  assert.equal(game.hasRadarIntel(1), false);
  assert.equal(game.canPlace(0, 'turret', beacon.x, beacon.y), false);
  const scoutPoint = { x: 1400, y: 720 };
  assert.equal(game.isVisibleFor(0, scoutPoint.x, scoutPoint.y), false);

  const engineer = game.addUnit(0, 'engineer', beacon.x - 25, beacon.y);
  engineer.order = { type: 'capture', targetId: beacon.id, x: beacon.x, y: beacon.y };
  game.update(0.05);
  assert.equal(beacon.owner, 0);
  assert.equal(engineer.hp, 0);
  assert.equal(game.hasRadarIntel(0), true);
  assert.equal(game.isVisibleFor(0, scoutPoint.x, scoutPoint.y), true);

  const rival = game.addUnit(1, 'engineer', beacon.x + 25, beacon.y);
  rival.order = { type: 'capture', targetId: beacon.id, x: beacon.x, y: beacon.y };
  game.update(0.05);
  assert.equal(beacon.owner, 1);
  assert.equal(game.hasRadarIntel(0), false);
  assert.equal(game.hasRadarIntel(1), true);
  assert.equal(game.isVisibleFor(1, 840, 720), true);
});

test('基地工程师可通过正常指令长距离到达并占领信标', () => {
  const game = new Game('china', 'russia');
  game.updateAI = () => {};
  game.aiWaveTimer = Infinity;
  const engineer = game.addUnit(0, 'engineer', 270, 875);
  game.selected = [engineer.id];
  game.command(game.beacons[0].x, game.beacons[0].y);
  assert.equal(engineer.order.type, 'move');
  game.addUnit(0, 'scout', 940, 720);
  game.updateFog();
  game.command(game.beacons[0].x, game.beacons[0].y);
  assert.equal(engineer.order.type, 'capture');
  advance(game, 25);
  assert.equal(game.beacons[0].owner, 0);
  assert.equal(engineer.hp, 0);
});

test('AI 不会预知未侦察的中立目标', () => {
  const game = new Game('china', 'russia');
  game.time = 42;
  assert.equal(game.hasExploredFor(1, game.beacons[0].x, game.beacons[0].y), false);
  game.updateAI();
  const barracks = game.ownedBuildings(1, 'barracks')[0];
  assert.equal(barracks.queue.includes('engineer'), false);
  game.addUnit(1, 'scout', 1300, 720);
  game.updateFog();
  assert.equal(game.hasExploredFor(1, game.beacons[0].x, game.beacons[0].y), true);
  game.updateAI();
  assert.equal(barracks.queue.includes('engineer'), true);
});

test('隐形侦察机仅新月阵营生产，且无武装侦察单位不参与进攻编队', () => {
  const game = new Game('russia', 'middleeast');
  game.addBuilding(0, 'armory', 650, 550);
  game.addBuilding(1, 'armory', 1590, 890);
  game.addBuilding(0, 'radar', 700, 700);
  game.addBuilding(1, 'radar', 1540, 740);
  assert.equal(game.queueUnit(0, 'ghost'), false);
  assert.equal(game.queueUnit(1, 'ghost'), true);
  const scout = game.addUnit(0, 'scout', 950, 700);
  const startHp = game.ownedUnits(1, 'tank')[0].hp;
  scout.order = { type: 'attackMove', x: 1400, y: 700 };
  game.selectAllCombat();
  assert.equal(game.selected.includes(scout.id), false);
  game.update(0.05);
  assert.equal(game.ownedUnits(1, 'tank')[0].hp, startHp);
});

test('失去隐形目标的侦测后只前往最后已知位置', () => {
  const game = new Game('russia', 'middleeast');
  game.units = [];
  game.updateAI = () => {};
  game.aiWaveTimer = Infinity;
  const tank = game.addUnit(0, 'tank', 1000, 700);
  const ghost = game.addUnit(1, 'ghost', 1190, 700);
  tank.order = { type: 'attack', targetId: ghost.id, x: ghost.x, y: ghost.y };
  tank.fireTimer = 0;
  game.updateFog();
  game.update(0.05);
  assert.equal(ghost.hp, ghost.maxHp);
  assert.equal(tank.order.type, 'attackMove');
});

test('同帧交火双方都能开火', () => {
  const game = new Game('china', 'russia');
  game.units = [];
  game.updateAI = () => {};
  game.aiWaveTimer = Infinity;
  const left = game.addUnit(0, 'rifle', 1000, 700);
  const right = game.addUnit(1, 'rifle', 1080, 700);
  left.hp = 12; right.hp = 12;
  left.fireTimer = 0; right.fireTimer = 0;
  game.updateFog();
  game.update(0.05);
  assert.equal(left.hp, 0);
  assert.equal(right.hp, 0);
});

test('射程边界的移动在双方判断后统一生效', () => {
  const game = new Game('china', 'russia');
  game.units = [];
  game.updateAI = () => {};
  game.aiWaveTimer = Infinity;
  const left = game.addUnit(0, 'rifle', 1000, 700);
  const right = game.addUnit(1, 'rifle', 1143, 700);
  left.fireTimer = 0; right.fireTimer = 0;
  game.updateFog();
  game.update(0.05);
  assert.equal(left.hp, left.maxHp);
  assert.equal(right.hp, right.maxHp);
  game.update(0.05);
  assert.equal(left.hp, left.maxHp - 12);
  assert.equal(right.hp, right.maxHp - 12);
});

test('西陆重坦能对密集无人机造成范围压制', () => {
  const game = new Game('nato', 'asia');
  const heavy = game.addUnit(0, 'elite', 1000, 700);
  const target = game.addUnit(1, 'drone', 1100, 700);
  const near = game.addUnit(1, 'drone', 1140, 700);
  const far = game.addUnit(1, 'drone', 1300, 700);
  game.fire(heavy, target, game.unitDamage(heavy, target), 'elite');
  assert.ok(target.hp < target.maxHp);
  assert.ok(near.hp < near.maxHp);
  assert.equal(far.hp, far.maxHp);
});

test('宝石矿产值为黄矿两倍，维修扣费，出售返还半价', () => {
  const game = new Game('china', 'russia');
  const miner = game.ownedUnits(0, 'harvester')[0];
  const gem = game.ore.find(ore => ore.kind === 'gem');
  miner.x = gem.x; miner.y = gem.y;
  for (let i = 0; i < 20; i++) game.updateHarvester(miner, 0.05);
  assert.ok(miner.cargo > 0);
  assert.ok(Math.abs(miner.cargoValue - miner.cargo * 2) < 0.01);
  const cargoValue = miner.cargoValue;
  const refinery = game.ownedBuildings(0, 'refinery')[0];
  miner.x = refinery.x; miner.y = refinery.y; miner.harvestState = 'return';
  const beforeDeposit = game.players[0].credits;
  game.updateHarvester(miner, 0.05);
  assert.ok(Math.abs(game.players[0].credits - beforeDeposit - cargoValue) < 0.01);

  const power = game.ownedBuildings(0, 'power')[0];
  game.damage(power, 120, 1);
  const damagedHp = power.hp, beforeRepair = game.players[0].credits;
  assert.equal(game.toggleRepair(0, power.id), true);
  game.updateBuilding(power, 1);
  assert.ok(power.hp > damagedHp);
  assert.ok(game.players[0].credits < beforeRepair);
  const beforeSale = game.players[0].credits;
  assert.equal(game.sellBuilding(0, power.id), true);
  assert.equal(game.players[0].credits, beforeSale + 175);
  assert.equal(game.players[0].powerIn, 0);
});

test('双方终极技能使用同一费用、冷却和核心建筑伤害上限', () => {
  const game = new Game('russia', 'russia');
  for (const side of [0, 1]) {
    game.addBuilding(side, 'power', side ? 1590 : 650, 550);
    game.addBuilding(side, 'super', side ? 1540 : 700, 850);
    game.players[side].abilityCharge = 100;
  }
  const hq = [game.ownedBuildings(0, 'hq')[0], game.ownedBuildings(1, 'hq')[0]];
  game.addUnit(0, 'rifle', hq[1].x + 80, hq[1].y);
  game.addUnit(1, 'rifle', hq[0].x + 80, hq[0].y);
  game.updateFog();
  assert.equal(game.castAbility(hq[1].x, hq[1].y, 0), true);
  assert.equal(game.castAbility(hq[0].x, hq[0].y, 1), true);
  assert.equal(game.players[0].credits, game.players[1].credits);
  assert.equal(game.players[0].abilityCharge, 0);
  assert.equal(game.players[1].abilityCharge, 0);
  assert.equal(game.players[0].abilityCooldown, game.players[1].abilityCooldown);
  assert.equal(hq[0].hp, hq[1].hp);
  assert.ok(hq[0].hp > hq[0].maxHp * 0.75);
});

test('进攻型终极技能不能打击未侦察区域，且不会扣费', () => {
  const game = new Game('russia', 'russia');
  game.addBuilding(0, 'power', 650, 550);
  game.addBuilding(0, 'super', 700, 850);
  game.players[0].abilityCharge = 100;
  const target = game.ownedBuildings(1, 'hq')[0];
  const before = game.players[0].credits;
  assert.equal(game.isVisibleFor(0, target.x, target.y), false);
  assert.equal(game.castAbility(target.x, target.y, 0), false);
  assert.equal(game.players[0].credits, before);
  assert.equal(game.players[0].abilityCharge, 100);
  game.addUnit(0, 'rifle', target.x - 80, target.y);
  game.updateFog();
  assert.equal(game.castAbility(target.x, target.y, 0), true);
});

test('全域防护无需目标区域，AI 在基地受威胁时启用', () => {
  const game = new Game('russia', 'china');
  game.addBuilding(1, 'power', 1590, 550);
  game.addBuilding(1, 'super', 1540, 850);
  game.players[1].abilityCharge = 100;
  game.addUnit(0, 'rifle', 1780, 720);
  game.updateFog();
  assert.equal(game.isVisibleFor(1, 1780, 720), true);
  game.updateAI();
  assert.equal(game.players[1].abilityCharge, 0);
  assert.ok(game.players[1].shieldUntil > game.time);
});

test('空军基地在雷达后解锁，双方按相同规则生产战机', () => {
  const game = new Game('china', 'russia');
  assert.equal(game.canBuild(0, 'airfield'), false);
  assert.equal(game.queueUnit(0, 'fighter'), false);
  game.addBuilding(0, 'radar', 650, 550);
  game.addBuilding(0, 'power', 700, 400);
  assert.equal(game.canBuild(0, 'airfield'), true);
  game.addBuilding(0, 'airfield', 760, 740);
  assert.equal(game.queueUnit(0, 'fighter'), true);
  advance(game, 25);
  assert.equal(game.ownedUnits(0, 'fighter').length, 1);
  assert.equal(game.ownedUnits(0, 'fighter')[0].ammo, 9);
  assert.ok(CORE_BUILDINGS.includes('airfield'));
});

test('AI 优先完成首架攻击机，再继续扩建基地', () => {
  const game = new Game('china', 'russia', {}, { difficulty: 'standard' });
  game.addBuilding(1, 'radar', 1540, 890);
  game.addBuilding(1, 'airfield', 1490, 680);
  game.time = game.difficulty.waveStart;
  game.players[1].aiPlanIndex = 4;
  game.players[1].credits = 2000;
  game.updateAI();
  assert.equal(game.players[1].buildQueue, null);
  assert.equal(game.ownedBuildings(1, 'airfield')[0].active?.type || game.ownedBuildings(1, 'airfield')[0].queue[0], 'strike');
  game.addUnit(1, 'strike', 1450, 680);
  game.updateAI();
  assert.equal(game.players[1].buildQueue?.type, 'armory');
  game.players[1].buildQueue = null;
  game.addBuilding(1, 'armory', 1550, 500);
  game.updateAI();
  assert.equal(game.players[1].buildQueue?.type, 'turret');
});

test('战车工厂与兵工厂分工明确，缺少兵工厂时不能借用战车工厂', () => {
  const game = new Game('china', 'russia');
  assert.equal(game.canBuild(0, 'armory'), true);
  assert.equal(game.queueUnit(0, 'tank'), true);
  assert.equal(game.queueUnit(0, 'harvester'), true);
  assert.equal(game.queueUnit(0, 'drone'), false);
  game.addBuilding(0, 'radar', 700, 400);
  assert.equal(game.queueUnit(0, 'aa'), false);
  const armory = game.addBuilding(0, 'armory', 650, 550);
  assert.equal(game.queueUnit(0, 'drone'), true);
  assert.equal(game.queueUnit(0, 'aa'), true);
  assert.deepEqual(armory.queue, ['drone', 'aa']);
  assert.deepEqual(game.ownedBuildings(0, 'factory')[0].queue, ['tank', 'harvester']);
  assert.ok(CORE_BUILDINGS.includes('armory'));
});

test('两类工厂可并行生产，兵工厂可取消退款，被摧毁后高级生产停用', () => {
  const game = new Game('china', 'russia'); game.updateAI = () => {};
  const armory = game.addBuilding(0, 'armory', 650, 550);
  game.addBuilding(0, 'power', 650, 400); game.players[0].credits = 10000;
  game.queueUnit(0, 'tank'); game.queueUnit(0, 'drone'); game.queueUnit(0, 'rifle');
  advance(game, 14);
  assert.equal(game.ownedUnits(0, 'drone').length, 1);
  assert.equal(game.ownedUnits(0, 'rifle').length, 4);
  assert.equal(game.ownedUnits(0, 'tank').length, 1);
  assert.equal(game.ownedBuildings(0, 'factory')[0].active.type, 'tank');
  game.queueUnit(0, 'drone'); advance(game, 1);
  const credits = game.players[0].credits, paid = armory.active.paid;
  assert.equal(game.cancelUnitProduction(0, armory.id), true);
  assert.ok(Math.abs(game.players[0].credits - credits - paid) < .01);
  game.damage(armory, armory.hp, 1);
  assert.equal(game.queueUnit(0, 'drone'), false);
  assert.equal(game.queueUnit(0, 'tank'), true);
});

test('AI 按同等规则建设和重建兵工厂，不会绕过生产设施', () => {
  const game = new Game('china', 'russia');
  game.time = 25; game.players[1].credits = 4000;
  assert.equal(game.queueUnit(1, 'drone'), false);
  game.updateAI(); assert.equal(game.players[1].buildQueue?.type, 'armory');
  game.updateAI = () => {}; advance(game, 26);
  const armory = game.ownedBuildings(1, 'armory')[0];
  assert.ok(armory);
  assert.equal(game.queueUnit(1, 'drone'), true);
  game.damage(armory, armory.hp, 0);
  game.players[1].buildQueue = null; game.players[1].credits = 4000;
  Game.prototype.updateAI.call(game);
  assert.equal(game.players[1].buildQueue?.type, 'armory');
});

test('快速对战须摧毁存活的兵工厂，不能漏判生产核心', () => {
  const game = new Game('china', 'russia');
  const armory = game.addBuilding(1, 'armory', 1500, 500);
  for (const building of game.ownedBuildings(1)) if (building.id !== armory.id && CORE_BUILDINGS.includes(building.type)) building.hp = 0;
  game.checkVictory(); assert.equal(game.winner, null);
  armory.hp = 0; game.checkVictory(); assert.equal(game.winner, 0);
});

test('高空战机跨越建筑，制空、对地和防空形成明确克制', () => {
  const game = new Game('china', 'russia');
  game.units = [];
  const fighter = game.addUnit(0, 'fighter', 850, 700);
  const strike = game.addUnit(0, 'strike', 850, 740);
  const rifle = game.addUnit(0, 'rifle', 900, 700);
  const tank = game.addUnit(0, 'tank', 900, 740);
  const aa = game.addUnit(0, 'aa', 900, 780);
  const chinaElite = game.addUnit(0, 'elite', 900, 820);
  const enemyJet = game.addUnit(1, 'fighter', 1100, 700);
  const enemyDrone = game.addUnit(1, 'drone', 1100, 740);
  const enemyTank = game.addUnit(1, 'tank', 1100, 780);
  const enemyBuilding = game.addBuilding(1, 'turret', 1080, 840);
  assert.equal(game.canAttack(rifle, enemyJet), false);
  assert.equal(game.canAttack(tank, enemyJet), false);
  assert.equal(game.canAttack(aa, enemyJet), true);
  assert.equal(game.canAttack(chinaElite, enemyJet), true);
  assert.equal(game.canAttack(fighter, enemyJet), true);
  assert.equal(game.canAttack(fighter, enemyDrone), true);
  assert.equal(game.canAttack(fighter, enemyTank), false);
  assert.equal(game.canAttack(strike, enemyJet), false);
  assert.equal(game.canAttack(strike, enemyDrone), false);
  assert.equal(game.canAttack(strike, enemyTank), true);
  assert.equal(game.canAttack(strike, enemyBuilding), true);
  game.addBuilding(0, 'power', 1000, 700);
  // 单独验证越过建筑，不让另一架战机的空中避碰改变飞行方向。
  enemyJet.y = 1000;
  game.moveUnitNow(fighter, { x: 1200, y: 700 }, 1, 8);
  assert.ok(fighter.x > 1000);
  assert.equal(fighter.y, 700);
});

test('攻击机弹药耗尽后返场，断电暂停补给，恢复供电后继续任务', () => {
  const game = new Game('china', 'russia');
  game.updateAI = () => {};
  game.aiWaveTimer = Infinity;
  game.addBuilding(0, 'airfield', 800, 700);
  const strike = game.addUnit(0, 'strike', 760, 700);
  const target = game.addBuilding(1, 'turret', 900, 700);
  strike.ammo = 1;
  strike.fireTimer = 0;
  strike.order = { type: 'attack', targetId: target.id, x: target.x, y: target.y };
  game.updateFog();
  game.update(0.05);
  assert.equal(strike.ammo, 0);
  assert.ok(target.hp < target.maxHp);
  game.update(0.05);
  assert.equal(strike.order.type, 'rearm');
  assert.equal(game.hasPower(0), false);
  advance(game, 2);
  assert.equal(strike.rearmProgress, 0);
  game.addBuilding(0, 'power', 660, 450);
  for (let i = 0; i < 350 && strike.order?.type === 'rearm'; i++) game.update(0.05);
  assert.equal(strike.ammo, 3);
  assert.equal(strike.order.type, 'attack');
});

test('快速对战须摧毁作为生产核心的空军基地', () => {
  const game = new Game('china', 'russia');
  const airfield = game.addBuilding(1, 'airfield', 1550, 900);
  for (const building of game.ownedBuildings(1).filter(b => CORE_BUILDINGS.includes(b.type) && b !== airfield)) game.damage(building, building.hp, 0);
  game.update(0.05);
  assert.equal(game.winner, null);
  game.damage(airfield, airfield.hp, 0);
  game.update(0.05);
  assert.equal(game.winner, 0);
});
