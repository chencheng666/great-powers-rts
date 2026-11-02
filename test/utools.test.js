import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { isUtools, openUtoolsLink } from '../src/utools-runtime.js';
import { PlayerTelemetry } from '../src/player-telemetry.js';

test('uTools 识别只接受带发行标记的本地文件，网页不能误用宿主能力', () => {
  const doc = { querySelector: () => ({ content: 'utools' }) };
  for (const protocol of ['https:', 'http:', 'tauri:']) assert.equal(isUtools({ location: { protocol }, document: doc }), false);
  assert.equal(isUtools({ location: { protocol: 'file:' }, document: doc }), true);
  assert.equal(isUtools({ location: { protocol: 'file:' }, document: { querySelector: () => null } }), false);
});
test('外部链接仅允许固定目的地，不接受任意协议和文件路径', async () => {
  const opened = [], environment = { utools: { shellOpenExternal: url => opened.push(url) } };
  await openUtoolsLink('online', environment); await openUtoolsLink('github', environment);
  assert.equal(opened[0], 'https://www.daguojueqi.site/play/?from=utools');
  for (const destination of ['file:///tmp/test', 'javascript:alert(1)', 'https://evil.example', '__proto__']) await assert.rejects(openUtoolsLink(destination, environment));
  await assert.rejects(openUtoolsLink('online', {}), /回到 uTools/);
  await assert.rejects(openUtoolsLink('online', { utools: { shellOpenExternal: async () => { throw Error('浏览器不可用'); } } }), /浏览器不可用/);
  assert.equal(opened.length, 2);
});
test('关闭统计时不注册计时器与事件、不发起任何请求，主动调用也不会上报', async () => {
  let requests = 0, registered = 0;
  const env = { location: { protocol: 'file:' }, localStorage: { getItem: () => null }, fetch: () => { requests++; }, setInterval: () => { registered++; }, document: { hidden: false, addEventListener: () => { registered++; } }, addEventListener: () => { registered++; } };
  const client = new PlayerTelemetry({ enabled: false, environment: env, now: () => 100 });
  client.identify('本地验收');client.error('resource', '模拟故障');client.tick({ running: true });await client.flush();client.destroy();
  assert.equal(requests, 0);assert.equal(registered, 0);assert.equal(client.enabled, false);
});
function launcher(api) {
  const controls = new Map(['status','launch','online','website','github','privacy'].map(id => [id,{ disabled:false, textContent:'', addEventListener(_,fn){this.click=fn;} }]));
  vm.runInNewContext(readFileSync('packaging/utools/launcher.js','utf8'), { window: { utools: api }, document: { querySelector: id => controls.get(id.slice(1)) } });
  return controls;
}
test('独立战场重复点击复用窗口，不依赖页面加载回调，关闭后允许重开', () => {
  let created = 0, destroyed = false, shown = 0, options;
  const window = { isDestroyed:()=>destroyed, isMinimized:()=>false, show:()=>shown++, focus(){} };
  const c=launcher({ createBrowserWindow: (path,o)=>{assert.equal(path,'game.html');options=o;created++;return window;},onPluginEnter(){} });
  c.get('launch').click();c.get('launch').click();assert.equal(created,1);assert.equal(c.get('launch').disabled,false);assert.equal(shown,2);
  destroyed=true;c.get('launch').click();assert.equal(created,2);
  assert.equal(options.webPreferences.nodeIntegration,false);assert.equal(options.webPreferences.contextIsolation,true);assert.equal(options.webPreferences.webSecurity,true);assert.equal(options.webPreferences.preload,undefined);
});
test('宿主创建窗口失败可重试，普通浏览器预览不会调用本地能力',()=>{
  let calls=0;const c=launcher({createBrowserWindow:()=>{calls++;throw Error('模拟失败');}});
  c.get('launch').click();assert.equal(c.get('launch').disabled,false);c.get('launch').click();assert.equal(calls,2);
  const preview=launcher(undefined);preview.get('launch').click();assert.match(preview.get('status').textContent,/预览/);
});
