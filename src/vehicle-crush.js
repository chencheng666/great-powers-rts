import { UNITS } from './data.js';

// 只有履带坦克可以碾压敌方地面人员；友军、载具与运输中的单位始终避让。
export function canCrush(vehicle, target, game = null) {
  return !game?.challenge && vehicle.type === 'tank' && vehicle.owner !== target.owner && target.hp > 0 && !target.embarkedIn && UNITS[target.type]?.tags.includes('infantry');
}

export function crushAlongMove(game, vehicle, from, to, neighbors) {
  const dx = to.x - from.x, dy = to.y - from.y, length = dx * dx + dy * dy;
  if (length < .001) return;
  for (const target of neighbors) {
    if (!canCrush(vehicle, target, game)) continue;
    const t = Math.max(0, Math.min(1, ((target.x - from.x) * dx + (target.y - from.y) * dy) / length));
    if (Math.hypot(target.x - from.x - dx * t, target.y - from.y - dy * t) > 24) continue;
    game.damage(target, target.hp + 1, vehicle.owner);
  }
}
