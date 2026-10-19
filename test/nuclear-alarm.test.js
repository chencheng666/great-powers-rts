import test from 'node:test';
import assert from 'node:assert/strict';
import { NuclearAlarm, NUCLEAR_SIREN, nuclearAlarmAudible, nuclearSirenSamples } from '../src/nuclear-alarm.js';

test('防空警报为原创有界升降调PCM，不使用外部素材且循环接缝连续', () => {
  for (const rate of [8000, 44100, 48000]) {
    const samples = nuclearSirenSamples(rate);
    assert.equal(samples.length, rate * NUCLEAR_SIREN.duration);
    let energy = 0, peak = 0;
    for (const value of samples) { assert.ok(Number.isFinite(value)); energy += value * value; peak = Math.max(peak, Math.abs(value)); }
    assert.ok(Math.sqrt(energy / samples.length) > .2); assert.ok(peak < 1);
    assert.ok(Math.abs(samples[0] - samples.at(-1)) < .3);
    const crossings = time => {
      let count = 0; const start = Math.round(time * rate), end = start + Math.round(.1 * rate);
      for (let i = start; i < end; i++) if (samples[i] <= 0 && samples[i + 1] > 0) count++;
      return count;
    };
    assert.ok(crossings(2.95) > crossings(0) * 1.6);
  }
  for (const value of [0, 7999, Infinity, NaN, 200000]) assert.throws(() => nuclearSirenSamples(value));
});

test('独立警报不受解说和音乐音量影响，但遵守音效、主音量、静音、暂停和战局结束', () => {
  const state = { active: true, paused: false, wanted: true, settings: { master: .75, effects: .5, voice: 0, music: 0, muted: false } };
  assert.equal(nuclearAlarmAudible(state), true);
  for (const patch of [{ active: false }, { paused: true }, { wanted: false }]) assert.equal(nuclearAlarmAudible({ ...state, ...patch }), false);
  for (const patch of [{ master: 0 }, { effects: 0 }, { muted: true }]) assert.equal(nuclearAlarmAudible({ ...state, settings: { ...state.settings, ...patch } }), false);
});

function mockContext() {
  const sources = [], buffers = [], gains = [];
  const context = {
    currentTime: 1, sampleRate: 8000,
    createBuffer(channels, length, rate) { const buffer = { channels, length, rate, copyToChannel(samples) { this.samples = samples; } }; buffers.push(buffer); return buffer; },
    createBufferSource() { const source = { connect() {}, disconnect() { this.disconnected = true; }, start() { this.started = true; }, stop(at) { this.stopAt = at; } }; sources.push(source); return source; },
    createGain() {
      const node = { connect() {}, disconnect() { this.disconnected = true; }, gain: { value: 0, setValueAtTime(value) { this.value = value; }, linearRampToValueAtTime(value) { this.value = value; }, cancelScheduledValues() {} } }; gains.push(node); return node;
    },
  };
  return { context, sources, buffers, gains };
}

test('重复联机快照和准备转飞行不重复创建警报；解除威胁淡出，旧节点结束不清掉新的警报', () => {
  const { context, sources, buffers, gains } = mockContext(), alarm = new NuclearAlarm(context, {});
  for (let i = 0; i < 200; i++) alarm.setActive(true);
  assert.equal(sources.length, 1); assert.equal(sources[0].loop, true); assert.ok(sources[0].started);
  alarm.setActive(false); assert.equal(alarm.source, null); assert.ok(Math.abs(sources[0].stopAt - 1.14) < 1e-9);
  alarm.setActive(true); assert.equal(sources.length, 2); assert.equal(buffers.length, 1);
  sources[0].onended(); assert.equal(alarm.source, sources[1]); assert.ok(gains[0].disconnected);
  alarm.setActive(false); sources[1].onended(); assert.equal(alarm.source, null);
  for (let i = 0; i < 10; i++) alarm.setActive(false);
  assert.equal(sources.length, 2);
});
