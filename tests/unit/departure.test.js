import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeDeparture, departureSummary, departureHintText } from '../../app/js/departure.js';

test('出発の目安は 5 分単位で早めに丸める', () => {
  assert.equal(computeDeparture('2026-12-02T10:00', 25, 10), '2026-12-02T09:25');
  assert.equal(computeDeparture('2026-12-02T10:00', 40, 10), '2026-12-02T09:10');
  assert.equal(computeDeparture('2026-12-02T10:00', 23, 10), '2026-12-02T09:25');
  assert.equal(computeDeparture('2026-12-02T00:20', 30, 10), '2026-12-01T23:40');
});
test('目安の文', () => {
  const ev = { allDay: false, start: '2026-12-02T10:00', route: { withHighways: { minutes: 25 }, withoutHighways: { minutes: 40 } } };
  assert.equal(departureHintText(departureSummary(ev, { bufferMinutes: 10 })), '出発の目安 9:10〜9:25ごろ');
});
test('道が 1 つだけ、または同じ時刻なら 1 つだけ出す', () => {
  const one = { allDay: false, start: '2026-12-02T10:00', route: { withHighways: null, withoutHighways: { minutes: 40 } } };
  assert.equal(departureHintText(departureSummary(one, { bufferMinutes: 10 })), '出発の目安 9:10ごろ');
  const same = { allDay: false, start: '2026-12-02T14:30', route: { withHighways: { minutes: 12 }, withoutHighways: { minutes: 12 } } };
  assert.equal(departureHintText(departureSummary(same, { bufferMinutes: 10 })), '出発の目安 14:05ごろ');
});
test('終日・道なしは目安なし', () => {
  assert.equal(departureSummary({ allDay: true, start: '2026-12-02', route: { withHighways: { minutes: 5 } } }, { bufferMinutes: 10 }), null);
  assert.equal(departureSummary({ allDay: false, start: '2026-12-02T10:00', route: null }, { bufferMinutes: 10 }), null);
  assert.equal(departureSummary({ allDay: false, start: '2026-12-02T10:00', route: { withHighways: null, withoutHighways: null } }, { bufferMinutes: 10 }), null);
  assert.equal(departureHintText(null), '');
});
