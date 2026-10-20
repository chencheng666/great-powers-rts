import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { OnlineGame } from '../src/online-game.js';
import { combatStance, supportsCombatStance } from '../src/combat-stance.js';
import { battleView } from '../server/battle-view.mjs';
import { executeCommand } from '../server/commands.mjs';
import { validateSave } from '../src/savegame.js';
import { surfaceMaps } from '../src/model-craft.js';
import { weatherMaterial } from '../src/visual-assets.js';
import * as THREE from 'three';

const fixture = (type = 'tank') => {
  const g = new Game('china', 'nato', {}, { multiplayer: true });
  g.units = []; g.buildings = []; g.map.barriers = [];
  g.updateLogistics = () => {}; g.checkVictory = () => {}; g.hasLineOfFire = () => true;
  for (const fog of g.fogs) { fog.visible.fill(true); fog.explored.fill(true); }
  g.fogTimer = 1e9;
  const u = g.addUnit(0, type, 900, 720); u.fireTimer = 0;
  g.selected = [u.id];
  return { g, u };
};
const tick = (g, seconds) => { for (let i = 0; i < seconds * 20; i++) g.update(.05); };

test('自由交战会追敌，原地警戒不越出阵地且在射程内正常开火', () => {
  const { g, u } = fixture(), enemy = g.addUnit(1, 'tank', 1240, 720);
  enemy.stunUntil = 100;
  assert(g.setCombatStance('guard'));
  tick(g, 1); assert.equal(u.x, 900); assert.equal(u.ammo, 30);
  enemy.x = 1150; tick(g, 1);
  assert.equal(u.x, 900); assert(u.ammo < 30); assert(enemy.hp < enemy.maxHp);
  enemy.x = 1240; g.setCombatStance('free'); tick(g, 1);
  assert(u.x > 900); assert.equal(combatStance(u), 'free');
});

test('警戒遇到遮挡和最小射程不自动绕路，手动移动不被附近敌人打断', () => {
  const { g, u } = fixture('rocket'), enemy = g.addUnit(1, 'tank', 1000, 720);
  enemy.stunUntil = 100;
  g.setCombatStance('guard'); tick(g, 1); assert.equal(u.x, 900); assert.equal(u.y, 720);
  enemy.x = 1300; g.hasLineOfFire = () => false; tick(g, 1); assert.equal(u.x, 900);
  g.command(900, 1000); tick(g, 1);
  assert(u.y > 720); assert.equal(combatStance(u), 'guard'); assert.equal(u.ammo, 8);
});

test('停火不还击但仍承受正常伤害，手动攻击及攻击移动恢复交战', () => {
  const { g, u } = fixture(), enemy = g.addUnit(1, 'tank', 1150, 720);
  enemy.fireTimer = 0; g.setCombatStance('ceasefire'); tick(g, 1);
  assert.equal(u.ammo, 30); assert(u.hp < u.maxHp); assert.equal(u.x, 900);
  g.command(enemy.x, enemy.y); assert.equal(combatStance(u), 'free'); tick(g, 1); assert(u.ammo < 30);
  g.setCombatStance('ceasefire'); g.command(1500, 900, true); assert.equal(combatStance(u), 'free');
  g.setCombatStance('ceasefire'); g.command(1500, 1000); assert.equal(combatStance(u), 'ceasefire');
  tick(g, 1); assert(u.y > 720);
});

test('警戒跳过射界受阻与最小射程内目标，保留阵营的真实有效射程', () => {
  const { g, u } = fixture('rocket'), close = g.addUnit(1, 'tank', 1000, 720), far = g.addUnit(1, 'tank', 1350, 720);
  g.setCombatStance('guard');
  assert.equal(g.closestEnemy(u, 680, 0, true), far);
  g.hasLineOfFire = (_source, target) => target.id !== far.id;
  assert.equal(g.closestEnemy(u, 680, 0, true), null);
  close.x = 1200; assert.equal(g.closestEnemy(u, 680, 0, true), close);
  const special = g.addUnit(0, 'elite', 700, 400), enemy = g.addUnit(1, 'tank', 1040, 400);
  g.players[0].faction = 'middleeast'; special.combatStance = 'guard';
  assert.equal(g.closestEnemy(special, 315, 0, true), enemy, '不能用通用基础射程裁掉阵营加成');
});

test('停火防空不拦截，警戒防空仍按原弹药与射击间隔拦截', () => {
  const { g, u } = fixture('aa');
  const incoming = () => ({ id: 1, kind: 'missile', owner: 1, sourceId: -1, targetId: u.id, x: 1030, y: 720, startX: 1030, startY: 720, toX: u.x, toY: u.y, angle: Math.PI, age: 0, jam: 0, amount: 20, hp: 38, speed: 100 });
  g.projectiles = [incoming()]; g.setCombatStance('ceasefire'); g.updateProjectiles(.05);
  assert.equal(u.ammo, 32); assert.equal(g.projectiles[0].hp, 38);
  const projectile = g.projectiles[0];
  g.setCombatStance('guard'); g.updateProjectiles(.05); assert.equal(u.ammo, 31); assert(projectile.finished);
});

