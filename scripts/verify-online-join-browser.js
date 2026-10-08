const { root, taskSpaceId, url, pageLabel = 'p3' } = globalThis.ONLINE_JOIN_QA;
const { WebSocket } = await import(`${root}/node_modules/ws/wrapper.mjs`);
const fs = await import('node:fs/promises');
const task = await taskSpace(taskSpaceId), page = task.page(pageLabel), sockets = [];
const check = (value, message) => { if (!value) throw new Error(message); };
const report = { origin: url, enter: false, button: false, invalid: false, full: false, battle: false };
async function guest(name) {
  const response = await fetch(`${url}/api/session`, { method: 'POST', headers: { Origin: url, 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
  check(response.ok, '测试身份创建失败');
  const cookie = response.headers.get('set-cookie').split(';')[0];
  const ws = new WebSocket(`${url.replace('http', 'ws')}/battle-socket`, { headers: { Origin: url, Cookie: cookie } });
  sockets.push(ws); const messages = [];
  ws.on('message', raw => messages.push(JSON.parse(raw)));
  return { ws, messages };
}
async function wait(client, predicate) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const index = client.messages.findIndex(predicate);
    if (index >= 0) return client.messages.splice(index, 1)[0];
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error('等待服务端消息超时');
}
try {
  await page.goto(url);
  if (await page.evaluate(() => document.querySelector('#nickname-dialog').open)) {
    await page.fill('#nickname-dialog input', '加入修复验收');
    await page.click('#nickname-dialog button[type=submit]');
  }
  await page.click('#online-btn');
  await page.waitForFunction(() => document.querySelector('#online-status').textContent.includes('已连接'));
  await page.fill('#join-code', '123'); await page.press('#join-code', 'Enter');
  await page.waitForFunction(() => document.querySelector('#online-error').textContent.includes('六位数字'));
  await page.fill('#join-code', '000000'); await page.press('#join-code', 'Enter');
  await page.waitForFunction(() => document.querySelector('#online-error').textContent.includes('房间不存在'));
  report.invalid = true;
  const host = await guest('独立测试房主'); await wait(host, message => message.type === 'hello');
  host.ws.send(JSON.stringify({ type: 'create', mapId: 'valley', victoryMode: 'quick', faction: 'china' }));
  const code = (await wait(host, message => message.type === 'room')).room.code;
  await page.fill('#join-code', code.replace(/[0-9]/g, value => String.fromCharCode(value.charCodeAt(0) + 0xfee0)));
  await page.press('#join-code', 'Enter');
  await page.waitForFunction(expected => document.querySelector('#room-code').textContent === expected && !document.querySelector('#online-room').hidden, code);
  report.enter = true;
  const extra = await guest('第三位测试玩家'); await wait(extra, message => message.type === 'hello');
  extra.ws.send(JSON.stringify({ type: 'join', code, faction: 'nato' }));
  const error = await wait(extra, message => message.type === 'error'); check(error.message.includes('已满'), '满房没有拒绝加入'); report.full = true;
  await page.click('[data-online=leave]');
  await wait(host, message => message.type === 'room' && message.room.members.filter(Boolean).length === 1);
  await page.fill('#join-code', `${code.slice(0, 3)} ${code.slice(3)}`); await page.click('[data-online=join]');
  await page.waitForSelector('#online-room', { state: 'visible' }); report.button = true;
  await page.screenshot({ path: `${root}/releases/lan-qa/房间加入.png` });
  host.ws.send(JSON.stringify({ type: 'ready', ready: true }));
  await page.click('[data-online=ready]');
  await wait(host, message => message.type === 'room' && message.room.members.every(member => member?.ready));
  host.ws.send(JSON.stringify({ type: 'start' }));
  await wait(host, message => message.type === 'battle');
  await page.waitForFunction(() => document.querySelector('#start-screen').style.display === 'none' && !document.querySelector('#online-dialog').open, undefined, { timeout: 60000 });
  await page.waitForFunction(() => document.querySelector('#clock').textContent !== '00:00', undefined, { timeout: 30000 });
  report.battle = true;
  await page.screenshot({ path: `${root}/releases/lan-qa/局域网战场.png` });
  await fs.writeFile(`${root}/releases/lan-qa/加入验收.json`, JSON.stringify(report, null, 2));
  console.log(report);
} finally {
  for (const ws of sockets) { if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'leave' })); ws.close(); }
}
