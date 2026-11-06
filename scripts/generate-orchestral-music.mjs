import { mkdirSync, writeFileSync, readFileSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { melody, bass, notes as pitchNames } from './internationale-score.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = join(root, 'releases/music-v3');
mkdirSync(output, { recursive: true });
const parts = [
  { program: 56, volume: .78, pan: -.18, percussion: false }, // 小号主旋律
  { program: 60, volume: .70, pan: .18, percussion: false }, // 圆号和声
  { program: 48, volume: .72, pan: -.35, percussion: false }, // 弦乐
  { program: 42, volume: .65, pan: .22, percussion: false }, // 大提琴
  { program: 57, volume: .72, pan: .32, percussion: false }, // 长号
  { program: 47, volume: .75, pan: -.08, percussion: false }, // 定音鼓
  { program: 0, volume: .72, pan: 0, percussion: true } // 军鼓、底鼓与钹
];
const report = [];
for (const id of ['internationale', 'iron-tide', 'east-wind']) {
  const bpm = id === 'internationale' ? 114 : id === 'iron-tide' ? 140 : 148;
  const beat = 60 / bpm, bars = id === 'internationale' ? 36 : 48;
  const score = { seconds: bars * 4 * beat, parts, notes: [] };
  function note(part, pitch, at, duration, velocity) {
    score.notes.push({ part, pitch, at: at * beat, duration: duration * beat, velocity });
  }
  function drums(bar, energy) {
    const start = bar * 4;
    for (const pulse of [0, 2]) {
      note(6, 36, start + pulse, .25, energy);
      note(5, 38, start + pulse, .6, energy - 12);
    }
    for (let step = 0; step < 8; step++) note(6, 38, start + step * .5, .14, step % 2 ? energy - 38 : energy - 15);
    if (bar % 4 === 3) for (const pulse of [3.25, 3.5, 3.75]) note(6, 38, start + pulse, .1, energy - 12);
    if (bar % 8 === 0) note(6, 49, start, 1.5, energy - 25);
  }
  if (id === 'internationale') {
    // 四小节前奏后进入原曲，铜管八度、弦乐分解和弦与进行军鼓。
    for (let bar = 0; bar < 4; bar++) {
      for (const at of [0, 1.5, 2, 3]) note(0, [55, 59, 62, 67][bar], bar * 4 + at, .8, 94 + bar * 3);
    }
    let offset = 32;
    const chords = { 43: [55, 59, 62], 48: [60, 64, 67], 45: [57, 60, 64], 50: [62, 66, 69], 40: [52, 55, 59] };
    for (const [index, measure] of melody.entries()) {
      if (index > 0) {
        const rootPitch = bass[index - 1] - 2, chord = chords[rootPitch] || [rootPitch + 12, rootPitch + 16, rootPitch + 19];
        const start = offset / 2;
        for (const tone of chord) { note(1, tone, start, 3.8, 75); note(4, tone - 12, start, 1.8, 70); }
        for (let step = 0; step < 8; step++) note(2, chord[step % chord.length] + 12, start + step * .5, .42, index > 16 ? 80 : 67);
        note(3, rootPitch, start, 1.8, 90); note(3, rootPitch + 7, start + 2, 1.8, 85);
      }
      for (const token of measure.split(' ')) {
        const [, sharp, pitch, length] = /^(\^?)([A-Ga-gz])(\d*(?:\.\d+)?)$/.exec(token);
        const count = Number(length || 1);
        if (pitch !== 'z') {
          const midi = pitchNames[pitch.toUpperCase()] + (pitch === pitch.toLowerCase() ? 12 : 0) + (sharp ? 1 : 0) - 2;
          note(0, midi, offset / 2, count * .46, index >= 17 ? 108 : 98);
          note(1, midi - 12, offset / 2, count * .47, 82);
        }
        offset += count;
      }
    }
    score.seconds = (offset / 2 + 2) * beat;
  } else {
    // 两首战斗曲采用各自的原创动机，保留低潮、推进与全奏段落。
    const harmony = id === 'iron-tide'
      ? [[38, 50, 53, 57], [34, 46, 50, 53], [41, 53, 57, 60], [36, 48, 52, 55]]
      : [[40, 52, 55, 59], [36, 48, 52, 55], [43, 55, 59, 62], [38, 50, 54, 57]];
    const motif = id === 'iron-tide' ? [0, 2, 1, 2, 0, 1, 2, 1] : [0, 1, 2, 2, 1, 0, 2, 1];
    for (let bar = 0; bar < bars; bar++) {
      const chord = harmony[Math.floor(bar / 2) % harmony.length], start = bar * 4;
      const intensity = bar < 4 || bar >= 24 && bar < 28 ? 70 : bar >= 32 ? 104 : 90;
      for (let step = 0; step < 8; step++) {
        note(2, chord[1 + motif[step] % 3] + 12, start + step * .5, .38, intensity - 15);
        if (step % 2 === 0) note(3, chord[0] + (step === 4 ? 7 : 0), start + step * .5, .85, intensity);
      }
      for (const tone of chord.slice(1)) note(1, tone, start, 3.7, intensity - 18);
      if (bar >= 4) {
        for (let step = 0; step < 4; step++) {
          const at = start + step;
          note(0, chord[1 + motif[(step + bar) % 8] % 3] + (bar >= 32 ? 12 : 0), at, step === 3 ? .65 : .8, intensity);
          if (step % 2 === 0) note(4, chord[1], at, .8, intensity - 15);
        }
      }
    }
  }
  for (let bar = 0; bar < bars; bar++) drums(bar, bar >= 16 ? 104 : 91);
  const json = join(output, id + '.json'), wav = join(output, id + '.wav'), flac = join(output, id + '.flac');
  const aac = join(root, 'assets/audio', id + '.m4a');
  writeFileSync(json, JSON.stringify(score));
  execFileSync('swift', [join(root, 'scripts/render-orchestra.swift'), json, wav], { stdio: 'inherit' });
  const floatWav = join(output, id + '-float.wav');
  execFileSync('/usr/bin/afconvert', [wav, floatWav, '-f', 'WAVE', '-d', 'LEF32']);
  const source = readFileSync(floatWav);
  let pcm;
  for (let position = 12; position + 8 <= source.length;) {
    const size = source.readUInt32LE(position + 4);
    if (source.toString('ascii', position, position + 4) === 'data') { pcm = source.subarray(position + 8, position + 8 + size); break; }
    position += 8 + size + size % 2;
  }
  if (!pcm) throw new Error('缺少渲染PCM');
  let peak = 0;
  for (let i = 0; i < pcm.length; i += 4) peak = Math.max(peak, Math.abs(pcm.readFloatLE(i)));
  if (!Number.isFinite(peak) || peak <= 0) throw new Error('渲染音轨为空');
  const master = Buffer.alloc(44 + pcm.length / 2);
  master.write('RIFF'); master.writeUInt32LE(master.length - 8, 4); master.write('WAVEfmt ', 8);
  master.writeUInt32LE(16, 16); master.writeUInt16LE(1, 20); master.writeUInt16LE(2, 22);
  master.writeUInt32LE(44100, 24); master.writeUInt32LE(176400, 28);
  master.writeUInt16LE(4, 32); master.writeUInt16LE(16, 34); master.write('data', 36); master.writeUInt32LE(master.length - 44, 40);
  const frames = pcm.length / 8;
  for (let i = 0; i < pcm.length / 4; i++) {
    const frame = Math.floor(i / 2), fade = Math.min(1, frame / (44100 * .02), (frames - frame - 1) / (44100 * .12));
    master.writeInt16LE(Math.round(pcm.readFloatLE(i * 4) / peak * .88 * 32767 * fade), 44 + i * 2);
  }
  writeFileSync(wav, master);
  execFileSync('/usr/bin/afconvert', [wav, flac, '-f', 'flac', '-d', 'flac']);
  execFileSync('/usr/bin/afconvert', [wav, aac, '-f', 'm4af', '-d', 'aac', '-b', '160000', '-q', '127']);
  report.push({ id, bpm, seconds: score.seconds, instruments: parts.length, flacBytes: statSync(flac).size, aacBytes: statSync(aac).size });
}
writeFileSync(join(output, 'report.json'), JSON.stringify(report, null, 2));
console.log(report);
