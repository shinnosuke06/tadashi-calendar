import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryKV } from '../../app/js/kv.js';
import { createEventCache } from '../../app/js/cache.js';
import { createOutbox } from '../../app/js/outbox.js';
import { ApiError } from '../../app/js/api.js';

function fakeApi() {
  const calls = [];
  const state = { offline: false, notFound: new Set(), seq: 0 };
  const guard = (name, p) => { calls.push([name, p]); if (state.offline) throw new ApiError('offline'); if (state.notFound.has(p?.eventId)) throw new ApiError('notFound'); };
  return {
    calls, state,
    insertEvent: async p => { guard('insert', p); return { id: `real-${++state.seq}`, ...p.resource }; },
    patchEvent: async p => { guard('patch', p); return { id: p.eventId }; },
    deleteEvent: async p => { guard('delete', p); return null; },
    saveSettings: async s => { guard('saveSettings', s); return null; },
  };
}
const setup = async () => { const kv = createMemoryKV(); return { kv, cache: createEventCache(kv), outbox: createOutbox(kv), api: fakeApi() }; };
const tmpEvent = { calendarId: 'primary', id: 'tmp-1', title: '散髪', allDay: false, start: '2026-12-05T15:00', end: '2026-12-05T16:00', pending: true };

test('電波がない間の追加は、送り直し待ちになり、戻ったら本物になる', async () => {
  const { cache, outbox, api } = await setup();
  await cache.upsert(tmpEvent);
  await outbox.enqueue({ type: 'insert', calendarId: 'primary', tempId: 'tmp-1', resource: { summary: '散髪' } });
  api.state.offline = true;
  assert.deepEqual(await outbox.process(api, cache), { sent: 0, remaining: 1 });
  assert.equal((await cache.get('primary', 'tmp-1')).pending, true);
  api.state.offline = false;
  assert.deepEqual(await outbox.process(api, cache), { sent: 1, remaining: 0 });
  assert.equal(await cache.get('primary', 'tmp-1'), undefined);
  const real = await cache.get('primary', 'real-1');
  assert.equal(real.pending, false);
  assert.equal(real.title, '散髪');
  assert.deepEqual(await outbox.list(), []);
});
test('止まったら順番を守る', async () => {
  const { cache, outbox, api } = await setup();
  await outbox.enqueue({ type: 'patch', calendarId: 'primary', eventId: 'e1', resource: { summary: 'a' } });
  await outbox.enqueue({ type: 'patch', calendarId: 'primary', eventId: 'e2', resource: { summary: 'b' } });
  api.state.offline = true;
  await outbox.process(api, cache);
  assert.deepEqual(api.calls.map(c => c[1].eventId), ['e1']);
  assert.deepEqual((await outbox.list()).map(o => o.eventId), ['e1', 'e2']);
});
test('消された予定の修正は捨てる', async () => {
  const { cache, outbox, api } = await setup();
  api.state.notFound.add('gone');
  await outbox.enqueue({ type: 'patch', calendarId: 'primary', eventId: 'gone', resource: {} });
  await outbox.enqueue({ type: 'delete', calendarId: 'primary', eventId: 'gone' });
  assert.deepEqual(await outbox.process(api, cache), { sent: 0, remaining: 0 });
});
test('仮の id への修正は本物の id で送る', async () => {
  const { cache, outbox, api } = await setup();
  await cache.upsert(tmpEvent);
  await outbox.enqueue({ type: 'insert', calendarId: 'primary', tempId: 'tmp-1', resource: { summary: '散髪' } });
  await outbox.enqueue({ type: 'patch', calendarId: 'primary', eventId: 'tmp-1', resource: { summary: '床屋' } });
  assert.deepEqual(await outbox.process(api, cache), { sent: 2, remaining: 0 });
  assert.equal(api.calls[1][1].eventId, 'real-1');
});
test('合言葉が違うときも止めて残す', async () => {
  const { cache, outbox, api } = await setup();
  api.patchEvent = async () => { throw new ApiError('badKey'); };
  await outbox.enqueue({ type: 'patch', calendarId: 'primary', eventId: 'e1', resource: {} });
  assert.deepEqual(await outbox.process(api, cache), { sent: 0, remaining: 1 });
});
test('設定の保存も送る', async () => {
  const { cache, outbox, api } = await setup();
  await outbox.enqueue({ type: 'saveSettings', settings: { fontLevel: 4 } });
  assert.deepEqual(await outbox.process(api, cache), { sent: 1, remaining: 0 });
  assert.deepEqual(api.calls[0], ['saveSettings', { fontLevel: 4 }]);
});
