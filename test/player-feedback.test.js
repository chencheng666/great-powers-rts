import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Game } from '../src/game.js';
import { UNITS } from '../src/data.js';
import { equipmentModel, equipmentProfile } from '../src/equipment.js';
import { createSpaceAircraft } from '../src/feedback-models.js';
import { projectileFlightPose } from '../src/projectile-flight.js';
import { parseSave } from '../src/savegame.js';

function setup(mapId = 'valley') {
  const g = new Game('china', 'china', {}, { mapId, victoryMode: 'annihilation' });
  g.units = []; g.time = 20; g.aiTimer = 100000; g.aiWaveTimer = 100000;
  for (const side of [0, 1]) { g.players[side].credits = 100000; for (let i = 0; i < 4; i++) g.addBuilding(side, 'power', side ? g.world.width - 320 : 320, 200 + i * 100); g.fogs[side].visible.fill(true); g.fogs[side].explored.fill(true); }
  return g;
}
const ticks = (g, u, seconds) => { for (let i = 0; i < seconds * 20; i++) { g.time += .05; g.updateUnit(u, .05); } };

test('满弹伤兵与坦克可主动整备，兵营和工厂逐步付费回血直到完成，双方相同', () => {
  for (const side of [0, 1]) for (const type of ['rifle', 'tank', 'engineer', 'scout']) {
    const g = setup(), b = g.ownedBuildings(side, UNITS[type].tags.includes('infantry') ? 'barracks' : 'factory')[0];
    const u = g.addUnit(side, type, b.x + (side ? -1 : 1) * (b.size * .55 + 30), b.y); u.hp -= 50;
    assert.equal(g.requestResupply(u), true); const before = g.players[side].credits;
    ticks(g, u, .5); assert.ok(u.hp > u.maxHp - 50 && u.hp < u.maxHp); assert.equal(u.order.type, 'rearm');
    ticks(g, u, 6); assert.equal(u.hp, u.maxHp); assert.equal(u.order, null); assert.ok(g.players[side].credits < before);
  }
});

test('停驻设施旁空闲陆军自动维修补弹；满弹不影响维修，持续受击和断电不生效', () => {
  const g = setup(), b = g.ownedBuildings(0, 'barracks')[0], u = g.addUnit(0, 'rifle', b.x + 65, b.y); u.hp = 60; u.ammo = 15;
  ticks(g, u, 5); assert.equal(u.hp, u.maxHp); assert.equal(u.ammo, UNITS.rifle.ammo);
  u.hp = 50; u.ammo = 10; u.lastDamageAt = g.time; ticks(g, u, 2); assert.equal(u.hp, 50); assert.equal(u.ammo, 10);
  g.hasPower = () => false; ticks(g, u, 5); assert.equal(u.hp, 50); assert.equal(u.ammo, 10);
});

test('移动中、缺钱、敌方设施或设施被毁不能免费维修补弹', () => {
  const g = setup(), b = g.ownedBuildings(0, 'factory')[0], u = g.addUnit(0, 'tank', b.x + 85, b.y); u.hp = 100; u.ammo = 5;
  u.lastMovedAt = g.time; g.serviceGroundUnit(u, .1); assert.equal(u.hp, 100);
  g.time += 1; g.players[0].credits = 0; g.serviceGroundUnit(u, 1); g.refillStationAmmo(u, 1); assert.equal(u.hp, 100); assert.equal(u.ammo, 5);
  g.players[0].credits = 1000; b.owner = 1; assert.equal(g.serviceGroundUnit(u, 1, b), false); b.owner = 0; b.hp = 0; assert.equal(g.serviceGroundUnit(u, 1, b), false);
});

