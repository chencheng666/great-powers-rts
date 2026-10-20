import { WebSocket } from 'ws';
import { writeFile,mkdir,readFile,readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { PROTOCOL_VERSION,SIX_PROTOCOL_VERSION } from '../src/network-protocol.js';
import { GAME_VERSION } from '../src/version.js';

const origin=process.argv[2]||'https://43.135.186.21:8443',out=`releases/v${GAME_VERSION}-online`,results=[],identities=[],checks=[];
await mkdir(out,{recursive:true});
const wait=async(c,p)=>{const end=Date.now()+45000;while(Date.now()<end){const i=c.messages.findIndex(p);if(i>=0)return c.messages.splice(i,1)[0];const error=c.messages.find(m=>m.type==='error');if(error)throw Error(error.message);await new Promise(r=>setTimeout(r,20));}throw Error('公网验收消息超时');};
const send=(c,m)=>c.ws.send(JSON.stringify(m));
for(const count of [2,6]){
  const prefix=count===6?'/candidate':'',protocol=count===6?SIX_PROTOCOL_VERSION:PROTOCOL_VERSION,clients=[],ids=[];let battleId;
  const health=await(await fetch(origin+prefix+'/api/health',{signal:AbortSignal.timeout(20000)})).json();
  if(health.version!==GAME_VERSION||health.protocol!==protocol||health.maxPlayers!==count)throw Error('公网版本或协议不匹配');
  if(health.battles)throw Error('已有玩家对局，暂停本轮公网开局验收');
  try{
    for(let i=0;i<count;i++){
      const response=await fetch(origin+prefix+'/api/session',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({name:`发布验收-${count}-${i}`}),signal:AbortSignal.timeout(20000)});
      if(!response.ok)throw Error('公网游客身份创建失败');const user=(await response.json()).user,cookie=response.headers.get('set-cookie').split(';')[0];ids.push(user.id);
      const ws=new WebSocket(origin.replace('https:','wss:').replace('http:','ws:')+prefix+'/battle-socket',{headers:{Origin:origin,Cookie:cookie}}),c={ws,messages:[]};clients.push(c);
      ws.on('message',b=>c.messages.push(JSON.parse(b)));ws.on('error',e=>c.messages.push({type:'error',message:e.message}));
      if((await wait(c,m=>m.type==='hello')).protocol!==protocol)throw Error('WebSocket 协议不符');
    }
    const host=clients[0];send(host,{type:'create',mapId:count===6?'sixfront':'strategic',victoryMode:'quick',faction:'china',nuclearEnabled:count===2,allowSpectators:count===6});const room=(await wait(host,m=>m.type==='room'&&m.room?.code)).room;
    for(let i=1;i<count;i++){send(clients[i],{type:'join',code:room.code,faction:'china'});await wait(clients[i],m=>m.type==='room'&&m.room.members.filter(Boolean).length===i+1);}
    clients.forEach(c=>send(c,{type:'ready',ready:true,nuclearConsent:count===2}));await wait(host,m=>m.type==='room'&&m.room.members.every(v=>v?.ready));send(host,{type:'start'});
    const starts=await Promise.all(clients.map(c=>wait(c,m=>m.type==='battle')));battleId=starts[0].config.battleId;
    if(new Set(starts.map(s=>s.config.battleId)).size!==1)throw Error('同局校验失败');
    if(count===2&&!starts.every(s=>s.config.nuclearEnabled))throw Error('核规则同步失败');
    const unit=starts[0].view.units.find(u=>u.owner===0&&u.type==='tank');send(host,{type:'command',action:'move',selected:[unit.id],x:unit.x+160,y:unit.y+120,seq:1});if(!(await wait(host,m=>m.type==='ack'&&m.seq===1)).ok)throw Error('公网移动指令被拒绝');
    await wait(host,m=>m.type==='snapshot'&&m.view.units.some(u=>u.id===unit.id&&Math.hypot(u.x-unit.x,u.y-unit.y)>10));
    for(const[seq,stance]of [[2,'guard'],[3,'ceasefire'],[4,'free']]){
      send(host,{type:'command',action:'combat-stance',selected:[unit.id],stance,seq});if(!(await wait(host,m=>m.type==='ack'&&m.seq===seq)).ok)throw Error('公网交战姿态被拒绝');
      await wait(host,m=>m.type==='snapshot'&&m.view.units.some(u=>u.id===unit.id&&u.combatStance===stance));
    }
    const route={x:unit.x+300,y:unit.y+180};send(host,{type:'command',action:'move',selected:[unit.id],...route,seq:5});if(!(await wait(host,m=>m.type==='ack'&&m.seq===5)).ok)throw Error('公网航点起点被拒绝');
    send(host,{type:'command',action:'move',selected:[unit.id],x:unit.x+400,y:unit.y+260,append:true,seq:6});if(!(await wait(host,m=>m.type==='ack'&&m.seq===6)).ok)throw Error('公网追加航点被拒绝');
    await wait(host,m=>m.type==='snapshot'&&m.view.units.some(u=>u.id===unit.id&&u.orderQueue?.length===1));
    send(clients[1],{type:'command',action:'combat-stance',selected:[unit.id],stance:'ceasefire',seq:1});if((await wait(clients[1],m=>m.type==='ack'&&m.seq===1)).ok)throw Error('敌方可以操纵我方交战姿态');
    send(host,{type:'command',action:'clear-waypoints',selected:[unit.id],seq:7});if(!(await wait(host,m=>m.type==='ack'&&m.seq===7)).ok)throw Error('公网清空航点被拒绝');
    await wait(host,m=>m.type==='snapshot'&&m.view.units.some(u=>u.id===unit.id&&u.orderQueue?.length===0));
    if(count===2){send(host,{type:'command',action:'nuclear',x:3000,y:1800,seq:8});if((await wait(host,m=>m.type==='ack'&&m.seq===8)).ok)throw Error('无前置核指令未被拒绝');}
    send(clients.at(-1),{type:'leave'});
    if(count===6)await wait(host,m=>m.type==='snapshot'&&m.view.running&&m.view.players.some(p=>p.actualSide===5&&p.eliminated));
    for(let i=1;i<count-1;i++)send(clients[i],{type:'leave'});
    const ended=await wait(host,m=>m.type==='snapshot'&&!m.view.running&&m.view.battleReport);
    if(ended.view.winner!==0||ended.view.battleReport.sides.length!==count)throw Error('公网结算视图错误');
    results.push({players:count,protocol,sameBattle:true,movement:true,combatStance:true,queuedWaypoints:true,opponentCommandRejected:true,nuclearConsent:count===2?true:null,invalidNuclearRejected:count===2?true:null,independentElimination:count===6?true:null,reportSides:count,compression:host.ws.extensions||'none'});
  }finally{
    identities.push({directory:count===6?'six':'main',ids,battleId});await writeFile(`${out}/identities.json`,JSON.stringify(identities,null,2),{mode:0o600});
    for(const c of clients){if(c.ws.readyState===1)send(c,{type:'leave'});c.ws.close();}
  }
}
const js=(await readdir('dist/assets')).filter(f=>/^index-.*\.js$/.test(f));if(js.length!==1)throw Error('不能唯一确定网页入口');
await writeFile(`${out}/report.json`,JSON.stringify({version:GAME_VERSION,results,checks,filesComplete:false},null,2));
const manifest=JSON.parse(await readFile('dist/downloads/manifest.json','utf8')),archive=manifest.files.find(f=>f.name===`packages/Great-Powers-RTS-v${GAME_VERSION}.zip`);
for(const path of ['/',`/assets/${js[0]}`,'/official/','/downloads/manifest.json',`/downloads/${archive.name}`]){
  const local=path==='/'?'dist/index.html':path==='/official/'?'dist/official/index.html':'dist'+path;
  if(path.endsWith('.zip')&&!process.argv.includes('--full-download')){
    const head=await fetch(origin+path,{method:'HEAD',signal:AbortSignal.timeout(30000)});
    if(!head.ok||Number(head.headers.get('content-length'))!==archive.size)throw Error('公网下载大小不符');
    const sample=await fetch(origin+path,{headers:{Range:'bytes=0-65535'},signal:AbortSignal.timeout(30000)}),bytes=Buffer.from(await sample.arrayBuffer()),expected=(await readFile(local)).subarray(0,65536);
    const sha=b=>createHash('sha256').update(b).digest('hex');
    if(sample.status!==206||sample.headers.get('content-range')!==`bytes 0-65535/${archive.size}`||bytes.length!==65536||sha(bytes)!==sha(expected))throw Error('公网分段下载校验失败');
    checks.push({path,mode:'range',size:archive.size,bytes:65536,sha256:sha(bytes),match:true,fullDownload:false});
    await writeFile(`${out}/report.json`,JSON.stringify({version:GAME_VERSION,results,checks,filesComplete:false},null,2));continue;
  }
  const response=await fetch(origin+path,{signal:AbortSignal.timeout(180000)});if(!response.ok)throw Error('下载或网页请求失败：'+path);
  const sha=b=>createHash('sha256').update(b).digest('hex'),remote=sha(Buffer.from(await response.arrayBuffer())),expected=sha(await readFile(local));
  if(remote!==expected||path.endsWith('.zip')&&remote!==archive.sha256)throw Error('公网文件校验失败：'+path);checks.push({path,mode:'full',sha256:remote,match:true});
  await writeFile(`${out}/report.json`,JSON.stringify({version:GAME_VERSION,results,checks,filesComplete:false},null,2));
}
await writeFile(`${out}/report.json`,JSON.stringify({version:GAME_VERSION,results,checks,filesComplete:true},null,2));console.log({version:GAME_VERSION,results,checks});
