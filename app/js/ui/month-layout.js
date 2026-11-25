// 月の表の並び方の計算（画面を使わないので、テストできる）
import { addDays, dayOfWeek, dateOf, parseKey } from '../dates.js';

const pad = n => String(n).padStart(2, '0');
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
export const isMulti = ev => ev.allDay && dateOf(ev.start) !== dateOf(ev.end);
export const addMonth = ([y, m], n) => { m += n; while (m < 1) { m += 12; y--; } while (m > 12) { m -= 12; y++; } return [y, m]; };
export const firstOf = ([y, m]) => `${y}-${pad(m)}-01`;
export const ymOf = key => { const { y, m } = parseKey(key); return [y, m]; };
export const sameYm = (a, b) => a[0] === b[0] && a[1] === b[1];

export function weekStartOf(key, weekStart = 0) {
  return addDays(key, -((dayOfWeek(key) - weekStart + 7) % 7));
}

export function monthList(today, before = 12, after = 24) {
  const base = ymOf(today);
  return Array.from({ length: before + after + 1 }, (_, i) => addMonth(base, i - before));
}

// 縦の形: 12 か月前の月初の週から、24 か月先の月末の週まで
export function weekRange(today, weekStart = 0) {
  const list = monthList(today);
  const week0 = weekStartOf(firstOf(list[0]), weekStart);
  const last = addDays(firstOf(addMonth(list.at(-1), 1)), -1);
  return { week0, count: Math.floor(daysBetween(week0, last) / 7) + 1 };
}

export const weekIndexOf = (week0, key) => Math.floor(daysBetween(week0, key) / 7);

// 見えている上から min(2, 見えている行 - 1) 番目の週の、最後の日の月
export function focusMonth(week0, topWeek, visibleRows) {
  const row = topWeek + Math.max(0, Math.min(2, visibleRows - 1));
  return ymOf(addDays(week0, row * 7 + 6));
}

// 横の形の 1 ページ: その月の 1 日を含む週から、末日を含む週まで
export function monthPageWeeks(ym, weekStart = 0) {
  const ws = weekStartOf(firstOf(ym), weekStart);
  const last = addDays(firstOf(addMonth(ym, 1)), -1);
  return { ws, rows: Math.floor(daysBetween(ws, last) / 7) + 1 };
}

// 複数日の予定を、開始日・長いほうの順に、空いている一番上の段へ入れる（週ごと）
export function weekLanes(weekStartKey, events) {
  const we = addDays(weekStartKey, 6);
  const multi = events.filter(e => isMulti(e) && dateOf(e.start) <= we && dateOf(e.end) >= weekStartKey)
    .sort((a, b) => dateOf(a.start).localeCompare(dateOf(b.start)) || dateOf(b.end).localeCompare(dateOf(a.end)) || String(a.id).localeCompare(String(b.id)));
  const lanes = [], lane = new Map();
  for (const e of multi) {
    const s = Math.max(0, daysBetween(weekStartKey, dateOf(e.start)));
    const t = Math.min(6, daysBetween(weekStartKey, dateOf(e.end)));
    let i = 0;
    while (lanes[i] && lanes[i].some(([a, b]) => !(t < a || s > b))) i++;
    (lanes[i] ||= []).push([s, t]);
    lane.set(e, i);
  }
  return { lane, count: lanes.length };
}

// マスに並べる順: 段に合わせた複数日の予定（空き段は null、末尾の空きは削る）→ 1 日の予定
export function cellItems(key, wl, dayEvents) {
  const slots = Array(wl.count).fill(null);
  for (const e of dayEvents) if (wl.lane.has(e)) slots[wl.lane.get(e)] = e;
  while (slots.length && !slots[slots.length - 1]) slots.pop();
  return [...slots, ...dayEvents.filter(e => !wl.lane.has(e))];
}

// 日付ごとの予定（複数日の予定は毎日に入る）
export function eventsByDay(events) {
  const map = new Map();
  for (const ev of events) {
    const last = dateOf(ev.end ?? ev.start);
    for (let k = dateOf(ev.start); k <= last; k = addDays(k, 1)) {
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(ev);
    }
  }
  return map;
}
