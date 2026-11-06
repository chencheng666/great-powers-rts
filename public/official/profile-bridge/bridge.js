const relatedOrigins = new Set(['https://www.daguojueqi.site', 'https://daguojueqi.site']);
window.addEventListener('message', event => {
  if (window.parent === window || event.source !== window.parent || !relatedOrigins.has(event.origin)) return;
  if (event.data?.type !== 'gp-read-honors' || !/^[a-f0-9-]{36}$/i.test(event.data.nonce || '')) return;
  let profile = null;
  try { profile = localStorage.getItem('great-powers-player-honors-v1'); } catch { /* 存储被禁用时返回空值。 */ }
  if (profile && profile.length > 8 * 1024 * 1024) return;
  event.source.postMessage({ type: 'gp-local-honors', nonce: event.data.nonce, profile }, event.origin);
});
