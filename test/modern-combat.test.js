import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { UNITS, WORLD } from '../src/data.js';
import { separateUnits, unitLayer, unitRadius } from '../src/unit-spacing.js';

const modernTypes = ['loiterer', 'jammer', 'laser', 'rocket', 'apc', 'supply', 'destroyer', 'carrier', 'submarine'];
const setup = (mapId = 'valley') => {
  const g = new Game('china', 'china', {}, { mapId, victoryMode: 'annihilation' });
  g.units = []; g.aiTimer = Infinity; g.aiWaveTimer = Infinity;
  g.updateFog = () => { for (const fog of g.fogs) { fog.visible.fill(true); fog.explored.fill(true); } };
  g.updateFog(); return g;
};
const advance = (g, seconds) => { for (let n = 0; n < seconds * 20; n++) g.update(.05); };

test('大型海图独立尺寸、资源、桥头、岸位与开局严格镜像，不改变旧地图', () => {
  const g = new Game('china', 'china', {}, { mapId: 'ocean' });
  assert.equal(g.world.width, 3520); assert.equal(g.world.height, 2240);
  assert.equal(new Game('china', 'china').world, WORLD);
  assert.equal(g.fog.visible.length, 44 * 28);
  assert.equal(g.players[0].credits, g.players[1].credits);
  assert.deepEqual(g.ownedUnits(0).map(u => [u.type, u.hp]), g.ownedUnits(1).map(u => [u.type, u.hp]));
  for (const a of g.ore) assert.ok(g.ore.some(b => b.x === g.world.width - a.x && b.y === g.world.height - a.y && b.kind === a.kind && b.amount === a.amount));
  for (const a of g.ownedBuildings(0)) assert.ok(g.ownedBuildings(1).some(b => b.type === a.type && b.x === g.world.width - a.x && b.y === g.world.height - a.y));
  assert.equal(g.isGroundBlocked(1760, 1120), true);
  assert.equal(g.isGroundBlocked(1760, 480), false);
  assert.equal(g.isGroundBlocked(1760, 1760), false);
});

test('九类新单位按同等设施、解锁、资金和独立生产线生产', () => {
  const g = setup('ocean'); g.updateUnit = () => {};
  for (const side of [0, 1]) {
    g.players[side].credits = 100000;
    assert.equal(g.queueUnit(side, 'loiterer'), false);
    for (const type of ['armory', 'radar', 'lab']) g.addBuilding(side, type, side ? 3050 : 470, 1500);
    for (let n = 0; n < 4; n++) g.addBuilding(side, 'power', side ? 3050 : 470, 1700 + n * 80);
    for (const type of modernTypes) assert.equal(g.queueUnit(side, type), true, type);
  }
  advance(g, 150);
  for (const type of modernTypes) {
    assert.equal(g.ownedUnits(0, type).length, 1, type);
    assert.equal(g.ownedUnits(1, type).length, 1, type);
    assert.equal(g.ownedUnits(0, type)[0].hp, g.ownedUnits(1, type)[0].hp);
  }
  const land = setup(); assert.equal(land.queueUnit(0, 'destroyer'), false); assert.equal(land.canBuild(0, 'dock'), false);
});

test('远程武器使用共享侦察但不能隔着战争迷雾自动锁定目标', () => {
  const g = setup(), launcher = g.addUnit(0, 'loiterer', 620, 700), target = g.addUnit(1, 'tank', 1120, 700);
  launcher.fireTimer = 0; g.fogs[0].visible.fill(false);
  g.updateUnit(launcher, .05); assert.equal(g.projectiles.length, 0);
  g.fogs[0].visible.fill(true); g.updateUnit(launcher, .05);
  assert.equal(g.projectiles.length, 1); assert.equal(target.hp, target.maxHp);
  const p = g.projectiles[0]; g.fogs[0].visible.fill(false); target.x += 180;
  g.updateProjectiles(.05); assert.equal(p.toX, 1120);
});

test('巡飞弹有真实飞行时间，激光拦截后不造成命中伤害', () => {
  const g = setup(), launcher = g.addUnit(0, 'loiterer', 600, 700), target = g.addUnit(1, 'tank', 1060, 700);
  g.fire(launcher, target, 95, 'loiterer'); assert.equal(target.hp, target.maxHp);
  const laser = g.addUnit(1, 'laser', 880, 760); laser.fireTimer = 0;
  advance(g, 3); assert.equal(target.hp, target.maxHp); assert.equal(g.projectiles.length, 0); assert.ok(laser.heat > 0);
});

