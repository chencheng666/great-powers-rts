const video=document.querySelector('#battle-video'),toggle=document.querySelector('#video-toggle');
video.addEventListener('play',()=>{toggle.textContent='暂停片段 Ⅱ';toggle.setAttribute('aria-pressed','true')});
video.addEventListener('pause',()=>{toggle.textContent='播放片段 ▶';toggle.setAttribute('aria-pressed','false')});
toggle.setAttribute('aria-pressed','false');toggle.addEventListener('click',()=>{if(video.paused)video.play().catch(()=>{toggle.textContent='请使用播放器控件播放'});else video.pause()});
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
new IntersectionObserver(entries=>{for(const e of entries)if(!e.isIntersecting&&!video.paused)video.pause()},{threshold:.15}).observe(video);
const gallery=document.querySelector('#gallery');for(const b of document.querySelectorAll('[data-slide]'))b.addEventListener('click',()=>gallery.scrollBy({left:Number(b.dataset.slide)*gallery.clientWidth*.8,behavior:reduced.matches?'instant':'smooth'}));
// 静音实机背景；减少动态效果和省流模式优先展示封面。
const heroVideo=document.querySelector('#hero-background-video'),heroToggle=document.querySelector('#hero-video-toggle');
let heroStopped=reduced.matches||!!navigator.connection?.saveData,heroVisible=true;
function syncHero(){heroToggle.textContent=heroStopped?'播放背景视频':'暂停背景视频';heroToggle.setAttribute('aria-pressed',String(!heroStopped));if(heroStopped||document.hidden||!heroVisible){heroVideo.pause();return;}if(!heroVideo.src)heroVideo.src=heroVideo.dataset.src;heroVideo.muted=true;heroVideo.play().catch(()=>{heroStopped=true;heroToggle.textContent='播放背景视频';heroToggle.setAttribute('aria-pressed','false');});}
heroToggle.addEventListener('click',()=>{heroStopped=!heroStopped;syncHero();});document.addEventListener('visibilitychange',syncHero);reduced.addEventListener('change',()=>{heroStopped=reduced.matches;syncHero();});new IntersectionObserver(entries=>{heroVisible=entries[0].isIntersecting;syncHero();}).observe(document.querySelector('.hero'));heroVideo.addEventListener('error',()=>{heroStopped=true;heroVideo.hidden=true;heroToggle.textContent='背景视频暂不可用';heroToggle.disabled=true;});syncHero();

// 官网与下载中心共用发行清单，后续换包不用再手工修改首页链接。
Promise.all([
  fetch('/downloads/manifest.json',{cache:'no-store',signal:AbortSignal.timeout(5000)}).then(r=>{if(!r.ok)throw Error();return r.json()}),
  fetch('/api/download-counts',{cache:'no-store',signal:AbortSignal.timeout(5000)}).then(r=>r.ok?r.json():{counts:{}}).catch(()=>({counts:{}}))
]).then(([m,{counts}])=>{
  const tag='v'+m.version, file=m.files?.find(f=>f.name===m.offlineFile);
  if(m.releaseTag!==tag||!/^v\d+\.\d+\.\d+$/.test(tag)||!file||file.name!==`packages/Great-Powers-RTS-${tag}.zip`||!Number.isSafeInteger(file.size)||file.size<=0||!/^[a-f0-9]{64}$/.test(file.sha256))return;
  for(const a of document.querySelectorAll('[data-latest-offline]')){a.href='/api/download?file='+encodeURIComponent(file.name);a.textContent=`下载${m.version}离线版 ↓ · ${counts?.[file.name]||0} 次`;}
  for(const a of document.querySelectorAll('[data-latest-release]'))a.href='https://github.com/chencheng666/great-powers-rts/releases/tag/'+tag;
}).catch(()=>{});

const groupExpiresAt = Date.parse('2026-11-19T00:00:00+08:00');
if (Date.now() >= groupExpiresAt) {
  document.querySelector('[data-group-qr]')?.setAttribute('hidden', '');
  document.querySelector('[data-group-expired]')?.removeAttribute('hidden');
}
