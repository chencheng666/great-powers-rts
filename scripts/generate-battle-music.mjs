import {mkdirSync,writeFileSync,statSync,readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
// 原创132BPM电子摇滚循环：强拍底鼓、军鼓、失真低音、铜管与切分音序。
const root=fileURLToPath(new URL('../',import.meta.url)),out=join(root,'releases/music-iron-tide'),rate=44100,bpm=132,beat=60/bpm,bars=32,seconds=bars*beat*4,n=Math.round(seconds*rate);
mkdirSync(out,{recursive:true});const left=new Float64Array(n),right=new Float64Array(n);let seed=20301103;
const noise=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2147483648-1;};
const hz=m=>440*2**((m-69)/12),tau=2*Math.PI;
function add(start,duration,sample,amp,pan=0){const offset=Math.round(start*rate),len=Math.round(duration*rate);for(let i=0;i<len;i++){const v=sample(i/rate)*amp,k=(offset+i)%n;left[k]+=v*Math.sqrt((1-pan)/2);right[k]+=v*Math.sqrt((1+pan)/2);}}
const chords=[[38,50,53,57],[34,46,50,53],[41,53,57,60],[36,48,52,55]];
for(let bar=0;bar<bars;bar++){
 const notes=chords[Math.floor(bar/2)%4],start=bar*beat*4,energy=bar<4?.75:bar>=16&&bar<20?.65:1;
 for(let step=0;step<16;step++){
  const at=start+step*beat/4;
  add(at,.06,t=>noise()*Math.exp(-t*80)*Math.min(1,t/.002),.033*(step%2?.65:1)*energy,step%2?.4:-.4);
  if(step%2===0){const f=hz(notes[0]+(step===12?12:0));add(at,beat*.43,t=>Math.min(1,t/.006)*Math.exp(-t*12)*Math.tanh(2.6*(Math.sin(tau*f*t)+.35*Math.sin(tau*f*2*t))),.2*energy);}
  if(bar>=4&&!(bar>=16&&bar<20)&&[0,3,6,8,11,14].includes(step)){
   const note=notes[1+(step+bar)%3]+12,f=hz(note);add(at,beat*.38,t=>Math.min(1,t/.007)*Math.exp(-t*13)*(Math.sin(tau*f*t)+.23*Math.sin(tau*f*2*t)),.1,.25);
   add(at+beat*.75,beat*.3,t=>Math.exp(-t*18)*Math.sin(tau*f*t),.035,-.45);
  }
 }
 for(const k of [0,1.5,2, ...(bar%4===3?[3.5]:[])])add(start+k*beat,.28,t=>Math.sin(tau*(46*t+7*(1-Math.exp(-t*24))))*Math.exp(-t*16)+noise()*.08*Math.exp(-t*170),.46*energy);
 for(const k of [1,3])add(start+k*beat,.18,t=>(noise()*.7+Math.sin(tau*185*t)*.3)*Math.exp(-t*25)*Math.min(1,t/.003),.23*energy,-.08);
 for(const k of [0,2.5])for(const note of [notes[1],notes[3]]){const f=hz(note);add(start+k*beat,beat*1.2,t=>Math.min(1,t/.025)*Math.exp(-t*4)*(Math.sin(tau*f*t)+.4*Math.sin(tau*f*2*t)+.18*Math.sin(tau*f*3*t)),.105, k?-.25:.25);}
 if(bar%4===3)for(let k=12;k<16;k++)add(start+k*beat/4,.13,t=>noise()*Math.exp(-t*27)+.2*Math.sin(tau*220*t)*Math.exp(-t*20),.08);
 if(bar%8===0)add(start,1,t=>noise()*Math.exp(-t*6)*Math.min(1,t/.003),.085,.35);
}
let peak=0;for(let i=0;i<n;i++)peak=Math.max(peak,Math.abs(left[i]),Math.abs(right[i]));
const wav=Buffer.alloc(44+n*4);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(2,22);wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*4,28);wav.writeUInt16LE(4,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(n*4,40);
for(let i=0;i<n;i++){wav.writeInt16LE(Math.round(left[i]/peak*.86*32767),44+i*4);wav.writeInt16LE(Math.round(right[i]/peak*.86*32767),46+i*4);}
const master=join(out,'iron-tide.wav'),flac=join(out,'iron-tide.flac'),decoded=join(out,'roundtrip.wav'),aac=join(root,'assets/audio/iron-tide.m4a');writeFileSync(master,wav);
execFileSync('/usr/bin/afconvert',[master,flac,'-f','flac','-d','flac']);execFileSync('/usr/bin/afconvert',[flac,decoded,'-f','WAVE','-d','LEI16']);
const pcm=b=>{for(let i=12;i+8<=b.length;){const size=b.readUInt32LE(i+4);if(b.toString('ascii',i,i+4)==='data')return b.subarray(i+8,i+8+size);i+=8+size+(size%2);}throw Error('缺少PCM');};
if(!pcm(wav).equals(pcm(readFileSync(decoded))))throw Error('FLAC还原PCM不一致');
execFileSync('/usr/bin/afconvert',[master,aac,'-f','m4af','-d','aac','-b','128000','-q','127']);
const report={title:'钢铁洪流',bpm,seconds,pcmBytes:pcm(wav).length,wavBytes:statSync(master).size,flacBytes:statSync(flac).size,aacBytes:statSync(aac).size,flacLosslessRoundtrip:true,aacIsLossy:true,aacSHA256:createHash('sha256').update(readFileSync(aac)).digest('hex')};writeFileSync(join(out,'report.json'),JSON.stringify(report,null,2));console.log(report);
