// まとめて取り込む（今のアプリのスクショから Claude が作ったファイルを読む）
// 形式: {"format": "tadashi-calendar-import", "version": 1, "events": [{date, endDate?, allDay, start?, end?, title, location?, memo?, category?, recurrence?}]}
import { addMinutes, dateOf } from './dates.js';
import { defaultNotifyFor } from './reminders.js';
import { toRRule } from './recurrence.js';

const BAD_FILE = 'このファイルは取り込めません';
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const FREQS = ['daily', 'weekly', 'monthlyDate', 'monthlyWeekday', 'yearly'];

function toEvent(e, settings) {
  if (!e || typeof e !== 'object') return '形が正しくありません';
  if (!DATE.test(e.date ?? '')) return '日付が読めません';
  if (typeof e.title !== 'string' || !e.title.trim()) return 'タイトルがありません';
  const allDay = e.allDay === true;
  const endDate = DATE.test(e.endDate ?? '') && e.endDate >= e.date ? e.endDate : e.date;
  let start, end;
  if (allDay) { start = e.date; end = endDate; } else {
    if (!TIME.test(e.start ?? '')) return '時刻が読めません';
    start = `${e.date}T${e.start}`;
    end = TIME.test(e.end ?? '') ? `${endDate}T${e.end}` : addMinutes(start, 60);
    if (end < start) end = addMinutes(start, 60);
  }
  const rule = e.recurrence && FREQS.includes(e.recurrence.freq) ? e.recurrence : null;
  return {
    calendarId: 'primary', id: null, recurringEventId: null, originalStart: null,
    title: e.title.trim(), allDay, start, end,
    location: typeof e.location === 'string' ? e.location : '', memo: typeof e.memo === 'string' ? e.memo : '',
    categoryId: settings.categories.some(c => c.id === e.category) ? e.category : null, colorId: null,
    recurrence: rule ? [toRRule({ freq: rule.freq, end: rule.end ?? { type: 'none' } }, e.date, allDay)] : null,
    notify: defaultNotifyFor(allDay, settings), items: [], origin: 'home', route: null, geo: null, pending: false,
  };
}

export function parseImportFile(text, settings) {
  let data;
  try { data = JSON.parse(text); } catch { return { events: [], errors: [BAD_FILE] }; }
  if (!data || data.format !== 'tadashi-calendar-import' || data.version !== 1 || !Array.isArray(data.events)) return { events: [], errors: [BAD_FILE] };
  const events = [], errors = [];
  data.events.forEach((e, i) => {
    const ev = toEvent(e, settings);
    if (typeof ev === 'string') errors.push(`${i + 1}件目: ${ev}`); else events.push(ev);
  });
  return { events, errors };
}

// 同じ日・同じ開始・同じタイトルの予定がすでにあるもの（の番号）
export function findDuplicates(events, existing) {
  const key = ev => `${dateOf(ev.start)}|${ev.allDay ? 'allday' : ev.start}|${ev.title}`;
  const have = new Set(existing.map(key));
  return new Set(events.flatMap((ev, i) => (have.has(key(ev)) ? [i] : [])));
}
