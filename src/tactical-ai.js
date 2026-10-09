import { UNITS, supportsMap } from './data.js';

export function knownThreats(game, side) {
  const units = game.activeUnits(1 - side).filter(u => game.canSeeEntity(side, u));
  const count = tag => units.filter(u => UNITS[u.type].tags.includes(tag)).length;
  return { air: count('air'), drones: count('drone'), armor: count('armor'), subs: count('submerged'), ships: count('ship'), forts: game.ownedBuildings(1 - side, 'turret').filter(b => game.canSeeEntity(side, b)).length };
}

export function aiCounterUnit(game, side, choices, domain = 'ground') {
  const threats = knownThreats(game, side), counts = new Map();
  for (const u of game.ownedUnits(side)) counts.set(u.type, (counts.get(u.type) || 0) + 1);
  for (const b of game.ownedBuildings(side)) for (const type of [...b.queue, ...(b.active ? [b.active.type] : [])]) counts.set(type, (counts.get(type) || 0) + 1);
  const ground = game.activeUnits(side).filter(u => UNITS[u.type].damage > 0 && !UNITS[u.type].tags.some(t => ['air', 'ship'].includes(t))).length;
  const demands = domain === 'air' ? [['fighter', Math.ceil(threats.air / 2), 4], ['navalFighter', Math.ceil(threats.air / 2), 4]]
    : domain === 'naval' ? [['frigate', Math.ceil((threats.subs + threats.air) / 2), 4], ['submarine', Math.ceil(threats.ships / 3), 2]]
    : [['aa', Math.ceil(threats.air / 2), 3], ['laser', Math.ceil(threats.drones / 3), 4], ['loiterer', Math.ceil(threats.armor / 3), 2], ['rocket', Math.ceil((threats.armor + threats.forts * 2) / 4), 2], ['supply', ground >= 4 ? 1 : 0, 1]];
  const available = demands.filter(([type, desired]) => {
    const d = UNITS[type];
    return choices.includes(type) && desired > (counts.get(type) || 0) && supportsMap(d.map, game.mapId) && (!d.faction || d.faction === game.players[side].faction) && (!d.requires || game.hasBuilding(side, d.requires)) && game.hasBuilding(side, d.producer);
  });
  available.sort((a, b) => (b[1] - (counts.get(b[0]) || 0)) * b[2] - (a[1] - (counts.get(a[0]) || 0)) * a[2]);
  return available[0]?.[0] || null;
}

export function retreatAIUnits(game, side) {
  if (!game.hasPower(side) || game.players[side].credits < 60) return;
  for (const u of game.activeUnits(side)) {
    const d = UNITS[u.type];
    if (!d.damage || u.temporaryUntil || u.passengers?.length || ['rearm', 'board', 'restock'].includes(u.order?.type)) continue;
    const depleted = d.ammo && u.ammo <= Math.floor(d.ammo * .25);
    if (u.hp / u.maxHp >= .32 && !depleted) continue;
    const station = d.tags.includes('air') ? 'airfield' : d.tags.includes('ship') ? 'dock' : d.tags.includes('infantry') ? 'barracks' : 'factory';
    if (!game.hasBuilding(side, station) && !(station === 'factory' && game.hasBuilding(side, 'armory'))) continue;
    game.requestResupply(u);
  }
}
