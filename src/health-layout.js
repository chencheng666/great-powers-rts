const overlaps = (a, b) => a.x < b.x + b.width + 3 && a.x + a.width + 3 > b.x && a.y < b.y + b.height + 3 && a.y + a.height + 3 > b.y;

export function layoutHealthBars(bars, viewport, obstacles = []) {
  const occupied = [...obstacles], result = [];
  for (const bar of [...bars].sort((a, b) => b.priority - a.priority || a.anchorY - b.anchorY || a.id - b.id)) {
    const candidates = [];
    for (let row = 0; row <= 8; row++) for (const col of [0, -1, 1]) {
      const dx = col * (bar.width + 6), dy = -row * (bar.height + 4);
      candidates.push({ x: Math.round(bar.anchorX - bar.width / 2 + dx), y: Math.round(bar.anchorY - bar.height + dy), width: bar.width, height: bar.height, cost: Math.abs(dx) + Math.abs(dy) * 1.1 });
      if (row && row <= 3) candidates.push({ x: Math.round(bar.anchorX - bar.width / 2 + dx), y: Math.round(bar.anchorY - bar.height - dy), width: bar.width, height: bar.height, cost: Math.abs(dx) + Math.abs(dy) * 1.4 });
    }
    candidates.sort((a, b) => a.cost - b.cost);
    const rect = candidates.find(candidate => candidate.x >= 4 && candidate.y >= 4 && candidate.x + candidate.width <= viewport.width - 4 && candidate.y + candidate.height <= viewport.height - 4 && !occupied.some(other => overlaps(candidate, other)));
    if (!rect) continue;
    occupied.push(rect); result.push({ ...bar, ...rect });
  }
  return result;
}
