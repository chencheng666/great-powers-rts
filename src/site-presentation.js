import { unitRadius } from './unit-spacing.js';

export function facilityRotation(building, future = false) {
  if (future || !['barracks', 'factory', 'armory'].includes(building.type)) return 0;
  const angle = Number.isFinite(building.spawnAngle) ? building.spawnAngle : building.owner ? Math.PI : 0;
  // 原模型正门沿本地 +Z，世界指令以 +X 为零度。
  return (building.type === 'armory' ? 0 : Math.PI / 2) - angle;
}

export function sceneryFootprint(point, foliage = false) {
  return foliage ? Math.max(12, (point.width || point.scale * 4) * .28) : (point.scale || 16) * .8;
}

export function sceneryClearance(point, buildings, units = [], foliage = false, worldWidth = null) {
  const radius = sceneryFootprint(point, foliage);
  if (buildings.some(b => {
    if(b.hp<=0)return false;
    if(b.type==='dock'){
      const scale=b.size/7.2,angle=b.harborAngle??(worldWidth?(b.x<worldWidth/2?0:Math.PI):(b.owner?Math.PI:0)),dx=point.x-b.x,dz=point.z-b.y;
      const x=dx*Math.cos(angle)+dz*Math.sin(angle),z=-dx*Math.sin(angle)+dz*Math.cos(angle);
      if(x>=-3.6*scale-radius&&x<=12.4*scale+radius&&Math.abs(z)<=10.3*scale+radius)return true;
    }
    return Math.hypot(b.x-point.x,b.y-point.z)<b.size*.95+radius;
  })) return true;
  return units.some(u => u.hp > 0 && !u.embarkedIn && !u.airborne &&
    Math.hypot(u.x - point.x, u.y - point.z) < unitRadius(u) + radius + 8);
}

export function shorelineWidth(z) {
  // 波纹向水域内收，不改变海陆碰撞边界和登陆规则。
  return 27 + Math.sin(z * .013) * 6 + Math.sin(z * .031) * 3;
}
