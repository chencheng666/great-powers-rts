import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Game } from '../src/game.js';
import { UNITS } from '../src/data.js';
import { validateSave } from '../src/savegame.js';

const setup = (mapId = 'ocean') => {
  const g = new Game('china', 'china', {}, { mapId, victoryMode: 'annihilation' });
  g.units = []; g.aiTimer = 1e6; g.aiWaveTimer = 1e6;
  g.players.forEach(p => { p.credits = 10000; });
  for (const fog of g.fogs) { fog.visible.fill(true); fog.explored.fill(true); }
  return g;
};
const advance = (g, duration) => { for (let n = 0; n < duration * 20; n++) g.update(.05); };

test('步兵、坦克和防空单位每次开火实际扣弹，耗尽后停止开火并补给，双方相同', () => {
  for (const side of [0, 1]) for (const type of ['rifle', 'tank', 'aa']) {
    const g = setup('frontier'), u = g.addUnit(side, type, 600, 900), target = g.addUnit(1 - side, type === 'aa' ? 'fighter' : 'tank', 680, 900);
    u.ammo = 1; u.fireTimer = 0; target.hp = target.maxHp = 10000;
    g.updateUnit(u, .05); assert.equal(u.ammo, 0, type);
    const hp = target.hp; g.updateUnit(u, .05);
    assert.equal(u.order.type, 'rearm'); assert.equal(target.hp, hp);
  }
});

test('飞机返场逐枚付费补弹并修复生命，断电、缺钱和近期受击不能免费维修', () => {
  const g = setup('frontier'), home = g.addBuilding(0, 'airfield', 750, 850);
  g.addBuilding(0, 'power', 650, 1200); g.recalculatePower();
  const jet = g.addUnit(0, 'fighter', home.x + 75, home.y); jet.hp = 120; jet.ammo = 0; jet.order = { type: 'rearm' }; jet.resumeOrder = { type: 'move', x: 1200, y: 850 };
  const cash = g.players[0].credits;
  advance(g, 14); assert.equal(jet.hp, jet.maxHp); assert.equal(jet.ammo, UNITS.fighter.ammo); assert.ok(g.players[0].credits < cash);
  assert.ok(jet.x > 1000); assert.equal(jet.resumeOrder, null);
  jet.x = home.x + 75; jet.y = home.y; jet.hp = 100; jet.lastMovedAt = -10;
  jet.lastDamageAt = g.time; g.serviceAircraft(jet, 1); assert.equal(jet.hp, 100);
  jet.lastDamageAt = -10; g.players[0].credits = 0; g.serviceAircraft(jet, 1); assert.equal(jet.hp, 100);
  g.players[0].credits = 100; g.players[0].powerIn = 0; g.serviceAircraft(jet, 1); assert.equal(jet.hp, 100);
});

test('满弹受伤飞机停在机场也会维修，手动返场不需要先把弹药打空', () => {
  const g = setup('frontier'), home = g.addBuilding(0, 'airfield', 700, 900), jet = g.addUnit(0, 'bomber', 775, 900);
  g.addBuilding(0, 'power', 700, 1150); g.recalculatePower();
  jet.hp = 200; g.serviceAircraft(jet, 1); assert.equal(jet.hp, 222);
  assert.equal(g.requestResupply(jet), true); assert.equal(jet.order.type, 'rearm');
});

test('补给车主动接近远处受伤步兵和坦克，恢复生命、弹药后换目标', () => {
  const g = setup('frontier'), truck = g.addUnit(0, 'supply', 600, 900), rifle = g.addUnit(0, 'rifle', 860, 900), tank = g.addUnit(0, 'tank', 1080, 960);
  rifle.hp = 70; rifle.ammo = 14; tank.hp = 300; tank.ammo = 10;
  const x = truck.x; advance(g, 45);
  assert.ok(truck.x > x + 100); assert.equal(rifle.hp, rifle.maxHp); assert.equal(rifle.ammo, UNITS.rifle.ammo);
  assert.equal(tank.hp, tank.maxHp); assert.equal(tank.ammo, UNITS.tank.ammo); assert.ok(truck.stock < UNITS.supply.stock);
});

