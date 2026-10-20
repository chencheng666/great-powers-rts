import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { OnlineGame } from '../src/online-game.js';
import { ORDER_QUEUE_LIMIT } from '../src/command-queue.js';
import { battleView } from '../server/battle-view.mjs';
import { executeCommand } from '../server/commands.mjs';
import { validateSave } from '../src/savegame.js';
import { orderRoutes } from '../src/order-routes.js';

const quiet = () => {
  const g = new Game('china', 'nato', {}, { multiplayer: true });
  g.units = []; g.map.barriers = []; g.checkVictory = () => {}; g.updateLogistics = () => {};
  const u = g.addUnit(0, 'tank', 700, 600); g.selected = [u.id];
  return { g, u };
};
const tick = (g, seconds) => { for (let i = 0; i < seconds * 20; i++) g.update(.05); };

test('追加不覆盖当前指令，队列有界，普通命令与停止立即清除旧计划', () => {
  const { g, u } = quiet();
  assert.equal(g.command(900, 600, false, 0, true), true);
  const first = { ...u.order };
  for (let i = 0; i < ORDER_QUEUE_LIMIT; i++) assert.equal(g.command(1000, 700 + i * 80, i % 2 === 0, 0, true), true);
  assert.deepEqual(u.order, first); assert.equal(u.orderQueue.length, 8);
  assert.equal(g.command(1100, 700, false, 0, true), false);
  g.clearQueuedOrders(); assert.equal(u.orderQueue.length, 0); assert.deepEqual(u.order, first);
  g.command(1000, 800, false, 0, true); g.command(1200, 600);
  assert.equal(u.order.x, 1200); assert.equal(u.orderQueue.length, 0);
  g.command(1300, 800, false, 0, true); g.stopSelected();
  assert.equal(u.order, null); assert.equal(u.orderQueue.length, 0);
  tick(g, 1); assert.equal(u.order, null);
});

test('实际依次抵达三个航点，攻击移动后继续路线，返场整备保留未执行计划', () => {
  const { g, u } = quiet();
  const goals = [{ x: 1000, y: 600 }, { x: 1000, y: 1000 }, { x: 700, y: 1000 }];
  g.command(goals[0].x, goals[0].y);
  for (const [i, goal] of goals.slice(1).entries()) g.command(goal.x, goal.y, i === 0, 0, true);
  const seen = new Set();
  for (let i = 0; i < 1200; i++) { g.update(.05); goals.forEach((p, n) => { if (Math.hypot(u.x - p.x, u.y - p.y) < 13) seen.add(n); }); }
  assert.deepEqual([...seen], [0, 1, 2]); assert.equal(u.order, null); assert.equal(u.orderQueue.length, 0);
  g.command(1200, 1000); g.command(1300, 1200, false, 0, true);
  const current = { ...u.order }, future = structuredClone(u.orderQueue);
  assert(g.requestResupply(u)); assert.equal(u.order.type, 'rearm');
  g.restoreCombatOrder(u); assert.deepEqual(u.order, current); assert.deepEqual(u.orderQueue, future);
});

test('友军编队追加航点保持独立落点，巡逻不追加死队列，非法与不可控单位拒绝', () => {
  const { g, u } = quiet(), b = g.addUnit(0, 'tank', 780, 600);
  g.selected = [u.id, b.id]; g.command(1000, 600); g.command(1100, 900, false, 0, true);
  assert.notDeepEqual(u.orderQueue[0], b.orderQueue[0]); assert(u.orderQueue[0].formation);
  u.order = { type: 'patrol', x: 1000, y: 600 }; g.selected = [u.id];
  assert.equal(g.command(1200, 700, false, 0, true), false);
  assert.equal(g.appendWaypoint(NaN, 600), false);
  const enemy = g.addUnit(1, 'tank', 900, 600); g.selected = [enemy.id]; assert.equal(g.appendWaypoint(1200, 700), false);
  g.selected = [b.id]; b.embarkedIn = 100; assert.equal(g.appendWaypoint(1200, 700), false);
  b.embarkedIn = null; b.orderQueue = []; g.selected = Array(120).fill(b.id);
  assert(g.appendWaypoint(1200, 700)); assert.equal(b.orderQueue.length, 1, '重复编号不能绕过八航点上限');
  g.isControlLocked = () => true; assert.equal(g.appendWaypoint(1200, 700), false);
  b.order = null; b.stunUntil = 10;
  assert.equal(g.advanceQueuedOrder(b), false, '瘫痪期间不能开始下一段');
  b.stunUntil = 0;
  assert(g.advanceQueuedOrder(b), '网络干扰只阻止新命令，已安排的航点仍继续');
});

