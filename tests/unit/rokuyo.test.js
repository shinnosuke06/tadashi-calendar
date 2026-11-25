import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toLunar, getRokuyo } from '../../app/js/rokuyo.js';

test('旧暦の正月は先勝', () => {
  // 2027 年は朔が 2/6 15:56 UTC = 日本時間 2/7 0:56 なので、日本の旧正月は 2/7（中国の春節 2/6 とは違う）
  for (const k of ['2024-02-10', '2025-01-29', '2026-02-17', '2027-02-07']) {
    assert.deepEqual(toLunar(k), { month: 1, day: 1, leap: false }, k);
    assert.equal(getRokuyo(k), '先勝', k);
  }
});
test('朔の日付は日本時間で決める', () => {
  // 朔 2026-10-10 15:50 UTC → 日本時間 10/11。日本では 10/11 が旧暦 9 月 1 日
  assert.deepEqual(toLunar('2026-10-11'), { month: 9, day: 1, leap: false });
  assert.deepEqual(toLunar('2026-10-10'), { month: 8, day: 30, leap: false });
});
test('十五夜（旧暦 8 月 15 日）は仏滅', () => {
  for (const k of ['2024-09-17', '2025-10-06', '2026-09-25']) {
    assert.deepEqual(toLunar(k), { month: 8, day: 15, leap: false }, k);
    assert.equal(getRokuyo(k), '仏滅', k);
  }
});
test('閏月（2025 年は閏 6 月）', () => {
  assert.deepEqual(toLunar('2025-07-24'), { month: 6, day: 30, leap: false });
  assert.deepEqual(toLunar('2025-07-25'), { month: 6, day: 1, leap: true });
  assert.deepEqual(toLunar('2025-08-23'), { month: 7, day: 1, leap: false });
});
test('範囲外は null', () => { assert.equal(toLunar('1999-12-31'), null); assert.equal(getRokuyo('2100-01-01'), null); });
