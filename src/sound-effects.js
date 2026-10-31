// 原创程序合成，不使用第三方录音。短声按武器分类缓存，移动声按类别合并。
const profile = (duration, low, high, tone, end, level, pulse = 0) => ({ duration, low, high, tone, end, level, pulse });
export const SOUND_PROFILES = {
  airTakeoff: profile(2.2, .7, .8, 75, 160, .23),
  airLanding: profile(1.7, .65, .65, 150, 65, .18),
  rotorStart: profile(1.4, .4, .15, 45, 210, .1, 18),
  rotorStop: profile(1.6, .3, .12, 200, 30, .1, 15),
  sonarPing: profile(.85, .01, .015, 1100, 600, .13),
  rifle: profile(.22, .03, .75, 170, 80, .14, 3),
  aa: profile(.3, .12, .65, 240, 85, .17, 4),
  tank: profile(.65, .75, .18, 118, 36, .34),
  turret: profile(.5, .6, .22, 145, 42, .27),
  elite: profile(.5, .5, .28, 160, 42, .25),
  patrol: profile(.4, .45, .35, 180, 48, .23),
  frigate: profile(.5, .6, .2, 140, 40, .27),
  missile: profile(.6, .18, .7, 180, 520, .18),
  rocket: profile(.85, .4, .6, 100, 220, .24, 2),
  ballistic: profile(1.3, .7, .5, 65, 150, .26),
  loiterer: profile(.45, .08, .4, 500, 220, .15),
  antiSub: profile(.4, .65, .12, 160, 58, .17, 2),
  submarine: profile(.65, .8, .03, 105, 48, .2, 3),
  bomber: profile(.38, .12, .1, 440, 120, .12, 2),
  carrier: profile(.8, .3, .35, 110, 450, .16),
  drone: profile(.2, .06, .45, 880, 260, .12, 2),
  laser: profile(.3, .01, .03, 2200, 650, .13),
  railgun: profile(.75, .5, .45, 2600, 70, .3),
  robotPulse: profile(.26, .06, .08, 1100, 180, .16, 2),
  lightImpact: profile(.13, .1, .35, 130, 60, .065),
  metalImpact: profile(.28, .3, .55, 920, 240, .11),
  explosiveImpact: profile(.7, .8, .35, 100, 30, .28),
  largeImpact: profile(1.15, .9, .3, 75, 24, .36),
  waterImpact: profile(.85, .8, .09, 90, 32, .22),
  intercept: profile(.4, .2, .6, 350, 80, .17),
  vehicleDestroyed: profile(1, .9, .4, 95, 26, .32, 2),
  aircraftDestroyed: profile(.85, .55, .6, 700, 45, .27),
  shipDestroyed: profile(1.4, .9, .15, 110, 28, .29, 3),
  buildingDestroyed: profile(1.6, .9, .3, 70, 23, .35, 3),
  sabotageBlast: profile(1.1, .85, .45, 85, 26, .3),
  nuclearLaunch: profile(1.8, .8, .5, 55, 180, .3),
  nuclearImpact: profile(3.4, 1, .3, 65, 22, .4, 2),
};
const ALIASES = { fighter: 'missile', strike: 'missile', navalFighter: 'missile', navalStrike: 'missile', aegis: 'missile', abm: 'missile', destroyer: 'missile', helicopter: 'missile' };
export function soundProfile(style) { return SOUND_PROFILES[ALIASES[style] || style] || null; }

export function synthesizeSound(style, sampleRate = 44100) {
  const p = soundProfile(style);
  if (!p) return null;
  const samples = new Float32Array(Math.ceil(sampleRate * p.duration));
  let seed = 731, low = 0, phase = 0;
  for (let i = 0; i < samples.length; i++) {
    const t = i / sampleRate, progress = t / p.duration;
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
    const noise = (seed >>> 0) / 2147483648 - 1;
    low += (noise - low) * .045;
    phase += 2 * Math.PI * (p.tone * (p.end / p.tone) ** progress) / sampleRate;
    const pulseTime = p.pulse ? (t * p.pulse / (p.duration * .65)) % 1 : 0;
    const pulse = p.pulse && progress < .65 ? Math.exp(-pulseTime * 8) : Math.exp(-progress * 5);
    const engine = ['airTakeoff', 'airLanding'].includes(style);
    const envelope = engine ? Math.min(1, t / .25) * Math.min(1, (p.duration - t) / .35) * (.65 + .35 * Math.sin(progress * Math.PI)) : Math.min(1, t / .004) * Math.min(1, (p.duration - t) / .04) * Math.exp(-progress * 2.5);
    samples[i] = (low * p.low * 3 + (noise - low) * p.high * .5 + Math.sin(phase) * .38) * envelope * (p.pulse ? .25 + pulse * .75 : 1) * p.level;
  }
  return samples;
}

const LOOP_PROFILES = {
  footsteps: [58, .18, .45, 3],
  tracks: [48, .55, .12, 13], wheels: [76, .35, .08, 5], jet: [120, .4, .65, 2],
  rotor: [64, .4, .25, 18], drone: [260, .13, .15, 36], ship: [40, .5, .18, 3], submerged: [32, .55, .015, 2], robot: [180, .18, .15, 8],
};

