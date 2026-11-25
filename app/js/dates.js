// 日本時間（+09:00）の日付計算。端末の時間帯は一切使わない。
// DateKey = 'YYYY-MM-DD'、LocalDateTime = 'YYYY-MM-DDTHH:mm'（どちらも日本時間）

const JST_MS = 9 * 3600 * 1000;
const DAY_MS = 86400 * 1000;
const WD = ['日', '月', '火', '水', '木', '金', '土'];
const pad = n => String(n).padStart(2, '0');

export function parseKey(key) {
  const [y, m, d] = key.slice(0, 10).split('-').map(Number);
  return { y, m, d };
}

// DateKey → その日の 0 時を表す UTC のミリ秒（日本時間の暦をそのまま UTC として扱う）
const keyToMs = key => { const { y, m, d } = parseKey(key); return Date.UTC(y, m - 1, d); };
const msToKey = ms => new Date(ms).toISOString().slice(0, 10);

export function todayKey(now = new Date()) {
  return msToKey(now.getTime() + JST_MS);
}

export function addDays(key, n) {
  return msToKey(keyToMs(key) + n * DAY_MS);
}

export function dayOfWeek(key) {
  return new Date(keyToMs(key)).getUTCDay();
}

export function monthGrid(y, m, weekStart = 0) {
  const first = `${y}-${pad(m)}-01`;
  const start = addDays(first, -((dayOfWeek(first) - weekStart + 7) % 7));
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

export function formatDateJa(key) {
  const { m, d } = parseKey(key);
  return `${m}月${d}日（${WD[dayOfWeek(key)]}）`;
}

export function formatMonthJa(y, m) {
  return `${y}年${m}月`;
}

// LocalDateTime → 日本時間を UTC として扱ったミリ秒
const localToMs = local => {
  const { y, m, d } = parseKey(local);
  const [hh, mm] = local.slice(11, 16).split(':').map(Number);
  return Date.UTC(y, m - 1, d, hh, mm);
};
const msToLocal = ms => new Date(ms).toISOString().slice(0, 16);

export function toRfc3339(local) {
  return `${local.slice(0, 16)}:00+09:00`;
}

export function fromRfc3339(s) {
  return msToLocal(new Date(s).getTime() + JST_MS);
}

export function addMinutes(local, n) {
  return msToLocal(localToMs(local) + n * 60000);
}

export function diffMinutes(a, b) {
  return Math.round((localToMs(b) - localToMs(a)) / 60000);
}

export function formatTime(local) {
  const [hh, mm] = local.slice(11, 16).split(':').map(Number);
  return `${hh}:${pad(mm)}`;
}

export function nthWeekdayOfMonth(key) {
  const { m, d } = parseKey(key);
  return { n: Math.ceil(d / 7), isLast: parseKey(addDays(key, 7)).m !== m };
}

export function dateOf(localOrKey) {
  return localOrKey.slice(0, 10);
}

export const WEEKDAYS = WD;
