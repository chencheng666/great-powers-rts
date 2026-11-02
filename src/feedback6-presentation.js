import { UNITS } from './data.js';

export { AIRCRAFT_LENGTHS, airframeScale, flightScaleFactor } from './model-scale.js';

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
