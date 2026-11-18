import { createRhythmSamples } from './procedural-rhythm.js';

// 两套同长度配器用流式媒体播放，避免把数分钟的多轨PCM一次性展开到内存。
export function battleMusicIntensity(game) {
  if(!game?.running||game.paused)return 0;
  const now=game.time,side=0;
  let intensity=0;
  for(const unit of game.units){
    if(unit.owner!==side||unit.hp<=0||unit.embarkedIn)continue;
    const age=now-Math.max(unit.lastDamageAt??-100,unit.lastFireAt??-100);
    intensity+=Math.max(0,1-age/8)*.26;
    if(intensity>=1)return 1;
  }
  for(const shot of game.projectiles||[]){
    if(shot.owner===side||shot.targetOwner===side)intensity+=.085;
    if(intensity>=1)return 1;
  }
  return intensity;
}
export class AdaptiveBattleMusic {
  constructor(context,bus,urls,mediaFactory=url=>new Audio(url)) {
    this.context=context;this.bus=bus;this.mix=0;this.lastSync=-Infinity;this.ended=false;
    this.layers=urls.map(url=>{
      const audio=mediaFactory(url);audio.loop=true;audio.preload='none';
      const source=context.createMediaElementSource(audio),gain=context.createGain();gain.gain.value=0;
      source.connect(gain);gain.connect(bus);return{audio,source,gain,ready:false};
    });
  }
  async play(){
    const pending=this.layers.map(async layer=>{await layer.audio.play();layer.ready=true;if(!this.ended)this.update(this.mix);return true;});
    try{await Promise.any(pending);}catch{return false;}
    if(this.ended){this.stop();return false;}
    this.update(0);return true;
  }
  update(target){
    if(this.ended)return;
    const previous=this.mix;
    const now=this.context.currentTime;target=Math.max(0,Math.min(1,Number.isFinite(target)?target:0));
    this.mix=target;
    const [calm,battle]=this.layers;
    if(!calm.ready)target=1;if(!battle.ready)target=0;
    // 线性互补避免两套相关配器在中点叠加抬升音量，变化用增益节点平滑。
    const transition=target >= previous ? .65 : 2.8;
    calm.gain.gain.setTargetAtTime(1-target,now,transition);battle.gain.gain.setTargetAtTime(target,now,transition);
    this.updateRhythm(target,calm.ready?calm.audio:battle.audio);
    if(now-this.lastSync>2&&calm.ready&&battle.ready){
      this.lastSync=now;
      if(Number.isFinite(calm.audio.currentTime)&&Math.abs(calm.audio.currentTime-battle.audio.currentTime)>.12){
        try{battle.audio.currentTime=calm.audio.currentTime;}catch{/* 低带宽尚不能跳转时，等待下一次校时。 */}
      }
    }
  }
  updateRhythm(mix, clock) {
    const context=this.context, intensity=Math.max(0,(mix-.48)/.52);
    if(!this.rhythm&&intensity>0&&context.createBuffer&&Number.isFinite(clock.currentTime)){
      const rate=context.sampleRate,data=createRhythmSamples(rate),buffer=context.createBuffer(1,data.length,rate);
      buffer.copyToChannel(data,0);
      const source=context.createBufferSource(),gain=context.createGain();
      source.buffer=buffer;source.loop=true;gain.gain.value=0;source.connect(gain);gain.connect(this.bus);
      source.start(context.currentTime,clock.currentTime%buffer.duration);this.rhythm={source,gain};
    }
    this.rhythm?.gain.gain.setTargetAtTime(.092*intensity**1.4,context.currentTime,intensity > .65 ? .72 : 1.8);
  }
  stop(){this.ended=true;if(this.rhythm){this.rhythm.source.stop();this.rhythm.source.disconnect();this.rhythm.gain.disconnect();delete this.rhythm;}for(const {audio}of this.layers){audio.pause();audio.removeAttribute('src');audio.load();}}
  disconnect(){for(const {source,gain}of this.layers){source.disconnect();gain.disconnect();}}
}
