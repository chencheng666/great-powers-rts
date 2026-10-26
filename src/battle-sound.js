import { UNITS } from './data.js';

// 声音事件单独保留到下一次网络快照；不依赖仅持续一帧的炮口画面。
export function emitBattleSound(game, style, point, phase = 'launch', extra = {}) {
  const event = { type: 'sound', style, phase, owner: point.owner ?? 0, x: point.x, y: point.y, age: 0, duration: .65, ...extra };
  game.effects.push(event);
  if (event.global || game.isVisibleFor(0, event.x, event.y) && (!event.sourceId || game.canSeeEntity(0, point))) game.events.shot?.(style, event.owner, event);
  return event;
}

export function weaponSound(style, target) {
  if (['patrol', 'frigate'].includes(style) && UNITS[target?.type]?.tags.includes('submerged')) return 'antiSub';
  return style;
}

export function impactSound(target, kind) {
  const tags = UNITS[target?.type]?.tags || [];
  if (kind === 'torpedo' || tags.includes('ship')) return 'waterImpact';
  if (kind === 'ballistic' || kind === 'bomb') return 'largeImpact';
  if (['missile', 'rocket', 'loitering', 'wing'].includes(kind)) return 'explosiveImpact';
  return tags.includes('infantry') ? 'lightImpact' : 'metalImpact';
}

export function destructionSound(target) {
  const tags = UNITS[target.type]?.tags || [];
  return target.kind === 'building' ? 'buildingDestroyed' : tags.includes('ship') ? 'shipDestroyed' : tags.includes('air') ? 'aircraftDestroyed' : tags.includes('infantry') ? 'lightImpact' : 'vehicleDestroyed';
}

export function soundPosition(point, listener) {
  if (point?.global || !listener || !Number.isFinite(point?.x)) return { level: 1, pan: 0 };
  const screen = listener.worldToScreen(point.x, point.y), { width, height } = listener.viewport;
  if (!width || !height) return { level: 0, pan: 0 };
  const dx = (screen.x - width / 2) / (width / 2), dy = (screen.y - height / 2) / (height / 2);
  const distance = Math.hypot(dx, dy);
  return { level: Math.max(0, 1 - distance / 1.65), pan: Math.max(-.85, Math.min(.85, dx * .7)) };
}

export function movementKind(unit, game) {
  const tags = UNITS[unit.type]?.tags || [];
  if (tags.includes('infantry')) return game.map.future ? 'robot' : null;
  if (unit.type === 'submarine') return game.submarineSurfaced(unit) ? 'ship' : 'submerged';
  if (tags.includes('ship')) return 'ship';
  if (unit.type === 'helicopter') return 'rotor';
  if (tags.includes('drone')) return 'drone';
  if (tags.includes('jet')) return 'jet';
  return tags.includes('armor') || unit.type === 'elite' ? 'tracks' : 'wheels';
}

export class MovementSounds {
  constructor() { this.positions = new Map(); this.elapsed = 0; }
  reset() { this.positions.clear(); this.elapsed = 0; }
  sample(game, listener, dt) {
    this.elapsed += Math.max(0, dt);
    const seen = new Set(), groups = new Map();
    for (const unit of game.units) {
      if (unit.hp <= 0 || unit.embarkedIn || !game.canSeeEntity(0, unit)) continue;
      const kind = movementKind(unit, game);
      if (!kind) continue;
      seen.add(unit.id);
      const old = this.positions.get(unit.id), moved = old && Math.hypot(unit.x - old.x, unit.y - old.y) > .15;
      const lastMove = moved ? this.elapsed : old?.lastMove ?? -Infinity;
      this.positions.set(unit.id, { x: unit.x, y: unit.y, lastMove });
      const airborne = ['jet', 'rotor', 'drone'].includes(kind) && !game.aircraftGrounded(unit);
      if (!airborne && this.elapsed - lastMove > .22) continue;
      const spatial = soundPosition(unit, listener);
      if (spatial.level < .04) continue;
      const level = spatial.level * (airborne ? 1 : .85);
      const group = groups.get(kind) || { kind, level: 0, pan: spatial.pan, weight: 0 };
      group.pan = (group.pan * group.weight + spatial.pan * level) / (group.weight + level);
      group.weight += level; group.level = Math.min(1, Math.hypot(group.level, level)); groups.set(kind, group);
    }
    for (const id of this.positions.keys()) if (!seen.has(id)) this.positions.delete(id);
    return [...groups.values()].sort((a, b) => b.level - a.level).slice(0, 4);
  }
}
