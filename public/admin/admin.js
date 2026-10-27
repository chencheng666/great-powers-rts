'use strict';
const $ = selector => document.querySelector(selector);
const state = { tab: 'overview', report: null, page: 1, generation: 0, players: null };
const nf = new Intl.NumberFormat('zh-CN');
const number = value => nf.format(Math.round(value || 0));
const duration = ms => ms < 60000 ? `${Math.round(ms / 1000)}秒` : ms < 3600000 ? `${(ms / 60000).toFixed(1)}分钟` : `${(ms / 3600000).toFixed(2)}小时`;
const date = value => new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
const day = time => new Date(time + 8 * 3600000).toISOString().slice(0, 10);
const node = (tag, text, className) => { const e = document.createElement(tag); if (text !== undefined) e.textContent = text; if (className) e.className = className; return e; };
const clear = selector => { const e = $(selector); e.replaceChildren(); return e; };
const modeNames = { sandbox: '指挥官沙盘', single: '单机遭遇战', online: '双人联网', candidate: '六方实验', challenge: '战术任务', spectator: '观战' };
const mapNames = { valley: '灰谷地带', strait: '跨海通道', frontier: '边境前沿', ocean: '深蓝海域', archipelago: '独立群岛', islandwatch: '列岛守望', lifeline: '海上生命线', strategic: '战略纵深', meridian: '子午环阵', moonsea: '月海基地', sixfront: '六方前线' };
const errorNames = { render: '画面中断', resource: '资源加载', script: '脚本错误', network: '网络错误' };
const filters = () => ({ from: $('#from').value, to: $('#to').value });
const playerFilters = () => ({ ...filters(), view: 'players', search: $('#search').value.trim(), groupBy: $('#group').value, sort: $('#sort').value, page: state.page });
function showLogin() { $('#login').hidden = false; $('#app').hidden = true; }
async function api(path, body) {
  const response = await fetch(`/api/admin/${path}`, { method: body ? 'POST' : 'GET', credentials: 'same-origin', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20000) });
  if (!response.ok) { const error = await response.json().catch(() => ({})); if (response.status === 401) showLogin(); throw Error(error.error || `请求失败（${response.status}）`); }
  return response;
}
function bars(selector, rows, field = 'sessions', options = {}) {
  const root = clear(selector), max = Math.max(1, ...rows.map(row => Number(row[field]) || 0));
  if (!rows.length || !rows.some(row => row[field] > 0)) { root.append(node('p', '所选日期暂无记录', 'empty')); return; }
  for (const row of rows) {
    const wrap = node('div', undefined, 'bar-row'), label = node('span', options.names?.[row.label] || row.label || '未识别', 'bar-label'), track = node('div', undefined, 'bar-track'), fill = node('div', undefined, 'bar-fill');
    fill.style.width = `${100 * row[field] / max}%`; track.append(fill);
    const value = node('span', number(row[field]), 'bar-value');
    if (row.ms !== undefined && options.showDuration) value.append(node('small', duration(row.ms), 'bar-sub'));
    wrap.append(label, track, value); root.append(wrap);
  }
}
function trend() {
  const root = clear('#trend'), durationMetric = $('#trend-metric').value === 'duration', rows = state.report.trend;
  const series = durationMetric ? [{ key: 'ms', label: '有效游玩分钟', color: '#168c7d', factor: 1 / 60000 }] : [{ key: 'visitors', label: '游戏访客', color: '#8fa8c2' }, { key: 'logins', label: '昵称进入', color: '#e3aa57' }, { key: 'players', label: '游玩人数', color: '#168c7d' }];
  if (!rows.some(row => row.visitors !== null)) { root.append(node('p', '所选日期尚未接入统计', 'empty')); return; }
  const ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg'); svg.setAttribute('viewBox', '0 0 720 260'); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', durationMetric ? '每日有效游玩分钟曲线' : '每日游戏访客、昵称进入及游玩人数曲线');
  const shape = (tag, attrs, text) => { const e = document.createElementNS(ns, tag); for (const [key, value] of Object.entries(attrs)) e.setAttribute(key, value); if (text !== undefined) e.textContent = text; svg.append(e); return e; };
  const maxValue = Math.max(1, ...rows.flatMap(row => series.map(s => (row[s.key] || 0) * (s.factor || 1)))), max = durationMetric ? Math.ceil(maxValue * 1.1) : Math.max(1, Math.ceil(maxValue / 4) * 4);
  const x = i => rows.length === 1 ? 390 : 48 + i * 650 / (rows.length - 1), y = value => 216 - value / max * 190;
  for (let i = 0; i <= 4; i++) { const value = max * i / 4; shape('line', { x1: 48, x2: 698, y1: y(value), y2: y(value), stroke: '#e9eef2' }); shape('text', { x: 38, y: y(value) + 4, 'text-anchor': 'end' }, durationMetric ? value.toFixed(value < 10 ? 1 : 0) : number(value)); }
  rows.forEach((row, i) => { if (i === 0 || i === rows.length - 1 || i % Math.ceil(rows.length / 6) === 0) shape('text', { x: x(i), y: 244, 'text-anchor': 'middle' }, row.day.slice(5)); });
  for (const s of series) {
    let path = '', pen = false;
    rows.forEach((row, i) => { if (row[s.key] === null) { pen = false; return; } const value = row[s.key] * (s.factor || 1); path += `${pen ? 'L' : 'M'}${x(i)},${y(value)} `; pen = true; const circle = shape('circle', { cx: x(i), cy: y(value), r: rows.length > 40 ? 1.8 : 3, fill: s.color }); const title = document.createElementNS(ns, 'title'); title.textContent = `${row.day} ${s.label}：${durationMetric ? value.toFixed(2) : number(value)}`; circle.append(title); });
    shape('path', { d: path, fill: 'none', stroke: s.color, 'stroke-width': 2.5, 'stroke-linejoin': 'round' });
  }
  root.append(svg); const legend = node('div', undefined, 'legend'); series.forEach(s => { const item = node('span'), dot = node('i'); dot.style.background = s.color; item.append(dot, document.createTextNode(s.label)); legend.append(item); }); root.append(legend);
}
function renderOverview() {
  const r = state.report, s = r.summary, cards = clear('#cards');
  for (const [label, value, detail] of [['游戏访客', number(s.visitors), '所选日期 · 独立访客'], ['昵称进入人数', number(s.logins), '昵称进入，不等同于实名登录'], ['游玩人数', number(s.players), '所选日期 · 至少进入一次对局'], ['有效游玩时长', duration(s.ms), `人均 ${duration(s.averageMs)} · 以游玩人数为分母`]]) { const e = node('div', undefined, 'metric'); e.append(node('span', label, 'label'), node('strong', value), node('small', detail)); cards.append(e); }
  trend(); bars('#duration-bars', r.buckets.map(b => ({ ...b, label: b.label, count: b.count })), 'count');
  $('#duration-summary').textContent = `30分钟内 ${number(r.buckets[1].count)} 人 · 60分钟内 ${number(r.buckets[1].count+r.buckets[2].count)} 人（累计，均含上限）`;
  const retention = clear('#retention');
  const rate = value => value.rate === null ? '等待数据' : `${(value.rate * 100).toFixed(1)}%`;
  for (const [label, value, detail] of [['新访客', number(s.newcomers), '首次访问在所选日期'], ['回访访客', number(s.visitors - s.newcomers), '首次访问早于所选日期'], ['次日返玩率', rate(r.retention.nextDay), `${r.retention.nextDay.retained} / ${r.retention.nextDay.eligible} 成熟档案`], ['第7日返玩率', rate(r.retention.day7), `${r.retention.day7.retained} / ${r.retention.day7.eligible} 成熟档案`]]) { const item = node('div'); item.append(node('span', label), node('strong', value), node('span', detail)); retention.append(item); }
  const coverage = clear('#coverage'); for (const [label, value] of [['累计采集档案', number(s.totalPlayers)], ['当前在线 / 正在游玩', `${number(s.online)} / ${number(s.playingNow)}`], ['历史双人联网档案', number(r.legacy.count)], ['统计启用时间', date(r.startedAt)]]) { const row = node('div', undefined, 'coverage-row'); row.append(node('span', label), node('strong', value)); coverage.append(row); }
  $('#tracking-start').textContent = `北京时间 · ${day(r.startedAt)}启用`; $('#updated').textContent = `数据更新于 ${date(r.generatedAt)} · 北京时间`;
  const definitions = clear('#definition-list'), labels = { identity: '玩家身份', login: '昵称进入', duration: '有效游玩时长', distribution: '时长区间', history: '历史范围', source: '数据来源' }; for (const [key, value] of Object.entries(r.definitions)) definitions.append(node('dt', labels[key] || key), node('dd', value));
  bars('#browser-bars', r.browsers); bars('#os-bars', r.systems); bars('#device-bars', r.devices); bars('#version-bars', r.versions, 'sessions', { showDuration: true }); bars('#package-bars', r.packages || [], 'sessions', { names: { game: '网页', candidate: '六方网页', zip: '离线 ZIP', desktop: '桌面安装包' }, showDuration: true }); bars('#release-type-bars', (r.releaseTypes || []).map(row => ({...row, label: row.label.replace(/^game · /, '网页 · ').replace(/^candidate · /, '六方网页 · ').replace(/^zip · /, '离线 ZIP · ').replace(/^desktop · /, '桌面安装包 · ')})), 'sessions', { showDuration: true }); bars('#mode-bars', r.modes, 'plays', { names: modeNames, showDuration: true }); bars('#map-bars', r.maps, 'plays', { names: mapNames, showDuration: true }); bars('#error-bars', r.errors, 'count', { names: errorNames });
  $('#legacy-note').textContent = `${r.legacy.scope}。不与新采集档案直接相加；同一个人可能出现在两套记录中。`;
  const legacy = clear('#legacy-list'); if (!r.legacy.rows.length) legacy.append(node('p', '暂无历史联网档案', 'empty')); else { const table = node('table'), head = node('tr'); ['昵称', '胜', '负', '平'].forEach(text => head.append(node('th', text))); table.append(head); r.legacy.rows.forEach(player => { const row = node('tr'); [player.name, player.wins, player.losses, player.draws].forEach(value => row.append(node('td', String(value)))); table.append(row); }); legacy.append(table); }
}
async function loadPlayers() {
  const data = await (await api('query', playerFilters())).json(); state.players = data; const body = clear('#player-rows');
  if (!data.rows.length) { const row = node('tr'), cell = node('td', '没有匹配的玩家记录', 'empty'); cell.colSpan = 7; row.append(cell); body.append(row); }
  for (const p of data.rows) { const row = node('tr'), name = node('td'); name.append(node('strong', p.name || '未填写昵称'), node('small', p.members > 1 ? `${p.members} 个同名档案已归并` : p.id.slice(0, 8))); row.append(name); [duration(p.ms), duration(p.lifetimeMs), `${p.days} / ${p.playDays}`, number(p.plays), date(p.lastSeen)].forEach(value => row.append(node('td', value))); const device = node('td'), details = node('details'); details.append(node('summary', p.device || '未识别设备'), node('p', p.ua || '暂无原始UA')); device.append(details); row.append(device); body.append(row); }
  $('#player-count').textContent = `${number(data.total)} ${$('#group').value === 'name' ? '组昵称' : '个独立档案'}`; $('#page-number').textContent = `${data.page} / ${Math.max(1, Math.ceil(data.total / data.limit))}`; $('#prev').disabled = data.page <= 1; $('#next').disabled = data.page * data.limit >= data.total;
}
async function refresh() {
  const generation = ++state.generation; $('#refresh').disabled = true; $('#status').className = 'status'; $('#status').textContent = '正在读取服务器统计…';
  try { const report = await (await api('query', filters())).json(); if (generation !== state.generation) return; state.report = report; renderOverview(); if (state.tab === 'players') await loadPlayers(); $('#status').textContent = `${report.environment} · 数据来自本站采集记录；昵称和UA仅管理员可见`; }
  catch (error) { $('#status').textContent = error.message; $('#status').className = 'status error'; } finally { $('#refresh').disabled = false; }
}
function preset(days) { const end = Date.now(); $('#to').value = day(end); $('#from').value = day(end - (days - 1) * 86400000); document.querySelectorAll('[data-days]').forEach(b => b.classList.toggle('active', Number(b.dataset.days) === days)); }
$('#login-form').addEventListener('submit', async event => { event.preventDefault(); const button = event.submitter; button.disabled = true; $('#login-error').textContent = ''; try { await api('login', { password: $('#password').value }); $('#password').value = ''; $('#login').hidden = true; $('#app').hidden = false; await refresh(); } catch (error) { $('#login-error').textContent = error.message; } finally { button.disabled = false; } });
$('#logout').addEventListener('click', async () => { try { await api('logout', {}); } finally { state.report = null; clear('#player-rows'); showLogin(); } });
document.querySelectorAll('[data-tab]').forEach(button => button.addEventListener('click', async () => { state.tab = button.dataset.tab; document.querySelectorAll('.tab-view').forEach(e => e.hidden = e.id !== state.tab); document.querySelectorAll('[data-tab]').forEach(b => { if (b === button) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); }); $('#page-title').textContent = button.textContent; if (state.tab === 'players') { try { await loadPlayers(); } catch (error) { $('#status').textContent = error.message; } } }));
$('#filters').addEventListener('submit', event => { event.preventDefault(); state.page = 1; document.querySelectorAll('[data-days]').forEach(b => b.classList.remove('active')); refresh(); });
document.querySelectorAll('[data-days]').forEach(button => button.addEventListener('click', () => { preset(Number(button.dataset.days)); state.page = 1; refresh(); }));
$('#refresh').addEventListener('click', refresh); $('#trend-metric').addEventListener('change', trend);
$('#player-filters').addEventListener('submit', async event => { event.preventDefault(); state.page = 1; try { await loadPlayers(); } catch (error) { $('#status').textContent = error.message; } });
for (const [selector, delta] of [['#prev', -1], ['#next', 1]]) $(selector).addEventListener('click', async () => { state.page += delta; try { await loadPlayers(); } catch (error) { $('#status').textContent = error.message; } });
$('#export').addEventListener('click', async () => { try { const response = await api('query', { ...playerFilters(), view: 'export' }), blob = await response.blob(), url = URL.createObjectURL(blob), link = node('a'); link.href = url; link.download = `玩家统计-${$('#from').value}-${$('#to').value}.csv`; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); $('#status').textContent = response.headers.get('X-Export-Truncated') === 'true' ? '导出前10000条；请缩小筛选范围获取其余记录' : '已导出当前日期、搜索及归并维度下的全部匹配记录'; } catch (error) { $('#status').textContent = error.message; } });
$('#definitions-btn').addEventListener('click', () => $('#definitions').showModal()); $('#definitions-close').addEventListener('click', () => $('#definitions').close());
preset(7); api('status').then(() => { $('#login').hidden = true; $('#app').hidden = false; return refresh(); }).catch(() => {});
setInterval(() => { if (!document.hidden && !$('#app').hidden) refresh(); }, 60000);
