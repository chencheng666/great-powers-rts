export const QUICK_PRESETS = Object.freeze({
  land: { mapId: 'valleyTraining', difficulty: 'recruit', victory: 'quick', description: '灰谷 · 新兵难度 · 跟着提示熟悉指挥' },
  sea: { mapId: 'strait', difficulty: 'recruit', victory: 'quick', description: '海峡前线 · 新兵难度 · 建造船坞，组织海陆协同' },
  combined: { mapId: 'confluence', difficulty: 'standard', victory: 'control', description: '山海会战 · 山口、港岛与外海 · 据点争夺' },
  control: { mapId: 'canyon', difficulty: 'standard', victory: 'control', description: '双桥裂谷 · 标准难度 · 争夺据点，累计积分获胜' },
});

export function setupQuickEntry({ onStart, onContinue, candidate = false }) {
  const start = document.querySelector('#quick-start-btn'), presets = document.querySelector('.quick-presets');
  const description = document.querySelector('#quick-entry-description');
  let choice = 'land';
  if (candidate) { presets.hidden = true; description.textContent = '六方实验战区 · 每席40单位 · 规则与普通双人独立'; }
  for (const button of presets.querySelectorAll('button')) button.addEventListener('click', () => {
    choice = button.dataset.quickPreset;
    for (const item of presets.querySelectorAll('button')) item.setAttribute('aria-pressed', String(item === button));
    description.textContent = QUICK_PRESETS[choice].description;
  });
  start.addEventListener('click', () => onStart(candidate ? { mapId: 'sixfront', difficulty: 'standard', victory: 'quick' } : QUICK_PRESETS[choice]));
  document.querySelector('#quick-continue-btn').addEventListener('click', onContinue);
  document.querySelector('#mode-guide-jump').addEventListener('click', () => {
    const panel = document.querySelector('#custom-deployment'); panel.open = true;
    panel.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
  });
  document.querySelector('#quick-challenge-btn').addEventListener('click', () => document.querySelector('#challenge-btn').click());
  document.querySelector('#quick-online-btn').addEventListener('click', () => document.querySelector('#online-btn').click());
  document.addEventListener('gp-deploying', event => {
    start.disabled = !!event.detail; start.textContent = event.detail ? '正在准备战场…' : '开始游戏';
    document.querySelector('#quick-continue-btn').disabled = !!event.detail;
  });
  const source = document.querySelector('#deployment-status'), status = document.querySelector('#quick-entry-status');
  new MutationObserver(() => { status.hidden = source.hidden; status.textContent = source.textContent; }).observe(source, { attributes: true, childList: true, characterData: true, subtree: true });
}
