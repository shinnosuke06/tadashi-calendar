import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryKV } from '../../app/js/kv.js';
import { createEventCache } from '../../app/js/cache.js';

const ev = (id, start, end, extra = {}) => ({ calendarId: 'primary', id, title: id, allDay: start.length === 10, start, end, pending: false, ...extra });

test('memory KV は値を写して保存する', async () => {
  const kv = createMemoryKV();
  const v = { a: 1 };
  await kv.put('kv', 'x', v);
  v.a = 2;
  assert.deepEqual(await kv.get('kv', 'x'), { a: 1 });
  assert.deepEqual(await kv.getAll('kv'), [{ a: 1 }]);
  await kv.delete('kv', 'x');
  assert.equal(await kv.get('kv', 'x'), undefined);
});
test('範囲の予定を、日付順・終日を先に返す', async () => {
  const c = createEventCache(createMemoryKV());
  await c.putMonth('2026-12', ['primary'], [
    ev('b', '2026-12-03T10:00', '2026-12-03T11:00'), ev('a', '2026-12-03T09:00', '2026-12-03T09:30'),
    ev('trip', '2026-12-02', '2026-12-04'), ev('x', '2026-12-20T10:00', '2026-12-20T11:00'),
  ]);
  assert.deepEqual((await c.getRange('2026-12-03', '2026-12-03')).map(e => e.id), ['trip', 'a', 'b']);
  assert.deepEqual((await c.getRange('2026-12-01', '2026-12-31')).map(e => e.id), ['trip', 'a', 'b', 'x']);
  assert.ok(await c.monthFetchedAt('2026-12'));
  assert.equal(await c.monthFetchedAt('2027-01'), null);
});
test('月の入れ替えで送り直し待ちは消さない', async () => {
  const c = createEventCache(createMemoryKV());
  await c.putMonth('2026-12', ['primary'], [ev('old', '2026-12-05T10:00', '2026-12-05T11:00')]);
  await c.upsert(ev('tmp-1', '2026-12-06T10:00', '2026-12-06T11:00', { pending: true }));
  await c.putMonth('2026-12', ['primary'], [ev('new', '2026-12-07T10:00', '2026-12-07T11:00')]);
  assert.deepEqual((await c.getRange('2026-12-01', '2026-12-31')).map(e => e.id), ['tmp-1', 'new']);
});
test('ほかの月とほかのカレンダーの予定は消さない', async () => {
  const c = createEventCache(createMemoryKV());
  await c.upsert(ev('jan', '2027-01-05T10:00', '2027-01-05T11:00'));
  await c.upsert(ev('fam', '2026-12-05T10:00', '2026-12-05T11:00', { calendarId: 'family' }));
  await c.putMonth('2026-12', ['primary'], []);
  assert.deepEqual((await c.getRange('2026-12-01', '2027-01-31')).map(e => e.id), ['fam', 'jan']);
  await c.remove('primary', 'jan');
  assert.equal(await c.get('primary', 'jan'), undefined);
});