test('电子干扰对无人机和导引弹药有效，无法改变坦克或无制导火箭', () => {
  const g = setup(), jammer = g.addUnit(0, 'jammer', 900, 700), drone = g.addUnit(1, 'drone', 1000, 700), tank = g.addUnit(1, 'tank', 1000, 820);
  g.updateElectronicWarfare(.05); assert.ok(drone.jammedUntil > g.time); assert.equal(tank.jammedUntil, undefined);
  const launcher = g.addUnit(1, 'loiterer', 960, 700), target = g.addUnit(0, 'tank', 1600, 700);
  g.launchProjectile(launcher, target, 95, 'loiterer');
  for (let i = 0; i < 24; i++) { g.time += .05; g.updateProjectiles(.05); }
  assert.equal(g.projectiles.length, 0); assert.equal(target.hp, target.maxHp);
  g.launchProjectile(launcher, target, 85, 'rocket');
  for (let i = 0; i < 24; i++) g.updateProjectiles(.05);
  assert.equal(g.projectiles[0].jam, 0); assert.equal(jammer.hp, jammer.maxHp);
});

test('激光只反无人机，热量达到阈值后停止射击并冷却恢复', () => {
  const g = setup(), laser = g.addUnit(0, 'laser', 700, 700), drone = g.addUnit(1, 'drone', 900, 700), tank = g.addUnit(1, 'tank', 900, 780), jet = g.addUnit(1, 'fighter', 900, 820);
  assert.equal(g.canAttack(laser, drone), true); assert.equal(g.canAttack(laser, tank), false); assert.equal(g.canAttack(laser, jet), false);
  for (let n = 0; n < 3; n++) g.laserHeat(laser);
  assert.equal(laser.overheated, true); laser.fireTimer = 0;
  g.updateUnit(laser, .05); assert.equal(drone.hp, drone.maxHp);
  g.updateElectronicWarfare(5); assert.equal(laser.overheated, false);
});

test('火箭炮需要展开、不能近射，区域伤害不误伤友军或攻击飞机', () => {
  const g = setup(), rocket = g.addUnit(0, 'rocket', 620, 700), target = g.addUnit(1, 'tank', 1180, 700);
  rocket.fireTimer = 0; rocket.order = { type: 'attack', targetId: target.id, x: target.x, y: target.y };
  for (let n = 0; n < 39; n++) g.updateUnit(rocket, .05);
  assert.equal(g.projectiles.length, 0); g.updateUnit(rocket, .05); assert.equal(g.projectiles.length, 1); assert.equal(rocket.ammo, 5);
  const ally = g.addUnit(0, 'tank', 1180, 710), second = g.addUnit(1, 'rifle', 1180, 725), jet = g.addUnit(1, 'fighter', 1180, 715);
  for (let n = 0; n < 45; n++) { g.time += .05; g.updateProjectiles(.05); }
  assert.ok(target.hp < target.maxHp); assert.ok(second.hp < second.maxHp); assert.equal(ally.hp, ally.maxHp); assert.equal(jet.hp, jet.maxHp);
  target.x = 700; rocket.fireTimer = 0; rocket.deployProgress = 2; rocket.lastMovedAt = -10;
  g.updateUnit(rocket, .05); assert.equal(rocket.ammo, 5); assert.ok(rocket.x < 620);
});

test('运输车装载四名乘员，隐藏乘员视野和火力，下车恢复而不复制单位', () => {
  const g = setup(), apc = g.addUnit(0, 'apc', 700, 700), passengers = [];
  for (let n = 0; n < 5; n++) {
    const u = g.addUnit(0, n === 0 ? 'engineer' : 'rifle', 715, 700); passengers.push(u);
    u.order = { type: 'board', targetId: apc.id }; g.updateUnit(u, .05);
  }
  assert.equal(apc.passengers.length, 4); assert.equal(g.activeUnits(0).length, 2); assert.equal(g.ownedUnits(0).length, 6);
  assert.equal(g.canSeeEntity(0, passengers[0]), false); assert.equal(g.canAttack(passengers[4], passengers[0]), false);
  g.selected = [passengers[0].id]; g.selectAllCombat(); assert.ok(!g.selected.includes(passengers[0].id));
  assert.equal(g.unloadTransport(apc), 4); assert.equal(apc.passengers.length, 0); assert.equal(g.activeUnits(0).length, 6);
  assert.equal(new Set(g.units.map(u => u.id)).size, 6);
});

test('车毁乘员受伤撤出，瘫痪及装载乘员不参与位置分离', () => {
  const g = setup(), apc = g.addUnit(0, 'apc', 700, 700), u = g.addUnit(0, 'rifle', 710, 700);
  u.order = { type: 'board', targetId: apc.id }; g.updateUnit(u, .05);
  const before = { x: u.x, y: u.y }; separateUnits(g.units, .05, () => true);
  assert.deepEqual({ x: u.x, y: u.y }, before);
  g.damage(apc, apc.maxHp * 2, 1); assert.equal(u.embarkedIn, null); assert.equal(u.hp, u.maxHp / 2); assert.equal(apc.passengers.length, 0);
});

