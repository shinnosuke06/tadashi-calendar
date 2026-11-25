// 予定の読み書きのまとめ役。画面はここだけを使う。
// 端末の保存分をすぐ見せ、Google から取り直して入れ替える。送れないときは送り直し待ちに入れる。
import { createEventCache } from './cache.js';
import { createOutbox } from './outbox.js';
import { fromGoogle, toGoogle } from './event-model.js';
import { untilBefore } from './recurrence.js';
import { addDays, addMinutes, diffMinutes, dateOf, todayKey, toRfc3339, parseKey } from './dates.js';

const pad = n => String(n).padStart(2, '0');
const nowLocal = d => new Date(d.getTime() + 9 * 3600e3).toISOString().slice(0, 16);
const sameGeo = (a, b) => (!a && !b) || (a && b && a.lat === b.lat && a.lng === b.lng);
const NETWORK = new Set(['offline', 'timeout', 'server', 'badKey']);

// [startKey, endKey] を含む月の一覧と、月の最初の日・最後の日
function monthsBetween(startKey, endKey) {
  const out = [];
  let { y, m } = parseKey(startKey);
  const end = parseKey(endKey);
  while (y < end.y || (y === end.y && m <= end.m)) {
    out.push(`${y}-${pad(m)}`);
    m++; if (m > 12) { m = 1; y++; }
  }
  return out;
}
const monthLast = mk => { const [y, m] = mk.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };
const overlaps = (ev, a, b) => dateOf(ev.start) <= b && dateOf(ev.end ?? ev.start) >= a;

