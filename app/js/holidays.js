// 日本の祝日（2022〜2099 年。今の「国民の祝日に関する法律」のきまり）
import { parseKey, addDays, dayOfWeek } from './dates.js';

const FIXED = {
  '1-1': '元日', '2-11': '建国記念の日', '2-23': '天皇誕生日', '4-29': '昭和の日',
  '5-3': '憲法記念日', '5-4': 'みどりの日', '5-5': 'こどもの日', '8-11': '山の日',
  '11-3': '文化の日', '11-23': '勤労感謝の日',
};
// [月, 第 n 月曜, 名前]
const HAPPY_MONDAY = [[1, 2, '成人の日'], [7, 3, '海の日'], [9, 3, '敬老の日'], [10, 2, 'スポーツの日']];

const inRange = y => y >= 2022 && y <= 2099;

function nthMonday(y, m, n) {
  const first = dayOfWeek(`${y}-${String(m).padStart(2, '0')}-01`);
  return 1 + ((8 - first) % 7) + (n - 1) * 7;
}

function equinox(y, base) {
  const t = y - 1980;
  return Math.floor(base + 0.242194 * t - Math.floor(t / 4));
}

// 法律で日付が決まっている祝日だけ（振替休日・国民の休日を含まない）
function baseHoliday(key) {
  const { y, m, d } = parseKey(key);
  if (!inRange(y)) return null;
  if (FIXED[`${m}-${d}`]) return FIXED[`${m}-${d}`];
  for (const [hm, n, name] of HAPPY_MONDAY) if (m === hm && d === nthMonday(y, m, n)) return name;
  if (m === 3 && d === equinox(y, 20.8431)) return '春分の日';
  if (m === 9 && d === equinox(y, 23.2488)) return '秋分の日';
  return null;
}

export function getHoliday(key) {
  const base = baseHoliday(key);
  if (base) return base;
  if (!inRange(parseKey(key).y)) return null;
  // 振替休日: 日曜の祝日から後ろで、最初の祝日でない日
  for (let p = addDays(key, -1); baseHoliday(p); p = addDays(p, -1)) {
    if (dayOfWeek(p) === 0) return '振替休日';
  }
  // 国民の休日: 前後を祝日にはさまれた平日
  if (dayOfWeek(key) !== 0 && baseHoliday(addDays(key, -1)) && baseHoliday(addDays(key, 1))) return '国民の休日';
  return null;
}
