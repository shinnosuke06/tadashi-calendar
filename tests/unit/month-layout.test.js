import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, dayOfWeek } from '../../app/js/dates.js';
import { weekStartOf, weekRange, weekIndexOf, weekLanes, cellItems, focusMonth, monthPageWeeks, monthList, eventsByDay } from '../../app/js/ui/month-layout.js';

test('同じ日付は 1 回だけ', () => {
  const { week0, count } = weekRange('2026-11-24', 0);
  const days = Array.from({ length: count * 7 }, (_, i) => addDays(week0, i));
  assert.equal(new Set(days).size, days.length);
  assert.equal(dayOfWeek(week0), 0);
  assert.ok(week0 <= '2025-11-01' && addDays(week0, count * 7 - 1) >= '2028-11-30');
});
test('週の始まり（月曜）', () => {
  assert.equal(weekStartOf('2026-12-03', 1), '2026-11-30');
  assert.equal(weekStartOf('2026-12-03', 0), '2026-11-29');
  assert.equal(dayOfWeek(weekRange('2026-11-24', 1).week0), 1);
});
test('重なる旅行は段が分かれ、どの日も同じ段', () => {
  const A = { id: 'a', allDay: true, start: '2026-12-04', end: '2026-12-06' };
  const B = { id: 'b', allDay: true, start: '2026-12-05', end: '2026-12-08' };
  const w = weekLanes('2026-11-29', [A, B]);
  assert.equal(w.lane.get(A), 0); assert.equal(w.lane.get(B), 1);
  assert.deepEqual(cellItems('2026-12-04', w, [A]).map(e => e && e.id), ['a']);
  assert.deepEqual(cellItems('2026-12-07', w, [B]).map(e => e && e.id), [null, 'b']);
});
test('1 日の予定は段の後ろに続く', () => {
  const A = { id: 'a', allDay: true, start: '2026-12-04', end: '2026-12-06' };
  const one = { id: 'x', allDay: false, start: '2026-12-05T10:00', end: '2026-12-05T11:00' };
  const w = weekLanes('2026-11-29', [A, one]);
  assert.equal(w.count, 1);
  assert.deepEqual(cellItems('2026-12-05', w, [A, one]).map(e => e && e.id), ['a', 'x']);
});
test('見出しの月', () => {
  const { week0 } = weekRange('2026-11-24', 0);
  const top = weekIndexOf(week0, '2026-11-29');
  assert.deepEqual(focusMonth(week0, top, 6), [2026, 12]);
  assert.deepEqual(focusMonth(week0, weekIndexOf(week0, '2026-11-01'), 6), [2026, 11]);
  assert.deepEqual(focusMonth(week0, top, 1), [2026, 12]);
});
test('横の形の 1 ページ', () => {
  assert.deepEqual(monthPageWeeks([2026, 12], 0), { ws: '2026-11-29', rows: 5 });
  assert.deepEqual(monthPageWeeks([2026, 11], 0), { ws: '2026-11-01', rows: 5 });
  assert.deepEqual(monthPageWeeks([2026, 8], 0), { ws: '2026-07-26', rows: 6 });
  assert.deepEqual(monthPageWeeks([2026, 2], 0), { ws: '2026-02-01', rows: 4 });
});
test('月の一覧', () => {
  const list = monthList('2026-11-24');
  assert.equal(list.length, 37);
  assert.deepEqual(list[0], [2025, 11]);
  assert.deepEqual(list[12], [2026, 11]);
  assert.deepEqual(list.at(-1), [2028, 11]);
});
test('日ごとの予定（複数日は毎日に入る）', () => {
  const trip = { id: 't', allDay: true, start: '2026-12-11', end: '2026-12-13' };
  const eye = { id: 'e', allDay: false, start: '2026-12-03T10:00', end: '2026-12-03T11:00' };
  const m = eventsByDay([trip, eye]);
  assert.deepEqual(['2026-12-11', '2026-12-12', '2026-12-13'].map(k => m.get(k).map(e => e.id)), [['t'], ['t'], ['t']]);
  assert.deepEqual(m.get('2026-12-03').map(e => e.id), ['e']);
});
