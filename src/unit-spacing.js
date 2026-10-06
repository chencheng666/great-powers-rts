import { UNITS } from './data.js';

export function unitLayer(unit) {
  const tags = UNITS[unit.type].tags;
  return tags.includes('jet') ? 'jet' : tags.includes('drone') ? 'drone' : tags.includes('submerged') ? 'submerged' : tags.includes('ship') ? 'naval' : 'ground';
}

export function unitRadius(unit) {
  const tags = UNITS[unit.type].tags;
  if (tags.includes('infantry')) return 9;
  if (tags.includes('jet')) return { airlift: 80, bomber: 76 }[unit.type] || 40;
  if (tags.includes('drone')) return 20;
  if (tags.includes('ship')) return { carrier: 92, destroyer: 65, submarine: 46, frigate: 48, patrol: 36, landing: 74 }[unit.type] || 48;
  return unit.type === 'harvester' ? 29 : 30;
}

export class UnitSpatialIndex {
  constructor(units) {
    this.cells = new Map();
    for (const unit of units) {
      if (unit.hp <= 0 || unit.embarkedIn) continue;
      const key = `${unitLayer(unit)}:${Math.floor(unit.x / 224)}:${Math.floor(unit.y / 224)}`;
      if (!this.cells.has(key)) this.cells.set(key, []);
      this.cells.get(key).push(unit);
    }
  }

  nearby(unit) {
    const result = [], x = Math.floor(unit.x / 224), y = Math.floor(unit.y / 224), layer = unitLayer(unit);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      for (const other of this.cells.get(`${layer}:${x + dx}:${y + dy}`) || []) if (other !== unit && other.hp > 0) result.push(other);
    }
    return result;
  }
}

export function formationOffsets(units, target) {
  const result = new Map(), layers = new Map();
  for (const unit of units) {
    const layer = unitLayer(unit);
    if (!layers.has(layer)) layers.set(layer, []);
    layers.get(layer).push(unit);
  }
  for (const group of layers.values()) {
    const center = group.reduce((value, unit) => ({ x: value.x + unit.x / group.length, y: value.y + unit.y / group.length }), { x: 0, y: 0 });
    const angle = Math.atan2(target.y - center.y, target.x - center.x), forward = { x: Math.cos(angle), y: Math.sin(angle) }, right = { x: -forward.y, y: forward.x };
    const columns = Math.ceil(Math.sqrt(group.length)), rows = Math.ceil(group.length / columns), spacing = Math.max(...group.map(unitRadius)) * 2 + 12;
    const slots = [];
    for (let row = 0; row < rows; row++) {
      const count = Math.min(columns, group.length - row * columns);
      for (let col = 0; col < count; col++) {
        const across = (col - (count - 1) / 2) * spacing, depth = (row - (rows - 1) / 2) * spacing;
        slots.push({ x: across * right.x + depth * forward.x, y: across * right.y + depth * forward.y });
      }
    }
    // 部分行也以整支编队的重心为准，避免少量部队偏离点击位置。
    const mean = slots.reduce((value, slot) => ({ x: value.x + slot.x / slots.length, y: value.y + slot.y / slots.length }), { x: 0, y: 0 });
    const remaining = [...group].sort((a, b) => a.id - b.id);
    for (const slot of slots) {
      const offset = { x: slot.x - mean.x, y: slot.y - mean.y };
      remaining.sort((a, b) => Math.hypot(a.x - target.x - offset.x, a.y - target.y - offset.y) - Math.hypot(b.x - target.x - offset.x, b.y - target.y - offset.y) || a.id - b.id);
      result.set(remaining.shift().id, offset);
    }
  }
  return result;
}

export function separateUnits(units, dt, canMove, time = 0) {
  const live = units.filter(unit => unit.hp > 0 && !unit.embarkedIn).sort((a, b) => a.id - b.id);
  const shift = (unit, dx, dy) => {
    const point = { x: unit.x + dx, y: unit.y + dy };
    if (!canMove(unit, point)) return false;
    unit.x = point.x; unit.y = point.y;
    return true;
  };
  // 每轮重新索引，用小幅约束修正消除拥挤，不把单位瞬移到另一侧。
  for (let pass = 0; pass < 3; pass++) {
    const index = new UnitSpatialIndex(live);
    for (const a of live) for (const b of index.nearby(a)) {
      if (a.id >= b.id) continue;
      let dx = b.x - a.x, dy = b.y - a.y, distance = Math.hypot(dx, dy);
      const minimum = unitRadius(a) + unitRadius(b) + 2;
      if (distance >= minimum - .01) continue;
      if (distance < .001) { const angle = ((a.id * 13 + b.id * 7) % 32) * Math.PI / 16; dx = Math.cos(angle); dy = Math.sin(angle); distance = 1; }
      const push = Math.min((minimum - distance) / 2, dt * 60 / 3), nx = dx / distance, ny = dy / distance;
      const aMobile = !(a.stunUntil > time), bMobile = !(b.stunUntil > time);
      const movedA = aMobile && shift(a, -nx * push, -ny * push);
      const movedB = bMobile && shift(b, nx * push, ny * push);
      if (!movedA && movedB) shift(b, nx * push, ny * push);
      if (!movedB && movedA) shift(a, -nx * push, -ny * push);
    }
  }
}