test('巡逻真实往返，发现敌人交火，补给恢复巡逻，停止及新命令清除旧任务', () => {
  const g = setup(), u = g.addUnit(0, 'tank', 700, 650); g.selected = [u.id]; g.orderMode = 'patrol'; g.command(1000, 650);
  const order = structuredClone(u.order); ticks(g, u, 5); assert.equal(u.order.type, 'patrol'); assert.ok(u.order.x === order.originX);
  const enemy = g.addUnit(1, 'rifle', u.x + 70, u.y); u.fireTimer = 0; g.updateUnit(u, .05); assert.ok(u.ammo < UNITS.tank.ammo);
  enemy.hp = 0; g.requestResupply(u); assert.equal(u.resumeOrder.type, 'patrol'); g.restoreCombatOrder(u); assert.equal(u.order.type, 'patrol');
  g.stopSelected(); assert.equal(u.order, null); assert.equal(u.resumeOrder, null);
  g.command(900, 800); assert.equal(u.order.type, 'move');
});

test('巡逻起终点及返场恢复任务可存档，恶意巡逻坐标拒绝；读档不强制放置待部署建筑', () => {
  const g = setup(), u = g.addUnit(0, 'tank', 700, 650); g.selected = [u.id]; g.orderMode = 'patrol'; g.command(1000, 650); g.requestResupply(u);
  g.pendingBuilding = 'power'; g.placingBuilding = true; const save = g.toSave(), restored = Game.fromSave(save);
  assert.deepEqual(restored.getEntity(u.id).resumeOrder, u.resumeOrder); assert.equal(restored.pendingBuilding, 'power'); assert.equal(restored.placingBuilding, false);
  save.state.units[0].resumeOrder.originX = -1; assert.throws(() => parseSave(JSON.stringify(save)));
});

test('矿车能接受手动移动并按剩余生命回收，不能回收敌人或重复退款', () => {
  const g = setup('meridian'), u = g.addUnit(0, 'harvester', 700, 500); g.selected = [u.id]; g.command(850, 500); ticks(g, u, 2);
  assert.ok(u.x > 750); u.hp = u.maxHp / 2; const before = g.players[0].credits; assert.equal(g.sellHarvester(0, u.id), true);
  assert.equal(g.players[0].credits - before, Math.floor(g.unitCost(0, 'harvester') / 4)); assert.equal(g.sellHarvester(0, u.id), false);
  assert.equal(g.sellHarvester(1, g.addUnit(0, 'harvester', 900, 500).id), false);
});

test('着陆补给飞机可被坦克和炮塔攻击，飞行状态恢复原空地克制', () => {
  const g = setup(), airfield = g.addBuilding(1, 'airfield', 1500, 600), plane = g.addUnit(1, 'fighter', airfield.x + 60, airfield.y);
  const tank = g.addUnit(0, 'tank', 1400, 600), aa = g.addUnit(0, 'aa', 1400, 650), turret = g.addBuilding(0, 'turret', 1400, 700);
  plane.order = { type: 'rearm' }; assert.equal(g.aircraftGrounded(plane), true); assert.equal(g.canAttack(tank, plane), true); assert.equal(g.canAttack(turret, plane), true); assert.equal(g.canAttack(aa, plane), false);
  plane.order = { type: 'move', x: 1600, y: 600 }; assert.equal(g.aircraftGrounded(plane), false); assert.equal(g.canAttack(tank, plane), false); assert.equal(g.canAttack(aa, plane), true);
});

test('轰炸机必须飞临目标，炸弹垂直落下，不横向追踪；投弹后返航而非原地刷火力', () => {
  const g = setup('frontier'), b = g.addBuilding(0, 'airfield', 650, 1000), u = g.addUnit(0, 'bomber', 800, 1000), enemy = g.addBuilding(1, 'factory', 1000, 1000);
  u.order = { type: 'attack', targetId: enemy.id, x: enemy.x, y: enemy.y }; u.fireTimer = 0;
  g.updateUnit(u, .05); assert.equal(g.projectiles.length, 0);
  ticks(g, u, 2); assert.ok(g.projectiles.length > 0); assert.equal(u.order.type, 'rearm');
  const p = g.projectiles[0]; assert.equal(p.startX, p.toX); assert.equal(p.startY, p.toY); const h = projectileFlightPose(p).height;
  g.updateProjectiles(.5); assert.ok(projectileFlightPose(p).height < h); assert.equal(enemy.hp, enemy.maxHp);
  g.updateProjectiles(.7); assert.ok(enemy.hp < enemy.maxHp); assert.equal(b.hp, b.maxHp);
});

