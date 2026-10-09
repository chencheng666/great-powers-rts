const { root, taskSpaceId, url, pageLabel = 'p3', verifyRelease = false } = globalThis.ONLINE_JOIN_QA;
const { WebSocket } = await import(`${root}/node_modules/ws/wrapper.mjs`);
const fs = await import('node:fs/promises');
const task = await taskSpace(taskSpaceId), page = task.page(pageLabel), sockets = [];
const check = (value, message) => { if (!value) throw new Error(message); };
const report = { origin: url, enter: false, button: false, invalid: false, full: false, battle: false };
const testUsers = [], output = `${root}/releases/${verifyRelease ? 'server-v080-qa' : 'lan-qa'}`;
await fs.mkdir(output, { recursive: true });
async function guest(name) {
  const response = await fetch(`${url}/api/session`, { method: 'POST', headers: { Origin: url, 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
  check(response.ok, '测试身份创建失败');
  testUsers.push((await response.json()).user.id);
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
    const error=client.messages.find(message=>message.type==='error');
    if(error)throw new Error(`服务端拒绝验收步骤：${error.message}`);
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error('等待服务端消息超时');
}
try {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.evaluate(() => { window.__serverQErrors=[]; addEventListener('error',e=>__serverQErrors.push(e.message)); addEventListener('unhandledrejection',e=>__serverQErrors.push(String(e.reason))); });
  if (await page.evaluate(() => document.querySelector('#nickname-dialog').open)) {
    await page.fill('#nickname-dialog input', '加入修复验收');
    await page.click('#nickname-dialog button[type=submit]');
  }
  await page.click('#online-btn');
  await page.waitForFunction(() => document.querySelector('#online-status').textContent.includes('已连接'));
  if (verifyRelease) testUsers.push(await page.evaluate(async () => (await (await fetch('/api/session')).json()).user.id));
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
  await page.screenshot({ path: `${output}/房间加入.png` });
  host.ws.send(JSON.stringify({ type: 'ready', ready: true }));
  await page.click('[data-online=ready]');
  await wait(host, message => message.type === 'room' && message.room.members.every(member => member?.ready));
  host.ws.send(JSON.stringify({ type: 'start' }));
  const battle = await wait(host, message => message.type === 'battle');
  if (verifyRelease) {
    check(!battle.view.battleReport, '战斗中泄漏对方统计');
    const unit=battle.view.units.find(u=>u.owner===0&&u.type==='tank');
    check(unit, '缺少初始测试坦克');
    host.ws.send(JSON.stringify({type:'command',action:'move',selected:[unit.id],x:unit.x+140,y:unit.y+120,seq:1}));
    check((await wait(host,m=>m.type==='ack'&&m.seq===1)).ok, '移动指令没有被服务端接受');
    await wait(host,m=>m.type==='snapshot'&&m.view.units.some(u=>u.id===unit.id&&Math.hypot(u.x-unit.x,u.y-unit.y)>5));
    report.move=true;
  }
  await page.waitForFunction(() => document.querySelector('#start-screen').style.display === 'none' && !document.querySelector('#online-dialog').open, undefined, { timeout: 60000 });
  await page.waitForFunction(() => document.querySelector('#clock').textContent !== '00:00', undefined, { timeout: 30000 });
  report.battle = true;
  if (verifyRelease) {
    report.render=await page.evaluate(()=>{const c=document.querySelector('#game-canvas'),gl=c.getContext('webgl2'),p=new Uint8Array(c.width*c.height*4);gl.readPixels(0,0,c.width,c.height,gl.RGBA,gl.UNSIGNED_BYTE,p);const colors=new Set();for(let i=0;i<p.length;i+=1024)colors.add(`${p[i]},${p[i+1]},${p[i+2]}`);return {colors:colors.size,glError:gl.getError(),errors:__serverQErrors};});
    check(report.render.colors>150&&!report.render.glError&&!report.render.errors.length,'战场渲染验收未通过');
  }
  await page.screenshot({ path: `${output}/局域网战场.png` });
  if (verifyRelease) {
    host.ws.send(JSON.stringify({type:'leave'}));
    await page.waitForFunction(()=>document.querySelectorAll('.battle-report tbody tr').length===13,undefined,{timeout:30000});
    report.reportRows=13;
    await page.screenshot({path:`${output}/公网战后复盘.png`});
  }
  await fs.writeFile(`${output}/加入验收.json`, JSON.stringify(report, null, 2));
  console.log(report);
} finally {
  for (const ws of sockets) { if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'leave' })); ws.close(); }
  if (verifyRelease) {
    const file=`${output}/测试身份.json`;
    const previous=await fs.readFile(file,'utf8').then(JSON.parse).catch(()=>[]);
    await fs.writeFile(file,JSON.stringify([...new Set([...previous,...testUsers])]),{mode:0o600});
  }
}
