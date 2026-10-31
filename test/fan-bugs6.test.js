import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Game } from '../src/game.js';
import { MAPS, UNITS, supportsModernMap, supportsNuclearMap } from '../src/data.js';
import { validateSave } from '../src/savegame.js';
import { airfieldParking } from '../src/airfield-rules.js';
import { airframeScale, flightScaleFactor, armyComposition, unitRole } from '../src/feedback6-presentation.js';
import { refineNavalWeapons } from '../src/naval-presentation.js';

function setup(mapId = 'valley', nuclearEnabled = false) {
  const g = new Game('china', 'nato', {}, { mapId, nuclearEnabled, victoryMode: 'annihilation' });
  g.units = []; g.aiTimer = g.aiWaveTimer = 1e9; g.closestEnemy = () => null;
  g.hasPower = () => true; g.players.forEach(p => { p.credits = 100000; });
  return g;
}
function advance(g, seconds, done = () => false) {
  for (let i = 0; i < seconds * 20 && !done(); i++) g.update(.05);
}

test('常规海陆地图均能生产直升机、常规弹道车及反导车；核开关默认关闭', () => {
  for (const mapId of Object.keys(MAPS).filter(supportsModernMap)) {
    const g = setup(mapId);
    for (const side of [0, 1]) {
      for (const type of ['airfield', 'armory', 'radar', 'lab']) if (!g.hasBuilding(side, type)) g.addBuilding(side, type, side ? 2000 : 500, 600);
      for (const type of ['helicopter', 'ballistic', 'abm']) assert.equal(g.queueUnit(side, type), true, `${mapId} ${side} ${type}`);
      assert.equal(g.canBuild(side, 'nuclearSilo'), false);
    }
    if (supportsNuclearMap(mapId)) {
      const nuclear = setup(mapId, true); nuclear.addBuilding(0, 'lab', 600, 600);
      assert.equal(nuclear.canBuild(0, 'nuclearSilo'), true, mapId);
      assert.equal(validateSave(nuclear.toSave()).config.nuclearEnabled, true);
      assert.equal(Game.fromSave(nuclear.toSave()).nuclearEnabled, true);
    }
  }
  for (const mapId of ['meridian', 'sentinel']) assert.equal(supportsModernMap(mapId), false);
});

for (const owner of [0, 1]) test(`阵营${owner}六架混合固定翼在完整帧中返场、补弹、存读档再起飞均不堵塞`, () => {
  const g = setup(), home = g.addBuilding(owner, 'airfield', 1100, 1000);
  const planes = ['fighter', 'fighter', 'bomber', 'fighter', 'fighter', 'bomber'].map((type, i) => g.addUnit(owner, type, 700 + i * 70, 800));
  planes.forEach(u => { u.ammo = 0; u.order = { type: 'rearm', homeId: home.id }; });
  advance(g, 240, () => planes.every(u => u.airfieldOps?.phase === 'parked' && !u.order));
  assert.ok(planes.every(u => u.airfieldOps?.phase === 'parked' && !u.order), JSON.stringify(planes.map(u => [u.type, u.airfieldOps, u.order])));
  assert.equal(new Set(planes.map(u => u.airfieldOps.slot)).size, 6);
  for (const u of planes) {
    const spot = airfieldParking(home, u.airfieldOps.slot);
    assert.ok(Math.hypot(u.x - spot.x, u.y - spot.y) < 12); assert.equal(u.angle, spot.angle); assert.equal(u.ammo, UNITS[u.type].ammo);
  }
  const restored = Game.fromSave(validateSave(g.toSave())); restored.paused = false; restored.closestEnemy = () => null; restored.hasPower = () => true;
  restored.aiTimer = restored.aiWaveTimer = 1e9;
  const ids = planes.map(u => u.id), returned = restored.units.filter(u => ids.includes(u.id));
  returned.forEach(u => { u.order = { type: 'move', x: owner ? 450 : 1800, y: 1300 }; });
  advance(restored, 180, () => returned.every(u => !u.airfieldOps && !u.deployment && Math.hypot(u.x - home.x, u.y - home.y) > 350));
  assert.ok(returned.every(u => !u.airfieldOps && !u.deployment && Math.hypot(u.x - home.x, u.y - home.y) > 350));
});

