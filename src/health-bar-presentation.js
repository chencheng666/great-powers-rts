// 血条以屏幕像素计，不随镜头放大；详细数字与弹药只给当前关注单位。
export function healthBarPresentation(entity, { infantry = false, ship = false, selected = false, hovered = false, selectedCount = 0, recentlyHit = false } = {}) {
  const ratio = Math.max(0, Math.min(1, entity.hp / entity.maxHp));
  return {
    width: entity.kind === 'building' ? 56 : ship ? 42 : infantry ? 28 : 34,
    trackHeight: entity.kind === 'building' ? 7 : 5,
    numeric: hovered || selected && selectedCount === 1,
    detailed: hovered || selected && selectedCount <= 4,
    priority: hovered ? 6 : selected ? 5 : recentlyHit ? 4 : ratio <= .25 ? 3 : ratio < 1 ? 2 : 1,
    maxOffset: hovered || selected ? 64 : 28,
  };
}
export function healthBarBudget(viewport) { return viewport.width <= 600 ? 64 : 120; }
