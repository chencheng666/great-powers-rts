import { turnToward } from './projectile-flight.js';

export function unitAnimation(entry, unit, dt, time) {
  entry.animation ??= { x: unit.x, y: unit.y, heading: unit.angle, turnTravel: 0, aimPitch: 0, travel: 0, phase: 0, turret: unit.turretAngle, shot: unit.lastFireAt ?? -100, recoilAge: 10, speed: 0 };
  const a = entry.animation;
  if (dt <= 0) return a;
  const dx = unit.x - a.x, dy = unit.y - a.y, distance = Math.hypot(dx, dy);
  // 读档、重连或重新出现的位置跳变不转换成狂奔步态。
  const moving = distance > .001 && distance < 150;
  const signed = moving ? dx * Math.cos(unit.angle) + dy * Math.sin(unit.angle) : 0;
  a.travel += signed / entry.scale;
  const turn = Math.atan2(Math.sin(unit.angle - a.heading), Math.cos(unit.angle - a.heading));
  if (distance < 150 && Math.abs(turn) < 1) a.turnTravel += turn * 1.48;
  a.heading = unit.angle;
  a.phase += moving ? distance / 4.8 : 0;
  a.speed += ((moving ? Math.min(1, distance / Math.max(dt * 65, .001)) : 0) - a.speed) * (1 - Math.exp(-dt * 14));
  a.turret = turnToward(a.turret, unit.turretAngle, dt * 5);
  a.recoilAge += dt;
  if (Number.isFinite(unit.lastFireAt) && unit.lastFireAt > a.shot) {
    if (time - unit.lastFireAt < .5) a.recoilAge = 0;
    a.shot = unit.lastFireAt;
  }
  a.recoil = a.recoilAge < .06 ? Math.sin(a.recoilAge / .06 * Math.PI / 2) : Math.exp(-(a.recoilAge - .06) * 16);
  a.x = unit.x; a.y = unit.y;
  return a;
}

// Only presentation: weapon elevation never feeds targeting or damage calculations.
export function weaponElevation(distance, heightDelta, limit = .65) {
  return Math.max(-.18, Math.min(limit, Math.atan2(heightDelta, Math.max(1, distance))));
}

export function snapshotMotion(previous, next, seconds = .1) {
  const distance = Math.hypot(next.x - previous.x, next.y - previous.y);
  if (distance > 350 || next.embarkedIn || previous.embarkedIn || seconds > .5) return null;
  return { x: previous.x, y: previous.y, angle: previous.angle, turret: previous.turretAngle, toX: next.x, toY: next.y, toAngle: next.angle, toTurret: next.turretAngle, age: 0, duration: Math.max(.06, Math.min(.25, seconds || .1)) };
}

export function interpolateMotion(unit, dt) {
  const m = unit._motion; if (!m) return;
  m.age += Math.max(0, dt); const t = Math.min(1, m.age / m.duration);
  unit.x = m.x + (m.toX - m.x) * t; unit.y = m.y + (m.toY - m.y) * t;
  const angle = (from, to) => from + Math.atan2(Math.sin(to - from), Math.cos(to - from)) * t;
  unit.angle = angle(m.angle, m.toAngle); unit.turretAngle = angle(m.turret, m.toTurret);
  if (t === 1) delete unit._motion;
}
