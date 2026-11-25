// AppEvent（このアプリの予定）と Google カレンダーの予定の相互変換。
// 予定の開始・終了は、入力された値（AppEvent.start / end）だけから作る。
import { toRfc3339, fromRfc3339, addDays } from './dates.js';
import { toGoogleReminders, presetsFromOverrides } from './reminders.js';
import { colorHex } from './colors.js';

export const ITEMS_MARKER = '――― 持ち物 ―――';
const CHUNK = 1000;
const TIME_ZONE = 'Asia/Tokyo';

export function buildDescription(memo, items) {
  const text = (memo ?? '').replace(/\s+$/, '');
  if (!items?.length) return text;
  const lines = items.map(i => `${i.done ? '☑' : '☐'} ${i.text}`).join('\n');
  return `${text ? `${text}\n\n` : ''}${ITEMS_MARKER}\n${lines}`;
}

export function splitDescription(desc) {
  const s = desc ?? '';
  const at = s.lastIndexOf(ITEMS_MARKER);
  return { memo: at < 0 ? s : s.slice(0, at).replace(/\s+$/, '') };
}

// 持ち物を、1 つ 1000 文字以下の JSON の切れ端に分けて記録する
export function packItems(items) {
  const json = JSON.stringify((items ?? []).map(i => [i.text, i.done ? 1 : 0]));
  const out = {};
  let n = 0;
  for (let i = 0; i < json.length; i += CHUNK) out[`tc_items_${n++}`] = json.slice(i, i + CHUNK);
  out.tc_items_count = String(n);
  return out;
}

export function unpackItems(priv) {
  const n = Number(priv?.tc_items_count ?? 0);
  if (!n) return [];
  let json = '';
  for (let i = 0; i < n; i++) json += priv[`tc_items_${i}`] ?? '';
  try {
    return JSON.parse(json).map(([text, done]) => ({ text, done: !!done }));
  } catch {
    return [];
  }
}

const parseJson = v => { if (!v) return null; try { return JSON.parse(v); } catch { return null; } };

function readNotify(g, priv, allDay) {
  const r = g.reminders;
  if (!r || r.useDefault) return { on: true, presets: [], googleDefault: true, custom: [] };
  const overrides = r.overrides ?? [];
  if (!overrides.length) return { on: false, presets: [], googleDefault: false, custom: [] };
  const saved = parseJson(priv.tc_reminders);
  if (saved && Array.isArray(saved.p)) return { on: true, presets: saved.p, googleDefault: false, custom: saved.c ?? [] };
  return { on: true, googleDefault: false, ...presetsFromOverrides(overrides, allDay) };
}

const readTime = t => (t?.date ? t.date : t?.dateTime ? fromRfc3339(t.dateTime) : null);

export function fromGoogle(g, calendarId, settings) {
  const priv = g.extendedProperties?.private ?? {};
  const allDay = !!g.start?.date;
  return {
    calendarId,
    id: g.id ?? null,
    recurringEventId: g.recurringEventId ?? null,
    originalStart: readTime(g.originalStartTime),
    title: g.summary || '（タイトルなし）',
    allDay,
    start: readTime(g.start),
    end: allDay ? addDays(g.end.date, -1) : readTime(g.end),
    location: g.location ?? '',
    memo: splitDescription(g.description).memo,
    categoryId: priv.tc_cat || null,
    colorId: g.colorId ?? null,
    recurrence: g.recurrence ?? null,
    notify: readNotify(g, priv, allDay),
    items: unpackItems(priv),
    origin: priv.tc_origin || 'home',
    route: parseJson(priv.tc_route),
    geo: parseJson(priv.tc_geo),
    pending: false,
  };
}

export function toGoogle(ev, settings) {
  const category = settings.categories.find(c => c.id === ev.categoryId);
  const notify = ev.notify ?? {};
  const g = {
    summary: ev.title,
    location: ev.location ?? '',
    description: buildDescription(ev.memo, ev.items),
    start: ev.allDay ? { date: ev.start } : { dateTime: toRfc3339(ev.start), timeZone: TIME_ZONE },
    end: ev.allDay ? { date: addDays(ev.end, 1) } : { dateTime: toRfc3339(ev.end), timeZone: TIME_ZONE },
    colorId: category ? category.colorId : (ev.colorId ?? null),
    reminders: toGoogleReminders(ev, settings),
    extendedProperties: {
      private: {
        tc_v: '1',
        tc_cat: ev.categoryId ?? '',
        ...packItems(ev.items),
        tc_origin: ev.origin ?? 'home',
        tc_route: ev.route ? JSON.stringify(ev.route) : '',
        tc_geo: ev.geo ? JSON.stringify(ev.geo) : '',
        tc_reminders: notify.on && !notify.googleDefault ? JSON.stringify({ p: notify.presets ?? [], c: notify.custom ?? [] }) : '',
      },
    },
  };
  if (Array.isArray(ev.recurrence)) g.recurrence = ev.recurrence;
  return g;
}

export function eventColorHex(ev, settings, calendarHex) {
  const category = settings.categories.find(c => c.id === ev.categoryId);
  return (category && colorHex(category.colorId)) || colorHex(ev.colorId) || calendarHex || '#616161';
}
