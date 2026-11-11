import { SCENERY_MESHES } from './map-scenery-mesh-data.js';

const supplies = [
  ['pallet', -30, 0, 22], ['crate', -2, 0, 22], ['barrelA', 24, -8, 16],
  ['barrelB', 28, 14, 15], ['cylinder', 7, 25, 15]
];
const port = [
  ['cargo', -45, -12, 77], ['siteOffice', 30, -32, 60], ['fence', 16, 38, 60],
  ['barrier', -30, 47, 28], ['cone', 49, 43, 10]
];
const industry = [
  ['factory', -88, -34, 96], ['warehouse', 24, -32, 93],
  ['solar', 12, 45, 44], ['wind', 75, 44, 81]
];
const village = [
  ['stoneWall', -35, 0, 58], ['woodBarrels', 21, -21, 24], ['stoneBridge', 35, 45, 65]
];
const station = [
  ['stationGate', -24, -28, 47], ['stationWall', 27, -28, 43],
  ['stationFloor', -25, 17, 44], ['stationFloor', 25, 17, 44]
];

export function mapSceneryPoints(game, elevation) {
  const { map, world } = game;
  const points = [];
  const protectedSites = [...game.buildings, ...game.ore, ...game.oil, ...game.beacons, ...(game.resourceSites || [])];
  function cluster(x, z, layout, flipped = false) {
    const sign = flipped ? -1 : 1;
    for (const [name, dx, dz, scale] of layout) {
      const px = x + dx * sign;
      const pz = z + dz * sign;
      const radius = scale * .46;
      if (px < 42 + radius || px > world.width - 42 - radius || pz < 42 + radius || pz > world.height - 42 - radius) continue;
      if (map.water && !map.islands && px > map.water.x1 - radius && px < map.water.x2 + radius) continue;
      if (game.isGroundBlocked(px, pz, radius) || elevation(px, pz) < 0) continue;
      if (protectedSites.some(site => Math.hypot(site.x - px, site.y - pz) < (site.size || 66) * .6 + radius)) continue;
      const relief = Math.abs(elevation(px - radius, pz) - elevation(px + radius, pz)) +
        Math.abs(elevation(px, pz - radius) - elevation(px, pz + radius));
      if (relief > scale * .45) continue;
      points.push({ name, x: px, z: pz, scale, width: scale, angle: flipped ? Math.PI : 0 });
    }
  }

  if (map.future) {
    cluster(world.width * .35, world.height * .27, station);
    cluster(world.width * .65, world.height * .73, station, true);
    return points;
  }

  for (const site of (game.resourceSites || []).filter(site => site.type === 'depot' || site.type === 'salvage')) {
    const east = site.x > world.width / 2;
    cluster(site.x + (east ? 98 : -98), site.y, supplies, east);
  }
  if (map.islands) {
    for (const harbor of map.harbors || []) {
      cluster(harbor.x - Math.cos(harbor.angle) * 125, harbor.y - 95, port);
    }
  } else if (map.water) {
    cluster(map.water.x1 - 160, world.height * .29, port);
    cluster(map.water.x2 + 160, world.height * .71, port, true);
  } else {
    cluster(world.width * .28, world.height * .37, village);
    cluster(world.width * .72, world.height * .63, village, true);
    cluster(world.width * .33, world.height * .64, industry);
    cluster(world.width * .67, world.height * .36, industry, true);
    if (map.industrial) cluster(world.width * .43, world.height * .76, port);
  }
  return points;
}

export { SCENERY_MESHES };
