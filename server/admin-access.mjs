import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { SessionRateLimit } from './session-rate-limit.mjs';
export function passwordHash(password) {
  const salt = randomBytes(16).toString('hex'); return `${salt}:${scryptSync(password, salt, 32).toString('hex')}`;
}
export class AdminAccess {
  constructor(encoded = '', { clock = Date.now } = {}) {
    this.encoded = encoded; this.clock = clock; this.sessions = new Map();
    this.attempts = new SessionRateLimit({ limit: 8, windowMs: 600000, capacity: 2048 });
  }
  get enabled() { return /^[a-f0-9]{32}:[a-f0-9]{64}$/.test(this.encoded); }
  login(password, ip) {
    if (!this.enabled) return { status: 503, error: '管理员尚未配置' };
    if (!this.attempts.accept(ip, this.clock())) return { status: 429, error: '登录尝试过多，请稍后再试' };
    if (typeof password !== 'string' || password.length > 256) return { status: 401, error: '管理员口令不正确' };
    const [salt, expected] = this.encoded.split(':'), actual = scryptSync(password, salt, 32);
    if (!timingSafeEqual(actual, Buffer.from(expected, 'hex'))) return { status: 401, error: '管理员口令不正确' };
    for (const [key, expires] of this.sessions) if (expires <= this.clock()) this.sessions.delete(key);
    if (this.sessions.size >= 100) this.sessions.delete(this.sessions.keys().next().value);
    const token = randomBytes(32).toString('hex'); this.sessions.set(this.digest(token), this.clock() + 12 * 3600000); return { status: 200, token };
  }
  digest(token) { return createHash('sha256').update(token).digest('hex'); }
  token(cookie = '') { return cookie.split(';').map(s => s.trim()).find(s => s.startsWith('gp_admin='))?.slice(9); }
  authorized(cookie) { const token = this.token(cookie); return !!token && (this.sessions.get(this.digest(token)) || 0) > this.clock(); }
  logout(cookie) { const token = this.token(cookie); if (token) this.sessions.delete(this.digest(token)); }
}
export function playerCSV(data) {
  const cell = value => { let text = String(value ?? ''); if (/^[\s]*[=+\-@]/.test(text)) text = "'" + text; return '"' + text.replaceAll('"', '""') + '"'; };
  return '\ufeff' + [['玩家编号', '昵称', '同名档案数', '所选日期游玩分钟', '累计游玩分钟', '活跃天数', '开局数', '最近访问', '设备', 'UA'], ...data.rows.map(p => [p.id, p.name || '未填写昵称', p.members || 1, (p.ms / 60000).toFixed(2), (p.lifetimeMs / 60000).toFixed(2), p.days, p.plays, new Date(p.lastSeen).toISOString(), p.device, p.ua])].map(row => row.map(cell).join(',')).join('\r\n');
}
