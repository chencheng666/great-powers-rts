import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { UNITS } from '../src/data.js';
import { SUPPLY } from '../src/supply-rules.js';
import { battleView } from '../server/battle-view.mjs';

function setup(mapId = 'frontier') {
  const g = new Game('china', 'china', {}, { mapId, victoryMode: 'annihilation' });
  g.units = []; g.buildings = []; g.aiTimer = g.aiWaveTimer = 1e6;
  g.addBuilding(0, 'hq', 300, 2400); g.addBuilding(1, 'hq', g.world.width - 300, 2400);
  g.updateLogistics = () => {};
  g.players.forEach(p => { p.credits = 100000; });
  g.fogs.forEach(f => { f.visible.fill(true); f.explored.fill(true); });
  return g;
}
const advance = (g, seconds) => { for (let i = 0; i < seconds * 20; i++) g.update(.05); };

test('补给车费用低于坦克，扩大备弹与射程后仍保持近战、装甲、远程层次，双方一致', () => {
  assert.equal(UNITS.supply.cost, 300); assert.equal(UNITS.supply.range, 240); assert.equal(UNITS.supply.stock, 360);
  assert.equal(UNITS.rifle.ammo, 60); assert.equal(UNITS.tank.ammo, 30);
  assert.ok(UNITS.rifle.range < UNITS.tank.range && UNITS.tank.range < UNITS.loiterer.range && UNITS.loiterer.range < UNITS.rocket.range);
  assert.ok(UNITS.tank.sight >= UNITS.tank.range);
  const g = setup();
  assert.equal(g.addUnit(0, 'tank', 700, 1000).ammo, g.addUnit(1, 'tank', 1700, 1000).ammo);
});

test('光环同时补充圈内全部陆军弹药，维修总量共享，不追逐圈外目标或治疗敌军海空单位', () => {
  const g = setup(), truck = g.addUnit(0, 'supply', 700, 1000);
  const troops = ['tank', 'rifle', 'aa'].map((type, i) => g.addUnit(0, type, 760 + i * 40, 1000));
  troops.forEach(u => { u.hp -= 50; u.ammo -= 5; });
  const outside = g.addUnit(0, 'tank', 1200, 1000); outside.hp -= 50;
  const excluded = [g.addUnit(1, 'tank', 800, 1100), g.addUnit(0, 'drone', 820, 1100), g.addUnit(0, 'patrol', 850, 1100), g.addUnit(0, 'rifle', 800, 1000)];
  excluded.at(-1).embarkedIn = 9999;
  excluded.forEach(u => { u.hp -= 50; u.ammo = 0; });
  g.updateSupply(truck, 1);
  troops.forEach(u => { assert.equal(u.ammo, UNITS[u.type].ammo - 4); assert.equal(u.hp, u.maxHp - 42); });
  assert.ok(excluded.every(u => u.hp === u.maxHp - 50 && u.ammo === 0));
  assert.equal(truck.x, 700); assert.equal(truck.serviceTargetId, null); assert.equal(outside.hp, outside.maxHp - 50);
});

test('八辆缺弹坦克在保障圈内原地整备，不相向挤车，二十秒内每辆都得到持续保障', () => {
  const g = setup(), truck = g.addUnit(0, 'supply', 1000, 1400);
  const tanks = Array.from({ length: 8 }, (_, i) => {
    const a = i * Math.PI / 4, u = g.addUnit(0, 'tank', 1000 + Math.cos(a) * 185, 1400 + Math.sin(a) * 185);
    u.ammo = 0; u.hp -= 20; g.requestResupply(u); return { u, x: u.x, y: u.y };
  });
  advance(g, 20);
  tanks.forEach(({ u, x, y }) => { assert.ok(u.ammo >= 15, `${u.id}未获补弹`); assert.equal(u.hp, u.maxHp); assert.ok(Math.hypot(u.x - x, u.y - y) < 1); });
  assert.equal(truck.x, 1000); assert.equal(truck.y, 1400); assert.ok(truck.stock >= 0 && truck.stock < UNITS.supply.stock);
});

test('多车重叠不加速同一轮补弹和维修，库存与资金不为负，缺钱时不会让空弹部队死等', () => {
  const g = setup(), a = g.addUnit(0, 'supply', 700, 1000), b = g.addUnit(0, 'supply', 700, 1100), tank = g.addUnit(0, 'tank', 820, 1000);
  tank.ammo = 0; tank.hp -= 100; g.requestResupply(tank);
  g.updateSupply(a, 1); g.updateSupply(b, 1);
  assert.equal(tank.ammo, 1); assert.equal(tank.hp, tank.maxHp - 76);
  g.players[0].credits = 0; const before = tank.hp; g.time += 2;
  g.updateSupply(a, 1); assert.equal(tank.hp, before); assert.equal(g.players[0].credits, 0);
  g.addBuilding(0, 'factory', 400, 1000); g.updateGroundRearm(tank, 1); assert.ok(tank.x < 820);
});

