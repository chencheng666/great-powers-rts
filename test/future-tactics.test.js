import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Game } from '../src/game.js';
import { FACTIONS, MAPS, UNITS } from '../src/data.js';
import { equipmentProfile, equipmentModel } from '../src/equipment.js';
import { armorFacing, tacticalDamage, inCover, weatherState, hasSignalCover } from '../src/tactical-rules.js';

const setup = (mapId = 'meridian', victoryMode = 'control') => {
  const game = new Game('china', 'china', {}, { mapId, victoryMode });
  game.aiTimer = Infinity; game.aiWaveTimer = Infinity;
  return game;
};

test('现代防空车只对空，低空攻击无人机不能迎击高空战机，双方一致', () => {
  const g = setup();
  for (const side of [0,1]) {
    const aa = g.addUnit(side,'aa',1000,1000), drone = g.addUnit(side,'drone',1000,1100);
    const tank = g.addUnit(1-side,'tank',1200,1000), jet = g.addUnit(1-side,'fighter',1200,1100), targetDrone = g.addUnit(1-side,'drone',1200,1200);
    assert.equal(g.canAttack(aa,tank),false); assert.equal(g.canAttack(aa,jet),true); assert.equal(g.canAttack(aa,targetDrone),true);
    assert.equal(g.canAttack(drone,jet),false); assert.equal(g.canAttack(drone,tank),true);
  }
});

test('五阵营现实原型有公开来源，原创装备不冒充现役，十种坦克与火箭炮模型独立', () => {
  const names = new Set();
  for (const faction of Object.keys(FACTIONS)) {
    for (const type of ['tank', 'rocket', 'fighter']) { const profile = equipmentProfile(faction, type); assert.equal(profile.category, '现实原型'); assert.ok(profile.source.startsWith('https://')); }
    for (const type of ['elite', 'railgun', 'aegis', 'relay', 'ghost']) assert.equal(equipmentProfile(faction, type).category, '原创／概念装备');
    for (const type of ['tank', 'rocket']) names.add(equipmentModel(faction, type));
  }
  assert.equal(names.size, 10);
  const bytes = readFileSync(new URL('../assets/models/equipment-library.glb', import.meta.url));
  const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
  const roots = json.scenes[0].nodes.map(index => json.nodes[index].name);
  assert.equal(roots.length, 26); assert.equal(new Set(roots).size, 26);
  for (const name of [...names, 'future_hq', 'future_power', 'future_factory', 'future_beacon', 'railgun', 'aegis', 'relay']) assert.ok(roots.includes(name), name);
});

test('子午环阵资源、阻挡区、掩体及信标严格镜像，双方开局相等', () => {
  const g = setup(), map = MAPS.meridian;
  assert.equal(g.world.width, 3200); assert.equal(g.world.height, 2080);
  for (const ore of g.ore) assert.ok(g.ore.some(other => other.x === 3200 - ore.x && other.y === 2080 - ore.y && other.kind === ore.kind && other.amount === ore.amount));
  for (const zones of [map.barriers, map.noBuild, map.cover]) for (const zone of zones) assert.ok(zones.some(other => other.x1 === 3200 - zone.x2 && other.x2 === 3200 - zone.x1 && other.y1 === 2080 - zone.y2 && other.y2 === 2080 - zone.y1));
  for (const site of g.beacons) assert.ok(g.beacons.some(other => other.x === 3200 - site.x && other.y === 2080 - site.y));
  assert.deepEqual(g.ownedUnits(0).map(u => [u.type, u.hp]), g.ownedUnits(1).map(u => [u.type, u.hp]));
});

test('坦克正侧后装甲有确定差异，镜像角度和双方伤害规则一致', () => {
  const g = setup(), target = g.addUnit(0, 'tank', 700, 700); target.angle = 0;
  const source = g.addUnit(1, 'tank', 900, 700);
  assert.equal(armorFacing(source, target).multiplier, .82);
  const front = g.unitDamage(source, target); source.x = 700; source.y = 900;
  assert.equal(armorFacing(source, target).multiplier, 1); assert.ok(g.unitDamage(source, target) > front);
  source.x = 500; source.y = 700; const rear = g.unitDamage(source, target); assert.ok(rear > front);
  const mirroredTarget = g.addUnit(1, 'tank', 2500, 1380); mirroredTarget.angle = Math.PI;
  const mirroredSource = g.addUnit(0, 'tank', 2700, 1380);
  assert.equal(g.unitDamage(mirroredSource, mirroredTarget), rear);
});

