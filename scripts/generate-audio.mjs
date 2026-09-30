import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { VOICE_LINES, COMMAND_LINES, voiceFile } from '../src/audio-data.js';

const directory = fileURLToPath(new URL('../assets/audio/', import.meta.url));
mkdirSync(directory, { recursive: true });
let voiceCount = 0;
// 系统语音录音仅供本地个人试验，公开版使用浏览器实时播报。
if (process.argv.includes('--personal-voices')) {
console.warn('系统语音录音不用于公开再分发，请先核对设备语音许可。');
const voicesDirectory = fileURLToPath(new URL('../assets/private-voices/', import.meta.url));
mkdirSync(voicesDirectory, { recursive: true });
for (const [key, lines] of Object.entries(VOICE_LINES)) for (const [index, line] of lines.entries()) {
  const intermediate = join(voicesDirectory, 'voice-render.aiff');
  const voice = COMMAND_LINES.has(key) ? 'Reed (中文（中国大陆）)' : 'Tingting';
  execFileSync('/usr/bin/say', ['-v', voice, '-r', COMMAND_LINES.has(key) ? '178' : '186', '-o', intermediate, line]);
  execFileSync('/usr/bin/afconvert', [intermediate, join(voicesDirectory, voiceFile(key, index)), '-f', 'm4af', '-d', 'aac@24000', '-b', '64000', '-q', '127']);
  voiceCount++;
}
rmSync(join(voicesDirectory, 'voice-render.aiff'), { force: true });
}

// 原创循环配乐：电子低音、弦乐式铺底、分解和弦与军鼓，不使用商业游戏音乐。
const rate = 44100, beat = 60 / 104, bars = 32, duration = bars * beat * 4;
const count = Math.round(duration * rate), left = new Float32Array(count), right = new Float32Array(count);
const frequency = note => 440 * 2 ** ((note - 69) / 12);
let seed = 125478;
const noise = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2147483648 - 1; };
const add = (start, length, sample, volume, pan = 0) => {
  const offset = Math.round(start * rate), frames = Math.round(length * rate);
  for (let i = 0; i < frames; i++) {
    const t = i / rate, value = sample(t, i) * volume, index = (offset + i) % count;
    left[index] += value * Math.sqrt((1 - pan) / 2); right[index] += value * Math.sqrt((1 + pan) / 2);
  }
};
const harmony = [[40,52,55,59], [36,48,52,55], [45,57,60,64], [35,47,51,54]];
for (let bar = 0; bar < bars; bar++) {
  const start = bar * beat * 4, notes = harmony[Math.floor(bar / 2) % harmony.length];
  for (let n = 1; n < notes.length; n++) {
    const f = frequency(notes[n] + 12), length = beat * 4 + .25;
    add(start, length, t => {
      const envelope = Math.min(1, t / .32, (length - t) / .38);
      return envelope * (Math.sin(2 * Math.PI * f * t) + .24 * Math.sin(2 * Math.PI * (f * 1.004) * t) + .13 * Math.sin(4 * Math.PI * f * t));
    }, .09, (n - 2) * .55);
  }
  for (let step = 0; step < 8; step++) {
    const time = start + step * beat / 2, bass = frequency(notes[0] + (step === 6 ? 12 : 0));
    add(time, beat * .43, t => Math.min(1, t / .008) * Math.exp(-t * 10) * (Math.sin(2 * Math.PI * bass * t) + .32 * Math.sin(4 * Math.PI * bass * t) + .12 * Math.sin(6 * Math.PI * bass * t)), .23);
    add(time, .06, t => noise() * Math.exp(-t * 65) * (step % 2 ? .55 : .85), .048, step % 2 ? .2 : -.2);
    if (bar >= 4 && step % 2 === 0) {
      const f = frequency(notes[1 + ((step / 2 + bar) % 3)] + 12), length = .36;
      const sample = t => Math.min(1, t / .008) * Math.exp(-t * 12) * (Math.sin(2 * Math.PI * f * t) + .2 * Math.sin(4 * Math.PI * f * t));
      add(time, length, sample, .08, .35); add(time + beat * .75, length, sample, .035, -.45);
    }
  }
  for (const step of [0, 2, ...(bar % 4 === 3 ? [3.5] : [])]) {
    add(start + step * beat, .34, t => Math.sin(2 * Math.PI * (46 * t + 8 * (1 - Math.exp(-t * 22)))) * Math.exp(-t * 15) + noise() * Math.exp(-t * 160) * .08, .35);
  }
  for (const step of [1,3]) add(start + step * beat, .18, t => (noise() * .76 + Math.sin(2 * Math.PI * 175 * t) * .24) * Math.exp(-t * 27) * Math.min(1,t/.003), .16, -.1);
  if (bar % 8 === 7) for (const step of [3.25,3.5,3.75]) add(start + step * beat,.15,t=>noise()*Math.exp(-t*25),.065,.2);
}
let peak = 0;
for (let i = 0; i < count; i++) peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
const wav = Buffer.alloc(44 + count * 4);
wav.write('RIFF',0); wav.writeUInt32LE(wav.length - 8,4); wav.write('WAVEfmt ',8); wav.writeUInt32LE(16,16); wav.writeUInt16LE(1,20); wav.writeUInt16LE(2,22); wav.writeUInt32LE(rate,24); wav.writeUInt32LE(rate*4,28); wav.writeUInt16LE(4,32); wav.writeUInt16LE(16,34); wav.write('data',36); wav.writeUInt32LE(count*4,40);
for (let i = 0; i < count; i++) { wav.writeInt16LE(Math.round(left[i] / peak * .84 * 32767),44+i*4); wav.writeInt16LE(Math.round(right[i] / peak * .84 * 32767),46+i*4); }
const waveFile = join(directory,'frontline-sequence.wav'); writeFileSync(waveFile,wav);
execFileSync('/usr/bin/afconvert',[waveFile,join(directory,'frontline-sequence.m4a'),'-f','m4af','-d','aac','-b','160000','-q','127']);
rmSync(waveFile);
console.log(`音频生成完成：${voiceCount} 条中文语音，原创配乐 ${duration.toFixed(1)} 秒。`);