export class SoundEffects {
  constructor(context, bus, maxVoices = 16) {
    this.context = context; this.bus = bus; this.maxVoices = maxVoices;
    this.buffers = new Map(); this.voices = new Set(); this.loops = new Map(); this.cooldowns = new Map();
  }
  buffer(style) {
    const key = ALIASES[style] || style;
    if (!this.buffers.has(key)) {
      const data = synthesizeSound(key, this.context.sampleRate);
      if (!data) return null;
      const buffer = this.context.createBuffer(1, data.length, this.context.sampleRate);
      buffer.getChannelData(0).set(data); this.buffers.set(key, buffer);
    }
    return this.buffers.get(key);
  }
  play(style, { level = 1, pan = 0, owner = 0, phase = 'launch', preview = false } = {}) {
    if (!soundProfile(style) || level <= 0) return false;
    const now = this.context.currentTime, key = `${ALIASES[style] || style}:${phase}`;
    // 同类密集齐射合并，不再用一个全局时间戳吞掉其他武器或命中声。
    if (!preview && now - (this.cooldowns.get(key) ?? -Infinity) < .045) return false;
    const priority = style === 'nuclearImpact' ? 4 : phase === 'destroy' ? 3 : phase === 'impact' ? 2 : 1;
    if (this.voices.size >= this.maxVoices) {
      const victim = [...this.voices].sort((a, b) => a.priority - b.priority || a.at - b.at)[0];
      if (victim.priority > priority) return false;
      victim.stop();
    }
    const buffer = this.buffer(style);
    if (!buffer) return false;
    this.cooldowns.set(key, now);
    const source = this.context.createBufferSource(), gain = this.context.createGain(), panner = this.context.createStereoPanner();
    source.buffer = buffer; gain.gain.value = Math.min(1, level) * (owner ? .65 : 1); panner.pan.value = pan;
    source.connect(gain); gain.connect(panner); panner.connect(this.bus);
    const voice = { priority, at: now, stop: () => { source.onended = null; source.stop(); cleanup(); } };
    const cleanup = () => { source.disconnect(); gain.disconnect(); panner.disconnect(); this.voices.delete(voice); };
    source.onended = cleanup; this.voices.add(voice); source.start(); return true;
  }
  loopBuffer(kind) {
    const key = `loop:${kind}`;
    if (this.buffers.has(key)) return this.buffers.get(key);
    const [frequency, bass, hiss, pulse] = LOOP_PROFILES[kind];
    const rate = this.context.sampleRate, buffer = this.context.createBuffer(1, rate, rate), data = buffer.getChannelData(0);
    let seed = 721, low = 0;
    for (let i = 0; i < rate; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
      const noise = (seed >>> 0) / 2147483648 - 1; low += (noise - low) * .03;
      const t = i / rate, modulation = kind === 'footsteps' ? Math.exp(-((t * pulse) % 1) * 13) : .65 + .35 * Math.sin(2 * Math.PI * pulse * t);
      data[i] = (Math.sin(2 * Math.PI * frequency * t) * bass + low * 3 * hiss + noise * hiss * .2) * modulation * .065;
    }
    // 接缝交叉过渡，消除循环边界的点击。
    const edge = Math.floor(rate * .008);
    const tail = data[rate - 1];
    for (let i = 0; i < edge; i++) { const mix = i / edge; data[i] = tail * (1 - mix) + data[i] * mix; }
    this.buffers.set(key, buffer); return buffer;
  }
  syncMovement(groups) {
    const now = this.context.currentTime, wanted = new Set(groups.map(g => g.kind));
    for (const [kind, loop] of this.loops) if (!wanted.has(kind)) { loop.stop(); this.loops.delete(kind); }
    for (const group of groups.slice(0, 4)) {
      if (!LOOP_PROFILES[group.kind]) continue;
      let loop = this.loops.get(group.kind);
      if (!loop) {
        const source = this.context.createBufferSource(), gain = this.context.createGain(), pan = this.context.createStereoPanner();
        source.buffer = this.loopBuffer(group.kind); source.loop = true; gain.gain.value = 0;
        source.connect(gain); gain.connect(pan); pan.connect(this.bus);
        source.onended = () => { source.disconnect(); gain.disconnect(); pan.disconnect(); };
        source.start();
        loop = { source, gain, pan, stop: () => { gain.gain.cancelScheduledValues(this.context.currentTime); gain.gain.setTargetAtTime(0, this.context.currentTime, .025); source.stop(this.context.currentTime + .12); } };
        this.loops.set(group.kind, loop);
      }
      loop.gain.gain.setTargetAtTime(group.level, now, .08); loop.pan.pan.setTargetAtTime(group.pan, now, .08);
    }
  }
  stop() {
    for (const voice of [...this.voices]) voice.stop();
    this.syncMovement([]); this.cooldowns.clear();
  }
}
