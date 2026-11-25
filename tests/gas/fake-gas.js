// Apps Script の組み込みサービスの偽物（テスト用）。呼び出しを記録する。
export function createFakeGas({ pages = null, directions = null, geocodeResults = null, reverseResults = null } = {}) {
  const log = { calls: [], logger: [], errors: [] };
  const props = new Map();
  let uuid = 0;
  const events = new Map();
  const triggers = [];
  const spreadsheets = new Map();

  function makeSheet(name) {
    const cells = new Map(); // 'r,c' → value
    const sheet = {
      getName: () => name,
      getRange(a, b, nr = 1, nc = 1) {
        let r = a, c = b;
        if (typeof a === 'string') { const m = /^([A-Z])(\d+)$/.exec(a); c = m[1].charCodeAt(0) - 64; r = Number(m[2]); }
        return {
          getValue: () => cells.get(`${r},${c}`) ?? '',
          setValue: v => { cells.set(`${r},${c}`, v); return this; },
          getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => cells.get(`${r + i},${c + j}`) ?? '')),
          setValues: rows => { rows.forEach((row, i) => row.forEach((v, j) => cells.set(`${r + i},${c + j}`, v))); },
        };
      },
      appendRow: row => { const r = sheet.getLastRow() + 1; row.forEach((v, j) => cells.set(`${r},${j + 1}`, v)); },
      getLastRow: () => Math.max(0, ...[...cells.keys()].map(k => Number(k.split(',')[0]))),
      getActiveRange: () => sheet._active,
      setFrozenRows: () => {},
      _cells: cells,
    };
    return sheet;
  }
  function makeSpreadsheet(id, name) {
    const sheets = [makeSheet('シート1')];
    const ss = {
      getId: () => id, getName: () => name,
      getSheetByName: n => sheets.find(s => s.getName() === n) ?? null,
      insertSheet: n => { const s = makeSheet(n); sheets.push(s); return s; },
      getSheets: () => [...sheets],
      deleteSheet: s => { sheets.splice(sheets.indexOf(s), 1); },
      getActiveSheet: () => ss._activeSheet ?? sheets[0],
      toast: () => {},
    };
    spreadsheets.set(id, ss);
    return ss;
  }
  const bound = makeSpreadsheet('ss-bound', 'ただしカレンダー');

  const record = (name, args) => log.calls.push([name, ...JSON.parse(JSON.stringify(args))]);
  const notFound = () => new Error('API call to calendar.events.get failed with error: Not Found');
  const Calendar = {
    Events: {
      list(calendarId, opt) {
        record('Events.list', [calendarId, opt]);
        if (pages) { const i = opt.pageToken ? Number(opt.pageToken) : 0; return { items: pages[i], nextPageToken: i + 1 < pages.length ? String(i + 1) : undefined }; }
        return { items: [...events.values()].filter(e => e.calendarId === calendarId) };
      },
      get(calendarId, eventId) { record('Events.get', [calendarId, eventId]); const e = events.get(eventId); if (!e) throw notFound(); return e; },
      insert(resource, calendarId) { record('Events.insert', [resource, calendarId]); const e = { ...resource, id: `ev-${events.size + 1}`, calendarId }; events.set(e.id, e); return e; },
      patch(resource, calendarId, eventId) { record('Events.patch', [resource, calendarId, eventId]); const e = events.get(eventId); if (!e) throw notFound(); const n = { ...e, ...resource }; events.set(eventId, n); return n; },
      remove(calendarId, eventId) { record('Events.remove', [calendarId, eventId]); if (!events.delete(eventId)) throw notFound(); },
    },
    CalendarList: {
      list() { record('CalendarList.list', []); return { items: [{ id: 'primary@example.com', summary: '父', primary: true, backgroundColor: '#039be5', accessRole: 'owner' }, { id: 'holiday', summary: '日本の祝日', backgroundColor: '#0b8043', accessRole: 'reader' }] }; },
    },
  };

  // 地図（Maps サービス）の偽物
  const Maps = {
    DirectionFinder: { Mode: { DRIVING: 'driving' }, Avoid: { HIGHWAYS: 'highways' } },
    newDirectionFinder() {
      const q = {};
      const b = {
        setOrigin: v => { q.origin = v; return b; }, setDestination: v => { q.destination = v; return b; },
        setMode: v => { q.mode = v; return b; }, setLanguage: v => { q.language = v; return b; }, setRegion: v => { q.region = v; return b; },
        setAvoid: v => { q.avoid = v; return b; },
        getDirections: () => { record('Maps.directions', [q]); return directions ? directions(q) : { status: 'ZERO_RESULTS', routes: [] }; },
      };
      return b;
    },
    newGeocoder() {
      const q = {};
      const g = {
        setLanguage: v => { q.language = v; return g; }, setRegion: v => { q.region = v; return g; },
        setBounds: (a, b, c, d) => { q.bounds = [a, b, c, d]; return g; },
        geocode: address => { record('Maps.geocode', [{ ...q, address }]); return geocodeResults ? geocodeResults(address, q) : { status: 'ZERO_RESULTS', results: [] }; },
        reverseGeocode: (lat, lng) => { record('Maps.reverse', [{ lat, lng }]); return reverseResults ? reverseResults(lat, lng) : { status: 'ZERO_RESULTS', results: [] }; },
      };
      return g;
    },
  };

  const ctx = {
    Maps,
    console: { log: () => {}, error: (...a) => log.errors.push(a.join(' ')), warn: () => {} },
    JSON, Date, Math, Object, Array, String, Number, Error, RegExp, Boolean, Map, Set, encodeURIComponent,
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: k => props.get(k) ?? null,
        setProperty: (k, v) => { props.set(k, String(v)); },
        deleteProperty: k => { props.delete(k); },
        getProperties: () => Object.fromEntries(props),
        getKeys: () => [...props.keys()],
      }),
    },
    Utilities: {
      getUuid: () => `0000000${++uuid}-aaaa-4bbb-8ccc-dddddddddddd`.slice(-36),
      formatDate: (date, tz, fmt) => {
        const j = new Date(date.getTime() + 9 * 3600e3).toISOString();
        return fmt.replace('yyyy', j.slice(0, 4)).replace('MM', j.slice(5, 7)).replace('dd', j.slice(8, 10)).replace('HH', j.slice(11, 13)).replace('mm', j.slice(14, 16));
      },
      sleep: () => {},
    },
    ContentService: {
      MimeType: { JSON: 'json', TEXT: 'text' },
      createTextOutput: s => ({ content: s, setMimeType() { return this; }, getContent() { return this.content; } }),
    },
    ScriptApp: {
      getProjectTriggers: () => [...triggers],
      newTrigger: handler => {
        const b = { timeBased: () => b, everyDays: () => b, atHour: () => b, create: () => { const t = { getHandlerFunction: () => handler }; triggers.push(t); return t; } };
        return b;
      },
    },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => bound,
      openById: id => { const s = spreadsheets.get(id); if (!s) throw new Error('not found'); return s; },
      create: n => makeSpreadsheet(`ss-${spreadsheets.size + 1}`, n),
      getUi: () => ({ createMenu: () => ({ addItem() { return this; }, addToUi() {} }), alert: m => log.logger.push(`alert:${m}`) }),
    },
    Logger: { log: m => log.logger.push(String(m)) },
    Calendar,
  };
  return { ctx, log, props, events, triggers, bound, spreadsheets };
}
