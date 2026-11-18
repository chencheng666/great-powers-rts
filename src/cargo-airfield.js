import { AIRFIELD_LAYOUT, airfieldRunwayAvailable } from './airfield-rules.js';
import { UNITS } from './data.js';
import { battleMetric } from './battle-report.js';

export const CARGO_STAGES = ['approach', 'glide', 'roll', 'taxiIn', 'unload', 'taxiOut', 'takeoff', 'climb'];
export const runwayCargo = type => ['tank', 'rocket', 'ballistic', 'harvester'].includes(type);
export const cargoGrounded = cargo => ['roll', 'taxiIn', 'unload', 'taxiOut', 'takeoff'].includes(cargo?.stage);

export function cargoAirfieldRoute(home, world) {
  const scale = home.size / 7.2;
  const side = home.x < world.width / 2 ? 1 : -1;
  const point = (x, y = AIRFIELD_LAYOUT.runwayZ) => ({ x: home.x + side * x * scale, y: home.y + y * scale });
  const edge = x => Math.max(45, Math.min(world.width - 45, x));
  const gate = point(-25), exit = point(-27);
  gate.x = edge(gate.x); exit.x = edge(exit.x);
  return {
    gate, touchdown: point(-11.4), turn: point(9.8), apron: point(9.8, 8.7), unload: point(9.8, 12),
    lift: point(-12.5), exit,
  };
}

const gap = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function follow(game, unit, point, dt, speed) {
  const distance = gap(unit, point);
  if (distance < .01) return true;
  const portion = Math.min(1, speed * dt / distance);
  unit.angle = unit.turretAngle = Math.atan2(point.y - unit.y, point.x - unit.x);
  unit.x += (point.x - unit.x) * portion;
  unit.y += (point.y - unit.y) * portion;
  unit.lastMovedAt = game.time;
  return portion === 1;
}

export function updateCargoAirfield(game, plane, dt) {
  const request = plane.reinforcement;
  let cargo = request.cargo;
  let home = cargo && game.getEntity(cargo.airfieldId);
  if (!home || home.hp <= 0 || home.owner !== plane.owner || home.type !== 'airfield') {
    if (cargo && CARGO_STAGES.indexOf(cargo.stage) >= CARGO_STAGES.indexOf('taxiOut')) {
      request.phase = 'outbound'; request.startedAt = game.time; delete request.cargo;
      return true;
    }
    home = game.ownedBuildings(plane.owner, 'airfield')
      .filter(b => b.x > b.size * 2 && b.x < game.world.width - b.size * 2 && b.y + b.size * 2 < game.world.height)
      .sort((a, b) => gap(plane, a) - gap(plane, b) || a.id - b.id)[0];
    if (!home) { delete request.cargo; game.cruiseAircraft(plane, dt); return true; }
    cargo = request.cargo = { airfieldId: home.id, stage: 'approach', fraction: 1, readyAt: game.time };
    delete request.delivery;
    delete request.progress;
  }
  const path = cargoAirfieldRoute(home, game.world);
  switch (cargo.stage) {
    case 'approach':
      if (follow(game, plane, path.gate, dt, 195) && airfieldRunwayAvailable(game, plane, home)) cargo.stage = 'glide';
      break;
    case 'glide':
      if (follow(game, plane, path.touchdown, dt, 155)) cargo.stage = 'roll';
      cargo.fraction = Math.min(1, gap(plane, path.touchdown) / Math.max(1, gap(path.gate, path.touchdown)));
      break;
    case 'roll':
      if (follow(game, plane, path.turn, dt, 92)) cargo.stage = 'taxiIn';
      break;
    case 'taxiIn':
      if (follow(game, plane, path.apron, dt, 44)) {
        plane.angle = plane.turretAngle = -Math.PI / 2;
        cargo.stage = 'unload'; cargo.readyAt = game.time + 1.1;
      }
      break;
    case 'unload': {
      if (game.time < cargo.readyAt) break;
      const point = game.findSpawn(path.unload.x, path.unload.y, request.type, 12, p => p.y > path.apron.y + 13 && gap(p, path.unload) <= 115);
      if (!point) break;
      const payload = game.spawnUnit(plane.owner, request.type, point.x, point.y);
      payload.deliveryUntil = game.time + 1.4;
      payload.deliveryKind = 'landed';
      if (request.rally) payload.order = { type: 'move', ...game.resolveMoveGoal(payload, request.rally.x, request.rally.y) };
      cargo.stage = 'taxiOut';
      battleMetric(game, plane.owner, 'unitsProduced', 1);
      if (plane.owner === 0) { game.events.notice?.(`${UNITS[request.type].name}已在机场卸载`); game.events.voice?.('unitReady'); }
      break;
    }
    case 'taxiOut':
      if (follow(game, plane, path.turn, dt, 44)) cargo.stage = 'takeoff';
      break;
    case 'takeoff':
      if (follow(game, plane, path.lift, dt, 110)) cargo.stage = 'climb';
      break;
    case 'climb':
      if (follow(game, plane, path.exit, dt, 180)) {
        request.phase = 'outbound'; request.startedAt = game.time; delete request.cargo; plane.order = null;
      } else cargo.fraction = Math.max(0, 1 - gap(plane, path.exit) / Math.max(1, gap(path.lift, path.exit)));
      break;
  }
  return true;
}
