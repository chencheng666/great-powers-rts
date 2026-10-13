import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WebSocket } from 'ws';
import { createBattleServer } from '../server/index.mjs';

async function fixture(t) {
  const directory=await mkdtemp(join(tmpdir(),'gp-six-release-')),app=createBattleServer({directory,maxPlayers:6,dev:false}),clients=[];
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${app.server.address().port}`;
  t.after(async()=>{clients.forEach(c=>c.ws.terminate());await new Promise(r=>app.server.close(r));await rm(directory,{recursive:true,force:true});});
  const send=(c,m)=>c.ws.send(JSON.stringify(m));
  const wait=async(c,p)=>{const end=Date.now()+6000;while(Date.now()<end){const i=c.messages.findIndex(p);if(i>=0)return c.messages.splice(i,1)[0];await new Promise(r=>setTimeout(r,10));}throw Error('六方发行验收消息超时');};
  async function guest(name){const r=await fetch(origin+'/api/session',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({name})});assert.equal(r.status,200);const cookie=r.headers.get('set-cookie').split(';')[0],ws=new WebSocket(origin.replace('http:','ws:')+'/battle-socket',{headers:{Origin:origin,Cookie:cookie}}),messages=[];ws.on('message',b=>messages.push(JSON.parse(b)));const c={ws,messages};clients.push(c);c.user=(await wait(c,m=>m.type==='hello')).user;return c;}
  return {app,send,wait,guest};
}

test('六方房主离场后交接真人席位、旧房主失权；重复序号不重放，观战断线释放名额',async t=>{
  const {app,send,wait,guest}=await fixture(t),a=await guest('交接房主'),b=await guest('接任房主');
  assert.match(a.ws.extensions,/permessage-deflate/);assert.match(b.ws.extensions,/permessage-deflate/);
  send(a,{type:'create',mapId:'sixfront',victoryMode:'quick',faction:'china',allowSpectators:true});const code=(await wait(a,m=>m.type==='room'&&m.room?.code)).room.code;
  send(b,{type:'join',code,faction:'china'});await wait(b,m=>m.type==='room'&&m.room.members[1]);send(a,{type:'leave'});await wait(b,m=>m.type==='room'&&m.room.host===1);const room=app.rooms.get(code);
  send(a,{type:'set-ai',seat:0,faction:'russia'});await wait(a,m=>m.type==='error');assert.equal(room.members[0],null);
  for(const seat of [0,2,3,4,5]){send(b,{type:'set-ai',seat,faction:'china'});await wait(b,m=>m.type==='room'&&m.room.members[seat]?.controlType==='ai');}
  send(b,{type:'ready',ready:true});await wait(b,m=>m.type==='room'&&m.room.members.every(v=>v?.ready));send(b,{type:'start'});await wait(b,m=>m.type==='battle');
  const u=room.game.ownedUnits(1,'tank')[0],first={type:'command',action:'move',selected:[u.id],x:u.x+150,y:u.y+150,seq:7};
  send(b,first);assert.equal((await wait(b,m=>m.type==='ack'&&m.seq===7)).ok,true);send(b,{...first,x:u.x-150,seq:7});send(b,{type:'ping',at:17});await wait(b,m=>m.type==='pong'&&m.at===17);assert.equal(u.order.x,first.x);
  const observers=[];for(let i=0;i<8;i++){const c=await guest(`观战${i}`);send(c,{type:'observe',code,follow:1});assert.equal((await wait(c,m=>m.type==='battle')).view.players[0].credits,0);observers.push(c);}
  const extra=await guest('满额观战');send(extra,{type:'observe',code,follow:1});await wait(extra,m=>m.type==='error');assert.equal(room.spectators.size,8);
  observers[0].ws.terminate();for(let i=0;i<100&&room.spectators.size!==7;i++)await new Promise(r=>setTimeout(r,10));assert.equal(room.spectators.size,7);send(extra,{type:'observe',code,follow:1});await wait(extra,m=>m.type==='battle');assert.equal(room.spectators.size,8);
});

test('六方快速、歼灭、据点三规则均由服务端结算一次，旧双人表不被污染',async t=>{
  const {app,send,wait,guest}=await fixture(t),host=await guest('三规则验收');
  for(const [index,mode]of ['quick','annihilation','control'].entries()){
    host.messages.length=0;
    send(host,{type:'create',mapId:'sixfront',victoryMode:mode,faction:'china'});const code=(await wait(host,m=>m.type==='room'&&m.room?.code)).room.code;
    for(let seat=1;seat<6;seat++){send(host,{type:'set-ai',seat,faction:'china'});await wait(host,m=>m.type==='room'&&m.room?.members[seat]);}
    send(host,{type:'ready',ready:true});await wait(host,m=>m.type==='room'&&m.room?.members.every(v=>v?.ready));send(host,{type:'start'});await wait(host,m=>m.type==='battle');const g=app.rooms.get(code).game;
    if(mode==='control')g.players[0].controlScore=240;
    else{g.buildings=g.buildings.filter(b=>b.owner===0);if(mode==='annihilation'){g.units=g.units.filter(u=>u.owner===0);g.players.slice(1).forEach(p=>p.eliminated=false);}}
    await wait(host,m=>m.type==='snapshot'&&!m.view.running);assert.equal(g.winner,0);
    assert.equal(app.accounts.db.prepare('SELECT count(*) n FROM multi_matches').get().n,index+1);
    send(host,{type:'leave'});await wait(host,m=>m.type==='room'&&!m.room);
  }
  assert.equal(app.accounts.db.prepare('SELECT count(*) n FROM matches').get().n,0);
});
