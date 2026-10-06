import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { architectureLayout, CAMERA_ELEVATION } from '../src/architecture.js';
import { normalizeAudioSettings, speechOptions, VOICE_LINES, voiceFile } from '../src/audio-data.js';
import { layoutHealthBars } from '../src/health-layout.js';

test('建筑贴图从地表前缘向上展开，保留原投影位置且不会深入地下', () => {
  for (const [width, w, h] of [[11.6,350,250],[11.6,350,410],[8.5,320,250]]) {
    const layout = architectureLayout(width,w,h);
    assert.ok(layout.groundClearance > 0);
    assert.ok(layout.frontDepth > 0);
    assert.equal(layout.height,width*h/w);
    assert.ok(Math.abs(layout.frontDepth*Math.sin(CAMERA_ELEVATION)-layout.height*.18)<1e-9);
    assert.ok(layout.groundClearance + layout.height * Math.cos(CAMERA_ELEVATION) > layout.groundClearance);
  }
});

test('音量设置防止越界与无效数值，静音是独立开关', () => {
  assert.deepEqual(normalizeAudioSettings({master:9,music:-1,voice:NaN,effects:'错误',muted:true}), {master:1,music:0,voice:.95,effects:.5,muted:true});
  assert.equal(normalizeAudioSettings().music,.35);
  assert.equal(normalizeAudioSettings({muted:false}).muted,false);
});

test('公开版保留全部中文台词和独立配乐，不要求分发系统语音录音', () => {
  let count=0;
  for (const [key,lines] of Object.entries(VOICE_LINES)) for (const index of lines.keys()) {
    assert.ok(lines[index].trim()); assert.equal(voiceFile(key,index), `${key}-${index}.m4a`); count++;
  }
  assert.equal(count,37);
  assert.ok(existsSync(new URL('../assets/audio/frontline-sequence.m4a',import.meta.url)));
});

test('实时中文播报音量遵循总音量与语音音量，单位应答保留独立音调', () => {
  assert.deepEqual(speechOptions({ master: .5, voice: .8 }), { lang: 'zh-CN', rate: 1, pitch: 1, volume: .4 });
  assert.equal(speechOptions({ master: .5, voice: .8 }, true).pitch, .9);
});

test('实时播报静音与无效音量设置不会绕过已有音频控制', () => {
  assert.equal(speechOptions({ muted: true }).volume, 0);
  assert.equal(speechOptions({ master: 0 }).volume, 0);
  assert.equal(speechOptions({ master: NaN, voice: 9 }).volume, .75);
});

test('密集血条错位排列、不超出视口、不盖住战场操作面板', () => {
  const bars = Array.from({ length: 15 }, (_, id) => ({ id, anchorX: 260, anchorY: 320, width: 50, height: 16, priority: id < 4 ? 4 : 1 }));
  const obstacle = { x: 180, y: 240, width: 150, height: 50 }, viewport = { width: 520, height: 480 };
  const result = layoutHealthBars(bars, viewport, [obstacle]);
  assert.equal(result.length, bars.length);
  const intersects = (a, b) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
  for (const bar of result) {
    assert.ok(bar.x >= 4 && bar.y >= 4 && bar.x + bar.width <= viewport.width - 4 && bar.y + bar.height <= viewport.height - 4);
    assert.equal(intersects(bar, obstacle), false);
    assert.equal(result.some(other => other.id !== bar.id && intersects(bar, other)), false);
  }
  assert.ok(result.slice(0, 4).every(bar => bar.priority === 4));
});

test('狭小视口优先显示选中单位血条，屏外与拥挤区域不产生重叠绘制', () => {
  const bars = Array.from({ length: 100 }, (_, id) => ({ id, anchorX: 100, anchorY: 70, width: 76, height: 22, priority: id === 99 ? 4 : 1 }));
  const result = layoutHealthBars(bars, { width: 200, height: 120 });
  assert.ok(result.length < bars.length);
  assert.equal(result[0].id, 99);
  assert.deepEqual(layoutHealthBars(bars, { width: 20, height: 20 }), []);
});
