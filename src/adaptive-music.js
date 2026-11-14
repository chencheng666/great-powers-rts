// 两套同长度配器用流式媒体播放，避免把数分钟的多轨PCM一次性展开到内存。
export function battleMusicIntensity(game) {
  if(!game?.running||game.paused)return 0;
  const now=game.time,side=0;
  const recent=game.units.filter(u=>u.owner===side&&u.hp>0&&!u.embarkedIn&&Math.max(u.lastDamageAt??-100,u.lastFireAt??-100)>now-6).length;
  const shots=(game.projectiles||[]).filter(p=>p.owner===side||p.targetOwner===side).length;
  return Math.min(1,recent*.17+shots*.08);
}
export class AdaptiveBattleMusic {
  constructor(context,bus,urls,mediaFactory=url=>new Audio(url)) {
    this.context=context;this.mix=0;this.lastSync=-Infinity;this.ended=false;
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
    const now=this.context.currentTime;target=Math.max(0,Math.min(1,Number.isFinite(target)?target:0));
    this.mix=target;
    const [calm,battle]=this.layers;
    if(!calm.ready)target=1;if(!battle.ready)target=0;
    // 线性互补避免两套相关配器在中点叠加抬升音量，变化用增益节点平滑。
    calm.gain.gain.setTargetAtTime(1-target,now,.8);battle.gain.gain.setTargetAtTime(target,now,.8);
    if(now-this.lastSync>2&&calm.ready&&battle.ready){
      this.lastSync=now;
      if(Number.isFinite(calm.audio.currentTime)&&Math.abs(calm.audio.currentTime-battle.audio.currentTime)>.12){
        try{battle.audio.currentTime=calm.audio.currentTime;}catch{/* 低带宽尚不能跳转时，等待下一次校时。 */}
      }
    }
  }
  stop(){this.ended=true;for(const {audio}of this.layers){audio.pause();audio.removeAttribute('src');audio.load();}}
  disconnect(){for(const {source,gain}of this.layers){source.disconnect();gain.disconnect();}}
}
