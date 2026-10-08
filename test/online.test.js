import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WebSocket } from 'ws';
import { Game } from '../src/game.js';
import { OnlineGame } from '../src/online-game.js';
import { battleView } from '../server/battle-view.mjs';
import { executeCommand } from '../server/commands.mjs';
import { createBattleServer } from '../server/index.mjs';
import { nickname,packFog,unpackFog } from '../src/network-protocol.js';

test('昵称校验和迷雾位压缩不丢失可见或探索状态',()=>{
  assert.equal(nickname('  CAI  '),'CAI');assert.throws(()=>nickname('<script>'));assert.throws(()=>nickname('a'.repeat(17)));
  const fog={cols:5,rows:3,visible:Array.from({length:15},(_,i)=>i%3===0),explored:Array.from({length:15},(_,i)=>i%2===0)};
  assert.deepEqual(unpackFog(packFog(fog)),fog);
});
test('联机双方建设等待手动部署，无人工智能替敌方生产和下令',()=>{
  const g=new Game('china','china',{}, {multiplayer:true});
  assert.equal(g.startBuild(1,'power'),true);g.players[1].credits=10000;
  for(let i=0;i<800;i++)g.update(.05);
  assert.equal(g.players[1].readyBuilding,'power');assert.equal(g.ownedBuildings(1,'power').length,1);
  assert.equal(g.players[1].buildQueue,null);assert.equal(g.placeBuilding(1,'super',g.world.width-320,900),false);
  assert.equal(g.startBuild(1,'power'),false);assert.equal(g.cancelBuilding(1),true);assert.equal(g.players[1].readyBuilding,null);
});
test('服务端拒绝伪造实体、免费建筑和任意坐标，并支持第二席位下令',()=>{
  const g=new Game('china','china',{}, {multiplayer:true}),u=g.ownedUnits(1,'tank')[0],enemy=g.ownedUnits(0,'tank')[0];
  assert.equal(executeCommand(g,1,{action:'move',selected:[enemy.id],x:400,y:600}),false);assert.equal(enemy.order,null);
  assert.equal(executeCommand(g,1,{action:'place',unitType:'super',x:200,y:200}),false);
  assert.equal(executeCommand(g,1,{action:'move',selected:[u.id],x:NaN,y:600}),false);
  assert.equal(executeCommand(g,1,{action:'move',selected:[u.id],x:g.world.width-700,y:600}),true);assert.equal(u.order.type,'move');
  assert.equal(executeCommand(g,1,{action:'credits',amount:99999}),false);
});
test('联机快照不泄漏敌方隐蔽单位、资金、生产队列和迷雾',()=>{
  const g=new Game('china','nato',{}, {multiplayer:true});
  const v=battleView(g,0),other=battleView(g,1);
  assert.equal(v.units.some(u=>u.owner===1),false);assert.equal(v.buildings.some(b=>b.owner===1),false);
  assert.equal(v.players[1].credits,0);assert.equal(v.players[1].buildQueue,null);assert.equal(v.fogs,undefined);
  assert.equal(other.players[0].faction,'nato');assert.equal(other.units[0].owner,0);assert.deepEqual(unpackFog(v.fog),g.fogs[0]);
});
test('第二席位客户端只发指令，不模拟战斗；新快照解除已拆除的炸弹标记',async()=>{
  const server=new Game('china','nato',{}, {multiplayer:true,mapId:'ocean',battlefieldScale:1.5}),messages=[];
  const payload=()=>({seat:1,config:{mapId:'ocean',battleId:server.battleId,victoryMode:'quick',battlefieldScale:1.5},view:battleView(server,1)});
  const g=new OnlineGame(payload(),{}, {send:value=>{messages.push(value);return true;}});
  const hq=server.ownedBuildings(1,'hq')[0];hq.sabotage={owner:0,plantedAt:0,detonateAt:45};g.apply(payload());assert.ok(g.getEntity(hq.id).sabotage);
  delete hq.sabotage;g.apply(payload());assert.equal(g.getEntity(hq.id).sabotage,undefined);
  const before=g.time;g.update(.05);assert.equal(g.time,before);g.paused=true;assert.equal(g.paused,false);
  g.startBuild(0,'power');assert.equal(messages[0].type,'command');assert.equal(messages[0].unitType,'power');
  const left=server.ownedUnits(1)[0].x;assert.ok(left>g.world.width/2);assert.ok(g.homeX>g.world.width/2);
  messages.length=0;g.ownedUnits(0).forEach(u=>g.requestResupply(u));await Promise.resolve();
  assert.equal(messages.length,1);assert.equal(messages[0].action,'group-resupply');assert.equal(messages[0].selected.length,g.ownedUnits(0).length);
});
test('两个游客建房准备、权威对战、重连暂停和认输只结算一次',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'great-powers-online-')), app=createBattleServer({directory});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));const host=`127.0.0.1:${app.server.address().port}`,origin=`http://${host}`,sockets=[];
  t.after(async()=>{sockets.forEach(s=>s.terminate());await new Promise(resolve=>app.server.close(resolve));await rm(directory,{recursive:true,force:true});});
  async function guest(name){const r=await fetch(`${origin}/api/session`,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({name})});assert.equal(r.status,200);return {cookie:r.headers.get('set-cookie').split(';')[0],user:(await r.json()).user};}
  const a=await guest('测试甲'),b=await guest('测试乙');
  function connect(user){const ws=new WebSocket(`ws://${host}/battle-socket`,{headers:{Origin:origin,Cookie:user.cookie}});sockets.push(ws);const messages=[];ws.on('message',raw=>messages.push(JSON.parse(raw)));return {ws,messages};}
  const first=connect(a),second=connect(b);
  async function wait(client,predicate){const end=Date.now()+5000;while(Date.now()<end){const index=client.messages.findIndex(predicate);if(index>=0)return client.messages.splice(index,1)[0];await new Promise(r=>setTimeout(r,15));}throw new Error('等待消息超时');}
  const send=(client,value)=>client.ws.send(JSON.stringify(value));
  await wait(first,m=>m.type==='hello');await wait(second,m=>m.type==='hello');
  send(first,{type:'create',mapId:'valley',victoryMode:'quick',faction:'china'});const code=(await wait(first,m=>m.type==='room')).room.code;
  send(second,{type:'join',code,faction:'nato'});await wait(second,m=>m.type==='room');
  send(first,{type:'start'});await wait(first,m=>m.type==='error');
  send(first,{type:'ready',ready:true});send(second,{type:'ready',ready:true});await wait(first,m=>m.type==='room'&&m.room.members.every(p=>p?.ready));
  send(first,{type:'start'});const va=await wait(first,m=>m.type==='battle'),vb=await wait(second,m=>m.type==='battle');
  assert.equal(va.config.battleId,vb.config.battleId);assert.equal(vb.view.players[0].faction,'nato');
  send(second,{type:'command',action:'build',unitType:'power',seq:1});assert.equal((await wait(second,m=>m.type==='ack')).ok,true);
  const g=app.rooms.get(code).game;const before=g.players[1].buildQueue;
  send(second,{type:'command',action:'cancel-build',seq:1});await new Promise(r=>setTimeout(r,100));assert.equal(g.players[1].buildQueue,before);
  second.ws.close();await wait(first,m=>m.type==='snapshot'&&m.view.paused);
  const resumed=connect(b);const rejoin=await wait(resumed,m=>m.type==='battle');assert.equal(rejoin.config.battleId,va.config.battleId);
  await wait(first,m=>m.type==='snapshot'&&!m.view.paused);
  send(resumed,{type:'leave'});const result=await wait(first,m=>m.type==='snapshot'&&!m.view.running);assert.equal(result.view.winner,0);
  const stats=await fetch(`${origin}/api/session`,{headers:{Cookie:a.cookie}}).then(r=>r.json());assert.equal(stats.user.wins,1);
  assert.equal(app.accounts.db.prepare('SELECT count(*) n FROM matches').get().n,1);
  assert.equal((await fetch(`${origin}/api/session`,{method:'POST',headers:{Origin:'http://evil.test'},body:'{}'})).status,403);
});
