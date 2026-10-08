import { WebSocket } from 'ws';
const origin=process.env.TEST_ORIGIN||'http://localhost:4180';
const response=await fetch(`${origin}/api/session`,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({name:'联网验收对手'})});
if(!response.ok)throw new Error('测试身份创建失败');
const cookie=response.headers.get('set-cookie').split(';')[0];
const ws=new WebSocket(origin.replace('http','ws')+'/battle-socket',{headers:{Origin:origin,Cookie:cookie}});
ws.on('message',raw=>{
  const m=JSON.parse(raw);
  if(m.type==='hello')ws.send(JSON.stringify({type:'join',code:process.argv[2],faction:'nato'}));
  if(m.type==='room'&&m.room?.status==='waiting'&&m.room.members.some(p=>p&&!p.ready&&p.name==='联网验收对手'))ws.send(JSON.stringify({type:'ready',ready:true}));
  if(m.type==='battle'){console.log('第二席位已进入同一战局');ws.send(JSON.stringify({type:'command',action:'build',unitType:'power',seq:1}));}
  if(m.type==='error')console.log(m.message);
});
const timer=setTimeout(()=>{ws.send(JSON.stringify({type:'leave'}));ws.close();},180000);
ws.on('close',()=>{clearTimeout(timer);console.log('测试对手已退出');});
process.on('SIGINT',()=>{clearTimeout(timer);if(ws.readyState===1)ws.send(JSON.stringify({type:'leave'}));ws.close();});
