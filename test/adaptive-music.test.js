import test from 'node:test';
import assert from 'node:assert/strict';
import { AdaptiveBattleMusic, battleMusicIntensity } from '../src/adaptive-music.js';
import { normalizeAudioSettings } from '../src/audio-data.js';
const setup=(behaviors=[])=>{
 const nodes=[],media=[];const node=()=>{const n={connect(){},disconnect(){this.disconnected=true},gain:{value:0,setTargetAtTime(v){this.value=v}}};nodes.push(n);return n};
 const context={currentTime:1,createGain:node,createMediaElementSource:node};
 const factory=url=>{const m={url,currentTime:0,play:behaviors[media.length]||(()=>Promise.resolve()),pause(){this.paused=true},removeAttribute(){this.removed=true},load(){}};media.push(m);return m};
 const music=new AdaptiveBattleMusic(context,{},['calm','battle'],factory);return{music,context,media,nodes};
};
test('双配器逐步切换、相位漂移校正，暂停静音仍交由主总线控制',async()=>{
 const {music,context,media}=setup();assert.equal(await music.play(),true);music.update(1);assert.equal(music.layers[0].gain.gain.value,0);assert.equal(music.layers[1].gain.gain.value,1);
 context.currentTime=5;media[0].currentTime=4;media[1].currentTime=3;music.update(.4);assert.equal(media[1].currentTime,4);assert.ok(Math.abs(music.layers.reduce((n,l)=>n+l.gain.gain.value,0)-1)<1e-9);
 music.stop();music.disconnect();assert.ok(media.every(m=>m.paused&&m.removed));assert.ok(music.layers.every(l=>l.source.disconnected&&l.gain.disconnected));
});
test('一个音轨网络阻塞或失败不会让已能播放的音轨一直静音',async()=>{
 const {music}=setup([()=>Promise.resolve(),()=>new Promise(()=>{})]);assert.equal(await music.play(),true);assert.equal(music.layers[0].gain.gain.value,1);music.stop();music.disconnect();
 const {music:fallback}=setup([()=>Promise.reject(Error('模拟首轨失败')),()=>Promise.resolve()]);assert.equal(await fallback.play(),true);assert.equal(fallback.layers[1].gain.gain.value,1);fallback.stop();fallback.disconnect();
});
test('配器强度只依据己方最近交火，不读取战争迷雾内的敌方交战信息',()=>{
 const game={time:20,running:true,units:[{owner:1,hp:10,lastFireAt:20}],projectiles:[]};assert.equal(battleMusicIntensity(game),0);
 game.units.push({owner:0,hp:10,lastFireAt:19});assert.ok(battleMusicIntensity(game)>0);game.paused=true;assert.equal(battleMusicIntensity(game),0);game.paused=false;game.time=30;assert.equal(battleMusicIntensity(game),0);
});
test('新版默认启用原创采样配器，保留静音、音量及用户明确选择的旧曲',()=>{
 const settings=normalizeAudioSettings({musicRevision:2,musicTrack:'war-theme',muted:true,music:.2});assert.equal(settings.musicTrack,'mountain-sea');assert.equal(settings.music,.2);assert.equal(settings.muted,true);
 assert.equal(normalizeAudioSettings({musicRevision:2,musicTrack:'internationale'}).musicTrack,'internationale');assert.equal(normalizeAudioSettings({...settings,musicTrack:'war-theme'}).musicTrack,'war-theme');
});