test('掩体只保护区域内步兵，范围及重穿透火力不被掩体减免', () => {
  const g = setup(), rifle = g.addUnit(1, 'rifle', 1000, 800), source = g.addUnit(0, 'tank', 800, 800);
  assert.equal(inCover(g.map, rifle), true); assert.equal(tacticalDamage(g.map, source, rifle), .72);
  for (const type of ['rocket', 'strike', 'loiterer', 'railgun']) assert.equal(tacticalDamage(g.map, { type }, rifle), 1);
  rifle.x = 800; assert.equal(inCover(g.map, rifle), false);
  assert.equal(inCover(g.map, g.addUnit(1, 'tank', 1000, 800)), false);
});

test('三种科幻单位仅新地图生产，双方共享科技、费用、弹药与制空限制', () => {
  for (const side of [0, 1]) {
    const g = setup(); g.players[side].credits = 50000;
    for (const type of ['railgun', 'aegis', 'relay']) assert.equal(g.queueUnit(side, type), false);
    for (const type of ['radar', 'lab', 'armory', 'airfield', 'power']) g.addBuilding(side, type, side ? 2600 : 600, 1500);
    for (const type of ['railgun', 'aegis', 'relay']) assert.equal(g.queueUnit(side, type), true);
    const railgun = g.addUnit(side, 'railgun', 900, 900), aegis = g.addUnit(side, 'aegis', 900, 1000), tank = g.addUnit(1 - side, 'tank', 1050, 900), jet = g.addUnit(1 - side, 'fighter', 1050, 1000);
    assert.equal(g.canAttack(railgun, tank), true); assert.equal(g.canAttack(railgun, jet), false);
    assert.equal(g.canAttack(aegis, jet), true); assert.equal(g.canAttack(aegis, tank), false);
    assert.equal(railgun.ammo, UNITS.railgun.ammo); assert.equal(aegis.ammo, UNITS.aegis.ammo);
    const old = setup('valley'); old.players[side].credits = 50000;
    for (const type of ['radar', 'lab', 'armory', 'airfield']) old.addBuilding(side, type, 700, 700);
    for (const type of ['railgun', 'aegis', 'relay']) assert.equal(old.queueUnit(side, type), false);
  }
});

test('离子扰动周期可预测，两方空军同受影响，只有本方通信设施提供保障', () => {
  const g = setup(); assert.equal(weatherState(g.map, 79).phase, 'clear'); assert.equal(weatherState(g.map, 80).phase, 'warning'); assert.equal(weatherState(g.map, 100).phase, 'storm'); assert.equal(weatherState(g.map, 125).phase, 'clear');
  assert.equal(weatherState(MAPS.valley, 105).phase, 'clear');
  g.time = 105;
  const a = g.addUnit(0, 'aegis', 900, 900), b = g.addUnit(1, 'aegis', 2300, 1180);
  g.updateElectronicWarfare(.05); assert.equal(a.jammedUntil, b.jammedUntil);
  const relay = g.addUnit(0, 'relay', 900, 900); assert.equal(hasSignalCover(g, 0, a), true); assert.equal(hasSignalCover(g, 1, a), false);
  a.jammedUntil = 0; g.updateElectronicWarfare(.05); assert.equal(a.jammedUntil, 0);
  relay.stunUntil = 110; assert.equal(hasSignalCover(g, 0, a), false);
  g.beacons[0].owner = 0; a.x = g.beacons[0].x; a.y = g.beacons[0].y; assert.equal(hasSignalCover(g, 0, a), true);
});

