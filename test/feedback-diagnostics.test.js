import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createBattleServer } from '../server/index.mjs';
import { passwordHash } from '../server/admin-access.mjs';

test('反馈文字、图片、鉴权、限流和保留期', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'gp-feedback-'));
  const app = createBattleServer({directory:dir,root:resolve('dist'),adminPasswordHash:passwordHash('测试口令'),dev:true});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  t.after(async()=>{await new Promise(r=>app.server.close(r));rmSync(dir,{recursive:true,force:true});});
  const base = `http://127.0.0.1:${app.server.address().port}`, origin = 'http://localhost:4173';
  const send = body => fetch(`${base}/api/feedback`,{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)});
  assert.equal((await send({content:'  '})).status,400);
  const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aFcUAAAAASUVORK5CYII=';
  assert.equal((await send({content:'建议改进',image:png,version:'测试'})).status,200);
  assert.equal((await send({content:'仅文字'})).status,200);
  assert.equal((await send({content:'错误图片',image:'data:image/png;base64,SGVsbG8='})).status,400);
  assert.equal((await fetch(`${base}/api/admin/feedback-image?id=1`)).status,401);
  const login=await fetch(`${base}/api/admin/login`,{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({password:'测试口令'})});
  const cookie=login.headers.get('set-cookie').split(';')[0];
  const query=await fetch(`${base}/api/admin/query`,{method:'POST',headers:{origin,cookie,'content-type':'application/json'},body:JSON.stringify({view:'diagnostics'})});
  const result=await query.json();assert.equal(result.feedback.length,2);assert.equal(result.feedback[1].content,'建议改进');
  const img=await fetch(`${base}/api/admin/feedback-image?id=1`,{headers:{cookie}});assert.equal(img.status,200);assert.equal(img.headers.get('content-type'),'image/png');
  assert.equal((await send({content:'第五次'})).status,200);assert.equal((await send({content:'限流'})).status,429);
  app.analytics.db.prepare('UPDATE feedback_entries SET at=? WHERE id=1').run(Date.now()-400*86400000);app.analytics.pruneDiagnostics();assert.equal(app.analytics.feedbackImage(1),undefined);
});

test('反馈记录关闭数据库后可恢复，旧版错误表可迁移', async t => {
  const { DatabaseSync } = await import('node:sqlite');
  const { PlayerAnalytics } = await import('../server/player-analytics.mjs');
  const dir=mkdtempSync(join(tmpdir(),'gp-diagnostic-migrate-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const original=new DatabaseSync(join(dir,'analytics.sqlite'));original.exec('CREATE TABLE analytics_errors(id INTEGER PRIMARY KEY,player_id TEXT NOT NULL,session_id TEXT NOT NULL,at INTEGER NOT NULL,kind TEXT NOT NULL)');original.close();
  let db=new PlayerAnalytics(dir);db.submitFeedback({content:'重启后保留'});db.close();db=new PlayerAnalytics(dir);assert.equal(db.diagnostics().feedback[0].content,'重启后保留');assert.ok(db.db.prepare('PRAGMA table_info(analytics_errors)').all().some(x=>x.name==='detail'));db.close();
});