test('航点存档恢复、旧存档兼容，拒绝过长队列、越界、伪造类型及损坏字段', () => {
  const { g, u } = quiet(); g.multiplayer = false;
  g.command(1000, 600); g.command(1100, 900, true, 0, true);
  const save = g.toSave(), loaded = Game.fromSave(save);
  assert.deepEqual(loaded.getEntity(u.id).orderQueue, u.orderQueue);
  const old = structuredClone(save); delete old.state.units[0].orderQueue; assert.doesNotThrow(() => Game.fromSave(old));
  for (const mutate of [q => q.push(...Array(9).fill({ type: 'move', x: 900, y: 900 })), q => q[0].x = -1, q => q[0].type = 'nuclear', q => q[0].formation = '是', q => q[0].x = NaN]) {
    const bad = structuredClone(save); mutate(bad.state.units[0].orderQueue); assert.throws(() => validateSave(bad));
  }
});

test('联机追加与清空只作用于己方，敌人及观战者看不到计划，客户端不本地推演', () => {
  const { g, u } = quiet();
  const move = { action: 'move', selected: [u.id], x: 1100, y: 800 };
  assert(executeCommand(g, 0, move)); assert(executeCommand(g, 0, { ...move, x: 1200, append: true }));
  assert.equal(executeCommand(g, 0, { ...move, append: '是' }), false);
  assert.equal(u.orderQueue.length, 1);
  assert.equal(executeCommand(g, 1, { ...move, append: true }), false);
  g.fogs[1].visible.fill(true);
  assert.equal(battleView(g, 1).units.find(e => e.id === u.id).orderQueue.length, 0);
  assert.equal(battleView(g, 0, new Map(), { spectator: true }).units.find(e => e.id === u.id).orderQueue.length, 0);
  const messages = [], payload = { seat: 0, config: { mapId: g.mapId }, view: battleView(g, 0) };
  const client = new OnlineGame(payload, {}, { send: m => { messages.push(m); return true; } }); client.selected = [u.id];
  client.command(1300, 900, false, 0, true); client.clearQueuedOrders();
  assert.equal(messages[0].append, true); assert.equal(messages[1].action, 'clear-waypoints');
  assert.equal(client.getEntity(u.id).orderQueue.length, 1);
  assert(executeCommand(g, 0, messages[1])); assert.equal(u.orderQueue.length, 0); assert.equal(u.order.x, 1100);
  assert(executeCommand(g, 0, { ...move, selected: Array(120).fill(u.id), append: true })); assert.equal(u.orderQueue.length, 1);
});

test('计划路线只显示己方选择，后续航点不冒充已经算出的避障路线', () => {
  const { g, u } = quiet(); g.command(1000, 600); g.command(1100, 900, true, 0, true);
  const route = orderRoutes(g)[0]; assert.deepEqual(route.queued, [{ x: 1100, y: 900, type: 'attackMove' }]);
  assert.deepEqual(route.destination, { x: 1000, y: 600 });
  g.selected = [g.addUnit(1, 'tank', 1000, 900).id]; assert.equal(orderRoutes(g).length, 0);
});

test('无人机先执行后续航点，不在中间航点结束后抢先返回基地', () => {
  const { g } = quiet(); g.units = [];
  const u = g.addUnit(0, 'drone', 700, 600); g.selected = [u.id];
  g.command(950, 600); g.command(1200, 900, true, 0, true);
  const roles = new Set(); let reachedSecond = false;
  for (let i = 0; i < 700; i++) {
    g.update(.05); roles.add(u.droneRole);
    if (u.orderQueue.length) assert.notEqual(u.droneRole, 'return');
    if (Math.hypot(u.x - 1200, u.y - 900) < 15) reachedSecond = true;
  }
  assert(reachedSecond); assert(roles.has('mission')); assert.equal(u.orderQueue.length, 0);
});

test('舰艇连续航点遵守水域，不因地面航点队列规则开上陆地', () => {
  const g = new Game('china', 'nato', {}, { mapId: 'ocean', multiplayer: true });
  g.units = []; g.checkVictory = () => {}; g.updateLogistics = () => {};
  const x = (g.map.water.x1 + g.map.water.x2) / 2, u = g.addUnit(0, 'patrol', x, 900); g.selected = [u.id];
  g.command(x + 200, 900); g.command(x + 200, 1250, false, 0, true);
  for (let i = 0; i < 500; i++) { g.update(.05); assert.equal(g.isNavalBlocked(u.x, u.y, 36), false); }
  assert.equal(u.order, null); assert.equal(u.orderQueue.length, 0); assert(Math.hypot(u.x - x - 200, u.y - 1250) < 12);
});
