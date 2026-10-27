import test from 'node:test';
import assert from 'node:assert/strict';
import { PRIVACY_KEY, telemetryConsent, setupPrivacySettings } from '../src/privacy-settings.js';

test('统计需要明确同意，读取异常或未知值时不允许', () => {
  assert.equal(telemetryConsent({ getItem: () => null }), null);
  assert.equal(telemetryConsent({ getItem: () => 'unknown' }), null);
  assert.equal(telemetryConsent({ getItem: () => { throw new Error('拒绝'); } }), null);
  assert.equal(telemetryConsent({ getItem: key => key === PRIVACY_KEY ? 'allow' : null }), 'allow');
  assert.equal(telemetryConsent({ getItem: () => 'deny' }), 'deny');
});

test('本地存储不可用时仍可拒绝统计并进入游戏', () => {
  const handlers = {}, dialog = { open: false, setAttribute() {}, addEventListener: (name, fn) => { handlers[name] = fn; }, showModal() { this.open = true; }, close() { this.open = false; }, querySelector: () => ({ textContent: '' }) };
  const document = { createElement: () => dialog, body: { append() {} }, querySelector: () => ({ addEventListener() {} }) };
  let stopped = false, reloaded = false;
  setupPrivacySettings({ storage: { getItem() { throw Error('禁用'); }, setItem() { throw Error('禁用'); } }, document, location: { reload() { reloaded = true; } }, onChoice: () => { stopped = true; } });
  handlers.click({ target: { closest: () => ({ dataset: { privacy: 'deny' } }) } });
  assert.equal(dialog.open, true); assert.equal(stopped, true);
  handlers.click({ target: { closest: () => ({ dataset: { privacy: 'continue' } }) } });
  assert.equal(dialog.open, false); assert.equal(stopped, true); assert.equal(reloaded, false);
});
