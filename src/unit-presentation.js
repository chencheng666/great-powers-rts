// 显示尺度和屏幕选取独立于战斗半径、射程及寻路，不改变联机规则。
export const PRESENTATION_KEY = 'great-powers-unit-presentation-v1';
export const presentationMode = value => value === 'reference' ? 'reference' : 'readable';
export function readPresentation(storage) {
  try { return presentationMode(storage?.getItem(PRESENTATION_KEY)); } catch { return 'readable'; }
}
export function groundPresentationFactor(entity, tags = [], zoom = 1, mode = 'readable', future = false) {
  if (mode === 'reference' || future || entity.kind !== 'unit' || tags.some(t => ['air', 'ship', 'submerged'].includes(t))) return 1;
  const distant = Math.max(0, Math.min(1, (1 - (Number.isFinite(zoom) ? zoom : 1)) / .55));
  return tags.includes('infantry') ? 1.5 + distant * .4 : 1.2 + distant * .2;
}
export function selectionTolerance(touch = false) { return touch ? 26 : 18; }
export function nearestScreenSelection(entries, x, y, tolerance, project, selectable) {
  let closest = null, limit = tolerance;
  for (const entry of entries) {
    if (!selectable(entry)) continue;
    const point = project(entry), distance = Math.hypot(x - point.x, y - point.y);
    if (distance < limit) { closest = entry.entity; limit = distance; }
  }
  return closest;
}
export function personnelRoleMark(type) {
  return { rifle: '兵', engineer: '工', scout: '侦', evacuee: '援' }[type] || '';
}
export function setupUnitPresentation(renderer) {
  const select = document.querySelector('#unit-presentation');
  if (!select) return;
  let storage; try { storage = localStorage; } catch { /* 无存储仍能调整当前战局。 */ }
  select.value = readPresentation(storage);
  const apply = () => {
    const value = presentationMode(select.value);
    if (renderer()) renderer().presentation = value;
    try { storage?.setItem(PRESENTATION_KEY, value); } catch { /* 设置仅在本次页面有效。 */ }
  };
  select.addEventListener('change', apply);
  document.querySelector('#battle-ui-reset').addEventListener('click', () => { select.value = 'readable'; apply(); });
}