test('姿态切换清理旧行军与队列，保留整备登乘且不恢复旧攻击', () => {
  const { g, u } = fixture();
  g.command(1500, 900); g.command(1500, 1100, true, 0, true);
  g.setCombatStance('guard'); assert.equal(u.order, null); assert.deepEqual(u.orderQueue, []);
  g.command(1400, 1000); g.requestResupply(u); g.setCombatStance('ceasefire');
  assert.equal(u.order.type, 'rearm'); assert.equal(u.resumeOrder, null);
  u.order = { type: 'board', targetId: 123 }; g.setCombatStance('guard'); assert.equal(u.order.type, 'board');
  u.order = null; u.combatStance = 'guard';
  g.command(1400, 1000); g.command(1500, 1100, true, 0, true);
  assert.equal(combatStance(u), 'guard'); u.order = null; g.advanceQueuedOrder(u); assert.equal(combatStance(u), 'free');
});

test('姿态拒绝非陆军火力、敌军、登乘、非法值与暂停或受控状态', () => {
  const { g, u } = fixture();
  for (const type of ['supply', 'scout', 'fighter', 'patrol', 'swarmCarrier']) assert.equal(supportsCombatStance(g.addUnit(0, type, 700, 600)), false);
  assert.equal(g.setCombatStance('__proto__'), false); assert.equal(g.setCombatStance(['guard']), false);
  g.paused = true; assert.equal(g.setCombatStance('guard'), false); g.paused = false;
  g.isControlLocked = () => true; assert.equal(g.setCombatStance('guard'), false); g.isControlLocked = () => false;
  u.embarkedIn = 1; assert.equal(g.setCombatStance('guard'), false); u.embarkedIn = null;
  g.selected = [g.addUnit(1, 'tank', 700, 600).id]; assert.equal(g.setCombatStance('guard'), false);
  g.selected = [u.id]; u.hp = 0; assert.equal(g.setCombatStance('guard'), false);
});

test('姿态存档兼容旧版并拒绝伪造字段', () => {
  const { g, u } = fixture(); g.multiplayer = false;
  g.setCombatStance('guard'); const save = g.toSave();
  assert.equal(combatStance(Game.fromSave(save).getEntity(u.id)), 'guard');
  const old = structuredClone(save); delete old.state.units[0].combatStance;
  assert.equal(combatStance(Game.fromSave(old).getEntity(u.id)), 'free');
  for (const value of ['__proto__', '冲锋', 3, null, ['guard']]) {
    const bad = structuredClone(save); bad.state.units[0].combatStance = value; assert.throws(() => validateSave(bad));
  }
  const bad = structuredClone(save); bad.state.units[0].type = 'supply'; assert.throws(() => validateSave(bad));
});

test('联机姿态权威校验、席位映射、敌方与观战保密，客户端不提前修改', () => {
  const { g, u } = fixture(), enemy = g.addUnit(1, 'tank', 1150, 720);
  const command = { action: 'combat-stance', stance: 'guard', selected: [u.id, enemy.id] };
  assert(executeCommand(g, 0, command)); assert.equal(u.combatStance, 'guard'); assert.equal(enemy.combatStance, 'free');
  assert.equal(executeCommand(g, 0, { ...command, stance: ['guard'] }), false);
  assert.equal(battleView(g, 1).units.find(e => e.id === u.id).combatStance, undefined);
  assert.equal(battleView(g, 0, new Map(), { spectator: true }).units.find(e => e.id === u.id).combatStance, undefined);
  const messages = [], payload = { seat: 1, config: { mapId: g.mapId }, view: battleView(g, 1) };
  const client = new OnlineGame(payload, {}, { send: m => { messages.push(m); return true; } }); client.selected = [enemy.id];
  assert(client.setCombatStance('ceasefire')); assert.equal(client.getEntity(enemy.id).combatStance, 'free');
  assert(executeCommand(g, 1, messages[0])); assert.equal(enemy.combatStance, 'ceasefire');
  client.apply({ ...payload, view: battleView(g, 1) }); assert.equal(client.getEntity(enemy.id).combatStance, 'ceasefire');
  client.spectator = true; assert.equal(client.setCombatStance('guard'), false);
});

test('装甲贴图缓存复用，颜色、法线及粗糙度有层次且不替换海军和橡胶材质', () => {
  const maps = surfaceMaps('armor'); assert.equal(maps, surfaceMaps('armor'));
  assert.equal(maps.map.image.width, 256); assert.equal(maps.map.colorSpace, THREE.SRGBColorSpace);
  assert.equal(maps.normalMap.colorSpace, THREE.NoColorSpace);
  assert(new Set(maps.roughnessMap.image.data.filter((_, i) => i % 4 === 0)).size > 30);
  const base = new THREE.MeshStandardMaterial({ name: '装甲钢', color: '#6e7b59' });
  const armor = weatherMaterial(base); assert.equal(armor.map, maps.map); assert.equal(base.map, null);
  assert.notEqual(weatherMaterial(base, 'naval').map, maps.map);
  assert.notEqual(weatherMaterial(new THREE.MeshStandardMaterial({ name: '橡胶' })).map, maps.map);
});
