// お試しモード用の偽物の窓口。Google につながず、架空の見本の予定で動く。
// 予定は Google カレンダーと同じ形で端末（kv）に保存し、繰り返しは 1 回分ずつに広げて返す。
import { ApiError, bindApi } from './api.js';
import { todayKey, addDays, dayOfWeek, nthWeekdayOfMonth, parseKey, fromRfc3339, toRfc3339 } from './dates.js';
import { toGoogle } from './event-model.js';
import { DEFAULT_SETTINGS } from './settings.js';

const STORE = 'demo';
const CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const PLACES = {
  'さくら眼科': { hw: 25, nohw: 40, address: 'さくら市中央1-2（架空）', lat: 35.4437, lng: 139.638 },
  'みどり歯科': { hw: 12, nohw: 12, address: 'みどり町3-4（架空）', lat: 35.45, lng: 139.62 },
  '青葉内科': { hw: 18, nohw: 22, address: '青葉台5-6（架空）', lat: 35.54, lng: 139.52 },
};
const HOME = { lat: 35.47, lng: 139.6 };
const clone = v => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
const hash = s => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

function seedEvents(today) {
  const S = DEFAULT_SETTINGS;
  const hospitalItems = S.itemSets[0].items.map(text => ({ text, done: false }));
  const travelItems = S.itemSets[1].items.map(text => ({ text, done: false }));
  const app = (o) => ({
    calendarId: 'primary', id: null, recurringEventId: null, originalStart: null, allDay: false, location: '', memo: '',
    categoryId: null, colorId: null, recurrence: null, notify: { on: true, presets: ['1day', '1h'], googleDefault: false, custom: [] },
    items: [], origin: 'home', route: null, geo: null, pending: false, ...o,
  });
  const eye = PLACES['さくら眼科'];
  const naikaDay = addDays(today, 7);
  const list = [
    ['demo-eye', app({ title: '眼科', start: `${addDays(today, 2)}T10:00`, end: `${addDays(today, 2)}T11:00`, location: 'さくら眼科', categoryId: 'hospital',
      items: hospitalItems, memo: '目薬を持っていく。受付は9時45分から。',
      route: { withHighways: { minutes: eye.hw, km: 12.3 }, withoutHighways: { minutes: eye.nohw, km: 10.1 }, address: eye.address, origin: 'home', computedAt: `${today}T09:00` },
      geo: { lat: eye.lat, lng: eye.lng } })],
    ['demo-dentist', app({ title: '歯医者', start: `${addDays(today, 3)}T14:30`, end: `${addDays(today, 3)}T15:30`, location: 'みどり歯科', categoryId: 'hospital',
      items: [{ text: '診察券', done: false }] })],
    ['demo-trip', app({ title: '旅行', allDay: true, start: addDays(today, 10), end: addDays(today, 12), categoryId: 'travel', items: travelItems,
      notify: { on: true, presets: ['ad_prevEvening'], googleDefault: false, custom: [] }, memo: '宿の電話番号は手帳に書いてある。' })],
    ['demo-naika', app({ title: '内科', start: `${naikaDay}T09:00`, end: `${naikaDay}T10:00`, location: '青葉内科', categoryId: 'hospital',
      items: clone(hospitalItems), recurrence: [`RRULE:FREQ=MONTHLY;BYMONTHDAY=${parseKey(naikaDay).d};COUNT=3`] })],
  ];
  const events = list.map(([id, ev]) => ({ id, status: 'confirmed', ...toGoogle(ev, S) }));
  // Google のアプリで作った形（このアプリの記録なし・扱えない繰り返し）
  const taisoStart = addDays(today, -14);
  events.push({
    id: 'demo-taiso', status: 'confirmed', summary: '体操', description: '', location: '公民館',
    start: { dateTime: toRfc3339(`${taisoStart}T07:00`), timeZone: 'Asia/Tokyo' },
    end: { dateTime: toRfc3339(`${taisoStart}T07:30`), timeZone: 'Asia/Tokyo' },
    recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR'], reminders: { useDefault: true },
  });
  return events;
}

const toLocal = t => (t.date ? `${t.date}T00:00` : fromRfc3339(t.dateTime));
const compact = k => k.replace(/-/g, '');

