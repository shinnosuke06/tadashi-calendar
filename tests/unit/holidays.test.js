import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getHoliday } from '../../app/js/holidays.js';

const H = { '2026-01-01':'元日','2026-01-12':'成人の日','2026-02-11':'建国記念の日','2026-02-23':'天皇誕生日',
  '2026-03-20':'春分の日','2026-04-29':'昭和の日','2026-05-03':'憲法記念日','2026-05-04':'みどりの日',
  '2026-05-05':'こどもの日','2026-05-06':'振替休日','2026-07-20':'海の日','2026-08-11':'山の日',
  '2026-09-21':'敬老の日','2026-09-22':'国民の休日','2026-09-23':'秋分の日','2026-10-12':'スポーツの日',
  '2026-11-03':'文化の日','2026-11-23':'勤労感謝の日','2025-11-24':'振替休日','2027-03-21':'春分の日','2027-03-22':'振替休日' };
test('祝日', () => { for (const [k, v] of Object.entries(H)) assert.equal(getHoliday(k), v, k); });
test('祝日でない日', () => { assert.equal(getHoliday('2026-11-24'), null); assert.equal(getHoliday('2026-12-25'), null); });
test('範囲外の年は null', () => { assert.equal(getHoliday('2021-01-01'), null); assert.equal(getHoliday('2100-01-01'), null); });
