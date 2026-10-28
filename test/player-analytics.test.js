import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { PlayerAnalytics, analyticsRange, chinaDay, parseUserAgent } from '../server/player-analytics.mjs';
import { AdminAccess, passwordHash, playerCSV } from '../server/admin-access.mjs';
import { PlayerTelemetry } from '../src/player-telemetry.js';
import { createBattleServer } from '../server/index.mjs';
function fixture(t, stamp = '2026-10-20T12:00:00+08:00') {
  let now = Date.parse(stamp); const directory = mkdtempSync(join(tmpdir(), 'gp-analytics-')), db = new PlayerAnalytics(directory, { clock: () => now });
  t.after(() => { db.close(); rmSync(directory, { recursive: true, force: true }); });
  return { db, next: ms => now += ms, set: value => now = Date.parse(value), now: () => now };
}
const context = (battleId = 'battle-test-0001', mode = 'single') => ({ battleId, mode, mapId: 'valley', faction: 'china' });
function session(db, { name = '测试玩家', id = 'session-test-0001', cookie = '', ...rest } = {}) {
  let seq = 0, activeMs = 0, token = cookie;
  const send = (delta = 0, extra = {}) => { activeMs += delta; const result = db.ingest({ sessionId: id, seq: ++seq, activeMs, name, version: '2.0.0', context: context(), playing: true, ...rest, ...extra }, { cookie: token, ua: 'Mozilla/5.0 (Windows NT 10.0) Chrome/131.0.0.0 Safari/537.36' }); if (result.token) token = `gp_analytics=${result.token}`; return result; };
  send(); return { send, cookie: () => token, seq: () => seq };
}
test('昵称进入、游玩人数、日期时长、UA分类和时长分布有同一分母', t => {
  const { db, next } = fixture(t), a = session(db); next(15000); a.send(15000);
  session(db, { name: '', id: 'session-menu-0001', context: null, playing: false });
  const r = db.report({ from: '2026-10-20', to: '2026-10-20' });
  assert.equal(r.summary.visitors, 2); assert.equal(r.summary.logins, 1); assert.equal(r.summary.players, 1); assert.equal(r.summary.ms, 15000);
  assert.equal(r.summary.averageMs, 15000); assert.equal(r.buckets.reduce((s, b) => s + b.count, 0), 2);
  assert.equal(r.browsers[0].label, 'Chrome'); assert.equal(r.browsers[0].sessions, 2); assert.equal(r.devices[0].label, '电脑'); assert.equal(r.modes[0].ms, 15000);
});
test('重复和乱序心跳不重复计时，另一个玩家不能接管会话', t => {
  const { db, next } = fixture(t), a = session(db); next(15000); a.send(15000);
  const body = { sessionId: 'session-test-0001', seq: 2, activeMs: 15000, context: context() };
  assert.equal(db.ingest(body, { cookie: a.cookie() }).duplicate, true);
  assert.equal(db.ingest({ ...body, seq: 1 }, { cookie: a.cookie() }).duplicate, true);
  assert.throws(() => db.ingest({ ...body, seq: 3, activeMs: 16000 }, { cookie: '' }), /会话归属/);
  assert.equal(db.report().summary.ms, 15000); assert.equal(db.report().summary.totalPlayers, 1);
});
test('多标签页的重叠时间只计算一次，后台菜单及观战不增加游玩时长', t => {
  const { db, next } = fixture(t), a = session(db), b = session(db, { id: 'session-tab2-0001', cookie: a.cookie() });
  next(15000); a.send(15000); assert.equal(b.send(15000).credited, 0);
  next(5000); assert.equal(b.send(5000).credited, 5000);
  next(15000); a.send(15000, { context: null, playing: false, visible: false });
  const spectator = session(db, { id: 'session-spectator-01', cookie: a.cookie(), context: context('battle-watch-0001', 'spectator') });
  next(15000); spectator.send(15000);
  assert.equal(db.report().summary.ms, 20000); assert.equal(db.report().summary.visitors, 1);
});
test('断网、伪造长时长及倒退计数受服务端限制，退出后不再续算', t => {
  const { db, next } = fixture(t), a = session(db); next(600000); assert.equal(a.send(600000).credited, 45000);
  assert.throws(() => db.ingest({ sessionId: 'session-test-0001', seq: 3, activeMs: 1, context: context() }, { cookie: a.cookie() }), /回退/);
  next(15000); a.send(15000, { closed: true }); next(15000); assert.equal(a.send(15000).duplicate, true); assert.equal(db.report().summary.ms, 60000);
});
test('跨午夜按北京时间拆分，设备和玩法的日期时长不带入区间外数据', t => {
  const { db, next } = fixture(t, '2026-10-20T23:59:50+08:00'), a = session(db); next(20000); a.send(20000);
  const before = db.report({ from: '2026-10-20', to: '2026-10-20' }), after = db.report({ from: '2026-10-21', to: '2026-10-21' });
  assert.equal(before.summary.ms, 10000); assert.equal(after.summary.ms, 10000);
  assert.equal(before.browsers[0].ms, 10000); assert.equal(after.browsers[0].ms, 10000);
  assert.equal(before.modes[0].ms, 10000); assert.equal(after.maps[0].ms, 10000);
  assert.equal(db.players({ from: '2026-10-21', to: '2026-10-21' }).rows[0].ms, 10000);
});
test('同名默认独立，归并仅影响玩家表并合并天数集合，搜索与分页保持', t => {
  const { db, next, set } = fixture(t), a = session(db); next(15000); a.send(15000);
  set('2026-10-21T12:00:00+08:00'); const b = session(db, { id: 'session-second-0001' }); next(15000); b.send(15000);
  const solo = db.players({ from: '2026-10-20', to: '2026-10-21' }), grouped = db.players({ from: '2026-10-20', to: '2026-10-21', groupBy: 'name' });
  assert.equal(solo.total, 2); assert.equal(grouped.total, 1); assert.equal(grouped.rows[0].members, 2); assert.equal(grouped.rows[0].ms, 30000); assert.equal(grouped.rows[0].days, 2);
  assert.equal(db.players({ search: '不存在' }).total, 0); assert.equal(db.report().summary.visitors, 2);
});
test('启用前曲线留空，留存仅使用已完整结束的目标日且按返玩判断', t => {
  const f = fixture(t), a = session(f.db); f.next(15000); a.send(15000);
  f.set('2026-10-21T12:00:00+08:00'); session(f.db, { id: 'session-return-0001', cookie: a.cookie() });
  assert.equal(f.db.report().retention.nextDay.rate, null);
  f.set('2026-10-22T12:00:00+08:00'); const report = f.db.report(); assert.equal(report.retention.nextDay.eligible, 1); assert.equal(report.retention.nextDay.rate, 1); assert.equal(report.retention.day7.rate, null);
  assert.equal(report.trend[0].visitors, null);
});
test('时长区间边界、非法日期、UA与CSV公式转义正确', t => {
  const f = fixture(t), a = session(f.db); for (let i = 0; i < 120; i++) { f.next(15000); a.send(15000); }
  const report = f.db.report(); assert.equal(report.buckets[1].count, 1); assert.equal(report.buckets[2].count, 0);
  assert.throws(() => analyticsRange('2026-02-30', '2026-03-01')); assert.throws(() => analyticsRange('2020-01-01', '2026-10-01'));
  assert.equal(chinaDay(Date.parse('2026-10-20T16:00:00Z')), '2026-10-21'); assert.equal(parseUserAgent('Mozilla/5.0 (iPhone) Mobile Safari/604.1').device, '手机');
  assert.match(playerCSV({ rows: [{ id: 'p', name: '=HYPERLINK("test")', ms: 0, lifetimeMs: 0, lastSeen: f.now() }] }), /"'=HYPERLINK/);
});
test('管理员没有默认密码，错误口令限流，会话过期、退出和CSRF不可绕过', () => {
  let now = 0; const admin = new AdminAccess(passwordHash('测试口令-随机长字符'), { clock: () => now });
  assert.equal(new AdminAccess().enabled, false); assert.equal(admin.login('错误', 'a').status, 401);
  const login = admin.login('测试口令-随机长字符', 'a'), cookie = `gp_admin=${login.token}`; assert.equal(admin.authorized(cookie), true); admin.logout(cookie); assert.equal(admin.authorized(cookie), false);
  const second = admin.login('测试口令-随机长字符', 'a'); now += 12 * 3600000; assert.equal(admin.authorized(`gp_admin=${second.token}`), false);
  for(let i=0;i<8;i++)admin.login('错误','b');assert.equal(admin.login('测试口令-随机长字符','b').status,429);
});
test('真实HTTP接口保护玩家信息，正确设置cookie，限制跨域，CSV导出可回读', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'gp-admin-http-')), app = createBattleServer({ directory, root: resolve('public'), adminPasswordHash: passwordHash('测试管理员-口令') });
  await new Promise(r => app.server.listen(0, '127.0.0.1', r)); t.after(async () => { await new Promise(r => app.server.close(r)); rmSync(directory, { recursive: true, force: true }); });
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  const call = (path, body, headers = {}) => fetch(origin + path, { method: body ? 'POST' : 'GET', headers: { Origin: origin, 'Content-Type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined });
  assert.equal((await call('/api/admin/query', {})).status, 401);
  assert.equal((await call('/api/admin/login', { password: '测试管理员-口令' }, { Origin: 'https://evil.example' })).status, 403);
  const visit = await call('/api/telemetry', { sessionId: 'http-session-0001', seq: 1, activeMs: 0, name: '小王', context: context(), playing: true }); assert.equal(visit.status, 200); assert.match(visit.headers.get('set-cookie'), /HttpOnly/);
  const login = await call('/api/admin/login', { password: '测试管理员-口令' }); assert.equal(login.status, 200); const cookie = login.headers.get('set-cookie').split(';')[0]; assert.match(login.headers.get('set-cookie'), /SameSite=Strict/);
  const report = await (await call('/api/admin/query', {}, { Cookie: cookie })).json(); assert.equal(report.summary.visitors, 1); assert.equal(report.summary.logins, 1);
  const csv = await call('/api/admin/query', { view: 'export' }, { Cookie: cookie }); assert.equal(csv.status, 200); assert.match(await csv.text(), /小王/); assert.equal(csv.headers.get('cache-control'), 'no-store');
  assert.equal((await call('/admin/')).status, 200); assert.match((await call('/admin/')).headers.get('content-security-policy'), /frame-ancestors 'none'/);
  await call('/api/admin/logout', {}, { Cookie: cookie }); assert.equal((await call('/api/admin/status', null, { Cookie: cookie })).status, 401);
});
function environment(protocol = 'https:') {
  const handlers = new Map(), requests = [];
  const e = { location: { protocol, pathname: '/play/' }, document: { hidden: false, addEventListener: (key, fn) => handlers.set(key, fn), removeEventListener() {} }, crypto: { randomUUID: () => 'client-session-0001' }, setInterval: () => 1, clearInterval() {}, addEventListener: (key, fn) => handlers.set(key, fn), removeEventListener() {}, fetch: async (_, options) => { requests.push(JSON.parse(options.body)); return { ok: true }; }, navigator: { sendBeacon: () => false } };
  return { e, requests, handlers };
}
test('客户端只累计前台未暂停的实时时长，暂停和离开会冲刷最后一段，ZIP尝试联网统计', async () => {
  const { e, requests } = environment(); let now = 0;
  const game = { running: true, paused: false, battleId: 'client-battle-0001', mapId: 'valley', players: [{ faction: 'china' }] }, client = new PlayerTelemetry({ version: '2.0.0', environment: e, now: () => now });
  client.identify('小王'); client.tick(game); now += 500; client.tick(game); assert.equal(client.activeMs, 500);
  game.paused = true; now += 100; client.tick(game); now += 10000; client.tick(game); assert.equal(client.activeMs, 600);
  game.paused = false; client.tick(game); now += 200; client.tick(game); e.document.hidden = true; now += 100; client.tick(game); now += 20000; client.tick(game); assert.equal(client.activeMs, 900);
  client.tick(null); await client.flush(); assert.ok(requests.some(r => r.context?.battleId === game.battleId && r.activeMs === 900)); assert.equal(requests.at(-1).context, null); client.destroy();
  const offline = environment('file:'); const offlineClient = new PlayerTelemetry({ environment: offline.e, version: '2.0.1' }); offlineClient.identify('离线'); await offlineClient.flush(); assert.ok(offline.requests.some(r=>r.entry==='zip')); offlineClient.destroy();
});
test('离线页面与桌面包联网时独立记录有效游玩时长，匿名令牌不可接管，跨域只开放统计接口',async t=>{
 const directory=mkdtempSync(join(tmpdir(),'gp-offline-')),app=createBattleServer({directory,root:resolve('public')});let now=Date.now();app.analytics.clock=()=>now;
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(async()=>{await new Promise(r=>app.server.close(r));rmSync(directory,{recursive:true,force:true});});const root=`http://127.0.0.1:${app.server.address().port}`;
 const post=(origin,data)=>fetch(root+'/api/external-telemetry',{method:'POST',headers:{Origin:origin,'Content-Type':'text/plain'},body:JSON.stringify(data)});
 const first={sessionId:'zip-session-test1',seq:1,activeMs:0,entry:'zip',version:'2.0.1',context:context(),playing:true};
 assert.equal((await post('https://other.example',first)).status,403);
 const response=await post('null',first);assert.equal(response.status,200);assert.equal(response.headers.get('access-control-allow-origin'),'null');const token=(await response.json()).token;assert.match(token,/^[a-f0-9]{64}$/);
 now+=15000;assert.equal((await post('null',{...first,seq:2,activeMs:15000,token})).status,200);assert.equal(app.analytics.report().packages.find(x=>x.label==='zip').ms,15000);
 assert.equal((await post('null',{...first,seq:3,activeMs:16000,token:'f'.repeat(64)})).status,400);
 const desktop=await post('tauri://localhost',{...first,sessionId:'desktop-session-1',entry:'desktop'});assert.equal(desktop.status,200);assert.ok(app.analytics.report().packages.some(x=>x.label==='desktop'));
 assert.equal((await fetch(root+'/api/admin/status',{headers:{Origin:'null'}})).status,401);
});

test('来源仅首次白名单归因，跨日结算按对局去重且排除未结算',t=>{
 const f=fixture(t,'2026-10-20T23:59:50+08:00'),a=session(f.db,{source:'warreport'});
 f.next(20000);a.send(20000,{source:'github',context:{...context(),outcome:'win'}});
 const r=f.db.report({from:'2026-10-20',to:'2026-10-21'});
 assert.equal(r.sources[0].label,'warreport');assert.equal(r.outcomes[0].wins,1);
 session(f.db,{id:'session-source-0002',source:'private-secret',context:context('battle-other-0002')});
 const next=f.db.report({from:'2026-10-20',to:'2026-10-21'});assert.ok(next.sources.some(s=>s.label==='direct'));assert.equal(next.outcomes[0].wins,1);assert.equal(next.outcomes[0].losses,0);
});
