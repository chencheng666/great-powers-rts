export const CARRIER_CAPACITY = 24;
export const CARRIER_SORTIE_LIMIT = 6;
export const CARRIER_LAUNCH_OFFSET = 48;
export const CARRIER_APPROACH_RADIUS = 180;

// 在外飞机保留机位；旧存档没有机位时按实体编号补齐，不随停机列表跳位。
export function carrierSlots(planes) {
  const slots = new Map(), used = new Set(), ordered = [...planes].filter(p => p.hp > 0).sort((a,b) => a.id-b.id);
  for (const plane of ordered) if (Number.isInteger(plane.carrierSlot) && plane.carrierSlot >= 0 && plane.carrierSlot < CARRIER_CAPACITY && !used.has(plane.carrierSlot)) {
    slots.set(plane.id, plane.carrierSlot); used.add(plane.carrierSlot);
  }
  for (const plane of ordered) if (!slots.has(plane.id)) {
    for (let slot=0;slot<CARRIER_CAPACITY;slot++) if (!used.has(slot)) { slots.set(plane.id,slot);used.add(slot);break; }
  }
  return slots;
}

export function carrierAirStatus(game, carrier) {
  const planes=game.carrierAircraft(carrier).filter(p=>p.hp>0), deck=planes.filter(p=>p.embarkedIn===carrier.id);
  return { total:planes.length, deck:deck.length, airborne:planes.length-deck.length,
    queued:deck.filter(p=>p.deckTaxi?.launch).length };
}
