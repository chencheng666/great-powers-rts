import { UNITS } from './data.js';
import { formationOffsets } from './unit-spacing.js';
import { supportsCombatStance } from './combat-stance.js';

export const ORDER_QUEUE_LIMIT = 8;
const routable = u => u?.kind === 'unit' && u.hp > 0 && !u.embarkedIn && !UNITS[u.type].tags.includes('logistics');

export const commandQueue = {
  appendWaypoint(x, y, attackMove = false, side = 0) {
    if (this.isControlLocked(side) || !Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x > this.world.width || y > this.world.height) return false;
    const units = [...new Set(this.selected)].map(id => this.getEntity(id)).filter(u => routable(u) && u.owner === side);
    const eligible = units.filter(u => u.order?.type !== 'patrol' && (u.orderQueue?.length || 0) < ORDER_QUEUE_LIMIT);
    if (!eligible.length) {
      if (side === 0) this.events.notice?.('无法追加：巡逻需先结束，待执行航点最多八个');
      return false;
    }
    // 后续队形沿上一段计划的终点转向，不重复使用部队尚未出发的位置。
    const planned = units.map(u => { const end = u.orderQueue?.at(-1) || u.order; return { ...u, x: Number.isFinite(end?.x) ? end.x : u.x, y: Number.isFinite(end?.y) ? end.y : u.y }; });
    const offsets = formationOffsets(planned, { x, y });
    for (const u of eligible) {
      const offset = offsets.get(u.id), goal = this.resolveMoveGoal(u, Math.max(20, Math.min(this.world.width - 20, x + offset.x)), Math.max(20, Math.min(this.world.height - 20, y + offset.y)));
      const order = { type: attackMove ? 'attackMove' : 'move', ...goal, ...(units.length > 1 ? { formation: true } : {}) };
      u.orderQueue ??= [];
      if (u.order) u.orderQueue.push(order);
      else { u.orderQueue.push(order); this.advanceQueuedOrder(u); }
    }
    this.effects.push({ type: 'order', x, y, age: 0, duration: .6, owner: side });
    this.events.voice?.(attackMove ? 'attackOrder' : 'moveOrder');
    return true;
  },

  advanceQueuedOrder(u) {
    if (!routable(u) || u.order || u.stunUntil > this.time || !u.orderQueue?.length) return false;
    u.order = u.orderQueue.shift();
    if (u.order.type === 'attackMove' && supportsCombatStance(u)) u.combatStance = 'free';
    u.path = []; u.pathTimer = 0; u.pathGoal = ''; u.targetId = null;
    u.avoidSide = 0; u.avoidUntil = 0;
    delete u.navigationProgress; delete u.navigationStalled; delete u.navigationAttempts;
    this.setDroneMission(u);
    return true;
  },

  clearQueuedOrders(side = 0) {
    if (this.isControlLocked(side)) return false;
    let changed = false;
    for (const id of this.selected) {
      const u = this.getEntity(id);
      if (!routable(u) || u.owner !== side || !u.orderQueue?.length) continue;
      u.orderQueue = []; changed = true;
    }
    return changed;
  }
};