test('补给消耗有限库存和资金，只帮助友军，移动与刚受攻击时不能维修', () => {
  const g = setup(), supply = g.addUnit(0, 'supply', 700, 700), tank = g.addUnit(0, 'tank', 760, 700), enemy = g.addUnit(1, 'tank', 760, 740);
  tank.hp = 200; enemy.hp = 200; g.players[0].credits = 100;
  supply.order = { type: 'move', x: 1000, y: 700 }; g.updateSupply(supply, 1); assert.equal(tank.hp, 200);
  supply.order = null; tank.lastDamageAt = g.time; g.updateSupply(supply, 1); assert.equal(tank.hp, 200);
  g.time = 4; g.updateSupply(supply, 1); assert.equal(tank.hp, 224); assert.equal(enemy.hp, 200); assert.ok(supply.stock < 120); assert.ok(g.players[0].credits < 100);
  g.players[0].credits = 0; g.updateSupply(supply, 1); assert.equal(tank.hp, 224);
});

test('前线补弹有费用和间隔；地面补给不依赖空军基地', () => {
  const g = setup(), supply = g.addUnit(0, 'supply', 700, 700), rocket = g.addUnit(0, 'rocket', 765, 700);
  rocket.ammo = 0; rocket.order = { type: 'rearm' }; rocket.resumeOrder = { type: 'attackMove', x: 1200, y: 700 };
  const cash = g.players[0].credits; g.updateSupply(supply, .05); assert.equal(rocket.ammo, 1); assert.equal(g.players[0].credits, cash - 10);
  g.updateSupply(supply, .05); assert.equal(rocket.ammo, 1);
  for (let n = 0; n < 61; n++) g.updateSupply(supply, .05);
  assert.equal(rocket.ammo, 3); assert.equal(rocket.order.type, 'attackMove');
  supply.stock = 0; supply.x = 520; supply.y = 705; g.players[0].credits = 1000;
  for (let n = 0; n < 162; n++) g.updateSupply(supply, .05);
  assert.equal(supply.stock, 120); assert.equal(g.players[0].credits, 900);
});

test('潜艇不能被普通地面或空军发现和攻击，声呐与发射暴露形成反制', () => {
  const g = setup('ocean'), sub = g.addUnit(1, 'submarine', 1580, 1000), radar = g.addBuilding(0, 'radar', 1500, 1000), tank = g.addUnit(0, 'tank', 1510, 1000), strike = g.addUnit(0, 'strike', 1510, 1000);
  assert.equal(g.canSeeEntity(0, sub), false); assert.equal(g.canAttack(tank, sub), false); assert.equal(g.canAttack(strike, sub), false); assert.equal(g.canAttack(radar, sub), false);
  const escort = g.addUnit(0, 'frigate', 1400, 1000); assert.equal(g.canSeeEntity(0, sub), true); assert.equal(g.canAttack(escort, sub), true);
  escort.x = 1100; assert.equal(g.canSeeEntity(0, sub), false);
  g.fire(sub, escort, 110, 'submarine'); assert.equal(g.canSeeEntity(0, sub), true);
  g.time = 5; assert.equal(g.canSeeEntity(0, sub), false);
  assert.equal(g.canAttack(sub, tank), false); assert.equal(g.canAttack(sub, escort), true);
});

test('水下与水面分层，大舰体型计入出生、编队和岸线限制', () => {
  const g = setup('ocean'), carrier = g.addUnit(0, 'carrier', 1600, 1000), sub = g.addUnit(0, 'submarine', 1600, 1000);
  assert.notEqual(unitLayer(carrier), unitLayer(sub));
  separateUnits([carrier, sub], .05, () => true); assert.equal(carrier.x, sub.x); assert.equal(carrier.y, sub.y);
  assert.equal(g.canOccupyUnit(carrier, { x: 1050, y: 1000 }), false);
  const spawn = g.findNavalSpawn(g.ownedBuildings(0, 'dock')[0], 'carrier'); assert.ok(spawn.x >= g.map.water.x1 + unitRadius(carrier));
  const goal = g.resolveMoveGoal(carrier, 10, 1120); assert.equal(goal.x, g.map.water.x1 + 92);
});

test('航母最多同时出动三机，飞机被击落永久损失，激光不能击落高空舰载机', () => {
  const g = setup('ocean'), carrier = g.addUnit(0, 'carrier', 1300, 1100), enemy = g.addUnit(1, 'destroyer', 1900, 1100);
  for (let n = 0; n < 3; n++) assert.equal(g.launchProjectile(carrier, enemy, 95, 'carrier'), true);
  assert.equal(g.launchProjectile(carrier, enemy, 95, 'carrier'), false);
  const laser = g.addUnit(1, 'laser', 1340, 1000); laser.fireTimer = 0;
  g.updateProjectiles(.05); assert.equal(g.projectiles.length, 3); assert.equal(laser.fireTimer, 0);
  g.projectiles[0].hp = 0; g.updateProjectiles(.05); assert.equal(carrier.wing, 2); assert.equal(g.projectiles.length, 2);
});

