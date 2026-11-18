const CELL = 96;
const key = (x, y) => `${x}:${y}`;

export class TreeContactGrid {
  constructor(points) {
    this.cells = new Map();
    for (const point of points) {
      const cell = key(Math.floor(point.x / CELL), Math.floor(point.z / CELL));
      if (!this.cells.has(cell)) this.cells.set(cell, []);
      this.cells.get(cell).push(point);
    }
  }

  cross(from, to, radius, time, visible) {
    const dx = to.x - from.x, dy = to.y - from.y, length2 = dx * dx + dy * dy;
    if (length2 < 1 || length2 > 96 ** 2) return [];
    const hit = [];
    for (let y = Math.floor((Math.min(from.y, to.y) - radius - 7) / CELL); y <= Math.floor((Math.max(from.y, to.y) + radius + 7) / CELL); y++) {
      for (let x = Math.floor((Math.min(from.x, to.x) - radius - 7) / CELL); x <= Math.floor((Math.max(from.x, to.x) + radius + 7) / CELL); x++) {
        for (const tree of this.cells.get(key(x, y)) || []) {
          if (tree.cleared || tree.fallenAt !== undefined) continue;
          const t = Math.max(0, Math.min(1, ((tree.x - from.x) * dx + (tree.z - from.y) * dy) / length2));
          if (Math.hypot(tree.x - from.x - t * dx, tree.z - from.y - t * dy) > radius + 7 || !visible(tree.x, tree.z)) continue;
          tree.fallenAt = time;
          tree.fallHeading = Math.atan2(dy, dx);
          hit.push(tree);
        }
      }
    }
    return hit;
  }
}

export function trailSamples(entry, end, spacing) {
  const start = entry.terrainPosition;
  entry.terrainPosition = end;
  if (!start) return [];
  const dx = end.x - start.x, dy = end.y - start.y, length = Math.hypot(dx, dy);
  if (length > 96 || end.time - start.time > .6) { entry.stepRemainder = 0; return []; }
  if (length < .01) return [];
  const heading = Math.atan2(dy, dx), result = [];
  const carry = entry.stepRemainder || 0;
  for (let d = spacing - carry; d <= length; d += spacing) {
    entry.stepSide = -(entry.stepSide || 1);
    result.push({ x: start.x + dx * d / length - Math.sin(heading) * entry.stepSide * 2.2,
      y: start.y + dy * d / length + Math.cos(heading) * entry.stepSide * 2.2, heading, start: end.time });
  }
  entry.stepRemainder = (carry + length) % spacing;
  return result;
}
