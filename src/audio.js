import { COMMAND_LINES, normalizeAudioSettings, speechOptions, VOICE_COOLDOWN, VOICE_LINES, VOICE_PRIORITY, voiceFile } from './audio-data.js';

const assets = import.meta.glob('../assets/audio/*.m4a', { eager: true, query: '?url', import: 'default' });
const portableVoices = import.meta.glob('../assets/audio/portable/*.wav', { eager: true, query: '?url', import: 'default' });
const SETTINGS_KEY = 'great-powers-audio-v1';

export class GameAudio {
  constructor() {
    let saved;
    try { saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'); } catch { saved = {}; }
    this.settings = normalizeAudioSettings(saved || {});
    this.context = null; this.buffers = new Map(); this.pending = new Map();
    this.active = false; this.paused = false; this.session = 0; this.music = null;
    this.voiceQueue = []; this.currentVoice = null; this.cooldowns = new Map(); this.variants = new Map(); this.lastSpeech = 0; this.lastShot = 0;
  }

  async unlock() {
    if (!this.context) {
      const Context = window.AudioContext || window.webkitAudioContext;
      if (!Context) return false;
      this.context = new Context();
      const ctx = this.context;
      this.master = ctx.createGain(); this.musicBus = ctx.createGain(); this.voiceBus = ctx.createGain(); this.effectsBus = ctx.createGain();
      this.compressor = ctx.createDynamicsCompressor(); this.compressor.threshold.value = -12; this.compressor.ratio.value = 4; this.compressor.attack.value = .01; this.compressor.release.value = .15;
      this.analyser = ctx.createAnalyser(); this.analyser.fftSize = 1024;
      this.master.connect(this.compressor); this.compressor.connect(this.analyser); this.analyser.connect(ctx.destination);
      this.musicBus.connect(this.master); this.effectsBus.connect(this.master); this.voiceBus.connect(this.master);
      this.radioFilter = ctx.createBiquadFilter(); this.radioFilter.type = 'lowpass'; this.radioFilter.frequency.value = 4700; this.radioFilter.connect(this.voiceBus);
      this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); const samples = this.noise.getChannelData(0);
      for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
      this.applySettings();
    }
    try { await this.context.resume(); return this.context.state === 'running'; } catch { return false; }
  }

  async buffer(file) {
    if (this.buffers.has(file)) return this.buffers.get(file);
    if (!this.pending.has(file)) {
      const url = assets[`../assets/audio/${file}`] || portableVoices[`../assets/audio/${file}`];
      if (!url) throw new Error(`缺少音频素材：${file}`);
      this.pending.set(file, fetch(url).then(response => { if (!response.ok) throw new Error('音频载入失败'); return response.arrayBuffer(); }).then(bytes => this.context.decodeAudioData(bytes)).then(buffer => { this.buffers.set(file, buffer); return buffer; }).finally(() => this.pending.delete(file)));
    }
    return this.pending.get(file);
  }

  async startBattle() {
    this.stopBattle(); this.active = true; const session = this.session;
    if (!await this.unlock()) return false;
    try {
      const buffer = await this.buffer('frontline-sequence.m4a');
      if (!this.active || session !== this.session) return false;
      const source = this.context.createBufferSource(); source.buffer = buffer; source.loop = true; source.loopEnd = Math.min(buffer.duration, 32 * 4 * 60 / 104); source.connect(this.musicBus); source.start(); this.music = source;
      this.applySettings(); this.say('welcome');
      for (const file of Object.keys(assets).map(path => path.split('/').at(-1)).filter(name => name !== 'frontline-sequence.m4a')) this.buffer(file).catch(() => {});
      return true;
    } catch { return false; }
  }

  stopBattle() {
    this.session++; this.active = false; this.paused = false;
    if (this.music) { this.music.stop(); this.music.disconnect(); this.music = null; }
    this.clearVoices(); this.cooldowns.clear(); this.lastSpeech = 0;
  }

  clearVoices() {
    this.voiceQueue = [];
    const current = this.currentVoice; this.currentVoice = null;
    if (current?.source) { current.source.onended = null; current.source.stop(); current.source.disconnect(); }
    if (current?.speech) { clearTimeout(current.timeout); current.speech.onend = null; current.speech.onerror = null; window.speechSynthesis.cancel(); }
  }

