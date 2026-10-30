import './official-cinematic.css';
import {OfficialShowAudio} from './official-show-audio.js';
import {OFFICIAL_SHOWS} from './official-show-config.js';
import emblem from '../assets/official/official-emblem.svg?no-inline';
import smallIcon from '../assets/official/official-emblem-32.png?no-inline';
import touchIcon from '../assets/official/official-emblem-180.png?no-inline';
import mapImage from '../docs/wechat-v3-20261029/images/02-maps.png?no-inline';
import growthImage from '../docs/wechat-v3-20261029/images/06-growth.png?no-inline';
document.querySelector('link[rel="icon"][type="image/svg+xml"]').href=emblem;document.querySelector('#brand-emblem').src=emblem;document.querySelector('link[rel="icon"][type="image/png"]').href=smallIcon;document.querySelector('link[rel="apple-touch-icon"]').href=touchIcon;
for(const img of document.querySelectorAll('[data-update-image]'))img.src=img.dataset.updateImage==='maps'?mapImage:growthImage;
const audio=new OfficialShowAudio(),soundButton=document.querySelector('#cinematic-sound'),volume=document.querySelector('#cinematic-volume');
const soundStatus=()=>{soundButton.textContent=audio.enabled?'音效：开':'点击开启音效';soundButton.setAttribute('aria-pressed',String(audio.enabled));document.documentElement.dataset.showSound=audio.enabled?'on':'off';};
soundButton.addEventListener('click',async()=>{if(audio.enabled){audio.disable();soundStatus();return;}try{if(await audio.enable()){soundStatus();play(layer.dataset.mode||'assault');}}catch{soundButton.textContent='声音不可用，点击重试';}});
volume.addEventListener('input',()=>audio.setVolume(Number(volume.value)/100));soundStatus();
const layer=document.querySelector('#cinematic-layer'),toggle=document.querySelector('#cinematic-toggle'),skip=document.querySelector('#cinematic-skip');
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
// 裂纹与脱落碎片使用矢量路径生成，不下载额外图片。
const fracture=document.querySelector('.screen-fracture');
const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 1200 800');svg.setAttribute('preserveAspectRatio','none');
for(let i=0;i<16;i++){const a=i*Math.PI/8,points=[];for(let j=0;j<6;j++){const r=70+j*145,b=a+Math.sin(i*7+j*11)*.09;points.push(`${600+Math.cos(b)*r},${400+Math.sin(b)*r}`);}const path=document.createElementNS(svg.namespaceURI,'polyline');path.setAttribute('points',points.join(' '));path.setAttribute('fill','none');path.setAttribute('stroke','#ffe4b5');path.setAttribute('stroke-width',String(i%3===0?2:1));svg.append(path);}
for(let i=0;i<8;i++){const a=i*Math.PI/4,points=[`${600+Math.cos(a)*90},${400+Math.sin(a)*90}`,`${600+Math.cos(a-.14)*800},${400+Math.sin(a-.14)*800}`,`${600+Math.cos(a+.12)*1000},${400+Math.sin(a+.12)*1000}`];const shard=document.createElementNS(svg.namespaceURI,'polygon');shard.setAttribute('points',points.join(' '));shard.setAttribute('fill',i%2?'#08111565':'#d5e7e512');shard.setAttribute('stroke','#eac18f55');shard.setAttribute('class','screen-shard');svg.append(shard);}
fracture.append(svg);
let enabled=!reduced.matches&&!navigator.connection?.saveData,scene=null,sceneReady=null,request=0,observer;
let preference;try{preference=localStorage.getItem('gp-official-motion');}catch{}
if(preference==='off')enabled=false;
function sync(){soundButton.disabled=!enabled;if(enabled)soundStatus();else soundButton.textContent='动态关闭时静音';if(!enabled&&document.querySelector('#hero-video-toggle')?.getAttribute('aria-pressed')==='true')document.querySelector('#hero-video-toggle').click();toggle.textContent=`动态效果：${enabled?'开':'关'}`;toggle.setAttribute('aria-pressed',String(enabled));document.documentElement.dataset.cinematicMotion=enabled?'on':'off';}
function stop(){request++;scene?.stop();audio.stop();layer.classList.remove('is-playing','is-blast');delete layer.dataset.mode;document.querySelector('#show-playing').textContent='选择一段演出';skip.hidden=true;document.querySelector('main').classList.remove('impact-shake','portal-pull');}
async function play(mode,automatic=false){
 if(!enabled||document.hidden)return;
 if(!OFFICIAL_SHOWS[mode])return;stop();const token=request;layer.dataset.loading='true';
 try{
  if(!scene){sceneReady ||= import('./official-scene3d.js').then(({createOfficialScene})=>createOfficialScene(document.querySelector('#cinematic-canvas')));scene=await sceneReady;}
  if(token!==request||!enabled||document.hidden)return;
  layer.classList.add('is-playing');layer.dataset.time='0';layer.dataset.mode=mode;layer.dataset.run=String(Number(layer.dataset.run||0)+1);skip.hidden=false;
  document.querySelector('#show-playing').textContent=OFFICIAL_SHOWS[mode].name;audio.begin(mode);if(mode==='blackhole'){document.querySelector('main').style.setProperty('--portal-origin',`${scrollY+innerHeight*.5}px`);document.querySelector('main').classList.add('portal-pull');}
  scene.play(mode,{tick:t=>audio.update(t),blast(){layer.classList.add('is-blast');document.querySelector('main').classList.add('impact-shake');},done:stop});
 }catch{sceneReady=null;stop();layer.dataset.fallback='true';if(!automatic){toggle.textContent='动态效果暂不可用';}}
 finally{delete layer.dataset.loading;}
}
for(const b of document.querySelectorAll('[data-cinematic]'))b.addEventListener('click',()=>play(b.dataset.cinematic));
toggle.addEventListener('click',()=>{enabled=!enabled;if(!enabled)stop();try{localStorage.setItem('gp-official-motion',enabled?'on':'off');}catch{}sync();});
skip.addEventListener('click',stop);document.addEventListener('keydown',e=>{if(e.key==='Escape')stop();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){stop();audio.pause();}});
reduced.addEventListener('change',()=>{if(reduced.matches){enabled=false;stop();sync();}});
sync();
// 首屏稍后再启动独立演出；快速滚动后不追着用户补播。
const intro=()=>{if(scrollY<innerHeight*.45)play('assault',true);};
if(document.readyState==='complete')setTimeout(intro,700);else window.addEventListener('load',()=>setTimeout(intro,700),{once:true});
observer=new IntersectionObserver(entries=>{for(const e of entries)if(e.isIntersecting){observer.unobserve(e.target);if(enabled)play('nuclear',true);}},{threshold:.48});observer.observe(document.querySelector('#impact-stage'));

window.addEventListener('pagehide',()=>{stop();audio.pause();});
