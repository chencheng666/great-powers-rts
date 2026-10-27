const source = new URL('../assets/videos/battle-montage-20261026.mp4', import.meta.url).href;
const poster = new URL('../assets/videos/battle-montage-poster-20261026.jpg', import.meta.url).href;
export function setupMenuVideo() {
  const video = document.querySelector('#menu-background-video'), button = document.querySelector('#menu-video-toggle'), menu = document.querySelector('#start-screen');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let stopped = reduced.matches || !!navigator.connection?.saveData || /(^|-)2g$/.test(navigator.connection?.effectiveType || '');
  video.poster = poster; video.muted = true;
  function sync() {
    button.textContent = stopped ? '播放实机背景' : '暂停实机背景';
    button.setAttribute('aria-pressed', String(!stopped));
    if (stopped || document.hidden || menu.style.display === 'none') { video.pause(); return; }
    if (!video.src) video.src = source;
    video.play().catch(() => { stopped = true; button.textContent = '播放实机背景'; button.setAttribute('aria-pressed', 'false'); });
  }
  button.addEventListener('click', () => { stopped = !stopped; sync(); });
  reduced.addEventListener('change', () => { stopped = reduced.matches; sync(); });
  document.addEventListener('visibilitychange', sync);
  new MutationObserver(sync).observe(menu, { attributes: true, attributeFilter: ['style'] });
  video.addEventListener('error', () => { stopped = true; video.hidden = true; button.textContent = '背景视频暂不可用'; button.disabled = true; });
  sync();
}
