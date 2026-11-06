import { CHALLENGES } from './challenges.js';

export const OPERATION_ROUTES = [
  { id: 'land', name: '陆地指挥', description: '从护送、反制到轮换守线', missions: ['corridor', 'airshield', 'passwatch'] },
  { id: 'sea', name: '深蓝航线', description: '登陆、护航与前哨保障', missions: ['beachhead', 'lifeline', 'seabreach'] },
  { id: 'combined', name: '协同任务', description: '侦察、工业接管与人员撤离', missions: ['recon', 'ironworks', 'homebound'] }
];

// 直接使用已有挑战档案，旧成绩和合并导入的成绩都能接续路线。
export function operationProgress(records) {
  return OPERATION_ROUTES.map(route => {
    const completed = route.missions.filter(id => records[id]?.wins > 0).length;
    const next = route.missions.find(id => !records[id]?.wins)
      || route.missions.reduce((weakest, id) => (records[id]?.bestStars || 0) < (records[weakest]?.bestStars || 0) ? id : weakest);
    return { ...route, completed, next, mastered: route.missions.every(id => records[id]?.bestStars === 3) };
  });
}

export function operationRoutesHTML(records) {
  const cards = operationProgress(records).map(route => {
    const missions = route.missions.map(id =>
      `<li class="${records[id]?.wins ? 'complete' : ''}">${records[id]?.wins ? '✓ ' : ''}${CHALLENGES[id].name}</li>`
    ).join('');
    const action = route.completed < route.missions.length ? '继续' : route.mastered ? '重温' : '提升星级';
    return `<article><h4>${route.name}<span>${route.completed} / ${route.missions.length}</span></h4><p>${route.description}</p><ol>${missions}</ol><button class="secondary-btn" data-modal="challenge-${route.next}">${action} · ${CHALLENGES[route.next].name}</button></article>`;
  }).join('');
  return `<section class="operation-routes" aria-label="作战路线"><h3>下一场，练点什么？</h3><p>三条路线，每条三项独立任务。按顺序练习，也可以自由挑战；通关成绩来自本机挑战档案。</p><div class="operation-route-grid">${cards}</div></section>`;
}

export function nextOperation(challengeId, records) {
  const route = operationProgress(records).find(item => item.missions.includes(challengeId));
  return route && route.next !== challengeId ? route.next : null;
}
