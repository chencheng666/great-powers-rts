import {WebSocket} from 'ws';
import {writeFile,mkdir,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const origin=process.argv[2]||'https://43.135.186.21:8443',out='releases/v1-qa',results=[];
await mkdir(out,{recursive:true});
const identities=JSON.parse(await readFile(`${out}/公网验收身份.json`,'utf8').catch(()=>'[]'));
for(const count of [2,6]){
  const prefix=count===6?'/candidate':'',clients=[],ids=[];let battleId;
  const wait=async(c,p)=>{const end=Date.now()+30000;while(Date.now()<end){const i=c.messages.findIndex(p);if(i>=0)return c.messages.splice(i,1)[0];const e=c.messages.find(m=>m.type==='error');if(e)throw Error(e.message);await new Promise(r=>setTimeout(r,15));}throw Error('公网消息等待超时');};
  const send=(c,m)=>c.ws.send(JSON.stringify(m));
  try{
    for(let i=0;i<count;i++){
      const r=await fetch(origin+prefix+'/api/session',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({name:`验收V1-${count}-${i}`}),signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('公网身份请求失败');const user=(await r.json()).user,cookie=r.headers.get('set-cookie').split(';')[0];ids.push(user.id);
      let c;
      for(let attempt=0;attempt<3;attempt++){
        const ws=new WebSocket(origin.replace('https:','wss:').replace('http:','ws:')+prefix+'/battle-socket',{headers:{Origin:origin,Cookie:cookie}});c={ws,messages:[]};ws.on('message',b=>c.messages.push(JSON.parse(b)));ws.on('error',e=>c.messages.push({type:'error',message:e.message}));
        try{if((await wait(c,m=>m.type==='hello')).protocol!==(count===6?3:2))throw Error('公网协议不匹配');break;}
        catch(error){ws.terminate();if(attempt===2)throw error;await new Promise(r=>setTimeout(r,1000));}
      }
      clients.push(c);
      if(i===0&&count===6)await writeFile(`${out}/公网六方浏览器验收会话.json`,JSON.stringify({cookie,id:user.id}),{mode:0o600});
    }
    const host=clients[0];send(host,{type:'create',mapId:count===6?'sixfront':'valley',victoryMode:'quick',faction:'china',allowSpectators:count===6});const code=(await wait(host,m=>m.type==='room'&&m.room?.code)).room.code;
    for(let i=1;i<count;i++){send(clients[i],{type:'join',code,faction:'china'});await wait(clients[i],m=>m.type==='room'&&m.room?.members.filter(Boolean).length===i+1);}
    clients.forEach(c=>send(c,{type:'ready',ready:true}));await wait(host,m=>m.type==='room'&&m.room?.members.every(v=>v?.ready));send(host,{type:'start'});
    const starts=await Promise.all(clients.map(c=>wait(c,m=>m.type==='battle')));battleId=starts[0].config.battleId;if(new Set(starts.map(s=>s.config.battleId)).size!==1)throw Error('战局编号不一致');
    const unit=starts[0].view.units.find(u=>u.owner===0&&u.type==='tank');send(host,{type:'command',action:'move',selected:[unit.id],x:unit.x+140,y:unit.y+120,seq:1});if(!(await wait(host,m=>m.type==='ack'&&m.seq===1)).ok)throw Error('公网移动被拒绝');
    await wait(host,m=>m.type==='snapshot'&&m.view.units.some(u=>u.id===unit.id&&Math.hypot(u.x-unit.x,u.y-unit.y)>10));
    send(clients.at(-1),{type:'leave'});
    if(count===6)await wait(host,m=>m.type==='snapshot'&&m.view.running&&m.view.players.some(p=>p.actualSide===5&&p.eliminated));
    for(let i=1;i<count-1;i++)send(clients[i],{type:'leave'});
    const ended=await wait(host,m=>m.type==='snapshot'&&!m.view.running&&m.view.battleReport);if(ended.view.winner!==0||ended.view.battleReport.sides.length!==count)throw Error('结算视图错误');
    results.push({players:count,protocol:count===6?3:2,sameBattle:true,movement:true,independentElimination:count===6,reportSides:ended.view.battleReport.sides.length,compression:host.ws.extensions||'none'});
  }finally{
    identities.push({directory:count===6?'six':'main',ids,battleId});await writeFile(`${out}/公网验收身份.json`,JSON.stringify(identities),{mode:0o600});
    for(const c of clients){if(c.ws.readyState===1)send(c,{type:'leave'});c.ws.close();}
  }
}
await writeFile(`${out}/公网双人与六方验收.json`,JSON.stringify({results,checks:[]},null,2));console.log({results});
const checks=[];
for(const[local,path]of [['dist/index.html','/'],['dist/assets/index-DIfc6EZ-.js','/assets/index-DIfc6EZ-.js'],['dist/official/index.html','/official/']]){
  const r=await fetch(origin+path,{signal:AbortSignal.timeout(120000)});if(!r.ok)throw Error(`文件请求失败：${path}`);const sha=b=>createHash('sha256').update(b).digest('hex'),remote=sha(Buffer.from(await r.arrayBuffer())),expected=sha(await readFile(local));if(remote!==expected)throw Error(`文件不一致：${path}`);checks.push({path,sha256:remote,match:true});
}
await writeFile(`${out}/公网双人与六方验收.json`,JSON.stringify({results,checks},null,2));console.log({results,checks});
