const source = new URL('../assets/videos/battle-montage-20261026.mp4', import.meta.url).href;
const poster = new URL('../assets/videos/battle-montage-poster-20261026.jpg', import.meta.url).href;
export function setupMenuVideo(environment = globalThis) {
  const { document, navigator, innerWidth } = environment;
  const video = document.querySelector('#menu-background-video'), button = document.querySelector('#menu-video-toggle'), menu = document.querySelector('#start-screen');
  const reduced = environment.matchMedia('(prefers-reduced-motion: reduce)');
  let deploying = false, generation = 0, failed = false;
  let stopped = environment.matchMedia('(pointer: coarse)').matches || innerWidth <= 700 || reduced.matches || !!navigator.connection?.saveData || /(^|-)2g$/.test(navigator.connection?.effectiveType || '');
  video.poster = poster; video.muted = true;
  function sync() {
    const current = ++generation;
    button.textContent = failed ? '重试实机背景' : stopped ? '播放实机背景' : '暂停实机背景';
    button.setAttribute('aria-pressed', String(!stopped && !failed));
    if (deploying) {
      video.dataset.backgroundState = 'suspended'; video.pause();
      if(video.hasAttribute('src')) { video.removeAttribute('src'); video.load(); }
      return;
    }
    if (stopped || document.hidden || menu.style.display === 'none') { video.dataset.backgroundState = 'paused'; video.pause(); return; }
    video.dataset.backgroundState = 'playing';
    if (!video.getAttribute('src')) video.src = source;
    // 切换战场、切换标签页会中止尚未完成的 play，不能把这种正常取消当成播放故障。
    Promise.resolve().then(() => { if (current === generation) return video.play(); }).catch(() => {
      if (current !== generation || deploying || document.hidden || menu.style.display === 'none') return;
      stopped = true; button.textContent = '播放实机背景'; button.setAttribute('aria-pressed', 'false');
    });
  }
  button.addEventListener('click', () => {
    if (failed) { failed = false; stopped = false; video.removeAttribute('src'); video.load(); }
    else stopped = !stopped;
    sync();
  });
  reduced.addEventListener('change', () => { if(reduced.matches)stopped=true; sync(); });
  document.addEventListener('visibilitychange', sync);
  document.addEventListener('gp-deploying',event=>{deploying=!!event.detail;sync();});
  new environment.MutationObserver(sync).observe(menu, { attributes: true, attributeFilter: ['style'] });
  video.addEventListener('error', () => {
    if (deploying || !video.getAttribute('src') || video.error?.code === 1) return;
    failed = stopped = true; ++generation;
    video.pause(); video.removeAttribute('src'); video.load();
    // 保留海报并提供手动重试，非关键背景失败不影响进入战场。
    button.textContent = '重试实机背景'; button.setAttribute('aria-pressed', 'false');
  });
  sync();
}
