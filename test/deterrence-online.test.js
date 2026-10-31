import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WebSocket } from 'ws';
import { createBattleServer } from '../server/index.mjs';

test('双客户端必须各自确认核规则，权威服务端验证发射、同步警报并保留迷雾',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'gp-nuclear-')),app=createBattleServer({directory}),clients=[];
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${app.server.address().port}`;
  t.after(async()=>{clients.forEach(c=>c.ws.terminate());await new Promise(r=>app.server.close(r));await rm(directory,{recursive:true,force:true});});
  const wait=async(c,p)=>{const end=Date.now()+6000;while(Date.now()<end){const i=c.messages.findIndex(p);if(i>=0)return c.messages.splice(i,1)[0];await new Promise(r=>setTimeout(r,10));}throw Error('等待核对抗消息超时');};
  const send=(c,m)=>c.ws.send(JSON.stringify(m));
  for(const name of ['核规则验收甲','核规则验收乙']) {
    const response=await fetch(origin+'/api/session',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({name})});
    const cookie=response.headers.get('set-cookie').split(';')[0],ws=new WebSocket(origin.replace('http:','ws:')+'/battle-socket',{headers:{Origin:origin,Cookie:cookie}}),c={ws,messages:[]};
    ws.on('message',b=>c.messages.push(JSON.parse(b)));clients.push(c);await wait(c,m=>m.type==='hello');
  }
  const [a,b]=clients;
  send(a,{type:'create',mapId:'meridian',faction:'nato',victoryMode:'annihilation',nuclearEnabled:true});assert.match((await wait(a,m=>m.type==='error')).message,/常规双人/);
  send(a,{type:'create',mapId:'archipelago',faction:'nato',victoryMode:'annihilation',nuclearEnabled:true});const room=(await wait(a,m=>m.type==='room')).room;assert.equal(room.config.nuclearEnabled,true);
  send(b,{type:'join',code:room.code,faction:'china'});await wait(b,m=>m.type==='room');
  send(a,{type:'ready',ready:true});assert.match((await wait(a,m=>m.type==='error')).message,/确认核威慑/);assert.equal(app.rooms.get(room.code).members[0].ready,false);
  send(a,{type:'ready',ready:true,nuclearConsent:true});send(b,{type:'ready',ready:true,nuclearConsent:true});await wait(a,m=>m.type==='room'&&m.room.members.every(v=>v?.ready));send(a,{type:'start'});
  const first=await wait(a,m=>m.type==='battle'),second=await wait(b,m=>m.type==='battle');assert.equal(first.config.battleId,second.config.battleId);assert.equal(second.config.nuclearEnabled,true);
  send(b,{type:'command',action:'nuclear',x:3000,y:1800,seq:1});assert.equal((await wait(b,m=>m.type==='ack')).ok,false);
  const g=app.rooms.get(room.code).game;
  for(const type of ['lab','radar','nuclearSilo'])g.addBuilding(0,type,900,1800);for(let i=0;i<6;i++)g.addBuilding(0,'power',1200,2100+i*100);
  g.players[0].credits=10000;g.players[0].nuclearCharge=240;g.players[0].satelliteUntil=g.time+30;g.recalculatePower();g.updateFog();
  const secret=g.addUnit(0,'tank',1500,1500);send(a,{type:'command',action:'nuclear',x:3000,y:1800,seq:1});assert.equal((await wait(a,m=>m.type==='ack')).ok,true);
  const warning=await wait(b,m=>m.type==='snapshot'&&m.view.nuclearWarnings?.length);assert.equal(warning.view.units.some(u=>u.id===secret.id),false);assert.equal(warning.view.players[1].credits,0);assert.ok(warning.view.nuclearWarnings[0].remaining>20);
  const cost=g.players[0].credits;send(a,{type:'command',action:'nuclear',x:3200,y:1800,seq:2});assert.equal((await wait(a,m=>m.type==='ack'&&m.seq===2)).ok,false);assert.ok(g.players[0].credits-cost<100);
  g.players[0].nuclearPending.launchAt=g.time;g.updateDeterrence(0);assert.equal(g.players[0].nuclearSpent,true);
  const flight=await wait(b,m=>m.type==='snapshot'&&m.view.projectiles.some(p=>p.kind==='nuclear'));assert.ok(flight.view.nuclearWarnings.some(w=>w.phase==='flight'));assert.equal(flight.view.projectiles.find(p=>p.kind==='nuclear').sourceId,null);
});