test('航母飞机能够打击后返回移动母舰，损失补充须泊港付费', () => {
  const g = setup('ocean'), carrier = g.addUnit(0, 'carrier', 1300, 1100), target = g.addUnit(1, 'patrol', 1700, 1100);
  target.fireTimer = 100; g.launchProjectile(carrier, target, 95, 'carrier');
  for (let n = 0; n < 60; n++) g.updateProjectiles(.05);
  assert.ok(target.hp < target.maxHp); assert.equal(g.projectiles[0].returning, true);
  carrier.y += 90;
  for (let n = 0; n < 80; n++) g.updateProjectiles(.05);
  assert.equal(g.projectiles.length, 0); assert.equal(carrier.wing, 3);
  carrier.x = 1140; carrier.y = 1120; carrier.wing = 2; carrier.ammo = 6; carrier.order = { type: 'rearm' }; g.players[0].credits = 1000;
  for (let n = 0; n < 162; n++) g.updateGroundRearm(carrier, .05);
  assert.equal(carrier.wing, 3); assert.equal(g.players[0].credits, 850);
});

test('电脑使用全部新生产类型，不绕过雷达、实验室和地图限制', () => {
  const g = setup('ocean'); g.time = 150;
  for (const type of ['armory', 'radar', 'lab', 'airfield']) g.addBuilding(1, type, 3000, 1550);
  g.addUnit(1, 'strike', 3000, 1500);
  g.players[1].credits = 100000; g.players[1].aiPlanIndex = 99;
  const produced = new Set(), original = g.queueUnit;
  g.queueUnit = function(side, type) { const result = original.call(this, side, type); if (result) { produced.add(type); this.addUnit(side, type, 3000, 1500); } return result; };
  for (let n = 0; n < 24; n++) {
    for (const b of g.ownedBuildings(1)) { b.queue = []; b.active = null; }
    g.updateAI();
  }
  for (const type of modernTypes) assert.ok(produced.has(type), type);
});

test('装载乘员不被范围技能二次命中，也不独立提供战争迷雾视野', () => {
  const g = new Game('russia', 'china', {}, { victoryMode: 'annihilation' });
  g.units = []; g.aiTimer = Infinity; g.aiWaveTimer = Infinity;
  const transport = g.addUnit(1, 'apc', 800, 700), scout = g.addUnit(1, 'scout', 810, 700);
  scout.order = { type: 'board', targetId: transport.id }; g.updateUnit(scout, .05);
  const attacker = g.addUnit(0, 'scout', 750, 700); g.addBuilding(0, 'super', 300, 500);
  g.addBuilding(0, 'power', 400, 500); g.recalculatePower(); g.players[0].abilityCharge = 100;
  g.updateFog(); assert.equal(g.isVisibleFor(1, 1170, 700), false);
  assert.equal(g.castAbility(transport.x, transport.y), true);
  assert.equal(scout.hp, scout.maxHp); assert.ok(transport.hp < transport.maxHp); assert.ok(attacker.hp > 0);
});

test('海图 AI 不再生产矿车，子午 AI 将在产矿车计入目标数量', () => {
  const g = new Game('china', 'russia', {}, { mapId: 'ocean' });
  const factory = g.ownedBuildings(1, 'factory')[0];
  for (let n = 0; n < 8; n++) g.updateAI();
  assert.equal(factory.queue.filter(type => type === 'harvester').length, 0);
  assert.equal(g.ownedUnits(1, 'harvester').length, 0);
  const moon = new Game('china', 'russia', {}, { mapId: 'meridian' });
  moon.ownedUnits(1, 'harvester')[0].hp = 0;
  for (let n = 0; n < 8; n++) moon.updateAI();
  assert.equal(moon.ownedBuildings(1, 'factory')[0].queue.filter(type => type === 'harvester').length, 1);
});

test('驱逐舰导弹能追上高速战机，不因弹速低于飞机而失去防空能力', () => {
  const g = setup('ocean'), destroyer = g.addUnit(0, 'destroyer', 1400, 1120), fighter = g.addUnit(1, 'fighter', 1840, 1120);
  g.launchProjectile(destroyer, fighter, 72, 'destroyer');
  assert.ok(g.projectiles[0].speed > UNITS.fighter.speed);
  for (let n = 0; n < 80 && g.projectiles.length; n++) { fighter.x += UNITS.fighter.speed * .05; g.updateProjectiles(.05); }
  assert.equal(fighter.hp, fighter.maxHp - 72); assert.equal(g.projectiles.length, 0);
});