test('电子压制机有限周期短距压制防空，制空机及范围外防空可反制，不能在机场展开', () => {
  for (const side of [0, 1]) {
    const g = setup(), u = g.addUnit(side, 'ewPlane', 1000, 700), aa = g.addUnit(1 - side, 'aa', 1100, 700), distant = g.addUnit(1 - side, 'aa', 1400, 700), fighter = g.addUnit(1 - side, 'fighter', 1080, 730);
    g.updateElectronicWarfare(.05); assert.ok(aa.ewSuppressedUntil > g.time); assert.equal(distant.ewSuppressedUntil, undefined); assert.equal(fighter.ewSuppressedUntil, undefined);
    assert.equal(g.canAttack(fighter, u), true); assert.equal(g.canAttack(u, fighter), false);
    g.time = 25; g.updateElectronicWarfare(.05); assert.ok(aa.ewSuppressedUntil < g.time);
    const b = g.addBuilding(side, 'airfield', 1000, 700); u.x = b.x; u.y = b.y; g.time = 30; aa.ewSuppressedUntil = 0; g.updateElectronicWarfare(.05); assert.equal(aa.ewSuppressedUntil, 0);
  }
});

test('无桥海图两岸完全隔离且镜像，双方可正常生产重型海军和运输单位，旧海图仍保留桥', () => {
  const g = setup('archipelago'); assert.equal(g.map.bridges.length, 0); assert.equal(g.isGroundBlocked(1760, 480), true); assert.equal(new Game('china', 'china', {}, { mapId: 'ocean' }).isGroundBlocked(1760, 480), false);
  for (const side of [0, 1]) { for (const type of ['radar', 'lab', 'airfield']) g.addBuilding(side, type, side ? 2800 : 720, 1300);
    for (const type of ['landing', 'destroyer', 'carrier', 'submarine', 'navalFighter', 'navalStrike', 'ewPlane']) assert.equal(g.queueUnit(side, type), true, type);
  }
  assert.equal(g.players[0].credits, g.players[1].credits); assert.equal(g.toSave().config.mapId, 'archipelago');
});

test('电子压制实际阻止防空射击与导弹拦截，周期结束后恢复且正常消耗弹药', () => {
  const g = setup(), plane = g.addUnit(0, 'ewPlane', 1000, 700), aa = g.addUnit(1, 'aa', 1100, 700);
  aa.fireTimer = 0; const ammo = aa.ammo;
  g.updateElectronicWarfare(.05); g.updateUnit(aa, .05); assert.equal(aa.ammo, ammo);
  g.launchProjectile(plane, aa, 40, 'missile'); const p = g.projectiles[0];
  g.updateProjectiles(.01); assert.equal(p.hp, 38); assert.equal(aa.ammo, ammo);
  g.time = 25; aa.fireTimer = 0; g.updateElectronicWarfare(.05); g.updateProjectiles(.01);
  assert.equal(aa.ammo, ammo - 1); assert.ok(p.hp < 38);
  g.projectiles = []; aa.fireTimer = 0; g.updateUnit(aa, .05); assert.equal(aa.ammo, ammo - 2);
});

test('月表七类飞机使用独立原创几何，常规飞机和阵营平衡不变，模型坐标与法线有限', () => {
  for (const type of ['fighter', 'strike', 'bomber', 'airlift', 'freightPlane', 'aegis', 'ewPlane']) {
    assert.equal(equipmentModel('china', type, true), `space_${type}`); assert.ok(equipmentProfile('china', type, true).category.startsWith('原创'));
    const model = createSpaceAircraft(type), box = new THREE.Box3().setFromObject(model); assert.ok(box.max.x > box.min.x && box.max.z > box.min.z);
    model.traverse(m => { if (m.isMesh) for (const a of ['position', 'normal']) assert.ok([...m.geometry.attributes[a].array].every(Number.isFinite)); });
  }
  assert.equal(equipmentModel('china', 'fighter'), 'fighter');
});
