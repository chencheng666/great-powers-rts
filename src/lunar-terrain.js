const layouts = new WeakMap();
const noise = i => { const v = Math.sin(i * 127.1 + 31.7) * 43758.5; return v - Math.floor(v); };
const clamp = v => Math.max(0, Math.min(1, v));

export function lunarCraters(game) {
  if (!game.map.future) return [];
  const { width, height = 2080 } = game.world, key = `${width}:${height}:${game.homeY}`;
  if (!layouts.has(game.map)) layouts.set(game.map, new Map());
  const cache = layouts.get(game.map);
  if (!cache.has(key)) {
    const result = [], scale = Math.min(width / 3200, height / 2080);
    const sites = [...(game.map.ore || []).map(([x, y]) => ({ x, y })), ...(game.map.oil || []), ...(game.map.beacons || [])];
    const protectedPoint = (x, y, radius) => sites.some(s => Math.hypot(x - s.x, y - s.y) < radius * 1.3 + 65 * scale) ||
      [...(game.map.cover || []), ...(game.map.barriers || [])].some(r => Math.hypot(x - Math.max(r.x1, Math.min(r.x2, x)), y - Math.max(r.y1, Math.min(r.y2, y))) < radius * 1.3 + 20);
    for (let i = 0; i < 70 && result.length < 32; i++) {
      const x = width * (.24 + noise(i + 7) * .23), y = height * (.07 + noise(i + 19) * .86);
      const radius = (45 + noise(i + 37) * 58) * scale;
      if (Math.abs(y - game.homeY) < radius + 140 || protectedPoint(x, y, radius) || protectedPoint(width - x, y, radius) ||
        result.some(c => Math.hypot(c.x - x, c.y - y) < c.radius + radius + 30)) continue;
      for (const cx of [x, width - x]) result.push({ x: cx, y, radius, depth: 6 + noise(i + 53) * 8 });
    }
    if (cache.size >= 4) cache.delete(cache.keys().next().value);
    cache.set(key, result);
  }
  return cache.get(key);
}

export function craterBowl(distance, radius, depth) {
  const q = distance / radius;
  if (q >= 1.3) return 0;
  const bowl = q < 1 ? -depth * (1 - q * q) ** 2 : 0;
  const rim = depth * .16 * Math.exp(-(((q - .93) / .16) ** 2));
  return (bowl + rim) * clamp((1.3 - q) / .2);
}

export function lunarRelief(game, x, y) {
  return lunarCraters(game).reduce((height, c) => height + craterBowl(Math.hypot(x - c.x, y - c.y), c.radius, c.depth), 0);
}

export function lunarReliefGLSL(game) {
  const n = value => value.toFixed(5);
  return `float moonBowl(vec2 p, vec2 center, float radius, float depth) {
    float q = distance(p, center) / radius;
    if (q >= 1.3) return 0.0;
    float basin = q < 1.0 ? -depth * pow(1.0 - q * q, 2.0) : 0.0;
    float rim = depth * .16 * exp(-pow((q - .93) / .16, 2.0));
    return (basin + rim) * clamp((1.3 - q) / .2, 0.0, 1.0);
  }
  float moonRelief(vec2 p) {
    float h = 0.0;
    ${lunarCraters(game).map(c => `h += moonBowl(p, vec2(${n(c.x)}, ${n(c.y)}), ${n(c.radius)}, ${n(c.depth)});`).join('\n')}
    return h;
  }`;
}
