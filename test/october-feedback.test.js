import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { UNITS } from '../src/data.js';
import { supportsDroneAutonomy } from '../src/drone-autonomy.js';
import { validateSave } from '../src/savegame.js';
import { executeCommand } from '../server/commands.mjs';
import { battleView } from '../server/battle-view.mjs';

function setup() {
  const game = new Game('china', 'nato');
  game.units = []; game.time = 20;
  for (const player of game.players) { player.credits = 20000; game.addBuilding(player.side, 'power', 400 + player.side * 1200, 400); }
  for (const fog of game.fogs) { fog.visible.fill(true); fog.explored.fill(true); }
  return game;
}
function tick(game, unit, until, limit = 800) {
  for (let i = 0; i < limit && !until(); i++) { game.time += .05; game.updateUnit(unit, .05); }
  assert.ok(until(), JSON.stringify({ role: unit.droneRole, order: unit.order, hp: unit.hp, ammo: unit.ammo }));
}

test('同类选兵限定当前视野候选，排除敌军、运输中及死亡单位，Shift保留原选择', () => {
  const game = setup(), a = game.addUnit(0, 'tank', 700, 600), b = game.addUnit(0, 'tank', 800, 600);
  const offscreen = game.addUnit(0, 'tank', 1700, 600), enemy = game.addUnit(1, 'tank', 900, 600);
  const rifle = game.addUnit(0, 'rifle', 760, 700), dead = game.addUnit(0, 'tank', 710, 700), passenger = game.addUnit(0, 'tank', 720, 700);
  dead.hp = 0; passenger.embarkedIn = 999;
  const ids = [a, b, enemy, dead, passenger, rifle].map(u => u.id);
  game.selected = [rifle.id];
  assert.equal(game.selectSameType(a, ids), true); assert.deepEqual(game.selected, [a.id, b.id]); assert.ok(!game.selected.includes(offscreen.id));
  game.selected = [rifle.id]; game.selectSameType(a, ids, true); assert.deepEqual(game.selected, [rifle.id, a.id, b.id]);
  assert.equal(game.selectSameType(enemy, ids), false); assert.deepEqual(game.selected, [rifle.id, a.id, b.id]);
  assert.equal(game.selectSameType(passenger, ids), false);
});

test('常驻武装无人机默认值守，临时蜂群及无武装侦察机不套用攻击任务', () => {
  const game = setup();
  for (const type of ['drone', 'aegis']) { const unit = game.addUnit(0, type, 600, 700); assert.equal(unit.autoDrone, true); assert.equal(unit.droneRole, 'guard'); }
  assert.equal(supportsDroneAutonomy(game.addUnit(0, 'drone', 600, 700, true)), false);
  assert.equal(game.addUnit(0, 'ghost', 600, 700).autoDrone, undefined);
});

test('警戒无人机只追击基地附近已侦察目标，不追击远处目标或穿透迷雾', () => {
  const game = setup(), home = game.ownedBuildings(0, 'hq')[0];
  const drone = game.addUnit(0, 'drone', home.x + 300, home.y);
  const enemy = game.addUnit(1, 'tank', home.x + 430, home.y);
  assert.equal(game.closestEnemy(drone, 330, 0)?.id, enemy.id);
  enemy.x = home.x + 470; assert.equal(game.closestEnemy(drone, 330, 0), null);
  enemy.x = home.x + 430; game.fogs[0].visible.fill(false); assert.equal(game.closestEnemy(drone, 330, 0), null);
});

test('攻击任务完成返回基地，手动移动和停止保持玩家意图', () => {
  const game = setup(), home = game.ownedBuildings(0, 'hq')[0], drone = game.addUnit(0, 'drone', 1000, 700);
  const enemy = game.addUnit(1, 'tank', 1100, 700);
  game.selected = [drone.id]; game.command(enemy.x, enemy.y);
  assert.equal(drone.droneRole, 'mission'); enemy.hp = 0;
  tick(game, drone, () => drone.droneRole === 'guard'); assert.ok(Math.hypot(drone.x - home.x, drone.y - home.y) < 220);
  game.command(1100, 1000); assert.equal(drone.droneRole, 'manual');
  tick(game, drone, () => !drone.order); assert.ok(drone.x > 1050);
  game.stopSelected(); const before = { x: drone.x, y: drone.y };
  game.addUnit(1, 'tank', drone.x + 240, drone.y);
  for (let i = 0; i < 50; i++) { game.time += .05; game.updateUnit(drone, .05); }
  assert.equal(drone.droneRole, 'hold'); assert.equal(drone.x, before.x); assert.equal(drone.y, before.y);
  game.toggleAutoDrone(drone); assert.equal(drone.autoDrone, false);
  game.toggleAutoDrone(drone); assert.equal(drone.droneRole, 'guard');
});

