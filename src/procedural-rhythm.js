// 八小节低鼓和刷镲与山海进行曲的 116 BPM 同拍。仅交火高峰才进入混音。
export const RHYTHM_SECONDS = 32 * 60 / 116;
export function createRhythmSamples(sampleRate) {
  const beat = 60 / 116, samples = new Float32Array(Math.round(sampleRate * RHYTHM_SECONDS));
  let seed = 161118;
  const noise = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2147483648 - 1;
  };
  for (let bar = 0; bar < 8; bar++) {
    for (const [offset, level, drum] of [[0,.56,true],[1.5,.20,false],[2,.38,true],[3.5,.15,false]]) {
      if (bar % 4 === 3 && offset === 3.5) continue;
      const start = Math.round((bar * 4 + offset) * beat * sampleRate);
      let low = 0, phase = 0;
      for (let i = 0; i < sampleRate * .33; i++) {
        const t = i / sampleRate, dry = noise();
        low += (dry - low) * (drum ? .026 : .12);
        phase += 2 * Math.PI * (49 + 88 * Math.exp(-t * 25)) / sampleRate;
        const hit = drum ? Math.sin(phase) * Math.exp(-t * 13) + low * .55 * Math.exp(-t * 30) :
          (dry - low) * .55 * Math.exp(-t * 22) + Math.sin(phase * 2.4) * .10 * Math.exp(-t * 15);
        samples[(start + i) % samples.length] += hit * level * Math.min(1, t * 465, (.331 - t) * 100);
      }
    }
  }
  return samples;
}