test('停止自动保障后不会自主出发，手动移动优先，车辆不跨海追寻不可达目标', () => {
  const g = setup(), truck = g.addUnit(0, 'supply', 700, 1100), unit = g.addUnit(0, 'rifle', 1760, 1120);
  unit.hp = 30; g.updateSupply(truck, .05); assert.equal(truck.serviceTargetId, null);
  unit.x = 950; truck.autoSupply = false; g.updateSupply(truck, 1); assert.equal(truck.x, 700);
  truck.order = { type: 'move', x: 650, y: 1100 }; g.updateSupply(truck, 1); assert.ok(truck.x < 700);
});

test('补给车治疗步兵不治疗敌军、空军、海军或车内单位，库存耗尽回厂', () => {
  const g = setup(), truck = g.addUnit(0, 'supply', 700, 1100), rifle = g.addUnit(0, 'rifle', 760, 1100);
  const excluded = [g.addUnit(1, 'rifle', 770, 1100), g.addUnit(0, 'drone', 780, 1100), g.addUnit(0, 'patrol', 790, 1100), g.addUnit(0, 'rifle', 800, 1100)];
  excluded.at(-1).embarkedIn = 12345; excluded.forEach(u => { u.hp = 20; }); rifle.hp = 50;
  g.updateSupply(truck, 1); assert.equal(rifle.hp, 74); assert.ok(excluded.every(u => u.hp === 20));
  truck.stock = 0; g.updateSupply(truck, .05); assert.equal(truck.order.type, 'restock');
});

test('登陆舰载重允许三辆坦克或十二名步兵，拒绝超载、敌军、飞机与嵌套运输', () => {
  const g = setup(), ship = g.addUnit(0, 'landing', 1130, 1120);
  for (let n = 0; n < 3; n++) { const tank = g.addUnit(0, 'tank', 1010, 1120 + n * 10); tank.order = { type: 'board', targetId: ship.id }; g.boardTransport(tank, .05); }
  assert.equal(ship.passengers.length, 3); assert.equal(g.transportLoad(ship), 12);
  assert.equal(g.canBoardTransport(g.addUnit(0, 'rifle', 1000, 1120), ship), false);
  assert.equal(g.canBoardTransport(g.addUnit(1, 'rifle', 1000, 1120), ship), false);
  assert.equal(g.canBoardTransport(g.addUnit(0, 'fighter', 1000, 1120), ship), false);
  assert.equal(g.canBoardTransport(g.addUnit(0, 'apc', 1000, 1120), ship), false);
});

test('登陆舰不能在深海卸载，靠岸后部队落在安全陆地；舰毁没有无敌乘员', () => {
  const g = setup(), ship = g.addUnit(0, 'landing', 1130, 1120), tank = g.addUnit(0, 'tank', 1010, 1120);
  tank.order = { type: 'board', targetId: ship.id }; g.boardTransport(tank, .05);
  ship.x = 1760; assert.equal(g.unloadTransport(ship), 0); assert.equal(tank.embarkedIn, ship.id);
  ship.x = 1130; assert.equal(g.unloadTransport(ship), 1); assert.equal(tank.embarkedIn, null); assert.ok(g.canOccupyUnit(tank, tank));
  tank.x = 1010; tank.y = 1120; tank.order = { type: 'board', targetId: ship.id }; g.boardTransport(tank, .05);
  ship.x = 1760; g.damage(ship, 10000, 1); assert.ok(tank.hp <= 0); assert.equal(ship.passengers.length, 0);
});

test('运输机只在安全停驻陆地装卸，不允许海上空投，容量与坦克重量一致', () => {
  const g = setup(), plane = g.addUnit(0, 'airlift', 800, 1200);
  const tank = g.addUnit(0, 'tank', 760, 1200); tank.order = { type: 'board', targetId: plane.id }; g.boardTransport(tank, .05);
  assert.equal(g.transportLoad(plane), 4); assert.equal(tank.embarkedIn, plane.id);
  plane.x = 1760; assert.equal(g.unloadTransport(plane), 0);
  plane.x = 2900; plane.order = { type: 'move', x: 2900, y: 1200 }; assert.equal(g.unloadTransport(plane), 0);
  plane.order = null; assert.equal(g.unloadTransport(plane), 1); assert.ok(g.canOccupyUnit(tank, tank));
});

