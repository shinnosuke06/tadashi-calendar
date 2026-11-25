import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toRRule, fromRRule, describeRule, untilBefore } from '../../app/js/recurrence.js';

test('RRULE を作る', () => {
  assert.equal(toRRule({ freq: 'weekly', end: { type: 'none' } }, '2026-12-08', false), 'RRULE:FREQ=WEEKLY;BYDAY=TU');
  assert.equal(toRRule({ freq: 'monthlyDate', end: { type: 'none' } }, '2026-12-02', false), 'RRULE:FREQ=MONTHLY;BYMONTHDAY=2');
  assert.equal(toRRule({ freq: 'monthlyWeekday', end: { type: 'none' } }, '2026-12-08', false), 'RRULE:FREQ=MONTHLY;BYDAY=2TU');
  assert.equal(toRRule({ freq: 'monthlyWeekday', end: { type: 'none' } }, '2026-12-29', false), 'RRULE:FREQ=MONTHLY;BYDAY=-1TU');
  assert.equal(toRRule({ freq: 'daily', end: { type: 'until', date: '2026-12-31' } }, '2026-12-01', false), 'RRULE:FREQ=DAILY;UNTIL=20261231T145959Z');
  assert.equal(toRRule({ freq: 'yearly', end: { type: 'until', date: '2030-12-02' } }, '2026-12-02', true), 'RRULE:FREQ=YEARLY;UNTIL=20301202');
  assert.equal(toRRule({ freq: 'weekly', end: { type: 'count', count: 10 } }, '2026-12-08', false), 'RRULE:FREQ=WEEKLY;BYDAY=TU;COUNT=10');
});
test('読み戻しと説明', () => {
  const r = fromRRule(['RRULE:FREQ=MONTHLY;BYDAY=2TU'], '2026-12-08');
  assert.deepEqual(r, { freq: 'monthlyWeekday', end: { type: 'none' } });
  assert.equal(describeRule(r, '2026-12-08'), '毎月 第2火曜');
  assert.equal(describeRule({ freq: 'monthlyWeekday', end: { type: 'none' } }, '2026-12-29'), '毎月 最後の火曜');
  assert.equal(describeRule({ freq: 'weekly', end: { type: 'count', count: 10 } }, '2026-12-08'), '毎週 火曜（10回）');
  assert.equal(describeRule({ freq: 'daily', end: { type: 'until', date: '2026-12-31' } }, '2026-12-01'), '毎日（12月31日まで）');
});
test('扱えない繰り返し', () => assert.deepEqual(fromRRule(['RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR'], '2026-12-07'), { unsupported: true }));
test('これ以降を分けるときの終わり', () => {
  assert.deepEqual(untilBefore(['RRULE:FREQ=WEEKLY;BYDAY=TU;COUNT=10', 'EXDATE;TZID=Asia/Tokyo:20261215T100000'], '2026-12-22T10:00', false),
    ['RRULE:FREQ=WEEKLY;BYDAY=TU;UNTIL=20261222T005900Z', 'EXDATE;TZID=Asia/Tokyo:20261215T100000']);
  assert.deepEqual(untilBefore(['RRULE:FREQ=DAILY'], '2026-12-22', true), ['RRULE:FREQ=DAILY;UNTIL=20261221']);
});
test('作った RRULE は読み戻せる', () => {
  const cases = [
    [{ freq: 'daily', end: { type: 'none' } }, '2026-12-01', false],
    [{ freq: 'weekly', end: { type: 'count', count: 3 } }, '2026-12-08', false],
    [{ freq: 'monthlyDate', end: { type: 'until', date: '2027-03-02' } }, '2026-12-02', false],
    [{ freq: 'monthlyWeekday', end: { type: 'none' } }, '2026-12-29', false],
    [{ freq: 'yearly', end: { type: 'until', date: '2030-12-02' } }, '2026-12-02', true],
  ];
  for (const [rule, start, allDay] of cases) assert.deepEqual(fromRRule([toRRule(rule, start, allDay)], start), rule);
});
test('そのほかの扱えない形', () => {
  assert.deepEqual(fromRRule(['RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=TU'], '2026-12-08'), { unsupported: true });
  assert.deepEqual(fromRRule(['RRULE:FREQ=MONTHLY;BYMONTHDAY=15'], '2026-12-08'), { unsupported: true });
  assert.deepEqual(fromRRule([], '2026-12-08'), { unsupported: true });
});
test('説明（毎年・年をまたぐ終わり）', () => {
  assert.equal(describeRule({ freq: 'yearly', end: { type: 'none' } }, '2026-12-02'), '毎年 12月2日');
  assert.equal(describeRule({ freq: 'monthlyDate', end: { type: 'until', date: '2027-03-02' } }, '2026-12-02'), '毎月 2日（2027年3月2日まで）');
});
