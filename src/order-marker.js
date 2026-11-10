// 目的地箭头沿屏幕中的最后一段路径指向真实落点，尺寸不随地图缩放。
export function destinationArrow(points) {
  if (points.length < 2 || points.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return null;
  const tip = points.at(-1);
  let index = points.length - 2;
  while (index >= 0 && Math.hypot(tip.x - points[index].x, tip.y - points[index].y) < .01) index--;
  if (index < 0) return null;
  const from = points[index], length = Math.hypot(tip.x - from.x, tip.y - from.y);
  const dx = (tip.x - from.x) / length, dy = (tip.y - from.y) / length;
  const size = Math.min(11, length), width = size * .46;
  const at = (back, side = 0) => ({ x: tip.x - dx * back - dy * side, y: tip.y - dy * back + dx * side });
  return {
    line: [...points.slice(0, index + 1), at(size)],
    outline: [tip, at(size, width), at(size * .65), at(size, -width)],
    tip,
  };
}
