// 端末に保存した予定（AppEvent）。月ごとに Google から取り直したものと入れ替える。
import { dateOf } from './dates.js';

const keyOf = (calendarId, id) => `${calendarId}|${id}`;
const startDate = ev => dateOf(ev.start);
const endDate = ev => dateOf(ev.end ?? ev.start);
const overlaps = (ev, a, b) => startDate(ev) <= b && endDate(ev) >= a;
const lastDay = monthKey => {
  const [y, m] = monthKey.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};

export function sortEvents(list) {
  return list.sort((a, b) => startDate(a).localeCompare(startDate(b))
    || (b.allDay - a.allDay)
    || a.start.localeCompare(b.start)
    || String(a.title).localeCompare(String(b.title)));
}

export function createEventCache(kv) {
  return {
    async putMonth(monthKey, calendarIds, events) {
      const first = `${monthKey}-01`, last = lastDay(monthKey);
      for (const ev of await kv.getAll('events')) {
        if (calendarIds.includes(ev.calendarId) && overlaps(ev, first, last) && !ev.pending) await kv.delete('events', keyOf(ev.calendarId, ev.id));
      }
      for (const ev of events) await kv.put('events', keyOf(ev.calendarId, ev.id), ev);
      await kv.put('months', monthKey, { fetchedAt: Date.now() });
    },
    async getRange(startKey, endKey) {
      return sortEvents((await kv.getAll('events')).filter(ev => overlaps(ev, startKey, endKey)));
    },
    get: (calendarId, id) => kv.get('events', keyOf(calendarId, id)),
    upsert: ev => kv.put('events', keyOf(ev.calendarId, ev.id), ev),
    remove: (calendarId, id) => kv.delete('events', keyOf(calendarId, id)),
    async monthFetchedAt(monthKey) {
      return (await kv.get('months', monthKey))?.fetchedAt ?? null;
    },
  };
}
