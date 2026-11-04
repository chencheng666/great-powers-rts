import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// 皮埃尔·德盖特 1888 年曲调。只转录旋律，配器和音频均由本脚本生成。
// https://abcnotation.com/tunePage?a=trillian.mit.edu%2F~jc%2Fmusic%2Fabc%2Fanthem%2FInternationale%2F0000
const melody = [
  'E', 'A3 G B A E C', 'F4 D2 z F', 'B3 A G F E D', 'C6 z E',
  'A3 G B A E C', 'F4 D2 B A', 'G2 G B d3 G', 'A6 c B',
  'G3 G F G A F', 'G4 E ^D E F', 'F F2 F B3 A', 'G6 z B',
  'B3 G E E ^D E', 'c4 E F G A', 'G2 B2 A2 F2', 'E6 c1.5 B0.5',
  'A4 E3 F', 'F4 D2 B1.5 A0.5', 'G2 G2 F2 E2', 'E6 E2',
  'c3 c B2 E2', 'A4 G3 G', 'F3 ^E F2 B2', 'B6 c1.5 B0.5',
  'A4 E3 F', 'F4 D2 B1.5 A0.5', 'G2 G2 G3 E', 'c6 z c',
  'e3 e d2 c2', 'B2 c2 d2 z d', 'c3 c B3 A', 'A6 z2',
];
const bass = [45,50,47,45,45,50,52,45,52,52,47,52,52,45,52,52,45,50,52,45,45,42,47,52,45,50,52,45,42,47,52,45];
const notes = { C:61, D:62, E:64, F:66, G:68, A:69, B:71 };
const rate = 44100, beat = 60 / 108, eighth = beat / 2, duration = (1 + 32 * 8) * eighth;
const samples = Math.round(duration * rate), left = new Float64Array(samples), right = new Float64Array(samples);
const hz = midi => 440 * 2 ** ((midi - 69) / 12);
const tau = 2 * Math.PI;
let seed = 1888;
const noise = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2147483648 - 1);
function add(at, seconds, sound, gain, pan = 0) {
  const offset = Math.round(at * rate), count = Math.round(seconds * rate);
  const l = gain * Math.sqrt((1 - pan) / 2), r = gain * Math.sqrt((1 + pan) / 2);
  for (let i = 0; i < count && offset + i < samples; i++) {
    const value = sound(i / rate);
    left[offset + i] += value * l;
    right[offset + i] += value * r;
  }
}
function brass(at, seconds, midi, gain, pan) {
  const frequency = hz(midi), length = seconds + .075;
  add(at, length, time => {
    const envelope = Math.min(1, time / .036) * Math.min(1, (length - time) / .085) * (.76 + .24 * Math.exp(-time * 2.7));
    const angle = tau * frequency * time + .026 * Math.sin(tau * 5.2 * time);
    return envelope * (.66 * Math.sin(angle) + .27 * Math.sin(angle * 2) + .16 * Math.sin(angle * 3) + .07 * Math.sin(angle * 5));
  }, gain, pan);
}
let offset = 0;
for (const [index, bar] of melody.entries()) {
  if (index > 0) {
    const at = offset * eighth, root = bass[index - 1] - 2, strong = index >= 17 ? 1 : .8;
    for (let pulse = 0; pulse < 4; pulse++) {
      const t = at + pulse * beat;
      brass(t, beat * .74, root + (pulse === 2 ? 7 : 0), (pulse % 2 ? .085 : .16) * strong, -.22);
      if (pulse % 2 === 0) add(t, .38, s => Math.sin(tau * (46 * s + 2 * (1 - Math.exp(-s * 22)))) * Math.exp(-s * 10), .29 * strong);
      else add(t, .19, s => (noise() * .7 + Math.sin(tau * 155 * s) * .3) * Math.min(1, s / .004) * Math.exp(-s * 22), .14, .23);
    }
  }
  for (const token of bar.split(' ')) {
    const [, sharp, note, size] = /^(\^?)([A-Ga-gz])(\d*(?:\.\d+)?)$/.exec(token);
    const count = Number(size || 1), at = offset * eighth;
    if (note !== 'z') {
      const midi = notes[note.toUpperCase()] + (note === note.toLowerCase() ? 12 : 0) + (sharp ? 1 : 0);
      brass(at, count * eighth * .94, midi - 2, .34, .12);
      brass(at, count * eighth * .86, midi - 14, index >= 17 ? .17 : .1, -.33);
    }
    offset += count;
  }
}
if (offset !== 257) throw new Error('乐谱时长不一致');
const peak = Math.max(left.reduce((p,v)=>Math.max(p,Math.abs(v)),0),right.reduce((p,v)=>Math.max(p,Math.abs(v)),0));
const wav = Buffer.alloc(44 + samples * 4);
wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20); wav.writeUInt16LE(2, 22); wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 4, 28);
wav.writeUInt16LE(4, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(samples * 4, 40);
for (let i = 0; i < samples; i++) {
  const fade = Math.min(1, i / (rate * .015), (samples - i - 1) / (rate * .06));
  const gain = 28300 * fade / peak;
  wav.writeInt16LE(Math.round(left[i] * gain), 44 + i * 4);
  wav.writeInt16LE(Math.round(right[i] * gain), 46 + i * 4);
}
const temp = mkdtempSync(join(tmpdir(), 'great-powers-score-'));
try {
  const master = join(temp, 'master.wav');
  const target = new URL('../assets/audio/internationale.m4a', import.meta.url);
  writeFileSync(master, wav);
  execFileSync('/usr/bin/afconvert', [master, decodeURIComponent(target.pathname), '-f', 'm4af', '-d', 'aac', '-b', '128000', '-q', '127']);
  if (process.argv[2]) execFileSync('/usr/bin/afconvert', [master, process.argv[2], '-f', 'flac', '-d', 'flac']);
} finally { rmSync(temp, { recursive: true, force: true }); }
