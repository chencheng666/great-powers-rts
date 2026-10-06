import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { UNITS } from '../src/data.js';
import { validateSave } from '../src/savegame.js';

const setup = () => {
  const g = new Game('china', 'nato', {}, { mapId: 'ocean' });
  g.units = []; g.aiTimer = g.aiWaveTimer = 1e9;
  g.logistics.forEach(r => { r.nextAir = r.nextSea = 1e9; });
  g.players.forEach(p => { p.credits = 10000; });
  return g;
};
const board = (g, plane, carrier) => {
  plane.order = { type: 'board', targetId: carrier.id };
  for (let i = 0; i < 60; i++) { g.time += .05; g.boardTransport(plane, .05); if (plane.embarkedIn) break; }
};

test('只有兼容舰载型能够着舰，甲板容量按真实机体计算，敌军及地面车辆不能登舰', () => {
  const g = setup(), carrier = g.addUnit(0, 'carrier', 1400, 1000);
  for (const type of ['fighter', 'strike', 'bomber', 'airlift', 'rifle', 'tank']) assert.equal(g.canBoardTransport(g.addUnit(0, type, 1400, 1000), carrier), false);
  assert.equal(g.canBoardTransport(g.addUnit(1, 'navalFighter', 1400, 1000), carrier), false);
  for (let n = 0; n < 3; n++) {
    const plane = g.addUnit(0, n % 2 ? 'navalFighter' : 'navalStrike', 1400, 1000);
    board(g, plane, carrier); assert.equal(plane.embarkedIn, carrier.id);
  }
  assert.equal(g.transportLoad(carrier), 3);
  assert.equal(g.canBoardTransport(g.addUnit(0, 'navalStrike', 1400, 1000), carrier), false);
  const save = g.toSave(); validateSave(save);
  assert.equal(Game.fromSave(save).ownedUnits(0, 'carrier')[0].passengers.length, 3);
});

test('真实飞机弹射起飞，不复制机体；舰载机耗弹受伤后返舰、付费整备并恢复任务', () => {
  const g = setup(), carrier = g.addUnit(0, 'carrier', 1400, 1000), plane = g.addUnit(0, 'navalStrike', 1400, 1000);
  board(g, plane, carrier);
  assert.equal(g.launchDeckAircraft(carrier), 1);
  assert.equal(plane.embarkedIn, null); assert.equal(carrier.passengers.length, 0);
  assert.ok(plane.deployment); assert.equal(g.ownedUnits(0, 'navalStrike').length, 1);
  plane.deployment = null; plane.x = carrier.x; plane.y = carrier.y;
  plane.hp -= 54; plane.ammo = 0;
  plane.order = { type: 'attackMove', x: 2200, y: 1000 };
  g.requestResupply(plane);
  for (let n = 0; n < 60 && !plane.embarkedIn; n++) { g.time += .05; g.updateRearm(plane, .05); }
  assert.equal(plane.embarkedIn, carrier.id);
  const initial = g.players[0].credits;
  for (let n = 0; n < 230; n++) { g.time += .05; g.updateCarrierAirGroup(carrier, .05); }
  assert.equal(plane.hp, plane.maxHp); assert.equal(plane.ammo, UNITS.navalStrike.ammo);
  assert.equal(plane.embarkedIn, null); assert.equal(plane.order.type, 'attackMove');
  assert.ok(Math.abs(initial - g.players[0].credits - (54 * .35 + 40)) < .001);
});

test('编入真实舰载机后航母自带攻击组停用；移动、断电和受击不允许免费着舰整备', () => {
  const g = setup(), carrier = g.addUnit(0, 'carrier', 1400, 1000), plane = g.addUnit(0, 'navalStrike', 1400, 1000), enemy = g.addUnit(1, 'patrol', 1700, 1000);
  assert.equal(g.canAttack(carrier, enemy), true);
  carrier.lastMovedAt = g.time; board(g, plane, carrier);
  assert.equal(plane.embarkedIn, null);
  g.time += 4; board(g, plane, carrier);
  assert.equal(g.canAttack(carrier, enemy), false);
  plane.hp -= 20; plane.ammo = 0;
  carrier.lastDamageAt = g.time;
  g.updateCarrierAirGroup(carrier, 10); assert.equal(plane.hp, plane.maxHp - 20);
  g.time += 4; g.ownedBuildings(0, 'power')[0].hp = 0; g.recalculatePower();
  g.updateCarrierAirGroup(carrier, 10); assert.equal(plane.ammo, 0);
  assert.equal(g.launchDeckAircraft(carrier), 0);
});

test('航母沉没后甲板飞机紧急撤离受损，空中飞机可改回机场，不保留无敌隐藏机体', () => {
  const g = setup(), carrier = g.addUnit(0, 'carrier', 1400, 1000), plane = g.addUnit(0, 'navalFighter', 1400, 1000);
  board(g, plane, carrier); g.damage(carrier, carrier.maxHp * 2, 1);
  assert.equal(plane.embarkedIn, null); assert.equal(plane.hp, plane.maxHp * .5);
  assert.equal(plane.homeCarrierId, null); assert.ok(plane.deployment);
});

test('舰载机遵守空地克制，飞弹实际飞行后命中，不是瞬间扣血', () => {
  const g = setup(), fighter = g.addUnit(0, 'navalFighter', 1400, 1000), strike = g.addUnit(0, 'navalStrike', 1400, 1200), enemyAir = g.addUnit(1, 'fighter', 1640, 1000), enemyShip = g.addUnit(1, 'patrol', 1640, 1200);
  g.fogs[0].visible.fill(true);
  assert.equal(g.canAttack(fighter, enemyShip), false); assert.equal(g.canAttack(strike, enemyAir), false);
  assert.equal(g.canAttack(fighter, enemyAir), true); assert.equal(g.canAttack(strike, enemyShip), true);
  g.fire(strike, enemyShip, 50, 'navalStrike'); assert.equal(enemyShip.hp, enemyShip.maxHp);
  assert.equal(g.projectiles[0].kind, 'missile');
  for (let n = 0; n < 30; n++) g.updateProjectiles(.05);
  assert.equal(enemyShip.hp, enemyShip.maxHp - 50);
});
