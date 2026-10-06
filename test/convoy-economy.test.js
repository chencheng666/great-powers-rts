import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { MAPS, UNITS } from '../src/data.js';
import { FREIGHT_TYPES, SUPPLY_ROUTES } from '../src/logistics-economy.js';
import { validateSave } from '../src/savegame.js';
import { equipmentModel } from '../src/equipment.js';
import { readFileSync } from 'node:fs';

const quiet = (mapId = 'ocean') => {
  const g = new Game('china', 'china', {}, { mapId });
  g.aiTimer = g.aiWaveTimer = 1e9;
  g.closestEnemy = () => null;
  g.units = [];
  return g;
};
const advance = (g, seconds) => { for (let n = 0; n < seconds * 20; n++) g.update(.05); };

test('常规地图无矿石和矿车，只在子午地图采矿，双方与难度不改变外部后勤条件', () => {
  for (const mapId of Object.keys(MAPS)) {
    const g = quiet(mapId), lunar = mapId === 'meridian';
    assert.equal(g.economyMode, lunar ? 'mining' : 'convoy');
    assert.equal(g.ore.length, lunar ? MAPS.meridian.ore.length : 0);
    assert.equal(g.queueUnit(0, 'harvester'), lunar);
    assert.equal(g.queueUnit(1, 'harvester'), lunar);
    assert.equal(g.queueUnit(0, 'freightPlane'), false);
    assert.equal(g.queueUnit(0, 'containerShip'), false);
    assert.deepEqual(g.logistics[0], { ...g.logistics[1], side: 0 });
    if (!lunar) {
      const a = g.launchFreight(0), b = g.launchFreight(1);
      assert.equal(a.x, g.world.width - b.x); assert.equal(a.y, g.world.height - b.y);
      assert.equal(a.freight.value, b.freight.value); assert.equal(a.hp, b.hp);
    }
  }
});

test('运输机和集装箱船实际抵达卸货，镜像航线收入相等，不能每帧或增建仓库刷收入', () => {
  for (const mapId of ['valley', 'strait', 'ocean', 'frontier']) {
    const g = quiet(mapId), initial = g.players[0].credits;
    advance(g, 100);
    assert.ok(g.logistics[0].delivered >= 1440, `${mapId} 至少两批空运物资`);
    assert.equal(g.logistics[0].delivered, g.logistics[1].delivered);
    assert.equal(g.players[0].credits - initial, g.logistics[0].delivered);
    assert.ok(g.activeUnits(0, 'freightPlane').length <= 2);
    assert.ok(g.activeUnits(0, 'containerShip').length <= 2);
    if (g.map.water) assert.ok(g.logistics[0].delivered >= 2340, '空运与海运各有交付');
    const before = g.activeUnits(0, 'freightPlane').length;
    g.addBuilding(0, 'refinery', 630, 1100);
    g.updateLogistics(.05); assert.equal(g.activeUnits(0, 'freightPlane').length, before);
  }
});

test('未卸货不到账，断电和近期受击停卸；运输被击毁仅损失未交付物资', () => {
  const g = quiet(), u = g.launchFreight(0), home = g.getEntity(u.freight.homeId);
  const initial = g.players[0].credits;
  u.x = home.x; u.y = home.y;
  g.updateFreight(u, 1); assert.equal(g.players[0].credits, initial);
  const power = g.ownedBuildings(0, 'power')[0]; power.hp = 0; g.recalculatePower();
  g.updateFreight(u, 10); assert.equal(g.players[0].credits, initial);
  power.hp = power.maxHp; g.recalculatePower();
  g.damage(u, 1, 1); g.updateFreight(u, 10); assert.equal(u.freight.progress, 1);
  g.time += 4; g.damage(home, 1, 1); g.updateFreight(u, 5);
  assert.equal(u.freight.progress, 1, '接收设施受袭也暂停卸货');
  g.time += 4; g.updateFreight(u, 5);
  assert.equal(g.players[0].credits, initial + SUPPLY_ROUTES.air.value);
  g.updateFreight(u, 20); assert.equal(g.players[0].credits, initial + SUPPLY_ROUTES.air.value);
  const lost = g.launchFreight(0, true); g.damage(lost, lost.maxHp * 2, 1);
  assert.equal(g.logistics[0].lost, SUPPLY_ROUTES.sea.value);
  g.damage(u, u.maxHp * 2, 1); assert.equal(g.logistics[0].lost, SUPPLY_ROUTES.sea.value);
});

