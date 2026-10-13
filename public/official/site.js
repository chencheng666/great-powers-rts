const video=document.querySelector('#battle-video'),toggle=document.querySelector('#video-toggle');
video.addEventListener('play',()=>{toggle.textContent='暂停片段 Ⅱ';toggle.setAttribute('aria-pressed','true')});
video.addEventListener('pause',()=>{toggle.textContent='播放片段 ▶';toggle.setAttribute('aria-pressed','false')});
toggle.setAttribute('aria-pressed','false');toggle.addEventListener('click',()=>{if(video.paused)video.play().catch(()=>{toggle.textContent='请使用播放器控件播放'});else video.pause()});
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
new IntersectionObserver(entries=>{for(const e of entries)if(!e.isIntersecting&&!video.paused)video.pause()},{threshold:.15}).observe(video);
const gallery=document.querySelector('#gallery');for(const b of document.querySelectorAll('[data-slide]'))b.addEventListener('click',()=>gallery.scrollBy({left:Number(b.dataset.slide)*gallery.clientWidth*.8,behavior:reduced.matches?'instant':'smooth'}));