test('双方无人机低弹低血回兵工厂付费整备，完成后恢复出击，不要求先造机场', () => {
  for (const side of [0, 1]) {
    const game = setup(), home = game.addBuilding(side, 'armory', side ? 1650 : 550, 1050);
    const drone = game.addUnit(side, 'drone', home.x + 140, home.y), target = game.addBuilding(1 - side, 'power', 1200, 100);
    drone.order = { type: 'attack', targetId: target.id, x: target.x, y: target.y }; drone.droneRole = 'mission'; drone.ammo = 2; drone.hp = 35;
    const before = game.players[side].credits;
    game.updateUnit(drone, .05); assert.equal(drone.order.type, 'rearm');
    tick(game, drone, () => drone.order?.type === 'attack' && drone.ammo === UNITS.drone.ammo && drone.hp === drone.maxHp);
    assert.equal(drone.order.targetId, target.id); assert.equal(drone.droneRole, 'mission'); assert.ok(game.players[side].credits < before);
  }
});

test('无人机整备仍受资金、供电与脱战限制，地面补给车不维修飞行无人机', () => {
  const game = setup(), home = game.addBuilding(0, 'armory', 700, 1000), drone = game.addUnit(0, 'drone', 760, 1000);
  drone.hp = 30; drone.ammo = 1; game.requestResupply(drone); game.players[0].credits = 0;
  for (let i = 0; i < 100; i++) { game.time += .05; game.updateUnit(drone, .05); }
  assert.equal(drone.hp, 30); assert.equal(drone.ammo, 1);
  game.players[0].credits = 10000; game.hasPower = () => false; game.updateUnit(drone, 1); assert.equal(drone.hp, 30);
  game.hasPower = () => true; drone.lastDamageAt = game.time; game.updateUnit(drone, 1); assert.equal(drone.hp, 30);
  assert.equal(game.serviceGroundUnit(drone, 1, home), false);
});

test('基地警戒脱战后自动补足少量损伤与弹药，完整后停止整备计费', () => {
  const game = setup(), home = game.addBuilding(0, 'armory', 500, 1000), drone = game.addUnit(0, 'drone', 570, 1000);
  drone.hp -= 10; drone.ammo -= 1;
  game.updateUnit(drone, .05); assert.equal(drone.order.type, 'rearm');
  tick(game, drone, () => !drone.order && drone.hp === drone.maxHp && drone.ammo === UNITS.drone.ammo);
  const credits = game.players[0].credits;
  for (let i = 0; i < 10; i++) { game.time += .05; game.updateUnit(drone, .05); }
  assert.equal(game.players[0].credits, credits);
});

test('六批次弹药的云隼按实际25%阈值返场，不在剩余两批时提前中断任务', () => {
  const game = setup(), drone = game.addUnit(0, 'aegis', 700, 900);
  game.addBuilding(0, 'airfield', 600, 1000);
  drone.droneRole = 'mission'; drone.order = { type: 'attackMove', x: 1200, y: 900 }; drone.ammo = 2;
  game.updateDroneAutonomy(drone); assert.equal(drone.order.type, 'attackMove');
  drone.ammo = 1; game.updateDroneAutonomy(drone); assert.equal(drone.order.type, 'rearm');
});

test('自主状态存档往返与旧存档兼容，联机仅允许控制己方单位且不泄露敌方任务状态', () => {
  const game = setup(), drone = game.addUnit(0, 'drone', 700, 900), enemy = game.addUnit(1, 'drone', 800, 900);
  game.selected = [drone.id]; game.command(1100, 1100, true); game.requestResupply(drone);
  const save = game.toSave(), restored = Game.fromSave(save), unit = restored.getEntity(drone.id);
  assert.equal(unit.autoDrone, true); assert.equal(unit.droneRole, 'mission'); assert.deepEqual(unit.resumeOrder, drone.resumeOrder);
  const old = structuredClone(save); for (const unit of old.state.units) { delete unit.autoDrone; delete unit.droneRole; }
  assert.equal(Game.fromSave(old).getEntity(drone.id).droneRole, 'manual');
  const bad = structuredClone(save); bad.state.units[0].droneRole = '未知任务'; assert.throws(() => validateSave(bad));
  assert.equal(executeCommand(game, 1, { action: 'auto-drone', id: drone.id }), false); assert.equal(drone.autoDrone, true);
  assert.equal(executeCommand(game, 0, { action: 'auto-drone', id: drone.id }), true); assert.equal(drone.autoDrone, false);
  const view = battleView(game, 0); assert.equal(view.units.find(u => u.id === drone.id).autoDrone, false);
  assert.equal(view.units.find(u => u.id === enemy.id).autoDrone, undefined);
});
