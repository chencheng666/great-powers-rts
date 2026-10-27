const sessionId = environment => environment.crypto?.randomUUID?.() || `session-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,14)}`;
export function telemetryContext(game) {
  if (!game) return null;
  return { battleId: game.battleId, mode: game.spectator ? 'spectator' : game.online ? game.playerCount === 6 ? 'candidate' : 'online' : game.challenge ? 'challenge' : game.sandbox ? 'sandbox' : 'single', mapId: game.mapId, faction: game.players[0]?.faction, outcome: game.running ? null : game.winner === 'draw' ? 'draw' : game.winner === 0 ? 'win' : 'loss' };
}
export class PlayerTelemetry {
  constructor({ version, desktop = false, getGame = () => null, environment = globalThis, now = () => performance.now(), allowed = true } = {}) {
    this.env = environment; this.version = version; this.getGame = getGame; this.now = now;
    this.external = desktop || environment.location?.protocol === 'file:'; this.entry = desktop ? 'desktop' : this.external ? 'zip' : /^\/candidate(?:\/|$)/.test(environment.location?.pathname || '') ? 'candidate' : 'game'; this.endpoint = this.external ? 'https://www.daguojueqi.site/api/external-telemetry' : '/api/telemetry'; this.token = '';
    try { if (this.external) this.token = environment.localStorage?.getItem('great-powers-analytics-token-v1') || ''; } catch { /* 不支持本地存储时仅记录当前会话。 */ }
    this.enabled = allowed && (this.external || ['http:', 'https:'].includes(environment.location?.protocol)); this.activeMs = 0; this.seq = 0; this.name = ''; this.context = null; this.playing = false; this.lastFrame = now(); this.queue = Promise.resolve(); this.pending = 0; this.aborters = new Set();
    if (!this.enabled) return;
    this.sessionId = sessionId(environment);
    this.timer = environment.setInterval(() => { if (!environment.document.hidden) this.flush(); }, 15000);
    this.onVisibility = () => { this.tick(this.getGame()); this.flush(); };
    this.onPageHide = () => { this.tick(this.getGame()); this.flush({ closed: true, beacon: true }); };
    environment.document.addEventListener('visibilitychange', this.onVisibility);
    environment.addEventListener('pagehide', this.onPageHide);
    this.onPageShow = event => { if(event.persisted){this.sessionId=sessionId(environment);this.seq=0;this.activeMs=0;this.lastFrame=now();this.flush();} };
    environment.addEventListener('pageshow',this.onPageShow);
    this.onError = event => this.error(event.target && event.target !== environment ? 'resource' : 'script');
    environment.addEventListener('error',this.onError,true);
    this.lastErrors = new Map();
    this.flush();
  }
  identify(name) { if (this.name === name) return; this.name = name || ''; this.flush(); }
  tick(game = this.getGame()) {
    if (!this.enabled) return;
    const now = this.now(), elapsed = Math.max(0, Math.min(1000, now - this.lastFrame)); this.lastFrame = now;
    if (this.playing) this.activeMs += elapsed;
    const context = telemetryContext(game), playing = !!game?.running && !game.paused && !game.spectator && !this.env.document.hidden;
    const changed = context?.mode !== this.context?.mode || context?.battleId !== this.context?.battleId || context?.outcome !== this.context?.outcome || playing !== this.playing;
    if (changed && this.context?.battleId !== context?.battleId) this.flush();
    this.context = context; this.playing = playing;
    if (changed) this.flush();
  }
  error(kind) { if(!this.enabled)return;const now=this.now();if(now-(this.lastErrors.get(kind)??-Infinity)<60000)return;this.lastErrors.set(kind,now);this.flush({ error: kind }); }
  flush({ closed = false, beacon = false, error } = {}) {
    if (!this.enabled || !beacon && this.pending >= 64) return Promise.resolve(false);
    const body = JSON.stringify({ sessionId: this.sessionId, seq: ++this.seq, activeMs: Math.floor(this.activeMs), name: this.name, context: this.context, playing: this.playing, visible: !this.env.document.hidden, entry: this.entry, version: this.version, closed, error });
    if (beacon && !this.external) {
      try { if (this.env.navigator.sendBeacon('/api/telemetry', new Blob([body], { type: 'application/json' }))) return Promise.resolve(true); } catch { /* 无法发送退出心跳时仍允许正常关闭。 */ }
    }
    this.pending++;
    const request = async () => {
      let controller, timeout;
      try {
        if (!this.enabled) return false;
        controller = new AbortController(); this.aborters.add(controller);
        timeout = setTimeout(() => controller.abort(), 8000);
        const payload = this.external ? JSON.stringify({ ...JSON.parse(body), token: this.token }) : body;
        const response = await this.env.fetch(this.endpoint, { method: 'POST', headers: { 'Content-Type': this.external ? 'text/plain' : 'application/json' }, body: payload, credentials: this.external ? 'omit' : 'same-origin', keepalive: true, signal: controller.signal });
        if (this.external && response.ok) { const result = await response.json(); if (result.token && this.enabled) { this.token = result.token; try { this.env.localStorage?.setItem('great-powers-analytics-token-v1', this.token); } catch { /* 继续本次会话。 */ } } }
        return response.ok;
      } catch { return false; }
      finally { if (timeout) clearTimeout(timeout); if (controller) this.aborters.delete(controller); this.pending--; }
    };
    this.queue = this.queue.then(request, request); return this.queue;
  }
  destroy() { if (!this.enabled) return; this.enabled = false; for (const controller of this.aborters) controller.abort(); this.env.clearInterval(this.timer); this.env.document.removeEventListener('visibilitychange', this.onVisibility); this.env.removeEventListener('pagehide', this.onPageHide); this.env.removeEventListener('pageshow', this.onPageShow); this.env.removeEventListener('error',this.onError,true); }
}
