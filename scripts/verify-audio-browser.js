const task = await taskSpace(Number(process.env.EGO_TASK_SPACE)), page = task.page('p1');
const root = process.cwd();
await page.cdp('Emulation.setDeviceMetricsOverride',{width:1512,height:762,deviceScaleFactor:1,mobile:false});
await page.goto('http://localhost:4173/');
const original = await page.evaluate(()=>localStorage.getItem('great-powers-audio-v1'));
await page.evaluate(()=>{
  window.__audioCheck={contexts:[],gains:[],analysers:[],sources:[],decoded:[],speeches:[]};
  if (window.speechSynthesis) {
    const speak = window.speechSynthesis.speak.bind(window.speechSynthesis);
    window.speechSynthesis.speak = speech => { window.__audioCheck.speeches.push({ text: speech.text, volume: speech.volume }); speak(speech); };
  }
  const Base=window.AudioContext;
  window.AudioContext=class extends Base {
    constructor(...args){super(...args);window.__audioCheck.contexts.push(this)}
    createGain(){const node=super.createGain();window.__audioCheck.gains.push(node);return node}
    createAnalyser(){const node=super.createAnalyser();window.__audioCheck.analysers.push(node);return node}
    createBufferSource(){const node=super.createBufferSource();window.__audioCheck.sources.push(node);const start=node.start.bind(node),stop=node.stop.bind(node);node.start=(...args)=>{node.__started=true;start(...args)};node.stop=(...args)=>{node.__stopped=true;stop(...args)};node.addEventListener('ended',()=>node.__ended=true);return node}
    async decodeAudioData(bytes){const buffer=await super.decodeAudioData(bytes);window.__audioCheck.decoded.push(buffer);return buffer}
  };
});
await page.click('#start-btn');
await page.waitForFunction(()=>document.querySelector('#start-screen').style.display==='none' && window.__audioCheck.decoded.length>=1);
const playback = await page.evaluate(()=>{
  const check=window.__audioCheck, data=new Float32Array(check.analysers[0].fftSize);check.analysers[0].getFloatTimeDomainData(data);
  return {context:check.contexts[0].state,music:check.sources.filter(source=>source.loop).map(source=>source.buffer.duration),decoded:check.decoded.length,rms:Math.sqrt(data.reduce((sum,n)=>sum+n*n,0)/data.length)};
});
if(playback.context!=='running'||playback.music.length!==1||playback.music[0]<70)throw new Error('背景音乐没有正常启动');
await page.click('#pause-btn');
await page.waitForFunction(()=>window.__audioCheck.gains[1].gain.value<.1);
await page.click('[data-modal=resume]');
await page.evaluate(async () => {
  const resource = performance.getEntriesByType('resource').find(item => new URL(item.name).pathname.endsWith('/src/audio.js'));
  const { gameAudio } = await import(resource.name);
  gameAudio.cooldowns.clear(); gameAudio.lastSpeech = -Infinity;
  gameAudio.selection([{ kind: 'unit', type: 'tank' }]);
});
await page.waitForFunction(()=>!window.speechSynthesis || window.__audioCheck.speeches.some(s=>s.text==='装甲部队待命。'));
console.log({playback,speeches:await page.evaluate(()=>window.__audioCheck.speeches)});
await page.click('[data-tab=units]');
const groups=await page.evaluate(()=>[...document.querySelectorAll('[data-producer]')].map(group=>({producer:group.dataset.producer,units:[...group.querySelectorAll('[data-unit]')].map(unit=>unit.dataset.unit)})));
if(!groups.find(g=>g.producer==='factory')?.units.includes('tank')||!groups.find(g=>g.producer==='armory')?.units.includes('drone'))throw new Error('工厂生产分组错误');
await page.click('#sound-btn');
await page.evaluate(()=>{const slider=document.querySelector('[data-audio=music]');slider.value='47';slider.dispatchEvent(new Event('input',{bubbles:true}))});
await page.click('#audio-muted');
await page.waitForFunction(()=>window.__audioCheck.gains[0].gain.value<.001);
const silence=await page.evaluate(()=>{const check=window.__audioCheck,data=new Float32Array(check.analysers[0].fftSize);check.analysers[0].getFloatTimeDomainData(data);return Math.sqrt(data.reduce((sum,n)=>sum+n*n,0)/data.length)});
if(silence>.001)throw new Error('静音后仍有明显输出');
await page.click('#audio-muted'); await page.click('#audio-close');
await page.click('#pause-btn'); await page.click('[data-modal=restart]');
await page.waitForFunction(()=>window.__audioCheck.sources.filter(s=>s.loop&&!s.__stopped).length===1);
console.log({groups,silence,loopingAfterRestart:await page.evaluate(()=>window.__audioCheck.sources.filter(s=>s.loop&&!s.__stopped).length)});
await page.cdp('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
await page.goto('http://localhost:4173/');
const persisted=await page.evaluate(()=>document.querySelector('[data-audio=music]').value);
if(persisted!=='47')throw new Error('音量设置未保存');
await page.click('#start-btn'); await page.waitForFunction(()=>document.querySelector('#start-screen').style.display==='none'); await page.click('#sound-btn');
await page.screenshot({path:`${root}/preview-audio-mobile-v3.png`});
console.log(await page.evaluate(()=>({persisted:document.querySelector('[data-audio=music]').value,overflow:document.documentElement.scrollWidth-innerWidth,panel:document.querySelector('#audio-panel').getBoundingClientRect().toJSON()})));
await page.evaluate(original=>{if(original===null)localStorage.removeItem('great-powers-audio-v1');else localStorage.setItem('great-powers-audio-v1',original)},original);
await page.cdp('Emulation.clearDeviceMetricsOverride'); await page.goto('http://localhost:4173/');
