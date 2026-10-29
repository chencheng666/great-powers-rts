import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { mkdirSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { nickname } from '../src/network-protocol.js';
const DAY = 86400000, OFFSET = 8 * 3600000;
const hash = value => createHash('sha256').update(value).digest('hex');
export const chinaDay = time => new Date(time + OFFSET).toISOString().slice(0, 10);
const midnight = day => Date.parse(`${day}T00:00:00+08:00`);
const identifier = value => typeof value === 'string' && /^[\w-]{8,100}$/.test(value);
const safeText = (value, max) => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max) : '';
export function parseUserAgent(value) {
  const ua = safeText(value, 512);
  const browser = /Edg\//.test(ua) ? 'Edge' : /MicroMessenger/.test(ua) ? '微信' : /Firefox\//.test(ua) ? 'Firefox' : /(?:Chrome|CriOS)\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : '其他';
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad|iPod/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows' : /Macintosh|Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '其他';
  const device = /iPad|Tablet/.test(ua) ? '平板' : /Mobile|iPhone|Android/.test(ua) ? '手机' : '电脑';
  return { ua, browser, os, device };
}
export function analyticsRange(from, to, now = Date.now()) {
  to ||= chinaDay(now); from ||= chinaDay(midnight(to) - 6 * DAY);
  for (const value of [from, to]) if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(midnight(value)) || chinaDay(midnight(value)) !== value) throw new Error('日期无效');
  const start = midnight(from), end = midnight(to) + DAY;
  if (end <= start || end - start > 366 * DAY) throw new Error('请选择不超过366天的日期范围');
  return { from, to, start, end };
}

