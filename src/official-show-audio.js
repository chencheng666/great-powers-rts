import {SoundEffects} from './sound-effects.js';
import {showDefinition} from './official-show-config.js';
export class OfficialShowAudio {
 constructor(createContext=()=>new (window.AudioContext||window.webkitAudioContext)()) {this.createContext=createContext;this.enabled=false;this.volume=.55;this.context=null;this.fx=null;this.mode=null;this.fired=new Set();this.epoch=0;}
 async enable(){
  const epoch=++this.epoch;
  if(!this.context){this.context=this.createContext();this.master=this.context.createGain();this.master.gain.value=this.volume;const limiter=this.context.createDynamicsCompressor();limiter.threshold.value=-14;limiter.knee.value=12;limiter.ratio.value=8;limiter.attack.value=.003;limiter.release.value=.25;this.master.connect(limiter);limiter.connect(this.context.destination);this.fx=new SoundEffects(this.context,this.master,10);}
  await this.context.resume();if(epoch!==this.epoch)return false;this.enabled=true;return true;
 }
 setVolume(value){this.volume=Math.max(0,Math.min(1,Number(value)||0));if(this.master)this.master.gain.setTargetAtTime(this.volume,this.context.currentTime,.03);}
 begin(mode){this.stop();if(!this.enabled)return;this.mode=mode;this.fired.clear();this.context.resume().catch(()=>{});}
 update(t){if(!this.enabled||!this.mode||this.context.state!=='running')return;const show=showDefinition(this.mode);for(let i=0;i<show.cues.length;i++){const [at,style]=show.cues[i];if(t>=at&&!this.fired.has(i)){this.fired.add(i);this.fx.play(style,{level:.8,preview:true});}}
  const loops=t<show.impact||show.impact===null?show.loops:[];this.fx.syncMovement(loops.map((kind,i)=>({kind,level:kind==='jet'?.65:.55,pan:i?.35:-.25})));
 }
 stop(){this.mode=null;this.fired.clear();this.fx?.stop();}
 disable(){this.epoch++;this.enabled=false;this.stop();this.context?.suspend().catch(()=>{});}
 pause(){this.stop();this.context?.suspend().catch(()=>{});}
 get status(){return{enabled:this.enabled,mode:this.mode,voices:this.fx?.voices.size||0,loops:this.fx?.loops.size||0,volume:this.volume,state:this.context?.state||'uncreated'};}
}
