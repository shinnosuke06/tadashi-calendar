import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRoute, routeTo } from '../../app/js/ui/router.js';

test('経路を読む', () => {
  assert.deepEqual(parseRoute('#/event/primary/abc%2F1'), { name: 'event', params: { calId: 'primary', eventId: 'abc/1' } });
  assert.deepEqual(parseRoute('#/month/2026-12'), { name: 'month', params: { ym: '2026-12' } });
  assert.deepEqual(parseRoute('#/month/2026-12?d=05'), { name: 'month', params: { ym: '2026-12', d: '05' } });
  assert.deepEqual(parseRoute('#/week/2026-12-03'), { name: 'week', params: { date: '2026-12-03' } });
  assert.deepEqual(parseRoute('#/day/2026-12-03'), { name: 'day', params: { date: '2026-12-03' } });
  assert.deepEqual(parseRoute('#/new/2026-12-03'), { name: 'new', params: { date: '2026-12-03' } });
  assert.deepEqual(parseRoute('#/edit/primary/e1'), { name: 'edit', params: { calId: 'primary', eventId: 'e1' } });
  for (const n of ['setup', 'list', 'search', 'settings']) assert.deepEqual(parseRoute(`#/${n}`), { name: n, params: {} });
  assert.deepEqual(parseRoute(''), { name: 'home', params: {} });
  assert.deepEqual(parseRoute('#/nope'), { name: 'home', params: {} });
  assert.deepEqual(parseRoute('#/month/abc'), { name: 'home', params: {} });
});
test('経路を作って戻せる', () => {
  const cases = [
    ['event', { calId: 'family@example.com', eventId: 'abc/1_20261208T010000Z' }],
    ['edit', { calId: 'primary', eventId: 'e1' }],
    ['month', { ym: '2026-12' }], ['month', { ym: '2026-12', d: '05' }],
    ['week', { date: '2026-12-03' }], ['day', { date: '2026-12-03' }], ['new', { date: '2026-12-03' }],
    ['list', {}], ['search', {}], ['settings', {}], ['setup', {}],
  ];
  for (const [name, params] of cases) assert.deepEqual(parseRoute(routeTo(name, params)), { name, params });
});
