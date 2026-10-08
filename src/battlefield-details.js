import { BUILDINGS, FACTIONS, PRODUCERS, UNITS } from './data.js';
import { equipmentProfile } from './equipment.js';
import { unitRadius } from './unit-spacing.js';
import { lunarBuildingProfile } from './lunar-robots.js';

export function productionExit(building, type) {
  const side = building.owner === 0 ? 1 : -1, tags = UNITS[type].tags;
  const reach = building.size * .45 + (tags.includes('infantry') ? 10 : 21);
  return { x: building.x + side * reach, y: building.y + side * building.size * .2, angle: side > 0 ? 0 : Math.PI, side, distance: tags.includes('infantry') ? 62 : Math.max(82, unitRadius({ type }) * 2 + 22) };
}

export function productionDuration(game, building, type) {
  return UNITS[type].time * (game.players[building.owner].faction === 'nato' ? 1.06 : 1) * (!game.hasPower(building.owner) && ['armory', 'airfield', 'dock'].includes(building.type) ? 2 : 1);
}

export function buildingInformation(game, building) {
  if (!building || building.kind !== 'building' || building.hp <= 0 || !game.canSeeEntity(0, building)) return null;
  const data = lunarBuildingProfile(game.map.future, building.type, BUILDINGS[building.type]), own = building.owner === 0;
  const producer = PRODUCERS.includes(building.type), active = own ? building.active : null;
  const duration = active ? productionDuration(game, building, active.type) : 0;
  return {
    id: building.id, name: data.name, description: data.desc,
    faction: FACTIONS[game.players[building.owner].faction].name, own,
    health: Math.ceil(building.hp), maxHealth: Math.ceil(building.maxHp), ratio: building.hp / building.maxHp,
    power: data.power, cost: data.cost, time: data.time,
    status: building.sabotage ? `定时破坏 ${Math.max(0,Math.ceil(building.sabotage.detonateAt-game.time))} 秒` : !own ? '敌方设施' : building.repairing ? '维修中' : !game.hasPower(0) && data.power < 0 ? '供电不足' : active ? '生产中' : producer ? '生产线待命' : '运行正常',
    producer, repairing: own && building.repairing,
    queue: own ? building.queue.length : null,
    production: active ? { name: equipmentProfile(game.players[building.owner].faction, active.type, game.map.future).name, progress: Math.min(1, active.progress / duration), remaining: Math.max(0, Math.ceil(duration - active.progress)) } : null,
    rally: own ? building.rallyPoint : null
  };
}

const overlapArea = (a, b) => Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));

export function placeBuildingPanel(anchor, size, viewport, obstacles = []) {
  const width = Math.min(size.width, viewport.width - 16), height = Math.min(size.height, viewport.height - 16), gap = 18;
  const candidates = [
    { x: anchor.x + gap, y: anchor.y - height / 2 },
    { x: anchor.x - width - gap, y: anchor.y - height / 2 },
    { x: anchor.x - width / 2, y: anchor.y - height - gap },
    { x: anchor.x - width / 2, y: anchor.y + gap }
  ];
  for (const x of [8, viewport.width - width - 8]) for (const y of [8, (viewport.height - height) / 2, viewport.height - height - 8]) candidates.push({ x, y });
  const xs = [8, viewport.width - width - 8, anchor.x - width / 2], ys = [8, viewport.height - height - 8, anchor.y - height / 2];
  for (const obstacle of obstacles) { xs.push(obstacle.x - width - 2, obstacle.x + obstacle.width + 2); ys.push(obstacle.y - height - 2, obstacle.y + obstacle.height + 2); }
  for (const x of xs) for (const y of ys) candidates.push({ x, y });
  return candidates.map(point => ({ x: Math.max(8, Math.min(viewport.width - width - 8, point.x)), y: Math.max(8, Math.min(viewport.height - height - 8, point.y)), width, height }))
    .sort((a, b) => obstacles.reduce((sum, obstacle) => sum + overlapArea(a, obstacle) - overlapArea(b, obstacle), 0) * 1000 + Math.hypot(a.x + width / 2 - anchor.x, a.y + height / 2 - anchor.y) - Math.hypot(b.x + width / 2 - anchor.x, b.y + height / 2 - anchor.y))[0];
}
