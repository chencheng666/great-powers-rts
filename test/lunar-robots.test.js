import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Game } from '../src/game.js';
import { MAPS, UNITS } from '../src/data.js';
import { equipmentProfile, equipmentModel } from '../src/equipment.js';
import { buildingInformation } from '../src/battlefield-details.js';
import { ROBOT_ENERGY, isLunarRobot } from '../src/lunar-robots.js';
import { validateSave } from '../src/savegame.js';

const setup = () => {
  const g = new Game('china', 'china', {}, { mapId: 'meridian', victoryMode: 'annihilation' });
  g.units = []; g.aiTimer = g.aiWaveTimer = 1e9; g.closestEnemy = () => null;
  for (const f of g.fogs) { f.visible.fill(true); f.explored.fill(true); }
  return g;
};
const advance = (g, seconds) => { for (let n = 0; n < seconds * 20; n++) g.update(.05); };

test('只有月表三类步兵改为机器人，价格、血量和职责保留，常规地图不受影响', () => {
  for (const [id, map] of Object.entries(MAPS)) for (const type of ['rifle', 'engineer', 'scout']) {
    const g = new Game('china', 'china', {}, { mapId: id });
    const u = g.addUnit(0, type, 650, 900), future = Boolean(map.future);
    assert.equal(isLunarRobot(map, type), future);
    assert.equal(equipmentModel('china', type, future), future ? `robot_${type}` : type);
    assert.equal(equipmentProfile('china', type, future).category.includes('机器人'), future);
    assert.equal(u.battery, future ? 100 : undefined);
    assert.equal(u.ammo, future ? null : UNITS[type].ammo ?? null);
    assert.equal(u.maxHp, UNITS[type].hp);
  }
  const g = setup(), home = g.ownedBuildings(0, 'barracks')[0];
  g.queueUnit(0, 'rifle'); g.updateBuilding(home, .05);
  const info = buildingInformation(g, home);
  assert.equal(info.name, '机器人装配站'); assert.equal(info.production.name, '月卫战斗机器人');
});

test('脉冲武器实际耗电，不消耗常规弹药，电量不足无法无限攻击', () => {
  for (const side of [0, 1]) {
    const g = setup(), u = g.addUnit(side, 'rifle', 700, 900), target = g.addUnit(1 - side, 'tank', 800, 900);
    g.fire(u, target, 12, 'rifle'); assert.equal(u.battery, 96); assert.equal(u.ammo, null);
    assert.ok(g.effects.some(e => e.style === 'robotPulse'));
    u.battery = 2; const hp = target.hp; g.fire(u, target, 12, 'rifle'); assert.equal(target.hp, hp); assert.equal(u.battery, 2);
    g.updateUnit(u, .05); assert.equal(u.order.type, 'rearm');
  }
});

test('低电量自动返回充电，充满恢复任务；充电耗电网容量而不花弹药资金', () => {
  for (const side of [0, 1]) {
    const g = setup(), home = g.ownedBuildings(side, 'barracks')[0], u = g.addUnit(side, 'scout', home.x + (side ? -1 : 1) * 250, home.y);
    g.players[side].credits = 0;
    u.order = { type: 'move', x: home.x + (side ? -1 : 1) * 600, y: home.y }; u.battery = 20;
    for (let n = 0; n < 600; n++) { g.update(.05); if (u.battery > 99 && u.order?.type === 'move') break; }
    assert.ok(u.battery > 90); assert.equal(g.players[side].credits, 0);
    assert.equal(u.resumeOrder, null); assert.equal(u.order?.type, 'move');
    assert.equal(u.ammo, null);
  }
});

test('断电不清空电池，但阻止充电；充电负载计入双方，移动与受袭不能补能', () => {
  const g = setup(), home = g.ownedBuildings(0, 'barracks')[0], u = g.addUnit(0, 'engineer', home.x + 45, home.y);
  u.battery = 30; g.requestResupply(u); g.recalculatePower();
  assert.equal(g.players[0].robotChargeLoad, ROBOT_ENERGY.chargeLoad);
  const before = u.battery;
  g.players[0].powerIn = 0; g.updateRobotRearm(u, 1); assert.equal(u.battery, before);
  g.recalculatePower(); u.lastDamageAt = g.time; g.updateRobotRearm(u, 1); assert.equal(u.battery, before);
  u.lastDamageAt = -10; u.lastMovedAt = g.time; g.updateRobotRearm(u, 1); assert.equal(u.battery, before);
  u.lastMovedAt = -10; home.lastDamageAt = g.time; g.updateRobotRearm(u, 1); assert.equal(u.battery, before);
  home.lastDamageAt = -10; g.updateRobotRearm(u, 1); assert.equal(u.battery, before + ROBOT_ENERGY.chargeRate);
});

test('电池耗尽机器人停机，补给车能主动接近并在有电时救援，不给敌人或车内乘员充电', () => {
  const g = setup(), u = g.addUnit(0, 'scout', 1000, 1450), truck = g.addUnit(0, 'supply', 700, 1450);
  const enemy = g.addUnit(1, 'scout', 1020, 1450); enemy.battery = 0;
  u.battery = 0; g.players[0].credits = 0;
  g.updateUnit(u, .05); assert.equal(u.x, 1000); assert.equal(u.order.type, 'rearm');
  advance(g, 20); assert.ok(u.battery > 90); assert.ok(truck.x > 800); assert.equal(enemy.battery, 0);
  const apc = g.addUnit(0, 'apc', u.x, u.y); u.battery = 30; u.order = { type: 'board', targetId: apc.id };
  g.boardTransport(u, .05); assert.equal(u.embarkedIn, apc.id);
  const charge = u.battery; advance(g, 1); assert.equal(u.battery, charge);
});