export class PlayerAnalytics {
  constructor(directory, { clock = Date.now } = {}) {
    mkdirSync(directory, { recursive: true, mode: 0o700 }); this.clock = clock;
    const file = join(directory, 'analytics.sqlite'); this.db = new DatabaseSync(file); chmodSync(file, 0o600);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS analytics_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS download_counts(file TEXT PRIMARY KEY,count INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS analytics_players(id TEXT PRIMARY KEY,token_hash TEXT NOT NULL UNIQUE,name TEXT NOT NULL DEFAULT '',first_seen INTEGER NOT NULL,last_seen INTEGER NOT NULL,last_active_end INTEGER NOT NULL DEFAULT 0,guest_id TEXT);
      CREATE TABLE IF NOT EXISTS analytics_sessions(id TEXT PRIMARY KEY,player_id TEXT NOT NULL,started INTEGER NOT NULL,last_seen INTEGER NOT NULL,seq INTEGER NOT NULL,last_counter INTEGER NOT NULL,active_ms INTEGER NOT NULL DEFAULT 0,closed INTEGER NOT NULL DEFAULT 0,visible INTEGER NOT NULL DEFAULT 1,playing INTEGER NOT NULL DEFAULT 0,ua TEXT,browser TEXT,os TEXT,device TEXT,version TEXT,entry TEXT);
      CREATE INDEX IF NOT EXISTS analytics_sessions_player ON analytics_sessions(player_id,last_seen);
      CREATE INDEX IF NOT EXISTS analytics_sessions_seen ON analytics_sessions(last_seen);
      CREATE TABLE IF NOT EXISTS analytics_daily(day TEXT NOT NULL,player_id TEXT NOT NULL,logged INTEGER NOT NULL DEFAULT 0,played INTEGER NOT NULL DEFAULT 0,ms INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(day,player_id));
      CREATE TABLE IF NOT EXISTS analytics_plays(id TEXT PRIMARY KEY,player_id TEXT NOT NULL,session_id TEXT NOT NULL,battle_id TEXT NOT NULL,mode TEXT,map TEXT,faction TEXT,version TEXT,started INTEGER NOT NULL,last_seen INTEGER NOT NULL,ms INTEGER NOT NULL DEFAULT 0,outcome TEXT);
      CREATE INDEX IF NOT EXISTS analytics_plays_player ON analytics_plays(player_id,started);
      CREATE TABLE IF NOT EXISTS analytics_session_daily(day TEXT NOT NULL,session_id TEXT NOT NULL,ms INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(day,session_id));
      CREATE TABLE IF NOT EXISTS analytics_play_daily(day TEXT NOT NULL,play_id TEXT NOT NULL,ms INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(day,play_id));
      CREATE TABLE IF NOT EXISTS analytics_errors(id INTEGER PRIMARY KEY,player_id TEXT NOT NULL,session_id TEXT NOT NULL,at INTEGER NOT NULL,kind TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS feedback_entries(id INTEGER PRIMARY KEY,at INTEGER NOT NULL,content TEXT NOT NULL,version TEXT NOT NULL DEFAULT '',image_type TEXT,image BLOB);
      CREATE INDEX IF NOT EXISTS feedback_entries_at ON feedback_entries(at);
      CREATE INDEX IF NOT EXISTS analytics_errors_at ON analytics_errors(at);
    `);
    const columns = this.db.prepare('PRAGMA table_info(analytics_errors)').all().map(x => x.name);
    if (!columns.includes('detail')) this.db.exec("ALTER TABLE analytics_errors ADD COLUMN detail TEXT NOT NULL DEFAULT ''");
    if (!this.db.prepare('PRAGMA table_info(analytics_sessions)').all().some(x=>x.name==='source')) this.db.exec("ALTER TABLE analytics_sessions ADD COLUMN source TEXT NOT NULL DEFAULT 'direct'");
    this.pruneDiagnostics();
    this.db.prepare('INSERT OR IGNORE INTO analytics_meta VALUES(?,?)').run('started', String(clock()));
  }
  pruneDiagnostics() {
    const date = new Date(this.clock()), day = date.getUTCDate(); date.setUTCDate(1); date.setUTCFullYear(date.getUTCFullYear() - 1); date.setUTCDate(Math.min(day, new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate()));
    this.db.prepare('DELETE FROM feedback_entries WHERE at < ?').run(date.getTime());
    this.db.prepare('DELETE FROM analytics_errors WHERE at < ?').run(date.getTime());
  }
  submitFeedback({ content, version, image } = {}) {
    if (typeof content !== 'string' || !content.trim() || content.length > 2000) throw new Error('请填写不超过2000字的反馈');
    let data = null, type = null;
    if (image) {
      if (typeof image !== 'string' || image.length > 700000 || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(image)) throw new Error('图片格式或大小不符合要求');
      const match = image.match(/^data:image\/(png|jpeg|webp);base64,(.+)$/); type = `image/${match[1]}`; data = Buffer.from(match[2], 'base64');
      const valid = type === 'image/png' ? data.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')) : type === 'image/jpeg' ? data.subarray(0,3).equals(Buffer.from('ffd8ff','hex')) : data.subarray(0,4).toString() === 'RIFF' && data.subarray(8,12).toString() === 'WEBP';
      if (!valid || data.length > 524288) throw new Error('图片格式或大小不符合要求');
    }
    this.db.prepare('INSERT INTO feedback_entries(at,content,version,image_type,image) VALUES(?,?,?,?,?)').run(this.clock(),content.trim(),safeText(version,80),type,data);
  }
  diagnostics(filters = {}) {
    const {start,end} = analyticsRange(filters.from,filters.to,this.clock());
    const feedback = this.db.prepare('SELECT id,at,content,version,image_type AS imageType FROM feedback_entries WHERE at>=? AND at<? ORDER BY at DESC,id DESC LIMIT 100').all(start,end);
    const errors = this.db.prepare("SELECT e.at,e.kind,e.detail,COALESCE(s.version,'') version,COALESCE(s.entry,'') entry,COALESCE(s.browser,'') browser,COALESCE(s.os,'') os FROM analytics_errors e LEFT JOIN analytics_sessions s ON s.id=e.session_id WHERE e.at>=? AND e.at<? ORDER BY e.at DESC,e.id DESC LIMIT 100").all(start,end);
    return {feedback,errors};
  }
  feedbackImage(id) { return this.db.prepare('SELECT image_type type,image FROM feedback_entries WHERE id=? AND image IS NOT NULL').get(id); }
  recordDownload(file) { this.db.prepare('INSERT INTO download_counts(file,count) VALUES(?,1) ON CONFLICT(file) DO UPDATE SET count=count+1').run(file); }
  downloadCounts() { return Object.fromEntries(this.db.prepare('SELECT file,count FROM download_counts').all().map(row => [row.file,row.count])); }
  player(cookie = '') {
    const token = cookie.split(';').map(s => s.trim()).find(s => s.startsWith('gp_analytics='))?.slice(13);
    return token && /^[a-f0-9]{64}$/.test(token) ? this.db.prepare('SELECT * FROM analytics_players WHERE token_hash=?').get(hash(token)) : null;
  }
  ingest(body, { cookie = '', ua = '', guestId = null } = {}) {
    if (!body || !identifier(body.sessionId) || !Number.isSafeInteger(body.seq) || body.seq < 1 || !Number.isSafeInteger(body.activeMs) || body.activeMs < 0 || body.activeMs > 366 * DAY) throw new Error('统计请求无效');
    const now = this.clock(), meta = parseUserAgent(ua), entry = ['candidate','zip','desktop'].includes(body.entry) ? body.entry : 'game';
    const name = body.name ? nickname(body.name) : '', context = body.context || null;
    if (context && (!identifier(context.battleId) || !['single', 'online', 'candidate', 'challenge', 'sandbox', 'spectator', 'survival'].includes(context.mode))) throw new Error('战局标识无效');
    let player = this.player(cookie), token = null;
    this.db.exec('BEGIN IMMEDIATE');
    try {
      if (!player) {
        token = randomBytes(32).toString('hex'); player = { id: randomUUID(), name, first_seen: now, last_seen: now, last_active_end: 0 };
        this.db.prepare('INSERT INTO analytics_players(id,token_hash,name,first_seen,last_seen,guest_id) VALUES(?,?,?,?,?,?)').run(player.id, hash(token), name, now, now, guestId);
      }
      const previous = this.db.prepare('SELECT * FROM analytics_sessions WHERE id=?').get(body.sessionId);
      if (previous && previous.player_id !== player.id) throw new Error('会话归属无效');
      if (previous && (body.seq <= previous.seq || previous.closed)) { this.db.exec('COMMIT'); return { token, duplicate: true }; }
      if (previous && body.activeMs < previous.last_counter) throw new Error('时长计数不能回退');
      const delta = previous && context && context.mode !== 'spectator' ? Math.min(body.activeMs - previous.last_counter, Math.max(0, now - previous.last_seen), 45000) : 0;
      // 多标签页按真实时间区间取并集，客户端不能通过叠加心跳翻倍时长。
      const start = Math.max(now - delta, player.last_active_end || 0), credited = Math.max(0, now - start);
      const playing = body.playing === true && !!context && context.mode !== 'spectator';
      this.db.prepare('UPDATE analytics_players SET name=CASE WHEN ?<>\'\' THEN ? ELSE name END,last_seen=?,last_active_end=MAX(last_active_end,?),guest_id=COALESCE(?,guest_id) WHERE id=?').run(name, name, now, credited ? now : 0, guestId, player.id);
      this.db.prepare(`INSERT INTO analytics_sessions(id,player_id,started,last_seen,seq,last_counter,active_ms,closed,visible,playing,ua,browser,os,device,version,entry) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET last_seen=excluded.last_seen,seq=excluded.seq,last_counter=excluded.last_counter,active_ms=active_ms+excluded.active_ms,closed=excluded.closed,visible=excluded.visible,playing=excluded.playing,version=excluded.version`).run(body.sessionId, player.id, now, now, body.seq, body.activeMs, credited, body.closed === true ? 1 : 0, body.visible === false ? 0 : 1, playing ? 1 : 0, meta.ua, meta.browser, meta.os, meta.device, safeText(body.version, 40), entry);
      const source = ['warreport','wechat','github','xiaohongshu'].includes(body.source) ? body.source : 'direct';
      if(!previous) this.db.prepare('UPDATE analytics_sessions SET source=? WHERE id=?').run(source,body.sessionId);
      const day = chinaDay(now);
      this.db.prepare('INSERT OR IGNORE INTO analytics_session_daily(day,session_id) VALUES(?,?)').run(day,body.sessionId);
      if(context&&context.mode!=='spectator')this.db.prepare('INSERT OR IGNORE INTO analytics_play_daily(day,play_id) VALUES(?,?)').run(day,`${body.sessionId}:${context.battleId}`);
      this.db.prepare(`INSERT INTO analytics_daily(day,player_id,logged,played) VALUES(?,?,?,?) ON CONFLICT(day,player_id) DO UPDATE SET logged=MAX(logged,excluded.logged),played=MAX(played,excluded.played)`).run(day, player.id, name ? 1 : 0, context && context.mode !== 'spectator' ? 1 : 0);
      for (let cursor = start; credited && cursor < now;) {
        const segmentDay = chinaDay(cursor), until = Math.min(now, midnight(segmentDay) + DAY);
        this.db.prepare(`INSERT INTO analytics_daily(day,player_id,ms,played) VALUES(?,?,?,1) ON CONFLICT(day,player_id) DO UPDATE SET ms=ms+excluded.ms,played=1`).run(segmentDay, player.id, until - cursor); this.db.prepare('INSERT INTO analytics_session_daily(day,session_id,ms) VALUES(?,?,?) ON CONFLICT(day,session_id) DO UPDATE SET ms=ms+excluded.ms').run(segmentDay,body.sessionId,until-cursor);
        if(context&&context.mode!=='spectator')this.db.prepare('INSERT INTO analytics_play_daily(day,play_id,ms) VALUES(?,?,?) ON CONFLICT(day,play_id) DO UPDATE SET ms=ms+excluded.ms').run(segmentDay,`${body.sessionId}:${context.battleId}`,until-cursor);
        cursor = until;
      }
      if (context && context.mode !== 'spectator') {
        this.db.prepare(`INSERT INTO analytics_plays(id,player_id,session_id,battle_id,mode,map,faction,version,started,last_seen,ms,outcome) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
          ON CONFLICT(id) DO UPDATE SET last_seen=excluded.last_seen,ms=ms+excluded.ms,mode=CASE WHEN excluded.mode='sandbox' THEN 'sandbox' ELSE mode END,outcome=COALESCE(excluded.outcome,outcome)`).run(`${body.sessionId}:${context.battleId}`, player.id, body.sessionId, context.battleId, context.mode, safeText(context.mapId, 40), safeText(context.faction, 30), safeText(body.version, 40), now, now, credited, ['win', 'loss', 'draw', 'left'].includes(context.outcome) ? context.outcome : null);
      }
      if (['render', 'resource', 'script', 'network'].includes(body.error)) this.db.prepare('INSERT INTO analytics_errors(player_id,session_id,at,kind,detail) VALUES(?,?,?,?,?)').run(player.id, body.sessionId, now, body.error, safeText(body.errorDetail, 160).replace(/[^A-Za-z0-9_./: -]/g, ''));
      this.db.exec('COMMIT'); return { token, duplicate: false, credited };
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  report(filters = {}) {
    const now = this.clock(), range = analyticsRange(filters.from, filters.to, now), { from, to, start, end } = range;
    const rows = this.db.prepare(`SELECT d.*,p.name,p.first_seen,p.last_seen FROM analytics_daily d JOIN analytics_players p ON p.id=d.player_id WHERE day BETWEEN ? AND ?`).all(from, to);
    const grouped = new Map(), daily = new Map();
    for (const row of rows) {
      const p = grouped.get(row.player_id) || { id: row.player_id, name: row.name, ms: 0, days: 0, playDays: 0, logged: false, firstSeen: row.first_seen, lastSeen: row.last_seen };
      p.ms += row.ms; p.days++; p.playDays += row.played; p.logged ||= !!row.logged; grouped.set(row.player_id, p);
      const d = daily.get(row.day) || { day: row.day, visitors: 0, logins: 0, players: 0, ms: 0, newcomers: 0 };
      d.visitors++; d.logins += row.logged; d.players += row.played; d.ms += row.ms; d.newcomers += chinaDay(row.first_seen) === row.day ? 1 : 0; daily.set(row.day, d);
    }
    const startedAt = Number(this.db.prepare('SELECT value FROM analytics_meta WHERE key=?').get('started').value), trend = [];
    for (let cursor = start; cursor < end; cursor += DAY) {
      const day = chinaDay(cursor); trend.push(day < chinaDay(startedAt) || cursor > now ? { day, visitors: null, logins: null, players: null, ms: null, newcomers: null } : daily.get(day) || { day, visitors: 0, logins: 0, players: 0, ms: 0, newcomers: 0 });
    }
    const players = [...grouped.values()], played = players.filter(p => p.playDays > 0), ms = players.reduce((s, p) => s + p.ms, 0);
    const buckets = [{ name: '未游玩', min: -1, max: 0 }, { name: '0—30分钟', min: 0, max: 1800000 }, { name: '30—60分钟', min: 1800000, max: 3600000 }, { name: '1—2小时', min: 3600000, max: 7200000 }, { name: '超过2小时', min: 7200000, max: Infinity }].map(b => ({ label: b.name, count: players.filter(p => b.max === 0 ? !p.playDays : p.playDays && p.ms > b.min && p.ms <= b.max).length }));
    // 已开始但不足一毫秒的对局仍属于游玩人数，归入首个时长区间。
    buckets[1].count += played.filter(p => p.ms === 0).length;
    const composition = field => this.db.prepare(`SELECT s.${field} AS label,COUNT(DISTINCT s.id) AS sessions,COUNT(DISTINCT s.player_id) AS players,SUM(d.ms) AS ms FROM analytics_sessions s JOIN analytics_session_daily d ON d.session_id=s.id WHERE d.day BETWEEN ? AND ? GROUP BY s.${field} ORDER BY sessions DESC LIMIT 30`).all(from,to);
    const cohort = lag => {
      const cutoff = chinaDay(midnight(chinaDay(now)) - (lag + 1) * DAY), cohortPlayers = this.db.prepare('SELECT id,first_seen FROM analytics_players WHERE first_seen>=? AND first_seen<?').all(start, Math.min(end, midnight(cutoff) + DAY));
      const eligible = cohortPlayers.filter(p => chinaDay(p.first_seen) <= cutoff);
      const retained = eligible.filter(p => this.db.prepare('SELECT 1 FROM analytics_daily WHERE player_id=? AND day=? AND played=1').get(p.id, chinaDay(midnight(chinaDay(p.first_seen)) + lag * DAY))).length;
      return { eligible: eligible.length, retained, rate: eligible.length ? retained / eligible.length : null };
    };
    return { generatedAt: now, startedAt, range, summary: { visitors: players.length, logins: players.filter(p => p.logged).length, players: played.length, ms, averageMs: played.length ? ms / played.length : 0, newcomers: players.filter(p => p.firstSeen >= start && p.firstSeen < end).length, totalPlayers: this.db.prepare('SELECT COUNT(*) n FROM analytics_players').get().n, online: this.db.prepare('SELECT COUNT(DISTINCT player_id) n FROM analytics_sessions WHERE visible=1 AND closed=0 AND last_seen>?').get(now - 90000).n, playingNow: this.db.prepare('SELECT COUNT(DISTINCT player_id) n FROM analytics_sessions WHERE visible=1 AND closed=0 AND playing=1 AND last_seen>?').get(now - 45000).n }, trend, buckets, sources: composition('source'), browsers: composition('browser'), systems: composition('os'), devices: composition('device'), versions: composition('version'), packages: composition('entry'), releaseTypes: this.db.prepare("SELECT s.entry||' · '||s.version label,COUNT(DISTINCT s.id) sessions,COUNT(DISTINCT s.player_id) players,SUM(d.ms) ms FROM analytics_sessions s JOIN analytics_session_daily d ON d.session_id=s.id WHERE d.day BETWEEN ? AND ? GROUP BY s.entry,s.version ORDER BY sessions DESC LIMIT 50").all(from,to), modes: this.db.prepare('SELECT p.mode label,COUNT(DISTINCT p.id) plays,SUM(d.ms) ms,COUNT(DISTINCT p.player_id) players FROM analytics_plays p JOIN analytics_play_daily d ON d.play_id=p.id WHERE d.day BETWEEN ? AND ? GROUP BY p.mode').all(from,to), maps: this.db.prepare('SELECT p.map label,COUNT(DISTINCT p.id) plays,SUM(d.ms) ms,COUNT(DISTINCT p.player_id) players FROM analytics_plays p JOIN analytics_play_daily d ON d.play_id=p.id WHERE d.day BETWEEN ? AND ? GROUP BY p.map ORDER BY plays DESC LIMIT 30').all(from,to), outcomes: this.db.prepare("SELECT p.map label,COUNT(DISTINCT CASE WHEN p.outcome='win' THEN p.id END) wins,COUNT(DISTINCT CASE WHEN p.outcome='loss' THEN p.id END) losses,COUNT(DISTINCT CASE WHEN p.outcome='draw' THEN p.id END) draws FROM analytics_plays p JOIN analytics_play_daily d ON d.play_id=p.id WHERE d.day BETWEEN ? AND ? GROUP BY p.map").all(from,to), errors: this.db.prepare('SELECT kind label,COUNT(*) count FROM analytics_errors WHERE at>=? AND at<? GROUP BY kind').all(start, end), retention: { nextDay: cohort(1), day7: cohort(7) }, definitions: { identity: '同一浏览器的独立访客编号；同名不自动合并，清除Cookie或换设备会形成新档案', login: '有效昵称进入游戏页，属于昵称进入人数，不等同于实名账号登录', duration: '前台可见且对局未暂停的时间；心跳15秒，多标签页时间取并集，断网最多计45秒', distribution: '按所选日期内每位玩家的累计时长分组；左开右闭，已开局不足一毫秒计入首个区间', history: '接入前没有UA和时长记录，日期曲线用空缺表示；历史联机档案仅提供已有昵称和战绩', source: '本站 analytics.sqlite 的访客、日汇总、对局、会话及错误表；北京时间 UTC+8' } };
  }
  players(filters = {}) {
    const { from, to } = analyticsRange(filters.from, filters.to, this.clock()), search = safeText(filters.search, 60), page = Math.max(1, Math.min(100000, Number(filters.page) || 1)), limit = filters.export ? 10000 : 50;
    const all = this.db.prepare(`SELECT p.id,p.name,p.first_seen firstSeen,p.last_seen lastSeen,COALESCE(SUM(d.ms),0) ms,COUNT(d.day) days,COALESCE(SUM(d.played),0) playDays,GROUP_CONCAT(d.day) dates,GROUP_CONCAT(CASE WHEN d.played=1 THEN d.day END) playDates,
      (SELECT COALESCE(SUM(a.ms),0) FROM analytics_daily a WHERE a.player_id=p.id) lifetimeMs,
      (SELECT COUNT(*) FROM analytics_plays a WHERE a.player_id=p.id) plays,
      (SELECT ua FROM analytics_sessions s WHERE s.player_id=p.id ORDER BY last_seen DESC LIMIT 1) ua,
      (SELECT browser||' · '||os||' · '||device FROM analytics_sessions s WHERE s.player_id=p.id ORDER BY last_seen DESC LIMIT 1) device
      FROM analytics_players p LEFT JOIN analytics_daily d ON d.player_id=p.id AND d.day BETWEEN ? AND ? WHERE (?='' OR instr(p.name,?)>0 OR instr(p.id,?)>0) GROUP BY p.id`).all(from, to, search, search, search);
    let rows = all;
    if (filters.groupBy === 'name') {
      const names = new Map();
      for (const p of all) { const key = p.name || `匿名:${p.id}`; const g = names.get(key) || { ...p, members: 0, ms: 0, lifetimeMs: 0, plays: 0, days: 0, playDays: 0 }; g.dateSet??=new Set();g.playDateSet??=new Set();(p.dates||'').split(',').filter(Boolean).forEach(d=>g.dateSet.add(d));(p.playDates||'').split(',').filter(Boolean).forEach(d=>g.playDateSet.add(d));g.members++; g.ms += p.ms; g.lifetimeMs += p.lifetimeMs; g.plays += p.plays; g.days = Math.max(g.days, p.days); g.playDays = Math.max(g.playDays, p.playDays); g.firstSeen = Math.min(g.firstSeen, p.firstSeen); g.lastSeen = Math.max(g.lastSeen, p.lastSeen); if (g.members > 1) { g.id = ''; g.device = '同名归并，设备请切换独立档案查看'; g.ua = ''; } names.set(key, g); } rows = [...names.values()].map(p=>{p.days=p.dateSet.size;p.playDays=p.playDateSet.size;delete p.dateSet;delete p.playDateSet;return p;});
    }
    rows.sort((a, b) => filters.sort === 'recent' ? b.lastSeen - a.lastSeen : filters.sort === 'lifetime' ? b.lifetimeMs - a.lifetimeMs : b.ms - a.ms || b.lastSeen - a.lastSeen);
    return { total: rows.length, page, limit, truncated: filters.export && rows.length > limit, rows: rows.slice(filters.export ? 0 : (page - 1) * limit, filters.export ? limit : page * limit) };
  }
  close() { this.db.close(); }
}
