// 仅短促武器/爆炸进入一次共享卷积，不把配乐和无线电拖成长混响。
export function terrainImpulse(sampleRate=44100){
  const length=Math.ceil(sampleRate*.48),channels=[new Float32Array(length),new Float32Array(length)];let seed=971;
  for(let c=0;c<2;c++)for(let i=0;i<length;i++){
    const t=i/sampleRate;seed=(Math.imul(seed,1664525)+1013904223)|0;
    const noise=(seed>>>0)/2147483648-1,fade=Math.exp(-t*13);
    channels[c][i]=t>.025?noise*fade*.07:0;
  }
  // 地面与远坡的离散早反射，不添加延迟后的第二次炮击事件。
  for(const[t,level]of [[.037,.25],[.071,.14],[.123,.08]])for(let c=0;c<2;c++)channels[c][Math.floor((t+c*.003)*sampleRate)]+=level;
  return channels;
}
export class BattleReverb{
  constructor(context,bus){
    this.context=context;this.output=context.createGain();this.dry=context.createGain();this.wet=context.createGain();this.convolver=context.createConvolver();
    const samples=terrainImpulse(context.sampleRate),buffer=context.createBuffer(2,samples[0].length,context.sampleRate);samples.forEach((a,i)=>buffer.getChannelData(i).set(a));this.convolver.buffer=buffer;
    this.output.connect(this.dry);this.dry.connect(bus);this.output.connect(this.convolver);this.convolver.connect(this.wet);this.wet.connect(bus);this.wet.gain.value=.08;this.dry.gain.value=1;
  }
  setTerrain(map){
    const wet=map?.future?0:map?.industrial?.12:map?.ridges?.1:map?.water?.045:.07;
    this.wet.gain.setTargetAtTime(wet,this.context.currentTime,.25);
  }
  dispose(){for(const n of[this.output,this.dry,this.wet,this.convolver])n.disconnect();}
}
