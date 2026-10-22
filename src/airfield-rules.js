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
