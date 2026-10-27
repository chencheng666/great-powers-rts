import test from 'node:test';
import assert from 'node:assert/strict';
import { PRIVACY_KEY, telemetryConsent } from '../src/privacy-settings.js';

test('统计需要明确同意，读取异常或未知值时不允许', () => {
  assert.equal(telemetryConsent({ getItem: () => null }), null);
  assert.equal(telemetryConsent({ getItem: () => 'unknown' }), null);
  assert.equal(telemetryConsent({ getItem: () => { throw new Error('拒绝'); } }), null);
  assert.equal(telemetryConsent({ getItem: key => key === PRIVACY_KEY ? 'allow' : null }), 'allow');
  assert.equal(telemetryConsent({ getItem: () => 'deny' }), 'deny');
});