  setSettings(patch) {
    this.settings = normalizeAudioSettings({ ...this.settings, ...patch });
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings)); } catch { /* 设置不能持久化时仍正常播放。 */ }
    if (this.settings.muted || this.settings.voice === 0 || this.settings.master === 0) this.clearVoices();
    this.applySettings();
  }

  applySettings() {
    if (!this.context) return;
    const time = this.context.currentTime, settings = this.settings;
    this.master.gain.setTargetAtTime(settings.muted ? 0 : settings.master, time, .04);
    const duck = this.currentVoice ? .45 : 1, pause = this.paused ? .23 : 1;
    this.musicBus.gain.setTargetAtTime(settings.music * duck * pause, time, .12);
    this.voiceBus.gain.setTargetAtTime(settings.voice, time, .04); this.effectsBus.gain.setTargetAtTime(settings.effects, time, .04);
  }

  setPaused(value) {
    if (this.paused === value) return;
    this.paused = value;
    if (value) this.clearVoices();
    this.applySettings();
  }

  say(key) {
    if (!this.active || !this.context || this.settings.muted || !this.settings.master || !this.settings.voice || this.paused || !VOICE_LINES[key]) return false;
    const now = this.context.currentTime, priority = VOICE_PRIORITY[key] || 0;
    if (now - (this.cooldowns.get(key) ?? -Infinity) < (VOICE_COOLDOWN[key] || 1.7)) return false;
    if (priority === 0 && now - this.lastSpeech < 1.1) return false;
    this.cooldowns.set(key, now); this.lastSpeech = now;
    const index = (this.variants.get(key) || 0) % VOICE_LINES[key].length; this.variants.set(key, index + 1);
    if (this.currentVoice && priority >= 3 && priority > this.currentVoice.priority) this.clearVoices();
    if (this.voiceQueue.some(line => line.key === key)) return false;
    this.voiceQueue.push({ key, index, priority, time: now }); this.voiceQueue.sort((a, b) => b.priority - a.priority);
    this.voiceQueue = this.voiceQueue.slice(0, 3); this.playNextVoice(); return true;
  }

  async playNextVoice() {
    if (this.currentVoice || !this.voiceQueue.length || !this.active || this.paused) return;
    const line = this.voiceQueue.shift(), session = this.session;
    if (this.context.currentTime - line.time > 4) { this.playNextVoice(); return; }
    // 先占用通道，防止异步解码期间多个应答同时播放。
    const token = { ...line, source: null }; this.currentVoice = token;
    if (!assets[`../assets/audio/${voiceFile(line.key, line.index)}`]) {
      const chinese = window.speechSynthesis?.getVoices().some(voice => /^zh(?:-|_)/i.test(voice.lang));
      if (chinese) this.playSpeech(token);
      else await this.playPortableVoice(token);
      return;
    }
    try {
      const buffer = await this.buffer(voiceFile(line.key, line.index));
      if (session !== this.session || this.currentVoice !== token || !this.active || this.paused || this.settings.muted || !this.settings.voice || !this.settings.master) { if (this.currentVoice === token) this.currentVoice = null; return; }
      const source = this.context.createBufferSource(); source.buffer = buffer; source.connect(COMMAND_LINES.has(line.key) ? this.radioFilter : this.voiceBus);
      source.onended = () => { source.disconnect(); if (this.currentVoice === token) { this.currentVoice = null; this.applySettings(); this.playNextVoice(); } };
      token.source = source; source.start(); this.applySettings();
    } catch { if (this.currentVoice === token) { this.currentVoice = null; this.playNextVoice(); } }
  }

  async playPortableVoice(token) {
    const session = this.session, file = `portable/${token.key}-${token.index}.wav`;
    try {
      const buffer = await this.buffer(file);
      if (session !== this.session || this.currentVoice !== token || !this.active || this.paused || this.settings.muted || !this.settings.voice || !this.settings.master) return;
      const source = this.context.createBufferSource(); source.buffer = buffer; source.connect(COMMAND_LINES.has(token.key) ? this.radioFilter : this.voiceBus);
      source.onended = () => { source.disconnect(); if (this.currentVoice === token) { this.currentVoice = null; this.applySettings(); this.playNextVoice(); } };
      token.source = source; source.start(); this.applySettings();
    } catch { if (this.currentVoice === token) { this.currentVoice = null; this.applySettings(); this.playNextVoice(); } }
  }

  playSpeech(token) {
    // 不分发系统语音录音；设备音色不可用时回退到自带中文播报。
    if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) {
      this.playPortableVoice(token); return;
    }
    const synth = window.speechSynthesis;
    const speech = new window.SpeechSynthesisUtterance(VOICE_LINES[token.key][token.index]);
    Object.assign(speech, speechOptions(this.settings, COMMAND_LINES.has(token.key)));
    const voices = synth.getVoices().filter(voice => /^zh(?:-|_)/i.test(voice.lang));
    const voice = voices.find(item => item.localService) || voices[0];
    if (voice) speech.voice = voice;
    token.speech = speech;
    const finish = () => {
      clearTimeout(token.timeout);
      if (this.currentVoice !== token) return;
      this.currentVoice = null; this.applySettings(); this.playNextVoice();
    };
    speech.onend = finish;
    const fallback = () => {
      clearTimeout(token.timeout); speech.onend = null; speech.onerror = null;
      if (this.currentVoice === token) { synth.cancel(); token.speech = null; this.playPortableVoice(token); }
    };
    speech.onerror = fallback;
    token.timeout = setTimeout(() => {
      fallback();
    }, 12000);
    try { synth.speak(speech); this.applySettings(); } catch { fallback(); }
  }

  selection(entities) {
    const entity = entities.find(item => item.kind === 'unit') || entities[0];
    if (!entity) return;
    let key = 'infantrySelected';
    if (entity.kind === 'building') key = 'structureSelected';
    else if (entity.type === 'engineer') key = 'engineerSelected';
    else if (['tank','aa','harvester','elite','loiterer','jammer','laser','rocket','apc','supply'].includes(entity.type)) key = 'armorSelected';
    else if (['fighter','strike','bomber','airlift','aegis'].includes(entity.type)) key = 'airSelected';
    else if (['drone','ghost'].includes(entity.type)) key = 'droneSelected';
    else if (['patrol','frigate','destroyer','carrier','submarine','landing'].includes(entity.type)) key = 'navySelected';
    this.say(key);
  }

  shot(style, owner = 0) {
    if (!this.active || !this.context || this.paused || this.settings.muted || !this.settings.master || !this.settings.effects) return;
    const ctx = this.context, start = ctx.currentTime;
    if (start - this.lastShot < .06) return; this.lastShot = start;
    if (style === 'laser') {
      const beam = ctx.createOscillator(), envelope = ctx.createGain(); beam.type = 'sine'; beam.frequency.setValueAtTime(2100, start); beam.frequency.exponentialRampToValueAtTime(850, start + .16);
      envelope.gain.setValueAtTime(.035 * (owner ? .5 : 1), start); envelope.gain.exponentialRampToValueAtTime(.0001, start + .19);
      beam.connect(envelope); envelope.connect(this.effectsBus); beam.start(start); beam.stop(start + .2);
      beam.onended = () => { beam.disconnect(); envelope.disconnect(); }; return;
    }
    const heavy = ['tank','elite','turret','strike','frigate','rocket','destroyer','submarine'].includes(style), length = heavy ? .25 : .11;
    const noise = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
    noise.buffer = this.noise; filter.type = 'lowpass'; filter.frequency.value = heavy ? 850 : 3700;
    gain.gain.setValueAtTime((heavy ? .16 : .065) * (owner ? .5 : 1), start); gain.gain.exponentialRampToValueAtTime(.0001, start + length);
    noise.connect(filter); filter.connect(gain); gain.connect(this.effectsBus); noise.start(start); noise.stop(start + length);
    noise.onended = () => { noise.disconnect(); filter.disconnect(); gain.disconnect(); };
    if (heavy) {
      const bass = ctx.createOscillator(), envelope = ctx.createGain(); bass.frequency.setValueAtTime(105,start); bass.frequency.exponentialRampToValueAtTime(35,start+.18);
      envelope.gain.setValueAtTime(.16,start); envelope.gain.exponentialRampToValueAtTime(.0001,start+.2); bass.connect(envelope); envelope.connect(this.effectsBus); bass.start(start); bass.stop(start+.2);
      bass.onended = () => { bass.disconnect(); envelope.disconnect(); };
    }
  }
}

export const gameAudio = new GameAudio();
