import { PlayerAnalytics } from './player-analytics.mjs';
import { AdminAccess, playerCSV } from './admin-access.mjs';
import { createServer } from 'node:http';
import { stat, readFile } from 'node:fs/promises';
import { serveFile } from './static-files.mjs';
import { resolve, sep } from 'node:path';
import { randomInt } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { Game } from '../src/game.js';
import { FACTIONS, MAPS, VICTORY_MODES } from '../src/data.js';
import { PROTOCOL_VERSION,SIX_PROTOCOL_VERSION, nickname } from '../src/network-protocol.js';
import { Accounts } from './accounts.mjs';
import { executeCommand } from './commands.mjs';
import { battleView } from './battle-view.mjs';
import { GAME_VERSION, BUILD_ID } from '../src/version.js';
import { SessionRateLimit } from './session-rate-limit.mjs';

export function createBattleServer({ directory = process.env.DATA_DIRECTORY || resolve('server-data'), root = resolve('dist'), origin = process.env.PUBLIC_ORIGIN || '', additionalOrigins = process.env.PUBLIC_ORIGINS || '', maxPlayers=2, adminPasswordHash = process.env.ADMIN_PASSWORD_HASH || '', dev = process.env.NODE_ENV !== 'production' } = {}) {
  root=resolve(root);
  if(![2,6].includes(maxPlayers))throw new Error('席位上限无效');
  const protocol=maxPlayers===6?SIX_PROTOCOL_VERSION:PROTOCOL_VERSION;
  const cookieName=maxPlayers===6?'gp_six_guest':'gp_guest',cookiePath=maxPlayers===6?'/candidate':'/';
  const accounts = new Accounts(directory,{cookieName}), rooms = new Map(), peers = new Map(), requests = new SessionRateLimit();
  const analytics = new PlayerAnalytics(directory), admin = new AdminAccess(adminPasswordHash);
  const feedbackRequests = new SessionRateLimit({limit:5,windowMs:3600000,capacity:2048});
  const telemetryRequests = new SessionRateLimit({limit:240,capacity:2048}), newVisitors = new SessionRateLimit({limit:40,capacity:2048});
  const send = (ws, value) => { if (ws?.readyState === WebSocket.OPEN && ws.bufferedAmount < 512*1024) ws.send(JSON.stringify(value)); };
  const extraOrigins = new Set(additionalOrigins.split(',').map(value=>value.trim()).filter(value=>{try{const u=new URL(value);return ['http:','https:'].includes(u.protocol)&&u.origin===value;}catch{return false;}}));
  const allowed = req => req.headers.origin === (origin || `http://${req.headers.host}`) || extraOrigins.has(req.headers.origin) || dev && ['http://localhost:4173','http://127.0.0.1:4173'].includes(req.headers.origin);
  const userRoom = id => [...rooms.values()].find(r => r.members.some(m => m?.user.id === id&&!m.left)||r.spectators?.has(id));
  const publicRoom = r => ({ code: r.code, host: r.host, config: r.config, status: r.game ? r.game.running ? 'playing' : 'ended' : 'waiting', reason: r.reason || '', deadline: r.deadline || null,allowSpectators:!!r.allowSpectators,spectatorCount:r.spectators?.size||0,members: r.members.map(m => m ? { id: m.user.id, name: m.user.name, faction: m.faction, ready: m.ready, connected: m.controlType==='ai'||!!peers.get(m.user.id),controlType:m.controlType||'human',eliminated:!!r.game?.players[m.seat]?.eliminated } : null) });
  const roomNotice = r => r.members.forEach(m => m && send(peers.get(m.user.id), { type: 'room', room: publicRoom(r) }));
  function snapshot(r, ws, side, start = false,spectator=false) {
    send(ws, { type: start ? 'battle' : 'snapshot', config: { ...r.config, battleId: r.game.battleId }, seat: side, room: publicRoom(r), spectator,view: battleView(r.game, side, spectator?new Map():r.memory[side],{spectator}) });
  }
  function end(r, winner, reason) {
    if (r.settled) return;
    r.game.winner = winner; r.game.running = false; r.game.paused = false;
    r.reason = reason; r.settled = true; r.expires = Date.now()+120000;
    if(maxPlayers===6)accounts.settleMany(r.game.battleId,r.members.map(m=>({...m.user,controlType:m.controlType})),winner);else accounts.settle(r.game.battleId,r.members.map(m=>m.user),winner);
    r.members.forEach((m,side)=>m&&!m.left&&m.controlType!=='ai'&&snapshot(r,peers.get(m.user.id),side));for(const [id,follow]of r.spectators||[])snapshot(r,peers.get(id),follow,false,true);
    roomNotice(r);
  }
  function leave(id) {
    const r = userRoom(id); if (!r) return;
    const side = r.members.findIndex(m => m?.user.id === id);
    if(r.spectators?.has(id)){r.spectators.delete(id);send(peers.get(id),{type:'room',room:null});return;}
    if(maxPlayers===6&&r.game?.running){eliminate(r,side,'认输退出');r.members[side].left=true;send(peers.get(id),{type:'room',room:null});if(!abandonIfEmpty(r))roomNotice(r);return;}
    if (r.game?.running) end(r, 1-side, '对手认输退出');
    if (r.game) { r.members.forEach(m => send(peers.get(m.user.id), { type: 'room', room: null })); rooms.delete(r.code); }
    else { r.members[side] = null; if (!r.members.some(Boolean)) rooms.delete(r.code); else { r.host=r.members.findIndex(m=>m&&m.controlType!=='ai');if(r.host<0){rooms.delete(r.code);send(peers.get(id),{type:'room',room:null});return;}roomNotice(r); } }
    send(peers.get(id), { type: 'room', room: null });
  }
  function abandonIfEmpty(r){
    if(!r.game?.running)return false;
    const participating=r.members.some((m,side)=>m.controlType!=='ai'&&!m.left&&(!r.game.players[side].eliminated||peers.has(m.user.id)));
    const observing=[...r.spectators.keys()].some(id=>peers.has(id));
    if(participating||observing)return false;
    end(r,'abandoned','真人均已离场，释放候选战区');rooms.delete(r.code);return true;
  }
  function eliminate(r,side,reason){const p=r.game?.players[side];if(!p||p.eliminated)return;p.eliminated=true;p.buildQueue=null;p.readyBuilding=null;r.game.units=r.game.units.filter(u=>u.owner!==side);r.game.buildings=r.game.buildings.filter(b=>b.owner!==side);for(const site of [...r.game.oil,...r.game.beacons,...r.game.resourceSites])if(site.owner===side)site.owner=null;r.reason=reason;r.game.checkVictory();if(!r.game.running)end(r,r.game.winner,'最后存活者');}
  const server = createServer(async (req, res) => {
    const json = (status, data) => { res.writeHead(status, { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store' }); res.end(JSON.stringify(data)); };
    res.setHeader('X-Content-Type-Options','nosniff'); res.setHeader('X-Frame-Options','DENY'); res.setHeader('Referrer-Policy','same-origin');
    try {
      const url = new URL(req.url, 'http://local');
      if (url.pathname === '/api/health') return json(200, { ok: true, version:GAME_VERSION, build:BUILD_ID, protocol, maxPlayers,rooms: rooms.size, battles: [...rooms.values()].filter(r => r.game?.running).length });
      const secure = origin.startsWith('https:') || extraOrigins.has(req.headers.origin) && req.headers.origin.startsWith('https:');
      const readBody = async (limit = 8192) => { let text=''; for await (const chunk of req) { text+=chunk; if(Buffer.byteLength(text)>limit)throw Error('请求过大'); } return JSON.parse(text); };
      if (url.pathname === '/api/download-counts' && req.method === 'GET') return json(200, { counts: analytics.downloadCounts(), scope: '本站下载跳转次数，自功能启用后累计' });
      if (url.pathname === '/api/download' && req.method === 'GET') {
        const key = url.searchParams.get('file'), manifest = JSON.parse(await readFile(resolve(root,'downloads/manifest.json'),'utf8'));
        const item = manifest.files.find(f => f.name === key); if (!item) return json(404,{error:'下载文件不存在'});
        const local = /^packages\/[A-Za-z0-9._-]+$/.test(item.name);
        let destination = local ? `/downloads/${item.name}` : item.name;
        if (!local) { const target = new URL(item.name); if (target.protocol !== 'https:' || target.hostname !== 'github.com' || !target.pathname.startsWith('/chencheng666/great-powers-rts/releases/download/')) return json(400,{error:'下载地址无效'}); destination = target.href; }
        analytics.recordDownload(item.name);
        res.writeHead(302, { Location: destination, 'Cache-Control': 'no-store' }); return res.end();
      }
      if (url.pathname === '/api/external-telemetry') {
        const externalOrigin = req.headers.origin;
        if (!['null','tauri://localhost','https://tauri.localhost','http://tauri.localhost'].includes(externalOrigin)) return json(403,{error:'请求来源不被允许'});
        res.setHeader('Access-Control-Allow-Origin', externalOrigin);
        if (req.method !== 'POST') return json(405,{error:'不支持的请求'});
        const body = await readBody(), token = typeof body.token === 'string' && /^[a-f0-9]{64}$/.test(body.token) ? body.token : '';
        const cookie = token ? `gp_analytics=${token}` : '', player = analytics.player(cookie);
        if (!(player ? telemetryRequests : newVisitors).accept(player?.id || req.socket.remoteAddress)) return json(429,{error:'统计请求过于频繁'});
        const result = analytics.ingest(body,{cookie,ua:req.headers['user-agent']});
        return json(200,{ok:true,...(result.token ? {token:result.token} : {})});
      }
      if (url.pathname === '/api/telemetry') {
        if(req.method!=='POST')return json(405,{error:'不支持的请求'});
        if(!allowed(req))return json(403,{error:'请求来源不被允许'});
        const player=analytics.player(req.headers.cookie),source=player?.id||req.socket.remoteAddress;
        if(!(player?telemetryRequests:newVisitors).accept(source))return json(429,{error:'统计请求过于频繁'});
        const result=analytics.ingest(await readBody(),{cookie:req.headers.cookie,ua:req.headers['user-agent'],guestId:accounts.find(req.headers.cookie)?.id});
        if(result.token)res.setHeader('Set-Cookie',`gp_analytics=${result.token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=31536000${secure?'; Secure':''}`);
        return json(200,{ok:true});
      }
      if (url.pathname === '/api/feedback') {
        if (req.method !== 'POST') return json(405,{error:'不支持的请求'});
        const external = ['null','tauri://localhost','https://tauri.localhost','http://tauri.localhost'].includes(req.headers.origin);
        if (!external && !allowed(req)) return json(403,{error:'请求来源不被允许'});
        if (external) res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
        const feedbackPlayer = analytics.player(req.headers.cookie);
        if (!feedbackRequests.accept(feedbackPlayer?.id || req.socket.remoteAddress)) return json(429,{error:'提交过于频繁，请稍后再试'});
        try { analytics.pruneDiagnostics(); analytics.submitFeedback(await readBody(720000)); return json(200,{ok:true}); }
        catch { return json(400,{error:'反馈文字或图片不符合要求'}); }
      }
      if(url.pathname.startsWith('/api/admin/')) {
        if(req.method==='POST'&&!allowed(req))return json(403,{error:'请求来源不被允许'});
        if(url.pathname==='/api/admin/login'&&req.method==='POST'){
          const result=admin.login((await readBody()).password,req.socket.remoteAddress);
          if(result.error)return json(result.status,{error:result.error});
          res.setHeader('Set-Cookie',`gp_admin=${result.token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${secure?'; Secure':''}`);return json(200,{ok:true});
        }
        if(!admin.authorized(req.headers.cookie))return json(401,{error:'请先登录管理员'});
        if(url.pathname==='/api/admin/logout'&&req.method==='POST'){admin.logout(req.headers.cookie);res.setHeader('Set-Cookie','gp_admin=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');return json(200,{ok:true});}
        if(url.pathname==='/api/admin/feedback-image'&&req.method==='GET') {
          const id = Number(url.searchParams.get('id')); if (!Number.isSafeInteger(id) || id < 1) return json(400,{error:'编号无效'});
          const image=analytics.feedbackImage(id); if (!image) return json(404,{error:'图片不存在'});
          res.writeHead(200,{'Content-Type':image.type,'Cache-Control':'no-store','Content-Disposition':'inline','X-Content-Type-Options':'nosniff'});return res.end(image.image);
        }
        if(url.pathname==='/api/admin/status'&&req.method==='GET')return json(200,{ok:true});
        if(url.pathname==='/api/admin/query'&&req.method==='POST'){
          const filters=await readBody();
          if(filters.view==='players')return json(200,analytics.players(filters));
          if(filters.view==='diagnostics')return json(200,analytics.diagnostics(filters));
          if(filters.view==='export'){
            const data=analytics.players({...filters,export:true});res.writeHead(200,{'Content-Type':'text/csv; charset=utf-8','Cache-Control':'no-store','Content-Disposition':'attachment; filename="players.csv"','X-Export-Truncated':String(data.truncated)});return res.end(playerCSV(data));
          }
          const report=analytics.report(filters);report.environment=dev?'本地开发环境':'生产采集';
          report.legacy={count:accounts.db.prepare('SELECT COUNT(*) n FROM guests').get().n,rows:accounts.db.prepare('SELECT id,name,wins,losses,draws FROM guests ORDER BY wins DESC LIMIT 100').all(),scope:'历史双人联网档案；没有采集到的UA与时长不能回补，名单最多展示100条'};
          return json(200,report);
        }
        return json(404,{error:'接口不存在'});
      }
      if (url.pathname === '/api/session') {
        let user = accounts.find(req.headers.cookie);
        if (req.method === 'POST') {
          if (!allowed(req)) return json(403, { error:'请求来源不被允许' });
          if(!requests.accept(req.socket.remoteAddress))return json(429,{error:'操作过于频繁，请稍后再试'});
          let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 1024) throw new Error('请求过大'); }
          const name = nickname(JSON.parse(body).name);
          if (user) { accounts.rename(user.id, name); user.name = name; }
          else {
            const created = accounts.create(name); user = created.user;
            res.setHeader('Set-Cookie', `${cookieName}=${created.token}; HttpOnly; SameSite=Lax; Path=${cookiePath}; Max-Age=2592000${(origin.startsWith('https:') || extraOrigins.has(req.headers.origin) && req.headers.origin.startsWith('https:')) ? '; Secure' : ''}`);
          }
        } else if (req.method !== 'GET') return json(405, { error:'不支持的请求' });
        return json(200, { user, room: user ? publicRoom(userRoom(user.id) || { code:null, config:null, members:[], host:0 }) : null });
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') return json(405, { error:'不支持的请求' });
      let file = resolve(root, '.'+decodeURIComponent(url.pathname));
      if (!file.startsWith(root+sep) && file !== root) return json(403, { error:'禁止访问' });
      if (url.pathname === '/admin') { res.writeHead(302,{Location:'/admin/'});return res.end(); }
      if (url.pathname === '/admin/') file=resolve(root,'admin/index.html');
      if (url.pathname.startsWith('/admin/')) res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'none'");
      if (url.pathname === '/official') { res.writeHead(302,{Location:'/official/','Cache-Control':'no-cache'});return res.end(); }
      if (url.pathname === '/official/') file=resolve(root,'official/index.html');
      if (url.pathname === '/downloads') { res.writeHead(302, { Location:'/downloads/', 'Cache-Control':'no-cache' }); return res.end(); }
      if (url.pathname === '/downloads/') file = resolve(root,'downloads/index.html');
      if (file === root) file = resolve(root,'index.html');
      const info = await stat(file); if (!info.isFile()) return json(404, { error:'文件不存在' });
      serveFile(req,res,file,info,{official:url.pathname.startsWith('/official/')});
    } catch (error) { json(error.code === 'ENOENT' ? 404 : 400, { error:error.code === 'ENOENT' ? '文件不存在' : '请求无效' }); }
  });
  // 六方快照较大，使用低压缩等级与有限并发，保持双人协议的传输方式不变。
  const wss = new WebSocketServer({ noServer:true, maxPayload:16384, perMessageDeflate:maxPlayers===6?{threshold:1024,serverNoContextTakeover:true,clientNoContextTakeover:true,concurrencyLimit:2,zlibDeflateOptions:{level:1}}:false });
  server.on('upgrade', (req, socket, head) => {
    const user = accounts.find(req.headers.cookie);
    if (req.url !== '/battle-socket' || !allowed(req) || !user || peers.size >= 64 && !peers.has(user.id)) { socket.end('HTTP/1.1 403 Forbidden\r\n\r\n'); return; }
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, user));
  });
  wss.on('connection', (ws, user) => {
    const old = peers.get(user.id); peers.set(user.id, ws); old?.close(1000, '会话已在另一窗口打开');
    ws.alive = true; ws.on('pong', () => ws.alive = true);
    let seq = 0, tokens = 40, lastRate = Date.now();
    const resumed = userRoom(user.id);
    send(ws, { type:'hello', protocol, user, room:resumed?publicRoom(resumed):null });
    if (resumed) { roomNotice(resumed); const side=resumed.members.findIndex(m=>m?.user.id===user.id); if(resumed.game)snapshot(resumed,ws,resumed.spectators?.get(user.id)??side,true,resumed.spectators?.has(user.id)); }
    ws.on('message', raw => {
      try {
        if (peers.get(user.id) !== ws) return;
        const now = Date.now(); tokens=Math.min(40,tokens+(now-lastRate)*.02); lastRate=now;
        if (--tokens < 0) { ws.close(1008,'操作过于频繁'); return; }
        const msg=JSON.parse(raw.toString()); if (!msg || typeof msg !== 'object' || Array.isArray(msg)) throw new Error('指令格式无效');
        let r=userRoom(user.id), side=r?.members.findIndex(m=>m?.user.id===user.id);
        if (msg.type === 'create') {
          if (r) throw new Error('请先退出当前房间');
          if (rooms.size >= 20) throw new Error('房间已满，请稍后重试');
          if (MAPS[msg.mapId]?.missionOnly||MAPS[msg.mapId]?.singleplayerOnly||maxPlayers===6&&msg.mapId!=='sixfront'||maxPlayers===2&&MAPS[msg.mapId]?.maxPlayers===6|| !Object.hasOwn(MAPS,msg.mapId) || !Object.hasOwn(FACTIONS,msg.faction) || !Object.hasOwn(VICTORY_MODES,msg.victoryMode)) throw new Error('作战配置无效');
          if(msg.nuclearEnabled===true&&(maxPlayers!==2||msg.mapId!=='strategic'))throw new Error('核威慑仅限战略纵深双人战区');
          let code; do { code=String(randomInt(100000,1000000)); } while (rooms.has(code));
          r={ code, host:0, config:{ mapId:msg.mapId, victoryMode:msg.victoryMode, battlefieldScale:maxPlayers===6||MAPS[msg.mapId].fixedScale?1:1.5,...(maxPlayers===6?{playerCount:6}: {}) }, members:Array.from({length:maxPlayers},(_,seat)=>seat===0?{user,faction:msg.faction,ready:false,seat,controlType:'human'}:null), expires:now+600000, memory:Array.from({length:maxPlayers},()=>new Map()),spectators:new Map(),allowSpectators:maxPlayers===6&&msg.allowSpectators===true,disconnects:0,deadlines:new Map() };
          r.config.nuclearEnabled=msg.nuclearEnabled===true;
          rooms.set(code,r); roomNotice(r);
        } else if (msg.type === 'join') {
          if (r) throw new Error('请先退出当前房间'); r=rooms.get(String(msg.code));
          if (!r || r.game || r.members.every(Boolean)) throw new Error('房间不存在、已满或已开战');
          if (!Object.hasOwn(FACTIONS,msg.faction)) throw new Error('阵营无效');
          side=r.members.findIndex(m=>!m); r.members[side]={ user,faction:msg.faction,ready:false,seat:side,controlType:'human' }; r.expires=now+600000; roomNotice(r);
        } else if(msg.type==='observe'&&maxPlayers===6){
          if(r&&!r.game?.players[side]?.eliminated&&!r.spectators?.has(user.id))throw new Error('参战者不能切换他人视角');
          const target=rooms.get(String(msg.code));if(!target?.game||!target.allowSpectators||target.spectators.size>=8&&!target.spectators.has(user.id)||!Number.isInteger(msg.follow)||msg.follow<0||msg.follow>=6)throw new Error('观战不可用');
          if(r&&r!==target)leave(user.id);
          target.spectators.set(user.id,msg.follow);send(ws,{type:'room',room:publicRoom(target)});snapshot(target,ws,msg.follow,true,true);
        } else if (msg.type === 'leave') leave(user.id);
        else if (msg.type === 'ping') send(ws,{ type:'pong',at:msg.at });
        else if (!r) throw new Error('请先创建或加入房间');
        else if(msg.type==='set-ai'&&maxPlayers===6){
          if(r.game||side!==r.host||!Number.isInteger(msg.seat)||msg.seat<0||msg.seat>=6||!Object.hasOwn(FACTIONS,msg.faction)||r.members[msg.seat]&&r.members[msg.seat].controlType!=='ai')throw new Error('只有房主可配置空闲AI席位');
          r.members[msg.seat]=msg.remove?null:{seat:msg.seat,user:{id:`ai-${r.code}-${msg.seat}`,name:`电脑${msg.seat+1}`},faction:msg.faction,ready:true,controlType:'ai'};roomNotice(r);
        } else if(r.spectators.has(user.id))throw new Error('观战者不能控制战局');
        else if (msg.type === 'ready' || msg.type === 'faction') {
          if (r.game) throw new Error('已经开战，不能修改部署');
          if (msg.type === 'faction') { if (!Object.hasOwn(FACTIONS,msg.faction)) throw new Error('阵营无效'); r.members[side].faction=msg.faction; r.members[side].ready=false; }
          else {if(msg.ready===true&&r.config.nuclearEnabled&&msg.nuclearConsent!==true)throw new Error('请明确确认核威慑规则后准备');r.members[side].nuclearConsent=msg.nuclearConsent===true;r.members[side].ready=msg.ready === true;}
          r.expires=now+600000; roomNotice(r);
        } else if (msg.type === 'start') {
          if (r.game || side!==r.host || !r.members.every(m=>m?.ready&&(m.controlType==='ai'||peers.has(m.user.id)))) throw new Error(maxPlayers===6?'六个席位准备完成后，由房主开战':'双方准备完成后，由房主开战');
          if(r.config.nuclearEnabled&&!r.members.every(m=>m.nuclearConsent===true))throw new Error('双方均须确认核威慑规则');
          if ([...rooms.values()].filter(v=>v.game?.running).length >= (maxPlayers===6?1:4)) throw new Error('战区繁忙，请稍后开战');
          r.game=new Game(r.members[0].faction,r.members[1].faction,{}, { ...r.config, multiplayer:true,...(maxPlayers===6?{players:r.members.map(m=>({faction:m.faction,controlType:m.controlType}))}:{}) });
          r.members.forEach((m,s)=>m.controlType!=='ai'&&snapshot(r,peers.get(m.user.id),s,true)); roomNotice(r);
        } else if (msg.type === 'command') {
          if (!Number.isSafeInteger(msg.seq) || msg.seq<=seq) return; seq=msg.seq;
          const ok = !!r.game && executeCommand(r.game,side,msg);
          send(ws,{ type:'ack',seq,ok,action:msg.action });
        } else throw new Error('未知请求');
      } catch (error) { send(ws,{ type:'error',message:error instanceof SyntaxError ? '指令格式无效' : error.message }); }
    });
    ws.on('close', () => { if (peers.get(user.id)!==ws) return; peers.delete(user.id); const r=userRoom(user.id); if(r){r.spectators?.delete(user.id);roomNotice(r);if(maxPlayers===6)abandonIfEmpty(r);} });
    ws.on('error', () => {});
  });
  let effectId=1, tick=0;
  const timer=setInterval(() => {
    const now=Date.now(); tick++;
    for (const [code,r] of rooms) {
      if (!r.game || !r.game.running) { if(r.expires<now) { r.members.forEach(m=>m&&send(peers.get(m.user.id),{type:'room',room:null})); rooms.delete(code); } continue; }
      if(maxPlayers===6){
        const missing=r.members.map((m,side)=>m.controlType!=='ai'&&!r.game.players[side].eliminated&&!peers.has(m.user.id)?side:null).filter(s=>s!==null);
        for(const side of missing){if(!r.deadlines.has(side))r.deadlines.set(side,now+60000);if(now>=r.deadlines.get(side))eliminate(r,side,'席位掉线宽限结束');}
        for(const side of [...r.deadlines.keys()])if(!missing.includes(side)||r.game.players[side].eliminated)r.deadlines.delete(side);
        r.game.paused=r.deadlines.size>0;if(!r.game.paused)r.game.update(.05);if(abandonIfEmpty(r))continue;for(const e of r.game.effects)e.networkId??=effectId++;if(!r.game.running){end(r,r.game.winner,'六方目标达成');continue;}
        if(tick%4===0){r.members.forEach((m,side)=>m.controlType!=='ai'&&!m.left&&!r.spectators.has(m.user.id)&&snapshot(r,peers.get(m.user.id),side));for(const[id,follow]of r.spectators)snapshot(r,peers.get(id),follow,false,true);}continue;
      }
      const disconnected=r.members.map(m=>!peers.has(m.user.id));
      if (disconnected.some(Boolean)) {
        r.game.paused=true;
        if (!r.deadline) { r.disconnects++; r.deadline=now+(r.disconnects<=3?60000:10000); roomNotice(r); }
        if(now>=r.deadline) { end(r,disconnected.every(Boolean)?'draw':disconnected[0]?1:0,'掉线宽限结束'); continue; }
      } else { r.game.paused=false; if(r.deadline) { r.deadline=null; roomNotice(r); } r.game.update(.05); }
      for (const e of r.game.effects) e.networkId ??= effectId++;
      if(!r.game.running) { end(r,r.game.winner,'战场目标已达成'); continue; }
      if(tick%2===0) r.members.forEach((m,side)=>snapshot(r,peers.get(m.user.id),side));
    }
  },50);
  const heartbeat=setInterval(()=>wss.clients.forEach(ws=>{if(!ws.alive||ws.bufferedAmount>2*1024*1024)ws.terminate();else{ws.alive=false;ws.ping();}}),15000);
  const diagnosticsCleanup = setInterval(() => { try { analytics.pruneDiagnostics(); } catch (error) { console.error('诊断记录清理失败', error); } }, 86400000); diagnosticsCleanup.unref();
  server.on('close',()=>{clearInterval(diagnosticsCleanup);clearInterval(timer);clearInterval(heartbeat);wss.clients.forEach(ws=>ws.terminate());wss.close();analytics.close();accounts.db.close();});
  return { server, rooms, accounts, wss, analytics };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { server }=createBattleServer({maxPlayers:Number(process.env.MAX_PLAYERS||2)}); server.listen(Number(process.env.PORT||4180),process.env.HOST||'127.0.0.1',()=>console.log(`对战服务已启动，端口 ${process.env.PORT||4180}`));
}
