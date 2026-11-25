import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseImportFile, findDuplicates } from '../../app/js/import.js';
import { DEFAULT_SETTINGS as S } from '../../app/js/settings.js';

const file = events => JSON.stringify({ format: 'tadashi-calendar-import', version: 1, events });

test('正しい JSON から予定を作る', () => {
  const { events, errors } = parseImportFile(file([
    { date: '2026-12-03', endDate: '2026-12-03', allDay: false, start: '10:00', end: '11:00', title: '眼科', location: 'さくら眼科', memo: '目薬', category: 'hospital', recurrence: null },
  ]), S);
  assert.deepEqual(errors, []);
  assert.equal(events.length, 1);
  const e = events[0];
  assert.equal(e.start, '2026-12-03T10:00');
  assert.equal(e.end, '2026-12-03T11:00');
  assert.equal(e.title, '眼科');
  assert.equal(e.location, 'さくら眼科');
  assert.equal(e.memo, '目薬');
  assert.equal(e.categoryId, 'hospital');
  assert.equal(e.id, null);
  assert.equal(e.calendarId, 'primary');
  assert.deepEqual(e.notify, { on: true, presets: ['1day', '1h'] });
});
test('終日・複数日・終わりの時刻なし・繰り返し', () => {
  const { events } = parseImportFile(file([
    { date: '2026-12-11', endDate: '2026-12-13', allDay: true, title: '旅行' },
    { date: '2026-12-20', allDay: false, start: '13:00', title: '散髪' },
    { date: '2026-12-08', allDay: false, start: '09:00', end: '10:00', title: '内科', recurrence: { freq: 'monthlyDate', end: { type: 'none' } }, category: 'nope' },
  ]), S);
  assert.deepEqual([events[0].allDay, events[0].start, events[0].end], [true, '2026-12-11', '2026-12-13']);
  assert.deepEqual(events[0].notify, { on: true, presets: ['ad_prevEvening'] });
  assert.equal(events[1].end, '2026-12-20T14:00');
  assert.deepEqual(events[2].recurrence, ['RRULE:FREQ=MONTHLY;BYMONTHDAY=8']);
  assert.equal(events[2].categoryId, null);
});
test('形式が違えば errors', () => {
  assert.deepEqual(parseImportFile('not json', S), { events: [], errors: ['このファイルは取り込めません'] });
  assert.deepEqual(parseImportFile(JSON.stringify({ format: 'other', events: [] }), S), { events: [], errors: ['このファイルは取り込めません'] });
  const { events, errors } = parseImportFile(file([{ date: '12/3', title: 'x' }, { date: '2026-12-03', allDay: false, start: '25:00', title: 'y' }, { date: '2026-12-03', allDay: true, title: '' }]), S);
  assert.equal(events.length, 0);
  assert.equal(errors.length, 3);
  assert.match(errors[0], /^1件目/);
});
test('同じ予定は重複に入る', () => {
  const { events } = parseImportFile(file([
    { date: '2026-12-03', allDay: false, start: '10:00', end: '11:00', title: '眼科' },
    { date: '2026-12-03', allDay: false, start: '14:00', end: '15:00', title: '眼科' },
    { date: '2026-12-11', endDate: '2026-12-13', allDay: true, title: '旅行' },
  ]), S);
  const existing = [
    { title: '眼科', allDay: false, start: '2026-12-03T10:00', end: '2026-12-03T11:00' },
    { title: '旅行', allDay: true, start: '2026-12-11', end: '2026-12-13' },
  ];
  assert.deepEqual([...findDuplicates(events, existing)].sort(), [0, 2]);
});
