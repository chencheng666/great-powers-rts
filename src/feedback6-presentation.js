import { UNITS } from './data.js';

// 对同一机种按机身长度统一比例，避免不同阵营、机场与航母各用一套缩放。
export const AIRCRAFT_LENGTHS = Object.freeze({ fighter: 84, strike: 84, navalFighter: 84, navalStrike: 84, bomber: 168, ewPlane: 84 });
export function airframeScale(type, modelLength, fallback) {
  return AIRCRAFT_LENGTHS[type] && modelLength > 0 ? AIRCRAFT_LENGTHS[type] / modelLength : fallback;
}
export function flightScaleFactor(relativeHeight) {
  const t = Math.max(0, Math.min(1, (relativeHeight - 12) / 83));
  return 1 / 3 + 2 / 3 * t * t * (3 - 2 * t);
}

export function armyComposition(units) {
  const counts = { total: 0, ground: 0, air: 0, naval: 0 };
  for (const u of units) {
    if (u.hp <= 0 || UNITS[u.type]?.tags.includes('logistics')) continue;
    counts.total++;
    counts[UNITS[u.type].tags.includes('air') ? 'air' : UNITS[u.type].tags.includes('ship') ? 'naval' : 'ground']++;
  }
  return counts;
}

export function unitRole(type, faction) {
  if (type === 'elite') return { china: '近程防空 · 持续护卫', russia: '攻城火箭 · 建筑压制', nato: '重装反无人机', asia: '轻型侦察突击', middleeast: '电子压制 · 反轻甲' }[faction] || '阵营专属';
  return { aa: '野战防空 · 有限导弹', abm: '反导专用 · 不对地', loiterer: '追踪点杀 · 可被干扰', rocket: '远程面压制 · 定点齐射', jammer: '范围软压制 · 无直接伤害', laser: '反无人机硬拦截 · 会过热', helicopter: '低空反装甲 · 需补弹', frigate: '防空护航 · 鱼雷反潜', destroyer: '远程导弹 · 鱼雷反潜' }[type] || '';
}
