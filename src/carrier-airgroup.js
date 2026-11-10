import { UNITS } from './data.js';
import { carrierAirStatus, CARRIER_SORTIE_LIMIT } from './carrier-operations.js';

// 自行生产的实体飞机与自带的抽象打击编组分开显示，避免把编组当成机数。
export function carrierAirGroupLabel(game, carrier) {
  const assigned = game.carrierAircraft(carrier).filter(u => u.hp > 0);
  if (assigned.length) {
    const status=carrierAirStatus(game,carrier);
    return `舰载机 ${assigned.length}/${UNITS.carrier.capacity} · 甲板 ${status.deck} · 在外 ${status.airborne}/${CARRIER_SORTIE_LIMIT} · 待飞 ${status.queued}${carrier.airGroupHold?' · 已召回':''}`;
  }
  const flights = game.projectiles.filter(p => !p.finished && p.kind === 'wing' && p.sourceId === carrier.id).length;
  return `打击编组 ${carrier.wing || 0} · 出动 ${flights}`;
}
