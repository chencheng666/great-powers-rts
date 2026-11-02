import test from 'node:test';
import assert from 'node:assert/strict';
import { setupMenuVideo } from '../src/background-video.js';
class Target {
  handlers={};dataset={};attrs={};style={};
  addEventListener(type,fn){(this.handlers[type]||=[]).push(fn)}
  emit(type,detail){for(const fn of this.handlers[type]||[])fn({type,detail})}
  setAttribute(key,value){this.attrs[key]=value}getAttribute(key){return this.attrs[key]??null}hasAttribute(key){return key in this.attrs}removeAttribute(key){delete this.attrs[key]}
}
const settle=()=>new Promise(r=>setImmediate(r));
function fixture(){
  const video=new Target(),button=new Target(),menu=new Target(),document=new Target(),promises=[];
  Object.defineProperty(video,'src',{get:()=>video.attrs.src,set:v=>video.attrs.src=v});
  video.pause=()=>{};video.load=()=>{};video.play=()=>new Promise((resolve,reject)=>promises.push({resolve,reject}));
  document.querySelector=s=>({'#menu-background-video':video,'#menu-video-toggle':button,'#start-screen':menu}[s]);
  const environment={document,navigator:{},innerWidth:1200,matchMedia:()=>Object.assign(new Target(),{matches:false}),MutationObserver:class{observe(){}}};
  setupMenuVideo(environment);return {video,button,menu,document,promises};
}

test('开局释放视频请求后，旧play的取消不能误停返场背景或产生未处理异常',async()=>{
  const f=fixture();await settle();assert.equal(f.promises.length,1);
  f.document.emit('gp-deploying',true);assert.equal(f.video.getAttribute('src'),null);
  f.document.emit('gp-deploying',false);await settle();assert.equal(f.promises.length,2);
  f.promises[0].reject(new DOMException('正常取消','AbortError'));await settle();
  assert.equal(f.button.textContent,'暂停实机背景');assert.equal(f.button.attrs['aria-pressed'],'true');
  f.promises[1].resolve();
});

test('真实视频故障保留海报和可用的重试入口，手动重试恢复，正常中止不误报失败',async()=>{
  const f=fixture();await settle();f.video.error={code:1};f.video.emit('error');assert.equal(f.button.textContent,'暂停实机背景');
  f.video.error={code:3};f.video.emit('error');assert.equal(f.button.textContent,'重试实机背景');assert.ok(f.video.poster);assert.notEqual(f.video.hidden,true);assert.notEqual(f.button.disabled,true);
  f.button.emit('click');await settle();assert.ok(f.video.getAttribute('src'));assert.equal(f.button.textContent,'暂停实机背景');
  f.promises.forEach(p=>p.resolve());
});
