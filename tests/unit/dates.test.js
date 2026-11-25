import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  todayKey, addDays, dayOfWeek, monthGrid, formatDateJa, toRfc3339, fromRfc3339,
  addMinutes, formatTime, nthWeekdayOfMonth, parseKey, formatMonthJa, diffMinutes, dateOf,
} from '../../app/js/dates.js';

test('todayKey は日本時間で日付を返す', () => {
  assert.equal(todayKey(new Date('2026-11-22T15:30:00Z')), '2026-11-23');
  assert.equal(todayKey(new Date('2026-11-22T14:59:00Z')), '2026-11-22');
});
test('addDays は月・年・うるう年をまたぐ', () => {
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
});
test('dayOfWeek', () => assert.equal(dayOfWeek('2026-11-23'), 1));
test('monthGrid', () => {
  assert.equal(monthGrid(2026, 12, 0).length, 42);
  assert.equal(monthGrid(2026, 12, 0)[0], '2026-11-29');
  assert.equal(monthGrid(2026, 12, 1)[0], '2026-11-30');
});
test('formatDateJa', () => assert.equal(formatDateJa('2026-12-02'), '12月2日（水）'));
test('RFC3339 の変換は日本時間', () => {
  assert.equal(toRfc3339('2026-12-02T10:00'), '2026-12-02T10:00:00+09:00');
  assert.equal(fromRfc3339('2026-12-02T01:00:00Z'), '2026-12-02T10:00');
  assert.equal(fromRfc3339('2026-12-01T20:00:00-05:00'), '2026-12-02T10:00');
});
test('addMinutes は日をまたぐ', () => assert.equal(addMinutes('2026-12-02T00:10', -30), '2026-12-01T23:40'));
test('formatTime', () => assert.equal(formatTime('2026-12-02T09:05'), '9:05'));
test('nthWeekdayOfMonth', () => {
  assert.deepEqual(nthWeekdayOfMonth('2026-12-08'), { n: 2, isLast: false });
  assert.deepEqual(nthWeekdayOfMonth('2026-12-29'), { n: 5, isLast: true });
});
test('そのほかの小さな関数', () => {
  assert.deepEqual(parseKey('2026-12-02'), { y: 2026, m: 12, d: 2 });
  assert.equal(formatMonthJa(2026, 12), '2026年12月');
  assert.equal(diffMinutes('2026-12-02T09:10', '2026-12-02T10:00'), 50);
  assert.equal(dateOf('2026-12-02T10:00'), '2026-12-02');
  assert.equal(dateOf('2026-12-02'), '2026-12-02');
});
