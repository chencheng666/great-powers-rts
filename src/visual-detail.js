const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function terrainHeight(game, x, z) {
  const water = game.map.water;
  if (water && x > water.x1 && x < water.x2) return -15;
  if (!game.map.future && game.map.barriers.some(r => x > r.x1 && x < r.x2 && z > r.y1 && z < r.y2)) return -28;
  const edge = Math.min(x, game.world.width - x), road = clamp((Math.abs(z - game.homeY) - 70) / 150, 0, 1);
  const base = clamp((edge - 650) / 240, 0, 1);
  if (!road || !base) return 0;
  const rolling = Math.sin(edge * .009) * Math.cos(z * .008) * 2.4 + Math.sin(z * .017 + edge * .006) * 1.1;
  // 只改变可视地表；不增加碰撞、掩体和伤害修正，基地及主路保持平整。
  const plateau = game.map.future ? 0 : (1 + Math.sin(edge * .004)) * (1 + Math.cos(z * .006)) * 6;
  return (rolling * (game.map.future ? 1.4 : 1) + plateau) * road * base;
}

export function tracerEndpoints(effect) {
  const length = Math.hypot(effect.toX - effect.x, effect.toY - effect.y);
  const beam = ['laser', 'robotPulse', 'repair', 'railgun'].includes(effect.style);
  const mount = effect.sourceType === 'tank' ? 61 : effect.sourceType === 'railgun' ? 57 : effect.sourceType === 'elite' ? 48 : ['rifle', 'engineer', 'scout'].includes(effect.sourceType) ? 11 : 24;
  const muzzle = Math.min(.45, mount / Math.max(1, length)), t = clamp(effect.age / effect.duration, 0, 1);
  const head = muzzle + (1 - muzzle) * t;
  return { muzzle, beam, head: beam ? 1 : head, tail: beam ? muzzle : Math.max(muzzle, head - Math.min(.12, 18 / Math.max(1, length))), flash: Math.max(0, 1 - effect.age / (beam ? .14 : .065)) };
}

export function impactProfile(effect) {
  const explosion = effect.type === 'explosion', energy = ['laser', 'robotPulse', 'railgun'].includes(effect.style);
  const water = ['patrol', 'frigate', 'destroyer', 'carrier', 'submarine', 'landing', 'containerShip'].includes(effect.targetType);
  const infantry = ['rifle', 'engineer', 'scout'].includes(effect.targetType);
  return { explosion, energy, water, radius: explosion ? Math.min(170, (effect.size || 40) * .9) : infantry ? 7 : 14, particles: explosion ? 32 : infantry ? 5 : 12, smoke: explosion ? 6 : 3, fire: water ? '#c4e3e2' : energy ? '#99f0ff' : '#ffbe6b' };
}

export const REALISM_BUILDINGS = ['hq', 'power', 'barracks', 'factory', 'armory'];
