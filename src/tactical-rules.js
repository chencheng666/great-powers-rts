import { UNITS } from './data.js';

export function armorFacing(source, target) {
  const angle = Math.atan2(source.y - target.y, source.x - target.x), facing = Math.cos(angle - (target.angle || 0));
  return facing > .5 ? { name: '正面装甲', multiplier: .82 } : facing < -.5 ? { name: '后部装甲', multiplier: 1.18 } : { name: '侧面装甲', multiplier: 1 };
}

export function inCover(map, unit) {
  return unit.kind === 'unit' && UNITS[unit.type]?.tags.includes('infantry') && (map.cover || []).some(zone => unit.x >= zone.x1 && unit.x <= zone.x2 && unit.y >= zone.y1 && unit.y <= zone.y2);
}

export function tacticalDamage(map, source, target) {
  let factor = 1;
  if (target.kind === 'unit' && UNITS[target.type].tags.includes('armor') && ['tank', 'railgun'].includes(source.type)) factor *= armorFacing(source, target).multiplier;
  if (inCover(map, target) && !['rocket', 'strike', 'loiterer', 'railgun'].includes(source.type)) factor *= .72;
  return factor;
}

export function weatherState(map, time) {
  if (!map.future) return { phase: 'clear', remaining: 0 };
  const cycle = Math.max(0, time) % 180;
  return cycle < 80 ? { phase: 'clear', remaining: 80 - cycle } : cycle < 100 ? { phase: 'warning', remaining: 100 - cycle } : cycle < 125 ? { phase: 'storm', remaining: 125 - cycle } : { phase: 'clear', remaining: 260 - cycle };
}

export function hasSignalCover(game, owner, point) {
  return game.activeUnits(owner, 'relay').some(unit => game.time >= unit.stunUntil && Math.hypot(unit.x - point.x, unit.y - point.y) <= 260)
    || game.beacons.some(site => site.owner === owner && Math.hypot(site.x - point.x, site.y - point.y) <= 330);
}