test('无人机跨海移动不绕桥、不触发陆地碰撞，低空与高空仍分层', () => {
  const g = setup();
  for (const type of ['drone', 'ghost', 'fighter', 'airlift']) {
    const u = g.addUnit(0, type, 980, 1120), goal = g.resolveMoveGoal(u, 2200, 1120);
    assert.deepEqual(goal, { x: 2200, y: 1120 });
    for (let n = 0; n < 200; n++) g.moveUnitNow(u, goal, .05);
    assert.ok(u.x > 1800, type); assert.ok(Math.abs(u.y - 1120) < 20, type);
    assert.equal(g.canOccupyUnit(u, { x: 1760, y: 1120 }), true);
  }
  const tank = g.addUnit(0, 'tank', 980, 1120); assert.equal(g.canOccupyUnit(tank, { x: 1760, y: 1120 }), false);
});

test('轰炸机炸弹有飞行时间和区域落点，不能追踪飞机、攻击潜艇或误伤友军', () => {
  const g = setup('frontier'), bomber = g.addUnit(0, 'bomber', 700, 900), target = g.addUnit(1, 'tank', 890, 900), near = g.addUnit(1, 'rifle', 900, 915), friend = g.addUnit(0, 'rifle', 910, 900), drone = g.addUnit(1, 'drone', 910, 920);
  assert.equal(g.canAttack(bomber, drone), false); assert.equal(g.canAttack(bomber, g.addUnit(1, 'submarine', 900, 900)), false);
  bomber.x = target.x; bomber.y = target.y;
  g.fire(bomber, target, 100, 'bomber'); assert.equal(target.hp, target.maxHp); assert.equal(g.projectiles[0].kind, 'bomb');
  for (let n = 0; n < 30; n++) g.updateProjectiles(.05);
  assert.ok(target.hp < target.maxHp); assert.ok(near.hp < near.maxHp); assert.equal(friend.hp, friend.maxHp); assert.equal(drone.hp, drone.maxHp);
});

test('新海空单位两方按正常队列生产，地图、科研与设施条件不能绕过', () => {
  const g = setup(); g.updateUnit = () => {};
  for (const side of [0, 1]) {
    assert.equal(g.queueUnit(side, 'bomber'), false);
    for (const type of ['radar', 'lab', 'airfield', 'power', 'power', 'power']) g.addBuilding(side, type, side ? 3000 : 600, 1500);
    for (const type of ['landing', 'bomber', 'airlift']) assert.equal(g.queueUnit(side, type), true);
  }
  advance(g, 100);
  for (const type of ['landing', 'bomber', 'airlift']) {
    assert.equal(g.ownedUnits(0, type).length, 1); assert.equal(g.ownedUnits(1, type).length, 1);
    assert.equal(g.ownedUnits(0, type)[0].maxHp, g.ownedUnits(1, type)[0].maxHp);
    assert.ok(g.ownedUnits(0, type).every(u => Number.isFinite(u.x) && Number.isFinite(u.y)));
  }
  assert.equal(setup('frontier').queueUnit(0, 'landing'), false);
});

test('存档保留混合载重、自动保障和有限弹药，兼容旧版空弹药字段', () => {
  const g = setup(), ship = g.addUnit(0, 'landing', 1130, 1120), tank = g.addUnit(0, 'tank', 1010, 1120);
  tank.order = { type: 'board', targetId: ship.id }; g.boardTransport(tank, .05);
  tank.ammo = 3; const truck = g.addUnit(0, 'supply', 700, 1100); truck.autoSupply = false; truck.stock = 62;
  const restored = Game.fromSave(g.toSave()); assert.equal(restored.transportLoad(restored.getEntity(ship.id)), 4);
  assert.equal(restored.getEntity(tank.id).ammo, 3); assert.equal(restored.getEntity(truck.id).autoSupply, false); assert.equal(restored.getEntity(truck.id).stock, 62);
  const legacy = g.toSave(); legacy.state.units.find(u => u.id === tank.id).ammo = null;
  assert.equal(Game.fromSave(legacy).getEntity(tank.id).ammo, UNITS.tank.ammo);
});