test('仓库被摧毁后改由指挥中心接收低额应急物资，港口被摧毁则海运停止', () => {
  const g = quiet(), u = g.launchFreight(0), warehouse = g.getEntity(u.freight.homeId);
  g.damage(warehouse, warehouse.maxHp * 2, 1); g.updateFreight(u, .05);
  assert.equal(g.getEntity(u.freight.homeId).type, 'hq'); assert.equal(u.freight.value, 180);
  assert.equal(g.launchFreight(0).freight.value, 180);
  const ship = g.launchFreight(0, true), dock = g.getEntity(ship.freight.homeId);
  g.damage(dock, dock.maxHp * 2, 1); g.updateFreight(ship, .05);
  assert.equal(ship.freight.phase, 'outbound'); assert.equal(g.launchFreight(0, true), null);
});

test('后勤载具不响应作战指令或重复补给，且不阻止全域歼灭结算', () => {
  const g = quiet(), u = g.launchFreight(0);
  g.selected = [u.id]; g.command(500, 500); assert.equal(u.order, null);
  assert.equal(g.requestResupply(u), false);
  g.selectBox(0, 0, g.world.width, g.world.height); assert.equal(g.selected.length, 0);
  g.victoryMode = 'annihilation'; g.buildings = g.buildings.filter(b => b.owner === 1);
  g.checkVictory(); assert.equal(g.winner, 1);
});

test('所有舰艇与潜艇返港逐步付费回血补弹，满弹伤舰和无武装登陆舰仍可整备', () => {
  for (const side of [0, 1]) for (const type of ['patrol', 'frigate', 'destroyer', 'carrier', 'submarine', 'landing']) {
    const g = quiet(), home = g.ownedBuildings(side, 'dock')[0];
    const u = g.addUnit(side, type, 1700, 900); g.requestResupply(u);
    Object.assign(u, g.shipBerth(u, home)); u.hp -= 100;
    const initial = g.players[side].credits;
    for (let n = 0; n < 100; n++) { g.time += .05; g.updateGroundRearm(u, .05); }
    assert.equal(u.hp, u.maxHp, type);
    assert.ok(Math.abs(initial - g.players[side].credits - 35) < .001, type);
    assert.notEqual(u.order?.type, 'rearm', type);
    if (UNITS[type].ammo) {
      u.ammo = 0; g.requestResupply(u);
      for (let n = 0; n < 500; n++) { g.time += .05; g.updateGroundRearm(u, .05); }
      assert.equal(u.ammo, UNITS[type].ammo, type); assert.notEqual(u.order?.type, 'rearm');
    }
  }
});

test('远海、敌港、断电、缺钱、交火或移动期间不能免费修舰，多个泊位分离', () => {
  const g = quiet(), home = g.ownedBuildings(0, 'dock')[0], u = g.addUnit(0, 'destroyer', 1800, 1000);
  u.hp -= 100; g.serviceShip(u, 10); assert.equal(u.hp, u.maxHp - 100);
  g.requestResupply(u); Object.assign(u, g.shipBerth(u, home));
  u.lastDamageAt = g.time; g.serviceShip(u, 10); assert.equal(u.hp, u.maxHp - 100);
  g.time += 4; u.lastMovedAt = g.time; g.serviceShip(u, 10); assert.equal(u.hp, u.maxHp - 100);
  g.time += 1; g.players[0].credits = 0; g.serviceShip(u, 10); assert.equal(u.hp, u.maxHp - 100);
  g.players[0].credits = 100; g.ownedBuildings(0, 'power')[0].hp = 0; g.recalculatePower();
  g.serviceShip(u, 10); assert.equal(u.hp, u.maxHp - 100);
  const other = g.addUnit(0, 'carrier', 1700, 1000); g.requestResupply(other);
  assert.ok(Math.hypot(g.shipBerth(other, home).x - g.shipBerth(u, home).x, g.shipBerth(other, home).y - g.shipBerth(u, home).y) >= 200);
});

