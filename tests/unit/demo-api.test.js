import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDemoApi } from '../../app/js/demo-api.js';
import { ApiError } from '../../app/js/api.js';

const memKV = () => { const m = new Map(); return { get: async (s, k) => structuredClone(m.get(`${s}|${k}`)), put: async (s, k, v) => { m.set(`${s}|${k}`, structuredClone(v)); }, delete: async (s, k) => { m.delete(`${s}|${k}`); } }; };
const now = () => new Date('2026-12-01T00:00:00Z'); // 日本時間 12/1 9:00
const range = { calendarId: 'primary', timeMin: '2026-11-01T00:00:00+09:00', timeMax: '2027-03-01T00:00:00+09:00' };

test('お試し: 見本の予定が今日を基準に並ぶ', async () => {
  const api = createDemoApi({ now, kv: memKV() });
  const items = await api.listEvents(range);
  const eye = items.find(e => e.summary === '眼科');
  assert.equal(eye.start.dateTime, '2026-12-03T10:00:00+09:00');
  assert.equal(eye.location, 'さくら眼科');
  assert.ok(items.find(e => e.summary === '歯医者' && e.start.dateTime === '2026-12-04T14:30:00+09:00'));
  const trip = items.find(e => e.summary === '旅行');
  assert.deepEqual([trip.start.date, trip.end.date], ['2026-12-11', '2026-12-14']);
});
test('お試し: 繰り返しは 1 回分ずつ出る', async () => {
  const api = createDemoApi({ now, kv: memKV() });
  const items = await api.listEvents(range);
  const naika = items.filter(e => e.summary === '内科');
  assert.equal(naika.length, 3);
  assert.ok(naika.every(e => e.recurringEventId && e.start.dateTime.endsWith('T09:00:00+09:00')));
  const taiso = items.filter(e => e.summary === '体操' && e.start.dateTime.startsWith('2026-12-0'));
  assert.deepEqual(taiso.map(e => e.start.dateTime.slice(0, 10)), ['2026-12-02', '2026-12-04', '2026-12-07', '2026-12-09']);
  assert.equal(taiso[0].extendedProperties, undefined);
});
test('お試し: 不明な場所は道が見つからない', async () => {
  const api = createDemoApi({ now, kv: memKV() });
  assert.deepEqual(await api.route({ origin: '自宅', destination: '不明な場所' }),
    { withHighways: null, withoutHighways: null, destinationAddress: null, destination: null });
  const r = await api.route({ origin: '自宅', destination: 'さくら眼科' });
  assert.deepEqual([r.withHighways.minutes, r.withoutHighways.minutes], [25, 40]);
});
test('お試し: 追加・直す・消す（1 回分を含む）', async () => {
  const kv = memKV();
  const api = createDemoApi({ now, kv });
  const made = await api.insertEvent({ calendarId: 'primary', resource: { summary: '散髪', start: { dateTime: '2026-12-05T15:00:00+09:00' }, end: { dateTime: '2026-12-05T16:00:00+09:00' } } });
  assert.ok(made.id);
  await api.patchEvent({ calendarId: 'primary', eventId: made.id, resource: { summary: '床屋' } });
  assert.equal((await api.getEvent({ calendarId: 'primary', eventId: made.id })).summary, '床屋');
  const again = createDemoApi({ now, kv }); // 開き直しても残る
  assert.ok((await again.listEvents(range)).find(e => e.summary === '床屋'));
  const naika = (await api.listEvents(range)).filter(e => e.summary === '内科');
  await api.deleteEvent({ calendarId: 'primary', eventId: naika[1].id });
  assert.equal((await api.listEvents(range)).filter(e => e.summary === '内科').length, 2);
  await api.patchEvent({ calendarId: 'primary', eventId: naika[0].id, resource: { summary: '内科（変更）' } });
  assert.ok((await api.listEvents(range)).find(e => e.summary === '内科（変更）'));
  await api.deleteEvent({ calendarId: 'primary', eventId: made.id });
  await assert.rejects(api.getEvent({ calendarId: 'primary', eventId: made.id }), e => e instanceof ApiError && e.kind === 'notFound');
});
test('お試し: 探す・地図・設定', async () => {
  const api = createDemoApi({ now, kv: memKV() });
  assert.deepEqual((await api.listEvents({ ...range, q: '眼科' })).map(e => e.summary), ['眼科']);
  assert.equal((await api.geocode({ address: 'さくら眼科' })).results.length, 2);
  assert.equal((await api.geocode({ address: '不明な場所' })).results.length, 0);
  assert.match((await api.reverseGeocode({ lat: 35.5, lng: 139.6 })).address, /見本/);
  assert.equal(await api.getSettings(), null);
  await api.saveSettings({ fontLevel: 4 });
  assert.deepEqual(await api.getSettings(), { fontLevel: 4 });
  assert.deepEqual(await api.ping(), { version: 1 });
});
test('お試し: 電波なしにできる', async () => {
  let off = true;
  const api = createDemoApi({ now, kv: memKV(), isOffline: () => off });
  await assert.rejects(api.ping(), e => e.kind === 'offline');
  off = false;
  assert.deepEqual(await api.ping(), { version: 1 });
});
