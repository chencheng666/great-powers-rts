import test from 'node:test';
import assert from 'node:assert/strict';
import { OnlineClient } from '../src/online-client.js';
import { roomCode, PROTOCOL_VERSION } from '../src/network-protocol.js';

function fixture() {
  const nodes = new Map();
  const dialog = { querySelector: selector => {
    if (!nodes.has(selector)) nodes.set(selector, { value: '', textContent: '', hidden: false });
    return nodes.get(selector);
  }, querySelectorAll: () => [] };
  const client = Object.assign(Object.create(OnlineClient.prototype), {
    dialog, config: () => ({ faction: 'china', mapId: 'valley', victoryMode: 'quick' }),
    render() {}, onStatus() {}, onNotice() {}, retries: 0, seq: 0,
  });
  return { client, nodes, dialog };
}

function browserGlobal(t, key, value) {
  const original = Object.getOwnPropertyDescriptor(globalThis, key);
  Object.defineProperty(globalThis, key, { value, writable: true, configurable: true });
  t.after(() => { if (original) Object.defineProperty(globalThis, key, original); else delete globalThis[key]; });
}

class Socket {
  static OPEN = 1;
  static CONNECTING = 0;
  static latest;
  constructor() { Socket.latest = this; this.readyState = 0; }
  close() { this.readyState = 3; this.onclose?.({ reason: '' }); }
}

test('房间码接受全角数字和复制空格，拒绝不完整、链接和夹杂字符', () => {
  assert.equal(roomCode(' １２３ ４５６\n'), '123456');
  for (const value of ['', '12345', '1234567', '123a56', 'https://123456', null]) assert.throws(() => roomCode(value));
});

test('房间加入先校验再连接，正常输入发送一次并保留已有房间', async t => {
  browserGlobal(t, 'WebSocket', Socket);
  const { client, dialog } = fixture(), sent = [];
  client.socket = { readyState: 1, send: raw => sent.push(JSON.parse(raw)) };
  dialog.querySelector('#join-code').value = '123';
  await client.action('join'); assert.equal(sent.length, 0);
  assert.match(dialog.querySelector('#online-error').textContent, /六位数字/);
  dialog.querySelector('#join-code').value = '１２３ ４５６';
  await client.action('join'); assert.deepEqual(sent, [{ type: 'join', code: '123456', faction: 'china' }]);
  assert.equal(dialog.querySelector('#join-code').value, '123456');
  client.room = { code: '654321' }; await client.action('join');
  assert.equal(sent.length, 1); assert.match(dialog.querySelector('#online-error').textContent, /先退出/);
});

test('连接必须收到身份欢迎后才能完成，防止尚未恢复旧房间就加入另一房间', async t => {
  browserGlobal(t, 'WebSocket', Socket);
  browserGlobal(t, 'location', { protocol: 'http:', host: 'localhost:4180' });
  const { client } = fixture(); let finished = false;
  const pending = client.connect().then(() => { finished = true; });
  const ws = Socket.latest; ws.readyState = 1; ws.onopen(); await Promise.resolve();
  assert.equal(finished, false);
  const room = { code: '123456' };
  await ws.onmessage({ data: JSON.stringify({ type: 'hello', protocol: PROTOCOL_VERSION, user: { id: '甲' }, room }) });
  await pending; assert.equal(finished, true); assert.equal(client.room.code, room.code);
  client.room = null; ws.close();
});

test('欢迎消息前断线立即失败而不一直等待，版本不符也明确报错', async t => {
  browserGlobal(t, 'WebSocket', Socket);
  browserGlobal(t, 'location', { protocol: 'http:', host: 'localhost:4180' });
  const { client } = fixture();
  const pending = client.connect(); const rejected = assert.rejects(pending, /连接已关闭/);
  Socket.latest.close(); await rejected;
  const next = client.connect(); const mismatch = assert.rejects(next, /版本不一致/);
  await Socket.latest.onmessage({ data: JSON.stringify({ type: 'hello', protocol: 999 }) });
  await mismatch;
});

test('大厅错误独立显示，收到服务端加入失败不会藏在遮罩后', async t => {
  browserGlobal(t, 'WebSocket', Socket);
  browserGlobal(t, 'location', { protocol: 'http:', host: 'localhost:4180' });
  const { client, dialog } = fixture(); const pending = client.connect();
  await Socket.latest.onmessage({ data: JSON.stringify({ type: 'hello', protocol: PROTOCOL_VERSION, user: { id: '甲' }, room: null }) });
  await pending;
  await Socket.latest.onmessage({ data: JSON.stringify({ type: 'error', message: '房间不存在、已满或已开战' }) });
  assert.match(dialog.querySelector('#online-error').textContent, /房间不存在/);
  Socket.latest.close();
});

test('离线文件不请求会话，服务错误及仅静态网页均提供明确提示', async t => {
  browserGlobal(t, 'location', { protocol: 'file:' });
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => { throw new Error('不应请求'); });
  const { client } = fixture();
  await assert.rejects(client.session('测试'), /离线文件不能直接联机/);
  assert.equal(fetchMock.mock.callCount(), 0);
  globalThis.location.protocol = 'http:';
  fetchMock.mock.mockImplementation(async () => ({ ok: false, json: async () => ({ error: '请求来源不被允许' }) }));
  await assert.rejects(client.session('测试'), /请求来源不被允许/);
  fetchMock.mock.mockImplementation(async () => ({ ok: true, json: async () => { throw new Error('静态 HTML'); } }));
  await assert.rejects(client.session('测试'), /没有可用的对战服务/);
});
