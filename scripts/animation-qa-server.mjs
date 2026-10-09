import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { createBattleServer } from '../server/index.mjs';

// 仅由本地验收脚本启动；控制走终端输入，不增加公网调试接口。
const directory = await mkdtemp(join(tmpdir(), 'rts-animation-qa-'));
const app = createBattleServer({ directory, origin: 'http://localhost:4182', dev: true });
const sockets = new Set();
app.server.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
app.server.listen(4180, '127.0.0.1', () => console.log('本地双客户端验收服务已启动'));
const input = createInterface({ input: process.stdin });
input.on('line', line => {
  const room = [...app.rooms.values()].find(r => r.game?.running);
  if (!room) return console.log('尚无战局');
  const g = room.game;
  if (line === 'fixture') {
    g.fogTimer = 1e9; for (const f of g.fogs) { f.visible.fill(true); f.explored.fill(true); }
    const cx = g.world.width / 2, cy = g.world.height / 2; g.units = [];
    for (const side of [0, 1]) for (const [i, type] of ['tank', 'rifle', 'tank', 'rifle'].entries()) {
      const u = g.addUnit(side, type, cx + (side ? 110 : -110), cy - 100 + i * 70);
      u.order = { type: 'attackMove', x: cx + (side ? -150 : 150), y: u.y };
    }
    console.log(JSON.stringify({ fixture: true, cx, cy, units: g.units.map(u => ({ id: u.id, side: u.owner, type: u.type })) }));
  } else if (line === 'finish') { g.ownedBuildings(1, 'hq')[0].hp = 0; console.log('验收敌方核心损毁，等待正常结算'); }
});
async function close() { input.close(); for (const socket of sockets) socket.destroy(); await new Promise(r => app.server.close(r)); await rm(directory, { recursive: true, force: true }); process.exit(); }
process.on('SIGINT', close); process.on('SIGTERM', close);