test('满弹飞机手动点选指定机场同样降落，补给后不自动恢复旧攻击命令', () => {
  const g = setup(), near = g.addBuilding(0, 'airfield', 600, 900), chosen = g.addBuilding(0, 'airfield', 1300, 1000);
  const u = g.addUnit(0, 'fighter', 700, 1000); u.order = { type: 'attackMove', x: 1900, y: 1400 }; g.selected = [u.id];
  g.command(chosen.x, chosen.y);
  assert.equal(u.order.type, 'rearm'); assert.equal(u.order.homeId, chosen.id); assert.notEqual(u.order.homeId, near.id); assert.equal(u.resumeOrder, null);
  advance(g, 150, () => u.airfieldOps?.phase === 'parked' && !u.order);
  assert.equal(u.airfieldOps.homeId, chosen.id); assert.equal(u.airfieldOps.phase, 'parked'); assert.equal(u.order, null);
});

test('舰艇反潜使用有航行时间的鱼雷，火箭四弹分摊整轮伤害并具有独立轨迹', () => {
  const g = setup('ocean'), sub = g.addUnit(1, 'submarine', 1600, 1000);
  for (const type of ['patrol', 'frigate', 'destroyer']) {
    const ship = g.addUnit(0, type, 1550, 1000), before = sub.hp;
    g.projectiles = []; g.fire(ship, sub, 20, type);
    assert.equal(g.projectiles[0].kind, 'torpedo'); assert.equal(sub.hp, before);
  }
  const rocket = g.addUnit(0, 'rocket', 600, 700), target = g.addUnit(1, 'tank', 1100, 700);
  g.projectiles = []; g.fire(rocket, target, 85, 'rocket');
  assert.equal(g.projectiles.length, 4); assert.equal(g.projectiles.reduce((n, p) => n + p.amount, 0), 85);
  assert.equal(new Set(g.projectiles.map(p => p.startY)).size, 4); assert.equal(new Set(g.projectiles.map(p => p.speed)).size, 4);
});

test('统一飞机机身比例、平滑起飞尺寸和海陆空计数，物流不计战力但乘员计入', () => {
  assert.equal(airframeScale('fighter', 7, 10) * 7 / 3, airframeScale('navalFighter', 14, 10) * 14 / 3);
  assert.equal(airframeScale('bomber', 14, 10) * 14, 168);
  assert.equal(flightScaleFactor(0), 1 / 3); assert.equal(flightScaleFactor(95), 1);
  for (let h = 1; h <= 110; h++) assert.ok(flightScaleFactor(h) >= flightScaleFactor(h - 1) && flightScaleFactor(h) <= 1);
  assert.deepEqual(armyComposition([{ type: 'rifle', hp: 1, embarkedIn: 2 }, { type: 'fighter', hp: 1 }, { type: 'frigate', hp: 1 }, { type: 'freightPlane', hp: 1 }, { type: 'tank', hp: 0 }]), { total: 3, ground: 1, air: 1, naval: 1 });
  assert.notEqual(unitRole('jammer'), unitRole('laser')); assert.notEqual(unitRole('rocket'), unitRole('loiterer'));
});

test('舰炮保留旋转与后坐关节，炮口跟随炮管且反潜器不重复添加', () => {
  const model = new THREE.Group(), weapon = new THREE.Group(), barrel = new THREE.Group(); weapon.name = 'weapon'; barrel.name = 'barrel';
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, .2, .2)); mesh.position.x = 4; barrel.add(mesh); weapon.add(barrel); model.add(weapon);
  refineNavalWeapons(model, 'frigate'); const count = model.children.length; refineNavalWeapons(model, 'frigate');
  assert.equal(model.children.length, count); assert.equal(model.getObjectByName('open_asset_muzzle').parent, barrel);
  assert.ok(model.getObjectByName('反潜鱼雷发射器')); weapon.rotation.y = .5; barrel.position.x = -.1;
  assert.ok(new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3()).x > 0);
});