// 繰り返しを 1 回分ずつに広げる（このアプリが扱う形と、曜日を並べた毎週の形）
function occurrences(master, limitKey) {
  const p = Object.fromEntries(master.recurrence[0].replace(/^RRULE:/, '').split(';').map(x => x.split('=')));
  const startKey = (master.start.date ?? fromRfc3339(master.start.dateTime)).slice(0, 10);
  const until = p.UNTIL ? `${p.UNTIL.slice(0, 4)}-${p.UNTIL.slice(4, 6)}-${p.UNTIL.slice(6, 8)}` : null;
  const count = p.COUNT ? Number(p.COUNT) : Infinity;
  const days = p.BYDAY ? p.BYDAY.split(',') : null;
  const start = parseKey(startKey);
  const out = [];
  for (let k = startKey; k <= limitKey && (!until || k <= until) && out.length < count; k = addDays(k, 1)) {
    const { m, d } = parseKey(k);
    const wd = CODES[dayOfWeek(k)];
    let hit = false;
    if (p.FREQ === 'DAILY') hit = true;
    else if (p.FREQ === 'WEEKLY') hit = days ? days.includes(wd) : wd === CODES[dayOfWeek(startKey)];
    else if (p.FREQ === 'MONTHLY') {
      if (p.BYMONTHDAY) hit = d === Number(p.BYMONTHDAY);
      else if (days) {
        const mm = /^(-?\d)([A-Z]{2})$/.exec(days[0]);
        const { n, isLast } = nthWeekdayOfMonth(k);
        hit = !!mm && mm[2] === wd && (mm[1] === '-1' ? isLast : Number(mm[1]) === n);
      } else hit = d === start.d;
    } else if (p.FREQ === 'YEARLY') hit = m === start.m && d === start.d;
    if (hit) out.push(k);
  }
  return out;
}

function instanceOf(master, dayKey) {
  const { recurrence, ...rest } = clone(master);
  const shift = t => (t.date ? { date: addDays(dayKey, Math.round((Date.parse(t.date) - Date.parse(master.start.date)) / 864e5)) }
    : { ...t, dateTime: toRfc3339(`${addDays(dayKey, Math.round((Date.parse(fromRfc3339(t.dateTime).slice(0, 10)) - Date.parse(fromRfc3339(master.start.dateTime).slice(0, 10))) / 864e5))}T${fromRfc3339(t.dateTime).slice(11, 16)}`) });
  const start = shift(master.start);
  return {
    ...rest,
    id: `${master.id}_${compact(dayKey)}`,
    recurringEventId: master.id,
    originalStartTime: start,
    start,
    end: shift(master.end),
  };
}

const merge = (a, b) => {
  const out = { ...a, ...clone(b) };
  if (a.extendedProperties || b.extendedProperties) {
    out.extendedProperties = { private: { ...(a.extendedProperties?.private ?? {}), ...(b.extendedProperties?.private ?? {}) } };
  }
  return out;
};

