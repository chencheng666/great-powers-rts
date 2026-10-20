import { UNITS } from './data.js';

export const COMBAT_STANCES = {
  free: { name: '自由交战', icon: 'swords', description: '自动交战并追击可见目标。' },
  guard: { name: '原地警戒', icon: 'crosshair', description: '停止当前行军与后续航点，只攻击射程内目标，不自动追击；仍可手动移动和返场补给。' },
  ceasefire: { name: '停火待命', icon: 'shield-off', description: '停止当前行军与后续航点，不开火、不拦截；不提供隐身或减伤，手动攻击会恢复自由交战。' }
};

export function supportsCombatStance(unit) {
  const d = unit?.kind === 'unit' && UNITS[unit.type];
  return !!d && d.damage > 0 && !d.tags.some(tag => ['air', 'ship', 'logistics'].includes(tag));
}

export function combatStance(unit) { return supportsCombatStance(unit) && typeof unit.combatStance === 'string' && Object.hasOwn(COMBAT_STANCES, unit.combatStance) ? unit.combatStance : 'free'; }
export function weaponsHeld(unit) { return combatStance(unit) === 'ceasefire'; }

export const combatStanceCommands = {
  setCombatStance(stance, side = 0) {
    if (typeof stance !== 'string' || !Object.hasOwn(COMBAT_STANCES, stance) || !this.running || this.paused || this.isControlLocked(side)) return false;
    let changed = false;
    for (const id of new Set(this.selected)) {
      const u = this.getEntity(id);
      if (!supportsCombatStance(u) || u.owner !== side || u.hp <= 0 || u.embarkedIn) continue;
      u.combatStance = stance; changed = true;
      if (stance === 'free') continue;
      // 整备及登乘属于玩家明确安排的保障行动，不被姿态开关中断。
      if (!['rearm', 'board'].includes(u.order?.type)) u.order = null;
      u.orderQueue = []; u.resumeOrder = null; u.targetId = null;
      u.path = []; u.pathTimer = 0; u.deployProgress = 0;
      delete u.navigationProgress; delete u.navigationStalled; delete u.navigationAttempts;
    }
    return changed;
  }
};
