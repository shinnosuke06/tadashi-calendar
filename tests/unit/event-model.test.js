import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fromGoogle, toGoogle, buildDescription, splitDescription, packItems, unpackItems, eventColorHex, ITEMS_MARKER } from '../../app/js/event-model.js';
import { DEFAULT_SETTINGS as S } from '../../app/js/settings.js';

const fixtures = JSON.parse(readFileSync(new URL('../fixtures/google-events.json', import.meta.url)));
const base = {
  calendarId: 'primary', id: null, recurringEventId: null, originalStart: null, title: '眼科', allDay: false,
  start: '2026-12-02T10:00', end: '2026-12-02T11:00', location: '', memo: '', categoryId: null, colorId: null,
  recurrence: null, notify: { on: true, presets: ['1day', '1h'], googleDefault: false, custom: [] }, items: [],
  origin: 'home', route: null, geo: null, pending: false,
};
const full = {
  ...base, location: 'さくら眼科（架空）', memo: '目薬を持っていく', categoryId: 'hospital', colorId: '11',
  items: [{ text: '保険証', done: true }, { text: '診察券', done: false }],
  route: { withHighways: { minutes: 25, km: 12.3 }, withoutHighways: { minutes: 40, km: 10.1 }, address: 'さくら市中央1-2（架空）', origin: 'home', computedAt: '2026-11-25T10:00' },
  geo: { lat: 35.4, lng: 139.6 },
};

test('予定の時刻は、移動時間や出発の通知があっても入力したまま', () => {
  const ev = { ...base, start: '2026-12-02T10:00', end: '2026-12-02T11:00', notify: { on: true, presets: ['depart'] },
    route: { withHighways: { minutes: 25 }, withoutHighways: { minutes: 40 }, address: 'x', origin: 'home', computedAt: 't' } };
  const g = toGoogle(ev, S);
  assert.equal(g.start.dateTime, '2026-12-02T10:00:00+09:00');
  assert.equal(g.end.dateTime, '2026-12-02T11:00:00+09:00');
  assert.equal(g.start.timeZone, 'Asia/Tokyo');
});
test('複数日の終日予定', () => {
  const g = toGoogle({ ...base, allDay: true, start: '2026-12-20', end: '2026-12-22' }, S);
  assert.deepEqual([g.start, g.end], [{ date: '2026-12-20' }, { date: '2026-12-23' }]);
  assert.equal(fromGoogle(g, 'primary', S).end, '2026-12-22');
});
test('持ち物はメモ欄の最後にも書く', () => {
  assert.equal(buildDescription('メモ', [{ text: '保険証', done: false }, { text: '診察券', done: true }]),
    'メモ\n\n――― 持ち物 ―――\n☐ 保険証\n☑ 診察券');
  assert.equal(splitDescription('メモ\n\n――― 持ち物 ―――\n☐ 保険証').memo, 'メモ');
  assert.equal(buildDescription('', [{ text: '保険証', done: false }]), `${ITEMS_MARKER}\n☐ 保険証`);
  assert.equal(buildDescription('メモだけ', []), 'メモだけ');
});
test('持ち物が多くても記録できる', () => {
  const items = Array.from({ length: 60 }, (_, i) => ({ text: `持ち物${i}`.padEnd(30, 'あ'), done: i % 2 === 0 }));
  const p = packItems(items);
  for (const v of Object.values(p)) assert.ok(v.length <= 1024);
  assert.ok(Number(p.tc_items_count) > 1);
  assert.deepEqual(unpackItems(p), items);
});
test('Google のアプリで作った予定も読める', () => {
  const ev = fromGoogle(fixtures.fromGoogleApp, 'primary', S);
  assert.equal(ev.categoryId, null); assert.equal(ev.colorId, '5');
  assert.deepEqual(ev.items, []); assert.equal(ev.notify.googleDefault, true);
  assert.equal(ev.memo, fixtures.fromGoogleApp.description);
  assert.equal(ev.start, '2026-12-05T08:00');
  assert.equal(ev.route, null);
});
test('行って戻っても同じ', () => assert.deepEqual(fromGoogle(toGoogle(full, S), 'primary', S), { ...full, pending: false }));
test('このアプリが扱う項目だけを Google に送る', () => {
  const g = toGoogle(full, S);
  assert.deepEqual(Object.keys(g).sort(), ['colorId', 'description', 'end', 'extendedProperties', 'location', 'reminders', 'start', 'summary']);
  assert.equal(g.colorId, '11');
  assert.equal(g.extendedProperties.private.tc_cat, 'hospital');
});
test('繰り返しの 1 回分と、Google で決めた通知', () => {
  const ev = fromGoogle(fixtures.instance, 'primary', S);
  assert.equal(ev.recurringEventId, 'r1');
  assert.equal(ev.originalStart, '2026-12-08T10:00');
  assert.deepEqual(ev.notify, { on: true, presets: ['1day'], googleDefault: false, custom: [45] });
});
test('通知なし・タイトルなし', () => {
  const ev = fromGoogle(fixtures.noReminders, 'primary', S);
  assert.equal(ev.notify.on, false);
  assert.equal(ev.title, '（タイトルなし）');
  assert.equal(ev.allDay, true);
  assert.equal(ev.end, '2026-12-24');
});
test('繰り返しの親は recurrence を送る', () => {
  const g = toGoogle({ ...base, recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=WE'] }, S);
  assert.deepEqual(g.recurrence, ['RRULE:FREQ=WEEKLY;BYDAY=WE']);
});
test('色: 種類 → 予定の色 → カレンダーの色', () => {
  assert.equal(eventColorHex({ categoryId: 'travel', colorId: '5' }, S, '#123456'), '#039be5');
  assert.equal(eventColorHex({ categoryId: null, colorId: '5' }, S, '#123456'), '#f6bf26');
  assert.equal(eventColorHex({ categoryId: null, colorId: null }, S, '#123456'), '#123456');
});