test('三个海空模型独立存在，便携中文语音覆盖每条台词且为有效 PCM WAV', () => {
  const buffer = readFileSync(new URL('../assets/models/logistics-library.glb', import.meta.url));
  const json = JSON.parse(buffer.subarray(20, 20 + buffer.readUInt32LE(12)).toString());
  for (const name of ['landing', 'bomber', 'airlift']) assert.ok(json.nodes.some(node => node.name === name));
  const manifest = JSON.parse(readFileSync(new URL('../assets/audio/portable/manifest.json', import.meta.url)));
  assert.equal(manifest.files.length, 37);
  for (const { file } of manifest.files) {
    const wav = readFileSync(new URL(`../assets/audio/portable/${file}`, import.meta.url));
    assert.equal(wav.subarray(0, 4).toString(), 'RIFF'); assert.equal(wav.subarray(8, 12).toString(), 'WAVE'); assert.ok(wav.length > 1000);
  }
});

test('损坏存档中的负弹药、无限库存、重复乘员和假装载关系不会进入战局', () => {
  const g = setup(), ship = g.addUnit(0, 'landing', 1130, 1120), tank = g.addUnit(0, 'tank', 1010, 1120);
  tank.order = { type: 'board', targetId: ship.id }; g.boardTransport(tank, .05); g.addUnit(0, 'supply', 700, 900);
  for (const mutate of [s => { s.units.find(u => u.type === 'tank').ammo = -1; }, s => { s.units.find(u => u.type === 'supply').stock = 999; }, s => { s.units.find(u => u.type === 'landing').passengers.push(tank.id); }, s => { s.units.find(u => u.type === 'tank').embarkedIn = 99999; }]) {
    const save = g.toSave(); mutate(save.state); assert.throws(() => validateSave(save));
  }
});

test('电脑按相同生产条件制造轰炸机与运输机，登陆行动装载和卸载真实单位', () => {
  const g = setup(); g.time = 300; g.players[1].aiFirstStrikeProduced = true; g.players[1].aiPlanIndex = 11;
  for (const type of ['airfield', 'radar', 'lab', 'power', 'power', 'power']) g.addBuilding(1, type, 3000, 1500);
  g.players[1].aiAirUnitCount = 2; g.updateAI(); assert.ok(g.ownedBuildings(1, 'airfield')[0].queue.includes('bomber'));
  g.ownedBuildings(1, 'airfield')[0].queue = []; g.players[1].aiAirUnitCount = 3; g.updateAI(); assert.ok(g.ownedBuildings(1, 'airfield')[0].queue.includes('airlift'));
  const ship = g.addUnit(1, 'landing', g.map.water.x2 - 74, g.homeY + 190), tank = g.addUnit(1, 'tank', g.map.water.x2 + 55, g.homeY + 190);
  g.updateAITransports(); assert.equal(tank.order.type, 'board'); g.boardTransport(tank, .05); assert.equal(g.transportLoad(ship), 4);
  g.time += 13; g.updateAITransports(); g.updateAITransports(); assert.equal(ship.order.type, 'move');
  ship.x = g.map.water.x1 + 74; g.updateAITransports(); assert.equal(tank.embarkedIn, null); assert.equal(tank.order.type, 'attackMove');
  assert.equal(ship.transportStage, 'return');
});

test('登陆舰真实移动和生产点计入舰体半径，不会生成 NaN 或航行上岸', () => {
  const g = setup(), ship = g.addUnit(0, 'landing', 1150, 1200);
  for (let n = 0; n < 200; n++) g.moveUnitNow(ship, { x: 1760, y: 1200 }, .05);
  assert.ok(ship.x > 1650); assert.equal(g.canOccupyUnit(ship, { x: 1050, y: 1200 }), false);
  assert.equal(g.canOccupyUnit(ship, { x: 1150, y: 1200 }), true);
});
