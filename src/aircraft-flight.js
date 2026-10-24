import { UNITS } from './data.js';
import { runwayAircraft } from './airfield-rules.js';
import { turnToward } from './projectile-flight.js';

const FIXED_WING_TURN_RATE = .95;

// 游戏内的转向约束；不套用现实武器参数，也不影响货运、航天器及甲板进场。
export function aircraftTurnRate(unit, future = false) {
  if (future || unit.deployment || unit.deckApproach || unit.embarkedIn || UNITS[unit.type]?.tags.includes('logistics')) return null;
  if (runwayAircraft(unit.type)) return FIXED_WING_TURN_RATE;
  return UNITS[unit.type]?.tags.includes('rotorcraft') ? 1.65 : null;
}

export function aircraftStep(unit, goal, dt, amount, world, future = false) {
  const rate = aircraftTurnRate(unit, future);
  if (rate === null) return null;
  let desired = Math.atan2(goal.y - unit.y, goal.x - unit.x);
  const fixed = runwayAircraft(unit.type), margin = UNITS[unit.type].speed / rate + 26;
  // 提前向场内转弯，避免边界钳制让固定翼停在空中。
  if (fixed && (unit.x + Math.cos(unit.angle) * margin < 18 || unit.x + Math.cos(unit.angle) * margin > world.width - 18 || unit.y + Math.sin(unit.angle) * margin < 18 || unit.y + Math.sin(unit.angle) * margin > world.height - 18)) {
    desired = Math.atan2(world.height / 2 - unit.y, world.width / 2 - unit.x);
  }
  const heading = turnToward(unit.angle, desired, rate * dt);
  return { x: Math.max(18, Math.min(world.width - 18, unit.x + Math.cos(heading) * amount)),
    y: Math.max(18, Math.min(world.height - 18, unit.y + Math.sin(heading) * amount)), heading };
}

export function aircraftCanFire(unit, target, future = false) {
  if (!runwayAircraft(unit.type, future) || unit.type === 'bomber') return true;
  const bearing = Math.atan2(target.y - unit.y, target.x - unit.x);
  return Math.abs(Math.atan2(Math.sin(bearing - unit.angle), Math.cos(bearing - unit.angle))) <= Math.PI / 3;
}

export function aircraftAttackGoal(unit, target, range, future = false) {
  if (!runwayAircraft(unit.type, future)) return null;
  const bearing = Math.atan2(target.y - unit.y, target.x - unit.x);
  const error = Math.abs(Math.atan2(Math.sin(bearing - unit.angle), Math.cos(bearing - unit.angle)));
  const distance = Math.hypot(target.x - unit.x, target.y - unit.y);
  const egress = Math.max(range * 1.25, UNITS[unit.type].speed / FIXED_WING_TURN_RATE * 2.2);
  // 目标落在机后时先拉开距离再转回来，避免绕目标做切线圆周而永远进不了前向射界。
  const passing = distance < Math.max(12, UNITS[unit.type].speed * .15);
  return passing || error > Math.PI / 3 && distance < egress
    ? { x: unit.x + Math.cos(unit.angle) * 400, y: unit.y + Math.sin(unit.angle) * 400 }
    : target;
}

export function rotorMotion(entry, powered, dt) {
  entry.rotorSpeed ??= powered ? 47 : 0;
  const target = powered ? 47 : 0, step = (powered ? 24 : 12) * dt;
  entry.rotorSpeed += Math.max(-step, Math.min(step, target - entry.rotorSpeed));
  return entry.rotorSpeed;
}
