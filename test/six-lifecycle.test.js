import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {WebSocket} from 'ws';
import {createBattleServer} from '../server/index.mjs';

async function harness(t){
 const directory=await mkdtemp(join(tmpdir(),'gp-six-lifecycle-'));
 const app=createBattleServer({directory,maxPlayers:6,dev:false});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
 const origin=`http://127.0.0.1:${app.server.address().port}`,clients=[];
 t.after(async()=>{clients.forEach(c=>c.ws.terminate());await new Promise(r=>app.server.close(r));await rm(directory,{recursive:true,force:true});});
 async function wait(c,p){const deadline=Date.now()+6000;while(Date.now()<deadline){const i=c.messages.findIndex(p);if(i>=0)return c.messages.splice(i,1)[0];await new Promise(r=>setTimeout(r,10));}throw Error('lifecycle message timeout');}
 async function connect(cookie){const ws=new WebSocket(origin.replace('http:','ws:')+'/battle-socket',{headers:{Origin:origin,Cookie:cookie}}),messages=[];ws.on('message',b=>messages.push(JSON.parse(b)));const c={ws,messages,cookie};clients.push(c);await wait(c,m=>m.type==='hello');return c;}
 async function guest(name){const res=await fetch(origin+'/api/session',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({name})});assert.equal(res.status,200);return connect(res.headers.get('set-cookie').split(';')[0]);}
 const send=(c,m)=>c.ws.send(JSON.stringify(m));
 async function start(mode='quick'){const host=await guest('生命周期房主');send(host,{type:'create',mapId:'sixfront',victoryMode:mode,faction:'china',allowSpectators:true});const code=(await wait(host,m=>m.type==='room'&&m.room?.code)).room.code;for(let seat=1;seat<6;seat++){send(host,{type:'set-ai',seat,faction:'china'});await wait(host,m=>m.type==='room'&&m.room.members[seat]?.controlType==='ai');}send(host,{type:'ready',ready:true});await wait(host,m=>m.type==='room'&&m.room.members.every(m=>m?.ready));send(host,{type:'start'});await wait(host,m=>m.type==='battle');return {host,code,room:app.rooms.get(code)};}
 return {app,wait,connect,guest,send,start};
}

test('等待房间房主退出后真人接管，旧房主不能修改AI',async t=>{
 const h=await harness(t),a=await h.guest('原房主'),b=await h.guest('新房主');
 h.send(a,{type:'create',mapId:'sixfront',victoryMode:'quick',faction:'china'});const code=(await h.wait(a,m=>m.type==='room'&&m.room?.code)).room.code;
 h.send(b,{type:'join',code,faction:'nato'});await h.wait(b,m=>m.type==='room'&&m.room.members[1]);h.send(a,{type:'leave'});await h.wait(b,m=>m.type==='room'&&m.room.host===1);
 h.send(a,{type:'set-ai',seat:2,faction:'china'});await h.wait(a,m=>m.type==='error');assert.equal(h.app.rooms.get(code).members[2],null);
 h.send(b,{type:'set-ai',seat:2,faction:'china'});await h.wait(b,m=>m.type==='room'&&m.room.members[2]?.controlType==='ai');
});

for(const mode of ['quick','annihilation','control'])test(`六人真实网络${mode}胜利与一次性结算`,async t=>{
 const h=await harness(t),{host,room}=await h.start(mode),g=room.game;g.paused=true;
 if(mode==='control')g.players[0].controlScore=240;
 else{g.buildings=g.buildings.filter(b=>b.owner===0);if(mode==='annihilation'){g.checkVictory();assert.equal(g.running,true);assert.equal(g.players.filter(p=>p.eliminated).length,0);g.units=g.units.filter(u=>u.owner===0);}}
 const result=await h.wait(host,m=>m.type==='snapshot'&&!m.view.running);assert.equal(result.view.winner,0);assert.equal(g.winner,0);assert.equal(h.app.accounts.db.prepare('SELECT count(*) n FROM multi_matches').get().n,1);
 assert.equal(h.app.accounts.settleMany(g.battleId,room.members.map(m=>({...m.user,controlType:m.controlType})),0),false);
});

test('八名观战上限、观战重连及最后观战者掉线后释放无人AI战局',async t=>{
 const h=await harness(t),{host,code,room}=await h.start(),observers=[];
 for(let i=0;i<8;i++){const c=await h.guest('观战'+i);observers.push(c);h.send(c,{type:'observe',code,follow:i%6});await h.wait(c,m=>m.type==='battle'&&m.spectator);}
 const ninth=await h.guest('观战超限');h.send(ninth,{type:'observe',code,follow:0});await h.wait(ninth,m=>m.type==='error');assert.equal(room.spectators.size,8);
 observers[0].ws.terminate();const resumed=await h.connect(observers[0].cookie);const re=await h.wait(resumed,m=>m.type==='battle'&&m.spectator);assert.equal(re.config.battleId,room.game.battleId);assert.equal(re.view.players[0].credits,0);
 h.send(host,{type:'leave'});await h.wait(host,m=>m.type==='room'&&!m.room);assert.equal(room.game.running,true);
 for(const c of [...observers.slice(1),resumed])c.ws.terminate();
 const end=Date.now()+3000;while(h.app.rooms.has(code)&&Date.now()<end)await new Promise(r=>setTimeout(r,20));assert.equal(h.app.rooms.has(code),false);assert.equal(h.app.accounts.db.prepare('SELECT winner FROM multi_matches').get().winner,'abandoned');
});
