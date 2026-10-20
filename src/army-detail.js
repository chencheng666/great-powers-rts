// 大军团优先展示选中和镜头中心的人物精模，其余保留骨骼动作的低模。
export function armyDetailPlan(units, zoom, quality, selected, center, previous) {
  // 进入与退出使用不同阈值，镜头或视野人数轻微波动时不反复换模型。
  const zoomNear = previous ? zoom >= (previous.zoomNear ? 1.58 : 1.74) : zoom >= 1.7;
  const tier = units.length > 160 || previous?.tier === 2 && units.length > 144 ? 2 : units.length > 96 || previous?.tier > 0 && units.length > 84 ? 1 : 0;
  const trackBudget = units.length <= (previous?.trackBudget === false ? 112 : 120);
  const zoomTracks = previous ? zoom >= (previous.zoomTracks ? 1.34 : 1.46) : zoom >= 1.4;
  const limit = !zoomNear ? 0 : tier === 2 ? 12 : tier === 1 ? 24 : quality === 'high' ? Infinity : 32;
  const selectedIds = new Set(selected);
  const score = u => Math.hypot(u.x-center.x,u.y-center.y) - (previous?.near?.has(u.id) ? 70 : 0);
  const ranked = units.filter(u=>['rifle','engineer','scout'].includes(u.type)).sort((a,b)=> Number(selectedIds.has(b.id))-Number(selectedIds.has(a.id)) || score(a)-score(b) || a.id-b.id);
  return { near: new Set(ranked.slice(0,limit).map(u=>u.id)), tracks: zoomTracks && trackBudget, zoomNear, zoomTracks, trackBudget, tier };
}

export const inDetailViewport = (point,viewport,margin=100) => Number.isFinite(point.x) && Number.isFinite(point.y) && point.x >= -margin && point.y >= -margin && point.x <= viewport.width+margin && point.y <= viewport.height+margin;
