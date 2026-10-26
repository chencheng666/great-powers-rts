const sessionId = environment => environment.crypto?.randomUUID?.() || `session-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,14)}`;
export function telemetryContext(game) {
  if (!game) return null;
  return { battleId: game.battleId, mode: game.spectator ? 'spectator' : game.online ? game.playerCount === 6 ? 'candidate' : 'online' : game.challenge ? 'challenge' : game.sandbox ? 'sandbox' : 'single', mapId: game.mapId, faction: game.players[0]?.faction, outcome: game.running ? null : game.winner === 'draw' ? 'draw' : game.winner === 0 ? 'win' : 'loss' };
}
export class PlayerTelemetry {
  constructor({ version, getGame = () => null, environment = globalThis, now = () => performance.now() } = {}) {
    this.env = environment; this.version = version; this.getGame = getGame; this.now = now;
    this.enabled = ['http:', 'https:'].includes(environment.location?.protocol); this.activeMs = 0; this.seq = 0; this.name = ''; this.context = null; this.playing = false; this.lastFrame = now(); this.queue = Promise.resolve(); this.pending = 0;
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
    const body = JSON.stringify({ sessionId: this.sessionId, seq: ++this.seq, activeMs: Math.floor(this.activeMs), name: this.name, context: this.context, playing: this.playing, visible: !this.env.document.hidden, entry: /^\/candidate(?:\/|$)/.test(this.env.location.pathname) ? 'candidate' : 'game', version: this.version, closed, error });
    if (beacon) {
      try { if (this.env.navigator.sendBeacon('/api/telemetry', new Blob([body], { type: 'application/json' }))) return Promise.resolve(true); } catch { /* 无法发送退出心跳时仍允许正常关闭。 */ }
    }
    this.pending++;
    const request = async () => { try { const response = await this.env.fetch('/api/telemetry', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, credentials: 'same-origin', keepalive: true, signal: AbortSignal.timeout(8000) }); return response.ok; } catch { return false; } finally { this.pending--; } };
    this.queue = this.queue.then(request, request); return this.queue;
  }
  destroy() { if (!this.enabled) return; this.env.clearInterval(this.timer); this.env.document.removeEventListener('visibilitychange', this.onVisibility); this.env.removeEventListener('pagehide', this.onPageHide); this.env.removeEventListener('pageshow', this.onPageShow); this.env.removeEventListener('error',this.onError,true); }
}
