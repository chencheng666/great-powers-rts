import { UNITS } from './data.js';

// 自行生产的实体飞机与自带的抽象打击编组分开显示，避免把编组当成机数。
export function carrierAirGroupLabel(game, carrier) {
  const assigned = game.carrierAircraft(carrier).filter(u => u.hp > 0);
  if (assigned.length) {
    const deck = assigned.filter(u => u.embarkedIn === carrier.id).length;
    return `舰载机 ${assigned.length}/${UNITS.carrier.capacity} · 甲板 ${deck} · 出动 ${assigned.length - deck}`;
  }
  const flights = game.projectiles.filter(p => !p.finished && p.kind === 'wing' && p.sourceId === carrier.id).length;
  return `打击编组 ${carrier.wing || 0} · 出动 ${flights}`;
}
