const FRIENDLY = Object.freeze({ color: '#68d9f2', damaged: '#43b7d3', critical: '#278aa8', echo: '#b8ebf5', frame: '#94e8f7', line: '#68d9f299', marker: 'square', label: '我方' });
const HOSTILE = Object.freeze({ color: '#ff7668', damaged: '#ec5649', critical: '#c43b35', echo: '#ffc0ac', frame: '#ff9f91', line: '#ff766899', marker: 'diamond', label: '敌方' });
const NEUTRAL = Object.freeze({ color: '#e4c67e', frame: '#f0d8a5', marker: 'circle', label: '中立' });

export function teamVisual(owner, localPlayer = 0) {
  return owner === null || owner === undefined ? NEUTRAL : owner === localPlayer ? FRIENDLY : HOSTILE;
}

export function healthVisual(owner, ratio, localPlayer = 0) {
  const team = teamVisual(owner, localPlayer), value = Math.max(0, Math.min(1, Number.isFinite(ratio) ? ratio : 0));
  return { ...team, fill: value > .5 ? team.color : value > .25 ? team.damaged || team.color : team.critical || team.color, warning: value <= .25, hostile: owner !== null && owner !== undefined && owner !== localPlayer };
}

export function showHealthBar(entity, visible, selected, hovered, recentlyHit = false, localPlayer = 0) {
  if (!visible || entity.hp <= 0 || entity.embarkedIn) return false;
  return entity.owner !== localPlayer || entity.hp < entity.maxHp || selected || hovered || recentlyHit;
}
