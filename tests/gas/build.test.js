import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildGas } from '../../scripts/build-gas.mjs';

test('dist/Code.gs は最新（gas/src を直したら npm run build:gas）', () => {
  assert.equal(readFileSync(new URL('../../gas/dist/Code.gs', import.meta.url), 'utf8'), buildGas());
});
test('appsscript.json の設定', () => {
  const m = JSON.parse(readFileSync(new URL('../../gas/appsscript.json', import.meta.url), 'utf8'));
  assert.equal(m.timeZone, 'Asia/Tokyo');
  assert.deepEqual(m.webapp, { executeAs: 'USER_DEPLOYING', access: 'ANYONE_ANONYMOUS' });
  assert.equal(m.dependencies.enabledAdvancedServices[0].serviceId, 'calendar');
});