export function createDemoApi({ now = () => new Date(), kv, isOffline = () => false } = {}) {
  async function load() {
    let events = await kv.get(STORE, 'events');
    if (!events) {
      events = seedEvents(todayKey(now()));
      await kv.put(STORE, 'events', events);
    }
    const overrides = (await kv.get(STORE, 'overrides')) ?? {};
    return { events, overrides };
  }
  const saveEvents = events => kv.put(STORE, 'events', events);
  const saveOverrides = o => kv.put(STORE, 'overrides', o);

  function expandAll({ events, overrides }, limitKey) {
    const out = [];
    for (const e of events) {
      if (!e.recurrence) { out.push(e); continue; }
      for (const day of occurrences(e, limitKey)) {
        const inst = instanceOf(e, day);
        const o = overrides[inst.id];
        if (o?.status === 'cancelled') continue;
        out.push(o ? merge(inst, o) : inst);
      }
    }
    return out;
  }

  async function find(eventId) {
    const data = await load();
    const single = data.events.find(e => e.id === eventId);
    if (single) return { data, single };
    const masterId = eventId.replace(/_\d{8}$/, '');
    const master = data.events.find(e => e.id === masterId && e.recurrence);
    if (master && eventId !== masterId) {
      const inst = expandAll({ events: [master], overrides: data.overrides }, addDays(todayKey(now()), 3 * 366)).find(e => e.id === eventId);
      if (inst) return { data, instance: inst };
    }
    throw new ApiError('notFound');
  }

  const handlers = {
    ping: async () => ({ version: 1 }),
    'calendars.list': async () => [{ id: 'primary', summary: 'お父さんのカレンダー（見本）', primary: true, backgroundColor: '#039be5', accessRole: 'owner' }],
    'events.list': async ({ timeMin, timeMax, q }) => {
      const lo = fromRfc3339(timeMin), hi = fromRfc3339(timeMax);
      const all = expandAll(await load(), hi.slice(0, 10));
      return all
        .filter(e => toLocal(e.start) < hi && toLocal(e.end) > lo)
        .filter(e => !q || [e.summary, e.description, e.location].some(v => (v ?? '').includes(q)))
        .sort((a, b) => toLocal(a.start).localeCompare(toLocal(b.start)))
        .map(clone);
    },
    'events.get': async ({ eventId }) => {
      const r = await find(eventId);
      return clone(r.single ?? r.instance);
    },
    'events.insert': async ({ resource }) => {
      const { events } = await load();
      const seq = ((await kv.get(STORE, 'seq')) ?? 0) + 1;
      await kv.put(STORE, 'seq', seq);
      const ev = { ...clone(resource), id: `demo-new-${seq}`, status: 'confirmed' };
      events.push(ev);
      await saveEvents(events);
      return clone(ev);
    },
    'events.patch': async ({ eventId, resource }) => {
      const r = await find(eventId);
      if (r.single) {
        const updated = merge(r.single, resource);
        await saveEvents(r.data.events.map(e => (e.id === eventId ? updated : e)));
        return clone(updated);
      }
      const o = r.data.overrides;
      o[eventId] = merge(o[eventId] ?? {}, resource);
      await saveOverrides(o);
      return clone(merge(r.instance, resource));
    },
    'events.delete': async ({ eventId }) => {
      const r = await find(eventId);
      if (r.single) { await saveEvents(r.data.events.filter(e => e.id !== eventId)); return null; }
      r.data.overrides[eventId] = { status: 'cancelled' };
      await saveOverrides(r.data.overrides);
      return null;
    },
    'settings.get': async () => (await kv.get(STORE, 'settings')) ?? null,
    'settings.save': async ({ settings }) => { await kv.put(STORE, 'settings', settings); return null; },
    route: async ({ destination }) => {
      if (!destination || destination.includes('不明')) return { withHighways: null, withoutHighways: null, destinationAddress: null, destination: null };
      const known = PLACES[destination];
      const h = hash(destination);
      const hw = known?.hw ?? 10 + (h % 30), nohw = known?.nohw ?? hw + 5 + (h % 15);
      return {
        withHighways: { minutes: hw, km: Math.round(hw * 6) / 10 },
        withoutHighways: { minutes: nohw, km: Math.round(nohw * 4.5) / 10 },
        destinationAddress: known?.address ?? `${destination}（見本の住所）`,
        destination: known ? { lat: known.lat, lng: known.lng } : { lat: HOME.lat + ((h % 100) - 50) / 1000, lng: HOME.lng + ((h % 77) - 38) / 1000 },
      };
    },
    geocode: async ({ address }) => {
      if (!address || address.includes('不明')) return { results: [] };
      if (address.includes('さくら眼科')) {
        return { results: [
          { name: 'さくら眼科', address: 'さくら市中央1-2（架空）', lat: 35.4437, lng: 139.638 },
          { name: 'さくら眼科 駅前分院', address: 'さくら市駅前3-4（架空）', lat: 35.452, lng: 139.645 },
        ] };
      }
      const h = hash(address);
      return { results: [{ name: address, address: `${address}（見本の住所）`, lat: HOME.lat + ((h % 100) - 50) / 1000, lng: HOME.lng + ((h % 77) - 38) / 1000 }] };
    },
    reverseGeocode: async ({ lat, lng }) => ({ address: `見本市 ${lat.toFixed(3)}, ${lng.toFixed(3)} あたり` }),
  };

  async function call(action, params = {}) {
    if (isOffline()) throw new ApiError('offline');
    const h = handlers[action];
    if (!h) throw new ApiError('server');
    return h(params);
  }
  return bindApi(call);
}
