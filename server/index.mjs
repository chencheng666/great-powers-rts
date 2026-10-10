import { createServer } from 'node:http';
import { stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import { randomInt } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { Game } from '../src/game.js';
import { FACTIONS, MAPS, VICTORY_MODES } from '../src/data.js';
import { PROTOCOL_VERSION, nickname } from '../src/network-protocol.js';
import { Accounts } from './accounts.mjs';
import { executeCommand } from './commands.mjs';
import { battleView } from './battle-view.mjs';

export function createBattleServer({ directory = process.env.DATA_DIRECTORY || resolve('server-data'), root = resolve('dist'), origin = process.env.PUBLIC_ORIGIN || '', dev = process.env.NODE_ENV !== 'production' } = {}) {
  const accounts = new Accounts(directory), rooms = new Map(), peers = new Map(), requests = new Map();
  const send = (ws, value) => { if (ws?.readyState === WebSocket.OPEN && ws.bufferedAmount < 512*1024) ws.send(JSON.stringify(value)); };
  const allowed = req => req.headers.origin === (origin || `http://${req.headers.host}`) || dev && ['http://localhost:4173','http://127.0.0.1:4173'].includes(req.headers.origin);
  const userRoom = id => [...rooms.values()].find(r => r.members.some(m => m?.user.id === id));
  const publicRoom = r => ({ code: r.code, host: r.host, config: r.config, status: r.game ? r.game.running ? 'playing' : 'ended' : 'waiting', reason: r.reason || '', deadline: r.deadline || null, members: r.members.map(m => m ? { id: m.user.id, name: m.user.name, faction: m.faction, ready: m.ready, connected: !!peers.get(m.user.id) } : null) });
  const roomNotice = r => r.members.forEach(m => m && send(peers.get(m.user.id), { type: 'room', room: publicRoom(r) }));
  function snapshot(r, ws, side, start = false) {
    send(ws, { type: start ? 'battle' : 'snapshot', config: { ...r.config, battleId: r.game.battleId }, seat: side, room: publicRoom(r), view: battleView(r.game, side, r.memory[side]) });
  }
  function end(r, winner, reason) {
    if (r.settled) return;
    r.game.winner = winner; r.game.running = false; r.game.paused = false;
    r.reason = reason; r.settled = true; r.expires = Date.now()+120000;
    accounts.settle(r.game.battleId, r.members.map(m => m.user), winner);
    r.members.forEach((m, side) => snapshot(r, peers.get(m.user.id), side));
    roomNotice(r);
  }
  function leave(id) {
    const r = userRoom(id); if (!r) return;
    const side = r.members.findIndex(m => m?.user.id === id);
    if (r.game?.running) end(r, 1-side, '对手认输退出');
    if (r.game) { r.members.forEach(m => send(peers.get(m.user.id), { type: 'room', room: null })); rooms.delete(r.code); }
    else { r.members[side] = null; if (!r.members.some(Boolean)) rooms.delete(r.code); else { r.host = r.members.findIndex(Boolean); roomNotice(r); } }
    send(peers.get(id), { type: 'room', room: null });
  }
  const server = createServer(async (req, res) => {
    const json = (status, data) => { res.writeHead(status, { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store' }); res.end(JSON.stringify(data)); };
    res.setHeader('X-Content-Type-Options','nosniff'); res.setHeader('X-Frame-Options','DENY'); res.setHeader('Referrer-Policy','same-origin');
    try {
      const url = new URL(req.url, 'http://local');
      if (url.pathname === '/api/health') return json(200, { ok: true, protocol: PROTOCOL_VERSION, rooms: rooms.size, battles: [...rooms.values()].filter(r => r.game?.running).length });
      if (url.pathname === '/api/session') {
        let user = accounts.find(req.headers.cookie);
        if (req.method === 'POST') {
          if (!allowed(req)) return json(403, { error:'请求来源不被允许' });
          const ip=req.socket.remoteAddress, now=Date.now(), entry=requests.get(ip);
          if(entry&&entry.until>now&&entry.count>=30)return json(429,{error:'操作过于频繁，请稍后再试'});
          requests.set(ip,entry&&entry.until>now?{...entry,count:entry.count+1}:{until:now+60000,count:1});
          if(requests.size>1000)for(const [key,value]of requests)if(value.until<=now)requests.delete(key);
          let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 1024) throw new Error('请求过大'); }
          const name = nickname(JSON.parse(body).name);
          if (user) { accounts.rename(user.id, name); user.name = name; }
          else {
            const created = accounts.create(name); user = created.user;
            res.setHeader('Set-Cookie', `gp_guest=${created.token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000${origin.startsWith('https:') ? '; Secure' : ''}`);
          }
        } else if (req.method !== 'GET') return json(405, { error:'不支持的请求' });
        return json(200, { user, room: user ? publicRoom(userRoom(user.id) || { code:null, config:null, members:[], host:0 }) : null });
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') return json(405, { error:'不支持的请求' });
      let file = resolve(root, '.'+decodeURIComponent(url.pathname));
      if (!file.startsWith(root+sep) && file !== root) return json(403, { error:'禁止访问' });
      if (url.pathname === '/downloads') { res.writeHead(302, { Location:'/downloads/', 'Cache-Control':'no-cache' }); return res.end(); }
      if (url.pathname === '/downloads/') file = resolve(root,'downloads/index.html');
      if (file === root) file = resolve(root,'index.html');
      const info = await stat(file); if (!info.isFile()) return json(404, { error:'文件不存在' });
      const types = { '.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.glb':'model/gltf-binary','.wav':'audio/wav','.mp3':'audio/mpeg','.json':'application/json','.zip':'application/zip' };
      res.writeHead(200, { 'Content-Type':types[extname(file)] || 'application/octet-stream', 'Content-Length':info.size, 'Cache-Control': extname(file)==='.html' ? 'no-cache' : 'public, max-age=3600' });
      if(req.method==='HEAD')res.end();else { const stream=createReadStream(file);stream.on('error',()=>res.destroy());stream.pipe(res); }
    } catch (error) { json(error.code === 'ENOENT' ? 404 : 400, { error:error.code === 'ENOENT' ? '文件不存在' : '请求无效' }); }
  });
  const wss = new WebSocketServer({ noServer:true, maxPayload:16384, perMessageDeflate:false });
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
    send(ws, { type:'hello', protocol:PROTOCOL_VERSION, user, room:resumed?publicRoom(resumed):null });
    if (resumed) { roomNotice(resumed); const side=resumed.members.findIndex(m=>m?.user.id===user.id); if (resumed.game) snapshot(resumed,ws,side,true); }
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
          if (!Object.hasOwn(MAPS,msg.mapId) || !Object.hasOwn(FACTIONS,msg.faction) || !Object.hasOwn(VICTORY_MODES,msg.victoryMode)) throw new Error('作战配置无效');
          let code; do { code=String(randomInt(100000,1000000)); } while (rooms.has(code));
          r={ code, host:0, config:{ mapId:msg.mapId, victoryMode:msg.victoryMode, battlefieldScale:1.5 }, members:[{ user,faction:msg.faction,ready:false },null], expires:now+600000, memory:[new Map(),new Map()], disconnects:0 };
          rooms.set(code,r); roomNotice(r);
        } else if (msg.type === 'join') {
          if (r) throw new Error('请先退出当前房间'); r=rooms.get(String(msg.code));
          if (!r || r.game || r.members.every(Boolean)) throw new Error('房间不存在、已满或已开战');
          if (!Object.hasOwn(FACTIONS,msg.faction)) throw new Error('阵营无效');
          side=r.members.findIndex(m=>!m); r.members[side]={ user,faction:msg.faction,ready:false }; r.expires=now+600000; roomNotice(r);
        } else if (msg.type === 'leave') leave(user.id);
        else if (msg.type === 'ping') send(ws,{ type:'pong',at:msg.at });
        else if (!r) throw new Error('请先创建或加入房间');
        else if (msg.type === 'ready' || msg.type === 'faction') {
          if (r.game) throw new Error('已经开战，不能修改部署');
          if (msg.type === 'faction') { if (!Object.hasOwn(FACTIONS,msg.faction)) throw new Error('阵营无效'); r.members[side].faction=msg.faction; r.members[side].ready=false; }
          else r.members[side].ready=msg.ready === true;
          r.expires=now+600000; roomNotice(r);
        } else if (msg.type === 'start') {
          if (r.game || side!==r.host || !r.members.every(m=>m?.ready&&peers.has(m.user.id))) throw new Error('双方准备完成后，由房主开战');
          if ([...rooms.values()].filter(v=>v.game?.running).length >= 4) throw new Error('战区繁忙，请稍后开战');
          r.game=new Game(r.members[0].faction,r.members[1].faction,{}, { ...r.config, multiplayer:true });
          r.members.forEach((m,s)=>snapshot(r,peers.get(m.user.id),s,true)); roomNotice(r);
        } else if (msg.type === 'command') {
          if (!Number.isSafeInteger(msg.seq) || msg.seq<=seq) return; seq=msg.seq;
          const ok = !!r.game && executeCommand(r.game,side,msg);
          send(ws,{ type:'ack',seq,ok,action:msg.action });
        } else throw new Error('未知请求');
      } catch (error) { send(ws,{ type:'error',message:error instanceof SyntaxError ? '指令格式无效' : error.message }); }
    });
    ws.on('close', () => { if (peers.get(user.id)!==ws) return; peers.delete(user.id); const r=userRoom(user.id); if(r) roomNotice(r); });
    ws.on('error', () => {});
  });
  let effectId=1, tick=0;
  const timer=setInterval(() => {
    const now=Date.now(); tick++;
    for (const [code,r] of rooms) {
      if (!r.game || !r.game.running) { if(r.expires<now) { r.members.forEach(m=>m&&send(peers.get(m.user.id),{type:'room',room:null})); rooms.delete(code); } continue; }
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
  server.on('close',()=>{clearInterval(timer);clearInterval(heartbeat);wss.clients.forEach(ws=>ws.terminate());wss.close();accounts.db.close();});
  return { server, rooms, accounts };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { server }=createBattleServer(); server.listen(Number(process.env.PORT||4180),process.env.HOST||'127.0.0.1',()=>console.log(`对战服务已启动，端口 ${process.env.PORT||4180}`));
}