test('未来装备通过正常队列出厂，双方同费同生命同弹药，非免费生成', () => {
  const g = setup(); g.updateUnit = () => {};
  for (const side of [0, 1]) {
    g.players[side].credits = 20000;
    for (const type of ['radar','lab','armory','airfield']) g.addBuilding(side,type,side ? 2600 : 600,1600);
    for (let i = 0; i < 4; i++) g.addBuilding(side,'power',side ? 2700 : 500,300+i*110);
    for (const type of ['railgun','aegis','relay']) g.queueUnit(side,type);
  }
  for (let i = 0; i < 1500; i++) g.update(.05);
  for (const type of ['railgun','aegis','relay']) {
    const a = g.ownedUnits(0,type), b = g.ownedUnits(1,type);
    assert.equal(a.length,1); assert.equal(b.length,1);
    assert.equal(a[0].hp,b[0].hp); assert.equal(a[0].ammo,b[0].ammo);
  }
  assert.equal(g.players[0].credits,g.players[1].credits);
  assert.ok(Math.abs(g.players[0].credits-(20000-UNITS.railgun.cost-UNITS.aegis.cost-UNITS.relay.cost)) < 1e-6);
});

test('扰动摧毁无保障的巡飞弹，中继保护制导但不使火箭或地面车受影响', () => {
  for (const protectedSignal of [false,true]) {
    const g = setup(); g.units = []; g.time = 105;
    const source = g.addUnit(0,'loiterer',800,900), target = g.addUnit(1,'tank',1300,900);
    if (protectedSignal) g.addUnit(0,'relay',800,900);
    g.launchProjectile(source,target,50,'loiterer');
    for (let i = 0; i < 24; i++) { g.time += .05; g.updateProjectiles(.05); }
    assert.equal(g.projectiles.length,protectedSignal ? 1 : 0);
    if (protectedSignal) assert.equal(g.projectiles[0].jam,0);
    assert.equal(target.hp,target.maxHp);
    g.launchProjectile(source,target,50,'rocket'); g.updateProjectiles(.05);
    assert.equal(g.projectiles.at(-1).jam,0); g.updateElectronicWarfare(.05); assert.equal(source.jammedUntil,undefined);
  }
});

test('据点按实际占领数计分，暂停不增分，双方同时达标判平局', () => {
  const g = setup(); g.units = []; g.beacons[0].owner = 0; g.beacons[2].owner = 1;
  g.update(.05); assert.equal(g.players[0].controlScore, .05); assert.equal(g.players[1].controlScore, .05);
  g.paused = true; g.update(.05); assert.equal(g.players[0].controlScore, .05); g.paused = false;
  g.players[0].controlScore = 239.99; g.players[1].controlScore = 239.99; g.update(.05); assert.equal(g.winner, 'draw');
  const single = setup(); single.players[0].controlScore = 240; single.checkVictory(); assert.equal(single.winner, 0);
});

test('科幻信标供电可撤销，华夏炮塔减伤不偏袒玩家', () => {
  const g = setup(); g.recalculatePower(); const power = g.players[0].powerIn;
  g.beacons[0].owner = 0; g.recalculatePower(); assert.equal(g.players[0].powerIn, power + 40);
  g.beacons[0].owner = 1; g.recalculatePower(); assert.equal(g.players[0].powerIn, power);
  const a = g.addBuilding(0, 'turret', 700, 700), b = g.addBuilding(1, 'turret', 2500, 1380);
  g.damage(a, 100, 1); g.damage(b, 100, 0); assert.equal(a.hp, b.hp); assert.equal(a.maxHp - a.hp, 85);
});

test('科幻地图 AI 侦察出厂不依赖不存在的桥，争夺已侦察信标', () => {
  const g = setup(); g.players[1].credits = 10000; assert.equal(g.queueUnit(1, 'scout'), true);
  for (let i = 0; i < 400; i++) g.update(.05);
  assert.ok(g.ownedUnits(1, 'scout').length);
  g.fogs[1].explored.fill(true);
  for (let i = 0; i < 4; i++) g.addUnit(1, 'tank', 2000 + i * 80, 1000);
  g.launchAIWave(); assert.ok(g.ownedUnits(1, 'tank').some(unit => unit.order?.type === 'attackMove' && unit.order.x > 1500));
});