test('混合舰队从远海实际返港整备，整备后驶离，不永久占住维修泊位', () => {
  const g = quiet(); g.logistics.forEach(r => { r.nextAir = r.nextSea = 1e9; });
  const ships = ['destroyer', 'carrier', 'submarine', 'landing'].map((type, index) => g.addUnit(0, type, 1500 + index * 180, 1120 + index * 100));
  ships.forEach(u => { u.hp -= 100; g.requestResupply(u); });
  advance(g, 100);
  ships.forEach(u => { assert.equal(u.hp, u.maxHp, u.type); assert.notEqual(u.order?.type, 'rearm', u.type); assert.equal(g.isNavalBlocked(u.x, u.y, 20), false); });
});

test('限时卫星侦察双方同费同冷却，不无限透视、不替代声呐，断电不能请求', () => {
  const g = quiet('valley');
  for (const side of [0, 1]) {
    g.addBuilding(side, 'radar', side ? 1840 : 400, 300);
    g.addBuilding(side, 'lab', side ? 1840 : 400, 400);
    g.addBuilding(side, 'power', side ? 1840 : 400, 200);
    g.players[side].credits = 2000;
    assert.equal(g.activateSatellite(side), true); assert.equal(g.players[side].credits, 1000);
    assert.ok(g.fogs[side].visible.every(Boolean)); assert.equal(g.activateSatellite(side), false);
  }
  g.time = 9; g.updateFog(); assert.ok(g.fogs[0].visible.some(v => !v));
  g.time = 121; g.recalculatePower(); assert.equal(g.activateSatellite(0), true);
  const sea = quiet(); sea.players[0].satelliteUntil = 8; sea.updateFog();
  const sub = sea.addUnit(1, 'submarine', 1700, 1000); assert.equal(sea.canSeeEntity(0, sub), false);
});

test('航线时间、运输阶段与卫星状态可保存恢复；无经济字段的旧存档保留采矿', () => {
  const g = quiet('valley'); g.launchFreight(0); g.players[0].satelliteUntil = 8;
  const save = g.toSave(), restored = Game.fromSave(save);
  assert.deepEqual(restored.logistics, g.logistics); assert.equal(restored.economyMode, 'convoy');
  assert.deepEqual(restored.units[0].freight, g.units[0].freight);
  const bad = structuredClone(save); bad.state.units[0].freight.value = 999999;
  assert.throws(() => validateSave(bad));
  const old = quiet('meridian').toSave(); delete old.config.economyMode; delete old.state.logistics;
  assert.equal(Game.fromSave(old).economyMode, 'mining');
});

test('新增后勤舰队模型存在，052D 原创模型与中国驱逐舰关联，经济单位不挤占军工目录', () => {
  const data = readFileSync(new URL('../assets/models/convoy-library.glb', import.meta.url));
  const length = data.readUInt32LE(12), gltf = JSON.parse(data.subarray(20, 20 + length).toString());
  for (const name of ['logistics_depot', ...FREIGHT_TYPES, 'destroyer_china']) assert.ok(gltf.nodes.some(n => n.name === name));
  assert.equal(equipmentModel('china', 'destroyer'), 'destroyer_china');
  assert.equal(equipmentModel('nato', 'destroyer'), 'destroyer');
});