test('补给车绕开停驻装甲纵队到范围边缘即服务，不钻入目标或反复追逐', () => {
  const g = setup(), truck = g.addUnit(0, 'supply', 600, 1400);
  for (let i = 0; i < 5; i++) g.addUnit(0, 'tank', 820, 1240 + i * 80);
  const target = g.addUnit(0, 'tank', 1200, 1400); target.ammo -= 6; target.hp -= 60;
  advance(g, 35);
  assert.equal(target.ammo, UNITS.tank.ammo); assert.equal(target.hp, target.maxHp);
  assert.ok(Math.hypot(truck.x - target.x, truck.y - target.y) >= 160);
  assert.ok(g.canOccupyUnit(truck, truck));
  const at = { x: truck.x, y: truck.y }; advance(g, 4);
  assert.ok(Math.hypot(truck.x - at.x, truck.y - at.y) < 2);
});

test('山体隔开的近邻不获得穿墙补给，隔海目标不可达也不派车', () => {
  const g = setup(), truck = g.addUnit(0, 'supply', 700, 1100), tank = g.addUnit(0, 'tank', 920, 1100);
  g.map = { ...g.map, barriers: [{ x1: 790, x2: 840, y1: 700, y2: 1500 }] };
  tank.hp -= 50; tank.ammo = 0; g.updateSupply(truck, 1);
  assert.equal(tank.hp, tank.maxHp - 50); assert.equal(tank.ammo, 0);
  const sea = setup('ocean'), supply = sea.addUnit(0, 'supply', 800, 1100), other = sea.addUnit(0, 'rifle', 1760, 1100);
  other.hp = 10; sea.updateSupply(supply, 1); assert.equal(supply.serviceTargetId, null); assert.equal(supply.x, 800);
});

test('堵死后限时跳过原目标，补给搜索有距离上限且不每帧重算', () => {
  const g = setup(), truck = g.addUnit(0, 'supply', 600, 1400), tank = g.addUnit(0, 'tank', 1100, 1400);
  tank.ammo = 0; g.moveUnit = () => {};
  let searches = 0; const find = g.findPath.bind(g); g.findPath = (...args) => { searches++; return find(...args); };
  for (let i = 0; i < 80; i++) { g.time += .05; g.updateSupply(truck, .05); }
  assert.equal(truck.serviceSkipId, tank.id); assert.equal(truck.serviceTargetId, null); assert.ok(searches <= 3);
  assert.ok(truck.serviceSkipUntil > g.time);
});

test('缺货自动返厂补满，六秒收费八十，工厂被毁时不永久困在补货指令', () => {
  const g = setup(), home = g.addBuilding(0, 'factory', 650, 1400); g.addBuilding(0, 'power', 650, 1150); g.recalculatePower();
  const truck = g.addUnit(0, 'supply', 1100, 1400); truck.stock = 0;
  const cash = g.players[0].credits; advance(g, 17);
  assert.equal(truck.stock, UNITS.supply.stock); assert.equal(truck.order, null);
  assert.equal(cash - g.players[0].credits, SUPPLY.restockPrice);
  truck.stock = 0; g.updateSupply(truck, .05); assert.equal(truck.order.type, 'restock');
  home.hp = 0; g.updateSupply(truck, .05); assert.equal(truck.order, null);
});

test('补给光环与库存能保存恢复，内部避让缓存不通过联机快照泄漏', () => {
  const g = setup(), truck = g.addUnit(0, 'supply', 700, 1000), tank = g.addUnit(0, 'tank', 800, 1000);
  tank.ammo = 0; g.updateSupply(truck, .05);
  truck.serviceProgress = { x: 650, y: 1000, at: 0 }; truck.serviceSkipId = 99999; truck.serviceSkipUntil = 20;
  const copy = Game.fromSave(g.toSave());
  assert.equal(copy.getEntity(tank.id).ammo, 1); assert.equal(copy.getEntity(truck.id).stock, truck.stock);
  for (const side of [0, 1]) {
    const view = battleView(g, side), visible = view.units.find(u => u.id === truck.id);
    assert.ok(visible); assert.equal(visible.serviceProgress, undefined); assert.equal(visible.serviceSkipId, undefined);
    if (side === 1) { assert.equal(visible.ammo, undefined); assert.equal(visible.stock, undefined); }
  }
});

test('空库存仍响应手动撤离，基地存在也不会立即覆盖玩家的移动指令', () => {
  for (const factory of [false, true]) {
    const g = setup(), truck = g.addUnit(0, 'supply', 700, 1400); truck.stock = 0;
    if (factory) g.addBuilding(0, 'factory', 400, 1400);
    truck.order = { type: 'move', x: 1100, y: 1400 }; g.updateSupply(truck, .05);
    assert.equal(truck.order.type, 'move'); assert.ok(truck.x > 700);
  }
});
