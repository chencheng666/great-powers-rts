import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WebSocket } from 'ws';
import { createBattleServer } from '../server/index.mjs';
import { COMBINED_MAP_CAPABILITY } from '../src/network-protocol.js';
import { OnlineGame } from '../src/online-game.js';

test('综合战区双人正常开战，旧客户端收到升级提示，新客户端第二席位保留正确地图', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'gp-combined-online-'));
  const app = createBattleServer({ directory });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + app.server.address().port;
  const clients = [];
  t.after(async () => {
    clients.forEach(client => client.ws.terminate());
    await new Promise(resolve => app.server.close(resolve));
    await rm(directory, { recursive:true, force:true });
  });
  async function wait(client, predicate) {
    const until = Date.now() + 5000;
    while (Date.now() < until) {
      const index = client.messages.findIndex(predicate);
      if (index >= 0) return client.messages.splice(index, 1)[0];
      await new Promise(resolve => setTimeout(resolve, 15));
    }
    throw Error('等待对战消息超时');
  }
  async function guest(name, capable = true) {
    const response = await fetch(origin + '/api/session', {
      method:'POST', headers:{ Origin:origin, 'Content-Type':'application/json' }, body:JSON.stringify({ name })
    });
    const cookie = response.headers.get('set-cookie').split(';')[0];
    const options = { headers:{ Origin:origin, Cookie:cookie } };
    const ws = capable ? new WebSocket(origin.replace('http:', 'ws:') + '/battle-socket', COMBINED_MAP_CAPABILITY, options) :
      new WebSocket(origin.replace('http:', 'ws:') + '/battle-socket', options);
    const client = { ws, messages:[] };
    clients.push(client);
    ws.on('message', bytes => client.messages.push(JSON.parse(bytes)));
    await wait(client, message => message.type === 'hello');
    return client;
  }
  const send = (client, message) => client.ws.send(JSON.stringify(message));
  const host = await guest('综合图测试甲'), old = await guest('兼容性测试', false), peer = await guest('综合图测试乙');
  send(host, { type:'create', mapId:'confluence', faction:'china', victoryMode:'control' });
  const code = (await wait(host, message => message.type === 'room')).room.code;
  send(old, { type:'join', code, faction:'nato' });
  assert.match((await wait(old, message => message.type === 'error')).message, /刷新网页或更新客户端/);
  send(peer, { type:'join', code, faction:'nato' });
  await wait(peer, message => message.type === 'room');
  send(host, { type:'ready', ready:true });
  send(peer, { type:'ready', ready:true });
  await wait(host, message => message.type === 'room' && message.room.members.every(member => member?.ready));
  send(host, { type:'start' });
  const payload = await wait(peer, message => message.type === 'battle');
  const game = new OnlineGame(payload, {}, { send:() => true });
  assert.equal(game.world.width, 6400);
  assert.equal(game.controlGoal, 600);
  assert.equal(game.ownedBuildings(0, 'dock')[0].x, 4840);
  assert.ok(game.homeX > game.world.width / 2);
});
