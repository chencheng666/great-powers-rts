import { UNITS } from './data.js';

// 图鉴和真实生产共用阵营修正，避免展示数值与战场脱节。
export function unitCostFor(faction, type) {
  return Math.round(UNITS[type].cost * (type === 'drone' && faction === 'asia' ? .85 : 1));
}

export function unitHealthFor(faction, type) {
  let hp = UNITS[type].hp;
  if (type === 'tank' && faction === 'nato') hp *= 1.15;
  if (type === 'drone' && faction === 'asia') hp *= .85;
  if (type === 'aa' && faction === 'china') hp *= 1.15;
  if (type === 'elite' && faction === 'nato') hp = 580;
  if (type === 'elite' && faction === 'asia') hp = 250;
  return hp;
}
