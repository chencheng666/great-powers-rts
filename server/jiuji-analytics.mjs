import { PlayerAnalytics } from './player-analytics.mjs';
// 九级使用独立目录和访客标识，复用既有统计口径与后台鉴权。
export class JiujiAnalytics extends PlayerAnalytics {
  ingest(body, context = {}) {
    const game = body?.context;
    if (game && (!['home','verdant','cinder','frost'].includes(game.mapId) || !/^level-[1-9]$/.test(game.faction) || game.mode !== 'survival')) throw new Error('九级旅程数据无效');
    if (body?.consent !== true) throw new Error('需要明确同意统计');
    return super.ingest({...body,name:'',context:game}, {...context,guestId:null});
  }
  report(filters = {}) {
    const report = super.report(filters), {from,to} = report.range;
    report.levels = this.db.prepare('SELECT p.faction label,COUNT(DISTINCT p.player_id) players,SUM(d.ms) ms FROM analytics_plays p JOIN analytics_play_daily d ON d.play_id=p.id WHERE d.day BETWEEN ? AND ? GROUP BY p.faction ORDER BY p.faction').all(from,to);
    report.game = 'jiuji';
    report.definitions.identity = '仅统计明确同意的匿名访客；与大国崛起数据隔离，换设备或清除编号会形成新档案';
    report.definitions.login = '九级没有昵称登录，此指标不适用';
    report.definitions.duration = '页面可见、旅程进行且面板未暂停的有效时间；每15秒心跳，离线不回补，多标签页取时间并集';
    report.definitions.source = '九级独立 jiuji/analytics.sqlite；区域和等级按旅程片段统计，不能相加当作独立玩家总数；北京时间 UTC+8';
    return report;
  }
  pruneDiagnostics() {
    super.pruneDiagnostics();
    const cutoff=this.clock()-365*86400000, cutoffDay=new Date(cutoff+8*3600000).toISOString().slice(0,10);
    // 只清理九级的过期明细，不改动大国崛起原有保留策略。
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare('DELETE FROM analytics_play_daily WHERE day < ?').run(cutoffDay);
      this.db.prepare('DELETE FROM analytics_session_daily WHERE day < ?').run(cutoffDay);
      this.db.prepare('DELETE FROM analytics_play_daily WHERE play_id IN (SELECT id FROM analytics_plays WHERE last_seen < ?)').run(cutoff);
      this.db.prepare('DELETE FROM analytics_session_daily WHERE session_id IN (SELECT id FROM analytics_sessions WHERE last_seen < ?)').run(cutoff);
      this.db.prepare('DELETE FROM analytics_plays WHERE last_seen < ?').run(cutoff);
      this.db.prepare('DELETE FROM analytics_sessions WHERE last_seen < ?').run(cutoff);
      this.db.prepare('DELETE FROM analytics_players WHERE last_seen < ?').run(cutoff);
      this.db.prepare('DELETE FROM analytics_daily WHERE day < ?').run(cutoffDay);
      this.db.exec('COMMIT');
    } catch(error){this.db.exec('ROLLBACK');throw error;}
  }
}
