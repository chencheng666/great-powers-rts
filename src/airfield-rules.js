import { UNITS } from './data.js';

export function runwayAircraft(type, future = false) {
  const tags = UNITS[type]?.tags || [];
  return !future && tags.includes('jet') && !tags.includes('logistics') && type !== 'airlift';
}

export function airfieldApron(home) {
  return { x: home.x, y: home.y + home.size / 7.2 * 2.1 };
}

export function airfieldDeparture(home, type) {
  const side = home.owner ? -1 : 1, scale = home.size / 7.2;
  return { x: home.x - side * scale * 5.2, y: airfieldApron(home).y, side,
    angle: side > 0 ? 0 : Math.PI, forwardX: side, forwardY: 0, distance: scale * 11 };
}

export const AIRFIELD_SLOTS = 6;
export function airfieldParking(home, slot) {
  const apron = airfieldApron(home), row = Math.floor(slot / 3), column = slot % 3;
  return { x: apron.x + (column - 1) * 100, y: apron.y + 88 + row * 95,
    angle: home.owner ? -Math.PI * 3 / 4 : Math.PI / 4 };
}
export function allocateAirfieldSlot(game, unit, home) {
  const used = new Set(game.units.filter(other => other !== unit && other.hp > 0 && other.airfieldOps?.homeId === home.id).map(other => other.airfieldOps.slot));
  for (let slot = 0; slot < AIRFIELD_SLOTS; slot++) {
    const p = airfieldParking(home, slot);
    if (!used.has(slot) && p.x >= 50 && p.y >= 50 && p.x <= game.world.width - 50 && p.y <= game.world.height - 50) return slot;
  }
  return null;
}
