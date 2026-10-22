import PF from 'pathfinding';
import { unitRadius, unitLayer } from './unit-spacing.js';

export function navalPath(game, unit, goal) {
  const radius = Math.max(18, unitRadius(unit)), cell = game.world.cell;
  const cols = game.world.width / cell, rows = game.world.height / cell;
  game.islandNavGrids ||= new Map();
  if (!game.islandNavGrids.has(radius)) {
    const grid = new PF.Grid(cols, rows);
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      if (game.isNavalBlocked((x + .5) * cell, (y + .5) * cell, radius + 8)) grid.setWalkableAt(x, y, false);
    }
    game.islandNavGrids.set(radius, grid);
  }
  const grid = game.islandNavGrids.get(radius).clone();
  for(const peer of game.activeUnits(unit.owner).filter(v=>v!==unit && !v.order && ['naval','submerged'].includes(unitLayer(v)) && Math.hypot(v.x-unit.x,v.y-unit.y)<900)){
    const clearance=radius+unitRadius(peer)+12;
    for(let y=Math.max(0,Math.floor((peer.y-clearance)/cell));y<Math.min(rows,Math.ceil((peer.y+clearance)/cell));y++)for(let x=Math.max(0,Math.floor((peer.x-clearance)/cell));x<Math.min(cols,Math.ceil((peer.x+clearance)/cell));x++){
      if(Math.hypot((x+.5)*cell-peer.x,(y+.5)*cell-peer.y)<clearance)grid.setWalkableAt(x,y,false);
    }
  }
  const pos = p => [Math.max(0, Math.min(cols - 1, Math.floor(p.x / cell))), Math.max(0, Math.min(rows - 1, Math.floor(p.y / cell)))];
  const [sx, sy] = pos(unit), [gx, gy] = pos(goal);
  grid.setWalkableAt(sx, sy, true);
  if (game.isNavalBlocked(goal.x, goal.y, radius)) return [];
  grid.setWalkableAt(gx, gy, true);
  const finder = new PF.AStarFinder({ allowDiagonal: true, dontCrossCorners: true, heuristic: PF.Heuristic.octile });
  const path = finder.findPath(sx, sy, gx, gy, grid);
  return PF.Util.compressPath(path).slice(1).map(([x, y]) => ({ x: (x + .5) * cell, y: (y + .5) * cell }));
}

export function nearestSeaPoint(game, x, y, radius) {
  const w = game.map.water, clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const goal = { x: clamp(x, w.x1 + radius, w.x2 - radius), y: clamp(y, w.y1 + radius, w.y2 - radius) };
  if (!game.isNavalBlocked(goal.x, goal.y, radius)) return goal;
  let best = null, score = Infinity;
  for (let r = 40; r <= Math.max(game.world.width, game.world.height); r += 40) {
    for (let n = 0; n < 32; n++) {
      const a = n * Math.PI / 16, p = { x: goal.x + Math.cos(a) * r, y: goal.y + Math.sin(a) * r };
      if (game.isNavalBlocked(p.x, p.y, radius)) continue;
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < score) { best = p; score = d; }
    }
    if (best) return best;
  }
  return goal;
}
