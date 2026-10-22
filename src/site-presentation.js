import { unitRadius } from './unit-spacing.js';

export function facilityRotation(building, future = false) {
  if (future || !['barracks', 'factory', 'armory'].includes(building.type)) return 0;
  const angle = Number.isFinite(building.spawnAngle) ? building.spawnAngle : building.owner ? Math.PI : 0;
  // 原模型正门沿本地 +Z，世界指令以 +X 为零度。
  return (building.type === 'armory' ? 0 : Math.PI / 2) - angle;
}

export function sceneryClearance(point, buildings, units = [], foliage = false) {
  const radius = foliage ? Math.max(12, (point.width || point.scale * 4) * .28) : (point.scale || 16) * .8;
  if (buildings.some(b => b.hp > 0 && Math.hypot(b.x - point.x, b.y - point.z) < b.size * .95 + radius)) return true;
  return units.some(u => u.hp > 0 && !u.embarkedIn && !u.airborne &&
    Math.hypot(u.x - point.x, u.y - point.z) < unitRadius(u) + radius + 8);
}

export function shorelineWidth(z) {
  // 波纹向水域内收，不改变海陆碰撞边界和登陆规则。
  return 27 + Math.sin(z * .013) * 6 + Math.sin(z * .031) * 3;
}
