const ellipse = (x, y, rx, ry) => Array.from({ length: 16 }, (_, i) => {
  const a = i * Math.PI / 8, r = 1 + Math.sin(i * 2.7) * .045;
  return [Math.round(x + Math.cos(a) * rx * r), Math.round(y + Math.sin(a) * ry * r)];
});

export function islandWatchMap() {
  return {
    name: '山海列岛', sector: '独立群岛 · 列岛守望', missionOnly: true, fixedScale: true,
    world: { width: 4480, height: 3200, cell: 40, fog: 80 },
    ore: [], oil: [], barriers: [], noBuild: [], bridges: [], dockZones: [],
    water: { x1: 0, y1: 0, x2: 4480, y2: 3200 },
    islands: [
      { name: '后方基地岛', points: ellipse(700, 2520, 560, 560) },
      { name: '守望主岛', points: [[2240,1060],[2700,980],[3160,1200],[3280,1590],[3140,2040],[2740,2200],[2310,2070],[2110,1780],[2110,1400]] },
      { name: '北侧林岛', points: ellipse(1100, 580, 410, 280) },
      { name: '东南礁岛', points: ellipse(3940, 2660, 340, 340) },
      { name: '远海岩岛', points: ellipse(3920, 620, 260, 280) }
    ],
    beaches: [{ x1: 1940, y1: 1400, x2: 2280, y2: 1780 }, { x1: 1070, y1: 2390, x2: 1380, y2: 2640 },
      {x1:900,y1:700,x2:1250,y2:1000},{x1:3460,y1:2530,x2:3750,y2:2810}],
    beacons: [{ id: 'island-signal', x: 2320, y: 1470 }, { id: 'island-port', x: 2260, y: 1790 }],
    resources: [{ id: 'island-power', type: 'depot', x: 2600, y: 1560 }],
    harbors: [{ x: 2200, y: 1720, angle: Math.PI, approach: { x: 1900, y: 1920 } }],
    freight: { goal: 1800, entry: { x: 180, y: 1080 }, lanes: {
      direct: [{ x: 1300, y: 1080 }, { x: 1700, y: 1180 }],
      coastal: [{ x: 1500, y: 2180 }, { x: 1700, y: 2100 }]
    } }
  };
}

// 同一条多边形海岸同时约束碰撞、地形高度、登陆点和小地图。
export function islandDistance(map, x, y) {
  let best = -Infinity;
  for (const island of map.islands || []) {
    let inside = false, nearest = Infinity;
    for (let i = 0, j = island.points.length - 1; i < island.points.length; j = i++) {
      const [ax, ay] = island.points[j], [bx, by] = island.points[i];
      if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside;
      const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
      nearest = Math.min(nearest, Math.hypot(x - ax - t * dx, y - ay - t * dy));
    }
    best = Math.max(best, inside ? nearest : -nearest);
  }
  return best;
}

export function islandHeight(map, x, y) {
  const d = islandDistance(map, x, y);
  if (d < -24) return -15;
  const t = Math.max(0, Math.min(1, (d + 24) / 64));
  return -15 + 23 * t * t * (3 - 2 * t);
}

export function islandHeightGLSL(map) {
  if (!map.islands) return '';
  const f = n => Number(n).toFixed(1);
  return `float islandHeight(vec2 p) { float d = -1e8;
    ${map.islands.map(island => `{ bool inside = false; float nearest = 1e8;
      ${island.points.map(([bx, by], i) => {
        const [ax, ay] = island.points[(i + island.points.length - 1) % island.points.length];
        return `{ vec2 a = vec2(${f(ax)},${f(ay)}), b = vec2(${f(bx)},${f(by)}), v = b-a;
          if ((a.y > p.y) != (b.y > p.y)) { if (p.x < (b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x) inside = !inside; }
          nearest = min(nearest, length(p-a-v*clamp(dot(p-a,v)/dot(v,v),0.0,1.0))); }`;
      }).join('\n')}
      d = max(d, inside ? nearest : -nearest); }`).join('\n')}
    float t = clamp((d+24.0)/64.0,0.0,1.0); return -15.0+23.0*t*t*(3.0-2.0*t); }`;
}

export const islandHarbor = (map, home) => map.harbors?.find(p => Math.hypot(p.x - home.x, p.y - home.y) < 2);
export const legalIslandLanding = (map, point) => !map.beaches || map.beaches.some(r => point.x >= r.x1 && point.x <= r.x2 && point.y >= r.y1 && point.y <= r.y2);
export const islandIndex = (map, point) => map.islands?.findIndex(island => islandDistance({islands:[island]},point.x,point.y)>=0) ?? -1;