test('工程机器人按原有规则占领设施，机械步兵仍可乘坐装甲车', () => {
  const g = setup(), site = g.beacons[0], u = g.addUnit(0, 'engineer', site.x, site.y);
  u.order = { type: 'capture', targetId: site.id, x: site.x, y: site.y }; g.updateUnit(u, .05);
  assert.equal(site.owner, 0); assert.equal(u.hp, 0);
  const robot = g.addUnit(0, 'rifle', 700, 900), apc = g.addUnit(0, 'apc', 720, 900);
  assert.equal(g.canBoardTransport(robot, apc), true); assert.equal(g.transportLoad(apc), 0);
});

test('保存精确电量与返场任务；旧月表存档迁移机器人，非法电池字段拒绝', () => {
  const g = setup(), u = g.addUnit(0, 'rifle', 700, 900); u.battery = 17.35; g.requestResupply(u);
  const saved = g.toSave(), restored = Game.fromSave(saved).getEntity(u.id);
  assert.equal(restored.battery, 17.35); assert.equal(restored.ammo, null); assert.equal(restored.order.type, 'rearm');
  const legacy = structuredClone(saved); delete legacy.state.units[0].battery; legacy.state.units[0].ammo = 8;
  assert.equal(Game.fromSave(legacy).getEntity(u.id).battery, 100); assert.equal(Game.fromSave(legacy).getEntity(u.id).ammo, null);
  for (const value of [-1, 101, Infinity, '100']) { const bad = structuredClone(saved); bad.state.units[0].battery = value; assert.throws(() => validateSave(bad)); }
  const normal = new Game('china', 'china').toSave(); normal.state.units[0].battery = 50; assert.throws(() => validateSave(normal));
});

test('三类机器人有独立模型和左右髋关节，素材不含真人皮肤或衣服', () => {
  const buffer = readFileSync(new URL('../assets/models/robot-library.glb', import.meta.url));
  const json = JSON.parse(buffer.subarray(20, 20 + buffer.readUInt32LE(12)).toString());
  for (const name of ['robot_rifle', 'robot_engineer', 'robot_scout']) assert.ok(json.nodes.some(n => n.name === name));
  for (const side of ['left', 'right']) assert.equal(json.nodes.filter(n => n.name.startsWith(`robot_leg_${side}`)).length, 3);
  assert.ok(json.materials.every(m => !['皮肤', '作战服'].includes(m.name)));
});

test('停机机器人不再提供侦察和反隐视野，已探索的地图仍保留', () => {
  const g = setup(); g.buildings = []; g.beacons = []; g.map = { ...g.map, barriers: [] };
  const scout = g.addUnit(0, 'scout', 1700, 1200), enemy = g.addUnit(1, 'ghost', 1800, 1200);
  g.updateFog(); assert.equal(g.canSeeEntity(0, enemy), true);
  scout.battery = 0; g.updateFog();
  assert.equal(g.isVisibleFor(0, enemy.x, enemy.y), false); assert.equal(g.hasExploredFor(0, enemy.x, enemy.y), true);
  g.fogs[0].visible.fill(true); assert.equal(g.canSeeEntity(0, enemy), false);
  scout.battery = 1; assert.equal(g.canSeeEntity(0, enemy), true);
});

test('双方装配站缺电暂停扣款和生产，恢复供电后产出满电机器人', () => {
  for (const side of [0, 1]) {
    const g = setup(), home = g.ownedBuildings(side, 'barracks')[0];
    g.players[side].credits = 10000; g.queueUnit(side, 'rifle');
    g.players[side].powerIn = 0; g.updateBuilding(home, 1);
    assert.equal(home.active.progress, 0); assert.equal(home.active.paid, 0); assert.equal(g.players[side].credits, 10000);
    g.recalculatePower(); const cost = g.unitCost(side, 'rifle');
    for (let n = 0; n < 500 && !g.activeUnits(side, 'rifle').length; n++) g.updateBuilding(home, .05);
    const robot = g.activeUnits(side, 'rifle')[0]; assert.ok(robot); assert.equal(robot.battery, 100); assert.equal(robot.ammo, null);
    assert.ok(Math.abs(10000 - g.players[side].credits - cost) < .01);
  }
});

test('停机机体不能继续出厂位移，手动整备接口使用机器人充电规则', () => {
  const g = setup(), home = g.ownedBuildings(0, 'barracks')[0], u = g.addUnit(0, 'rifle', 1000, 1450);
  u.deployment = { x: 1100, y: 1450, until: 10 }; u.battery = 0;
  g.updateUnit(u, 1); assert.equal(u.x, 1000); assert.equal(u.y, 1450);
  u.x = home.x + 40; u.y = home.y; u.lastMovedAt = -10;
  g.updateRearm(u, 1); assert.equal(u.battery, ROBOT_ENERGY.chargeRate); assert.equal(u.ammo, null);
});