export function createRepository({ api, kv, getSettings, now = () => new Date() }) {
  const cache = createEventCache(kv);
  const outbox = createOutbox(kv);
  const calendars = () => getSettings().visibleCalendars ?? ['primary'];

  const repo = {
    cache, outbox, lastError: null, lastRouteError: null,

    async loadRange(startKey, endKey, onUpdate) {
      onUpdate(await cache.getRange(startKey, endKey));
      const months = monthsBetween(startKey, endKey);
      const from = `${months[0]}-01`, to = monthLast(months.at(-1));
      try {
        await outbox.process(api, cache).catch(() => {});
        const settings = getSettings();
        const all = [];
        for (const calendarId of calendars()) {
          const items = await api.listEvents({ calendarId, timeMin: toRfc3339(`${from}T00:00`), timeMax: toRfc3339(`${addDays(to, 1)}T00:00`) });
          for (const g of items ?? []) if (g.status !== 'cancelled') all.push(fromGoogle(g, calendarId, settings));
        }
        for (const mk of months) await cache.putMonth(mk, calendars(), all.filter(ev => overlaps(ev, `${mk}-01`, monthLast(mk))));
        repo.lastError = null;
        onUpdate(await cache.getRange(startKey, endKey));
      } catch (e) {
        repo.lastError = e;
      }
    },

    async getEvent(calendarId, id) {
      const cached = await cache.get(calendarId, id);
      if (cached) return cached;
      return fromGoogle(await api.getEvent({ calendarId, eventId: id }), calendarId, getSettings());
    },

    // 繰り返しの予定なら、親の繰り返しの行を返す
    async getRecurrence(ev) {
      if (ev.recurrence) return ev.recurrence;
      if (!ev.recurringEventId) return null;
      return (await api.getEvent({ calendarId: ev.calendarId, eventId: ev.recurringEventId })).recurrence ?? null;
    },

    async saveEvent(input, { scope = 'one', original = null } = {}) {
      const settings = getSettings();
      let ev = await withRoute({ calendarId: 'primary', ...input }, original, settings);
      if (ev.recurringEventId && scope !== 'one') return saveSeries(ev, scope, original, settings);
      const resource = toGoogle(ev, settings);
      if (!ev.id) {
        try {
          const made = await api.insertEvent({ calendarId: ev.calendarId, resource });
          ev = { ...ev, id: made.id, pending: false };
        } catch (e) {
          if (!NETWORK.has(e?.kind)) throw e;
          repo.lastError = e;
          ev = { ...ev, id: `tmp-${now().getTime()}-${Math.random().toString(36).slice(2, 7)}`, pending: true };
          await outbox.enqueue({ type: 'insert', calendarId: ev.calendarId, tempId: ev.id, resource });
        }
      } else {
        const queued = ev.pending || String(ev.id).startsWith('tmp-');
        try {
          if (queued) throw Object.assign(new Error('queued'), { kind: 'offline' });
          await api.patchEvent({ calendarId: ev.calendarId, eventId: ev.id, resource });
          ev = { ...ev, pending: false };
        } catch (e) {
          if (!NETWORK.has(e?.kind)) throw e;
          if (e.message !== 'queued') repo.lastError = e;
          ev = { ...ev, pending: true };
          await outbox.enqueue({ type: 'patch', calendarId: ev.calendarId, eventId: ev.id, resource });
        }
      }
      if (original && original.id !== ev.id) await cache.remove(original.calendarId, original.id);
      await cache.upsert(ev);
      return ev;
    },

    async deleteEvent(ev, scope = 'one') {
      if (ev.recurringEventId && scope !== 'one') {
        const master = await api.getEvent({ calendarId: ev.calendarId, eventId: ev.recurringEventId });
        const isFirst = !master.recurrence || startOfGoogle(master.start) === ev.originalStart;
        if (scope === 'all' || isFirst) await api.deleteEvent({ calendarId: ev.calendarId, eventId: ev.recurringEventId });
        else await api.patchEvent({ calendarId: ev.calendarId, eventId: ev.recurringEventId, resource: { recurrence: untilBefore(master.recurrence, ev.originalStart, ev.allDay) } });
        for (const other of await cache.getRange('1970-01-01', '2999-12-31')) {
          if (other.recurringEventId === ev.recurringEventId && (scope === 'all' || isFirst || other.start >= ev.start)) await cache.remove(other.calendarId, other.id);
        }
        return;
      }
      try {
        if (ev.pending || String(ev.id).startsWith('tmp-')) throw Object.assign(new Error('queued'), { kind: 'offline' });
        await api.deleteEvent({ calendarId: ev.calendarId, eventId: ev.id });
      } catch (e) {
        if (e?.kind === 'notFound') { await cache.remove(ev.calendarId, ev.id); return; }
        if (!NETWORK.has(e?.kind)) throw e;
        if (e.message !== 'queued') repo.lastError = e;
        await outbox.enqueue({ type: 'delete', calendarId: ev.calendarId, eventId: ev.id });
      }
      await cache.remove(ev.calendarId, ev.id);
    },

    toggleItem(ev, index) {
      const items = ev.items.map((it, i) => (i === index ? { ...it, done: !it.done } : it));
      return repo.saveEvent({ ...ev, items }, { scope: 'one', original: ev });
    },

    recomputeRoute(ev) {
      return repo.saveEvent({ ...ev, route: null }, { scope: 'one', original: { ...ev, route: null } });
    },

    async search(q) {
      const today = todayKey(now());
      const from = addDays(today, -366), to = addDays(today, 731);
      const settings = getSettings();
      try {
        const out = [];
        for (const calendarId of calendars()) {
          const items = await api.listEvents({ calendarId, timeMin: toRfc3339(`${from}T00:00`), timeMax: toRfc3339(`${to}T00:00`), q });
          for (const g of items ?? []) if (g.status !== 'cancelled') out.push(fromGoogle(g, calendarId, settings));
        }
        repo.lastError = null;
        return out.sort((a, b) => a.start.localeCompare(b.start));
      } catch (e) {
        repo.lastError = e;
        return (await cache.getRange(from, to)).filter(ev => [ev.title, ev.location, ev.memo].some(v => (v ?? '').includes(q)));
      }
    },

    syncOutbox: () => outbox.process(api, cache),
  };

  const startOfGoogle = t => (t.date ? t.date : t.dateTime ? fromRfcLocal(t.dateTime) : null);
  const fromRfcLocal = s => new Date(new Date(s).getTime() + 9 * 3600e3).toISOString().slice(0, 16);

  // 場所か出発する場所が変わったとき、または道がまだないときだけ計算する
  async function withRoute(ev, original, settings) {
    if (!ev.location) return { ...ev, route: null, geo: null };
    let geo = ev.geo;
    if (original && original.location !== ev.location && sameGeo(original.geo, ev.geo)) geo = null;
    const changed = !original || original.location !== ev.location || original.origin !== ev.origin || !sameGeo(original.geo, geo);
    if (ev.route && !changed) return { ...ev, geo };
    const origin = ev.origin === 'home' ? settings.home.address : ev.origin;
    if (!origin) return { ...ev, route: null, geo };
    try {
      const r = await api.route({ origin, destination: geo ? `${geo.lat},${geo.lng}` : ev.location });
      repo.lastRouteError = null;
      return {
        ...ev,
        route: { withHighways: r.withHighways, withoutHighways: r.withoutHighways, address: r.destinationAddress, origin: ev.origin, computedAt: nowLocal(now()) },
        geo: geo ?? r.destination ?? null,
      };
    } catch (e) {
      repo.lastRouteError = e;
      return { ...ev, route: null, geo };
    }
  }

  // 繰り返しの予定を「すべて」または「これ以降」で直す（電波が必要）
  async function saveSeries(ev, scope, original, settings) {
    const master = await api.getEvent({ calendarId: ev.calendarId, eventId: ev.recurringEventId });
    const origStart = original?.originalStart ?? ev.originalStart ?? original?.start;
    const masterStart = startOfGoogle(master.start);
    if (scope === 'following' && masterStart !== origStart) {
      await api.patchEvent({ calendarId: ev.calendarId, eventId: master.id, resource: { recurrence: untilBefore(master.recurrence, origStart, ev.allDay) } });
      const recurrence = ev.recurrence ?? master.recurrence.map(l => (l.startsWith('RRULE:') ? l.replace(/;COUNT=\d+/, '') : l));
      const made = await api.insertEvent({ calendarId: ev.calendarId, resource: toGoogle({ ...ev, id: null, recurringEventId: null, recurrence }, settings) });
      return { ...ev, id: made.id, recurringEventId: null, recurrence, pending: false };
    }
    // すべて: その回で動かした分だけ、親の開始・終了をずらす
    let start, end;
    if (ev.allDay) {
      const shift = Math.round((Date.parse(ev.start) - Date.parse(original.start)) / 864e5);
      const span = Math.round((Date.parse(ev.end) - Date.parse(ev.start)) / 864e5);
      start = addDays(masterStart, shift);
      end = addDays(start, span);
    } else {
      const shift = diffMinutes(original.start, ev.start);
      start = addMinutes(masterStart, shift);
      end = addMinutes(start, diffMinutes(ev.start, ev.end));
    }
    const recurrence = ev.recurrence ?? master.recurrence;
    await api.patchEvent({ calendarId: ev.calendarId, eventId: master.id, resource: toGoogle({ ...ev, start, end, recurrence }, settings) });
    return { ...ev, pending: false };
  }

  return repo;
}
