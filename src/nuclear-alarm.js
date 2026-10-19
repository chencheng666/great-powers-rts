export const NUCLEAR_SIREN = Object.freeze({ duration: 6, low: 280, high: 680, gain: .16 });

// 原创合成的机械升降调，不包含其他游戏的录音或采样。
export function nuclearSirenSamples(sampleRate) {
  if (!Number.isFinite(sampleRate) || sampleRate < 8000 || sampleRate > 192000) throw new RangeError('警报采样率无效');
  const count = Math.round(sampleRate * NUCLEAR_SIREN.duration), samples = new Float32Array(count);
  const mid = (NUCLEAR_SIREN.low + NUCLEAR_SIREN.high) / 2, span = (NUCLEAR_SIREN.high - NUCLEAR_SIREN.low) / 2;
  let phase = 0, rotor = 0;
  for (let i = 0; i < count; i++) {
    const frequency = mid - span * Math.cos(i / count * Math.PI * 2);
    const tone = Math.sin(phase) + .28 * Math.sin(phase * 2) + .10 * Math.sin(phase * 3);
    samples[i] = (tone + .32 * Math.sin(rotor)) * .56;
    phase += Math.PI * 2 * frequency / sampleRate;
    rotor += Math.PI * 2 * frequency * (1 + 1 / 240) / sampleRate;
  }
  return samples;
}

export const nuclearAlarmAudible = ({ active, paused, wanted, settings }) => Boolean(active && !paused && wanted && !settings.muted && settings.master > 0 && settings.effects > 0);

export class NuclearAlarm {
  constructor(context, destination) {
    this.context = context; this.destination = destination;
    this.buffer = null; this.source = null;
  }

  setActive(value) {
    if (Boolean(this.source) === Boolean(value)) return;
    const ctx = this.context, now = ctx.currentTime;
    if (!value) {
      const source = this.source, gain = this.gain; this.source = null; this.gain = null;
      gain.gain.cancelScheduledValues(now); gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.linearRampToValueAtTime(0, now + .12); source.stop(now + .14);
      return;
    }
    if (!this.buffer) {
      const samples = nuclearSirenSamples(ctx.sampleRate);
      this.buffer = ctx.createBuffer(1, samples.length, ctx.sampleRate); this.buffer.copyToChannel(samples, 0);
    }
    const source = ctx.createBufferSource(), gain = ctx.createGain();
    source.buffer = this.buffer; source.loop = true;
    gain.gain.setValueAtTime(0, now); gain.gain.linearRampToValueAtTime(NUCLEAR_SIREN.gain, now + .3);
    source.connect(gain); gain.connect(this.destination);
    source.onended = () => {
      source.disconnect(); gain.disconnect();
      if (this.source === source) { this.source = null; this.gain = null; }
    };
    this.source = source; this.gain = gain; source.start();
  }
}
