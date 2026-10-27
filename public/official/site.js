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

// 官网入口和下载中心共用计数，统计本站下载跳转，不推测站外下载量。
fetch('/api/download-counts',{cache:'no-store'}).then(r=>r.json()).then(({counts})=>{for(const a of document.querySelectorAll('a[href*="/downloads/packages/"]')){const u=new URL(a.href), key='packages/'+u.pathname.split('/').pop();a.href='/api/download?file='+encodeURIComponent(key);a.append(document.createTextNode(' · '+(counts[key]||0)+' 次'));}}).catch(()=>{});
