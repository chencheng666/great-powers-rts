import { landscapeNoise } from './terrain-materials.js';

// 山体位置使用地图比例，普通尺寸和扩展尺寸使用同一套谷地和坡面。
const PROFILES = {
  valley: [
    [.36, .16, .17, .18, 155], [.48, .12, .16, .17, 194], [.60, .20, .15, .17, 116],
    [.64, .84, .17, .18, 155], [.52, .88, .16, .17, 194], [.40, .80, .15, .17, 116]
  ],
  frontier: [
    [.26, .18, .13, .21, 154], [.40, .11, .16, .18, 183], [.54, .16, .14, .17, 119],
    [.74, .82, .13, .21, 154], [.60, .89, .16, .18, 183], [.46, .84, .14, .17, 119]
  ],
  canyon: [
    [.33, .14, .13, .19, 115], [.34, .82, .13, .17, 81],
    [.67, .86, .13, .19, 115], [.66, .18, .13, .17, 81]
  ],
  coast: [
    [.18, .11, .11, .21, 96], [.19, .83, .10, .16, 71],
    [.82, .89, .11, .21, 96], [.81, .17, .10, .16, 71]
  ],
  islands: [
    [.12, .15, .13, .19, 85], [.76, .16, .19, .18, 112],
    [.76, .85, .15, .17, 92], [.14, .87, .12, .17, 81]
  ],
  strategic: [
    [.25, .14, .13, .19, 142], [.44, .11, .15, .15, 170],
    [.75, .86, .13, .19, 142], [.56, .89, .15, .15, 170]
  ],
  moon: [
    [.31, .13, .14, .18, 57], [.69, .13, .14, .18, 57],
    [.29, .84, .17, .18, 64], [.71, .84, .17, .18, 64]
  ]
};

function hills(game) {
  const { map, mapId } = game;
  if (map.future) return PROFILES.moon;
  if (map.industrial || map.ridges) return [];
  if (map.islands) return PROFILES.islands;
  if (map.strategic) return PROFILES.strategic;
  if (map.water) return PROFILES.coast;
  if (mapId === 'canyon') return PROFILES.canyon;
  if (mapId === 'frontier') return PROFILES.frontier;
  return ['valley', 'valleyTraining', 'commanderTrial'].includes(mapId) ? PROFILES.valley : [];
}

export function battlefieldRelief(game, x, y) {
  const nx = x / game.world.width;
  const ny = y / (game.world.height || game.homeY * 2);
  let elevation = 0;
  for (const [cx, cy, rx, ry, height] of hills(game)) {
    const dx = (nx - cx) / rx;
    const dy = (ny - cy) / ry;
    const falloff = Math.max(0, 1 - dx * dx - dy * dy);
    const texture=game.map.future?1:.78+(1-Math.abs(landscapeNoise(x*.007,y*.007)*2-1))*.27+landscapeNoise(x*.024,y*.024)*.1;
    elevation = Math.max(elevation, height * falloff * falloff * texture);
  }
  return elevation;
}

export function battlefieldReliefGLSL(game) {
  const f = n => n.toFixed(6);
  const peaks = hills(game).map(([cx, cy, rx, ry, height]) =>
    `  h = max(h, battlefieldHill((n - vec2(${f(cx)}, ${f(cy)})) / vec2(${f(rx)}, ${f(ry)})) * ${f(height)});`);
  return `
float battlefieldHill(vec2 d) {
  float falloff = max(0.0, 1.0 - dot(d, d));
  return falloff * falloff;
}
float battlefieldRelief(vec2 p) {
  vec2 n = p / vec2(${f(game.world.width)}, ${f(game.world.height)});
  float h = 0.0;
${peaks.join('\n')}
  ${game.map.future?'':'h *= .78+(1.0-abs(geoNoise(p*.007)*2.0-1.0))*.27+geoNoise(p*.024)*.1;'}
  return h;
}`;
}

// 从相机向地表采样。先找最前方的交点，再细分，避免落点穿过坡脊。
export function intersectBattlefieldSurface(ray, elevation, world) {
  if (ray.direction.y >= -0.01) return null;
  const start = Math.max(0, (330 - ray.origin.y) / ray.direction.y);
  const end = (-45 - ray.origin.y) / ray.direction.y;
  if (end <= start) return null;
  const point = t => ({
    x: ray.origin.x + ray.direction.x * t,
    y: ray.origin.z + ray.direction.z * t
  });
  const above = t => {
    const p = point(t);
    return ray.origin.y + ray.direction.y * t > elevation(p.x, p.y);
  };
  let last = start;
  for (let step = 1; step <= 18; step++) {
    let next = start + (end - start) * step / 18;
    if (above(next)) { last = next; continue; }
    for (let i = 0; i < 9; i++) {
      const mid = (last + next) / 2;
      if (above(mid)) last = mid;
      else next = mid;
    }
    const p = point(next);
    return p.x >= 0 && p.y >= 0 && p.x <= world.width && p.y <= world.height ? p : null;
  }
  return null;
}
