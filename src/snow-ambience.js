import { snowEnvironment } from './snow-to-sea.js';

// 只合成三条固定容量的环境声，不随树木或雨滴数量增加音源。
export class SnowAmbience {
  constructor(context, output) { this.context=context;this.output=output;this.layers=[]; }
  start() {
    if(this.layers.length)return;
    const ctx=this.context,length=ctx.sampleRate*4,buffer=ctx.createBuffer(1,length,ctx.sampleRate),data=buffer.getChannelData(0);
    let seed=161116,low=0;
    for(let i=0;i<length;i++){seed=Math.imul(seed,1664525)+1013904223|0;const n=(seed>>>0)/2147483648-1;low+=(n-low)*.06;data[i]=low*.75+n*.12;}
    for(const [name,frequency,type]of [['wind',430,'lowpass'],['rain',2300,'highpass'],['surf',740,'lowpass']]){
      const source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),gain=ctx.createGain();source.buffer=buffer;source.loop=true;filter.type=type;filter.frequency.value=frequency;gain.gain.value=0;source.connect(filter);filter.connect(gain);gain.connect(this.output);source.start(0,this.layers.length*.71);this.layers.push({name,source,filter,gain});
    }
  }
  update(game,listener,audible) {
    if(!game.map.snowToSea){this.stop();return;}
    if(!audible){this.silence();return;}
    this.start();const p=listener?.center||game.map.spawns[0],s=snowEnvironment(game.map,p.x,p.y,game.time);
    const levels={wind:.045+s.snow*.035+Math.abs(s.wind)*.04,rain:s.rain*.10,surf:s.surf*(.065+.025*Math.sin(game.time*.43))};
    for(const layer of this.layers)layer.gain.gain.setTargetAtTime(levels[layer.name],this.context.currentTime,.5);
  }
  silence() { for(const layer of this.layers)layer.gain.gain.setTargetAtTime(0,this.context.currentTime,.04); }
  stop() { for(const l of this.layers){l.source.stop();l.source.disconnect();l.filter.disconnect();l.gain.disconnect();}this.layers=[]; }
}
