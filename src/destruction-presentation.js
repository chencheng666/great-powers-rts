import { UNITS } from './data.js';
const clamp = x => Math.max(0, Math.min(1, x));

export function destructionEvent(game, target, owner) {
  const tags = UNITS[target.type]?.tags || [];
  const airborne = tags.includes('air') && !game.aircraftGrounded(target) && !(target.type === 'airlift' && game.transportGrounded(target));
  return { type: 'explosion', destroyed: true, entityId: target.id, targetType: target.type,
    x: target.x, y: target.y, owner, age: 0, angle: target.angle,
    surface: airborne ? 'air' : tags.includes('ship') ? 'water' : 'ground',
    duration: airborne ? .9 : target.kind === 'building' ? 2.8 : 2.2,
    size: target.kind === 'building' ? target.size : tags.includes('ship') ? target.type === 'carrier' ? 90 : 62 : 40 };
}

export function confirmedAircraftLoss(entry, game) {
  if (!entry.model.visible || !UNITS[entry.entity.type]?.tags.includes('air') || entry.entity.embarkedIn || !game.isVisibleFor(0, entry.entity.x, entry.entity.y)) return false;
  return game.effects.some(e => e.type === 'explosion' && e.destroyed && e.entityId === entry.entity.id && e.surface === 'air' && e.age <= .85);
}

export function aircraftCrashPose(age, height, heading, seed = 0, rotor = false) {
  const duration = rotor ? 2.5 : 3.1, t = clamp(age / duration), sign = seed % 2 ? 1 : -1;
  const distance = (rotor ? 58 : 140) * (t - .32 * t * t), curve = Math.sin(t * Math.PI) * (rotor ? 14 : 32) * sign;
  return { x: Math.cos(heading) * distance - Math.sin(heading) * curve,
    y: Math.sin(heading) * distance + Math.cos(heading) * curve,
    height: Math.max(0, height * (1 - t ** 1.5)), roll: sign * t * (rotor ? .7 : 3.5), pitch: -.08 - t * .85,
    yaw: sign * t * (rotor ? .5 : 1.1), complete: age >= duration };
}

export function aircraftShadowOpacity(height, rotor = false) {
  const h = Math.max(0, height);
  return rotor ? .22 * Math.max(.25, 1 - h / 150) : .28 * Math.max(0, 1 - h / 85) ** 2;
}
