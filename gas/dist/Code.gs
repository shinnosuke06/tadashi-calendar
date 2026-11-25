// =====================================================================
// ただしカレンダー（Google 側のプログラム）
// このファイルは生成物です。直すときは gas/src を直して `npm run build:gas` を実行してください。
// =====================================================================
// ---- 00_config.js ----
// 版の番号。画面（アプリ）側はこれを見て、Google 側の更新が必要か判断する。
const API_VERSION = 1;
const TZ = 'Asia/Tokyo';
const SETTINGS_SHEET = '設定';

// ---- 10_auth.js ----
// 合言葉と初めの設定。家族が Apps Script の画面で setup / showKey / reissueKey を実行する。
function props_() {
  return PropertiesService.getScriptProperties();
}

function newKey_() {
  return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
}

function checkKey_(key) {
  const stored = props_().getProperty('API_KEY');
  return !!stored && typeof key === 'string' && key === stored;
}

// 初めに 1 回実行する（何度実行しても大丈夫）
function setup() {
  const p = props_();
  if (!p.getProperty('API_KEY')) p.setProperty('API_KEY', newKey_());
  if (!p.getProperty('SPREADSHEET_ID')) {
    const active = SpreadsheetApp.getActiveSpreadsheet();
    const ss = active || SpreadsheetApp.create('ただしカレンダー データ');
    p.setProperty('SPREADSHEET_ID', ss.getId());
  }
  const ss = spreadsheet_();
  if (!ss.getSheetByName(SETTINGS_SHEET)) ss.insertSheet(SETTINGS_SHEET);
  const has = ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'nightlyBackup');
  if (!has) ScriptApp.newTrigger('nightlyBackup').timeBased().everyDays(1).atHour(3).create();
  Logger.log('設定が終わりました。合言葉: ' + p.getProperty('API_KEY'));
}

function showKey() {
  Logger.log('合言葉: ' + props_().getProperty('API_KEY'));
}

// スマホを失くしたときなど。古い合言葉は使えなくなる
function reissueKey() {
  props_().setProperty('API_KEY', newKey_());
  Logger.log('新しい合言葉: ' + props_().getProperty('API_KEY'));
}

function spreadsheet_() {
  return SpreadsheetApp.openById(props_().getProperty('SPREADSHEET_ID'));
}

// ---- 20_api.js ----
// 画面（アプリ）からの依頼の受け口。合言葉が合うときだけ受け付ける。
const ACTIONS = {
  'ping': () => ({ version: API_VERSION }),
  'calendars.list': () => listCalendars_(),
  'events.list': p => listEvents_(p),
  'events.get': p => Calendar.Events.get(p.calendarId, p.eventId),
  'events.insert': p => Calendar.Events.insert(p.resource, p.calendarId),
  'events.patch': p => Calendar.Events.patch(p.resource, p.calendarId, p.eventId),
  'events.delete': p => { Calendar.Events.remove(p.calendarId, p.eventId); return null; },
  'settings.get': () => getSettings_(),
  'settings.save': p => saveSettings_(p.settings),
  'route': p => route_(p),
  'geocode': p => geocode_(p),
  'reverseGeocode': p => reverseGeocode_(p),
};

function ok_(data) {
  return ContentService.createTextOutput(JSON.stringify({ ok: true, data: data === undefined ? null : data })).setMimeType(ContentService.MimeType.JSON);
}

function fail_(code) {
  return ContentService.createTextOutput(JSON.stringify({ ok: false, error: { code: code } })).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return fail_('INTERNAL');
  }
  if (!checkKey_(body.key)) return fail_('BAD_KEY');
  const handler = ACTIONS[body.action];
  if (!handler) return fail_('INTERNAL');
  try {
    return ok_(handler(body.params || {}));
  } catch (err) {
    const msg = String(err && err.message || err);
    if (err && err.code === 'LIMIT') return fail_('LIMIT');
    if (/Not Found|has been deleted/i.test(msg)) return fail_('NOT_FOUND');
    console.error(body.action + ': ' + msg);
    return fail_('INTERNAL');
  }
}

// ブラウザで開いたとき用（何もしない）
function doGet() {
  return ContentService.createTextOutput('ただしカレンダー（Google 側）: 動いています。').setMimeType(ContentService.MimeType.TEXT);
}

// ---- 30_calendar.js ----
// Google カレンダーの読み書き（Calendar 拡張サービス v3）
function listEvents_(p) {
  const items = [];
  let pageToken;
  do {
    const opt = { timeMin: p.timeMin, timeMax: p.timeMax, q: p.q, singleEvents: true, orderBy: 'startTime', maxResults: 2500 };
    if (!p.q) delete opt.q;
    if (pageToken) opt.pageToken = pageToken;
    const res = Calendar.Events.list(p.calendarId, opt);
    (res.items || []).forEach(it => items.push(it));
    pageToken = res.nextPageToken;
  } while (pageToken);
  return items;
}

function listCalendars_() {
  return (Calendar.CalendarList.list().items || []).map(c => ({
    id: c.id, summary: c.summary, primary: !!c.primary, backgroundColor: c.backgroundColor, accessRole: c.accessRole,
  }));
}

// ---- 40_maps.js ----
// 地図（道順・住所探し）。Apps Script に最初からある地図機能を使い、料金はかからない。
// Google の上限（個人のアカウントは 1 日 1,000 回）の 1 割に収まるよう、1 日 100 回までに制限する。
const DAILY_ROUTE_LIMIT = 100;
const DAILY_GEO_LIMIT = 100;

function limitError_() {
  const e = new Error('LIMIT');
  e.code = 'LIMIT';
  return e;
}

// その日（日本時間）の回数を数える。足すと上限を超えるなら LIMIT
function useQuota_(prefix, n, limit) {
  const key = prefix + Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
  const used = Number(props_().getProperty(key) || 0);
  if (used + n > limit) throw limitError_();
  props_().setProperty(key, String(used + n));
}

function mapsCall_(fn) {
  try {
    return fn();
  } catch (e) {
    if (/too many times/i.test(String(e && e.message))) throw limitError_();
    throw e;
  }
}

function oneRoute_(origin, destination, avoidHighways) {
  const f = Maps.newDirectionFinder().setOrigin(origin).setDestination(destination)
    .setMode(Maps.DirectionFinder.Mode.DRIVING).setLanguage('ja').setRegion('jp');
  if (avoidHighways) f.setAvoid(Maps.DirectionFinder.Avoid.HIGHWAYS);
  const res = mapsCall_(() => f.getDirections());
  if (!res || res.status !== 'OK' || !res.routes || !res.routes.length) return null;
  const leg = res.routes[0].legs[0];
  return { minutes: Math.round(leg.duration.value / 60), km: Math.round(leg.distance.value / 100) / 10, leg: leg };
}

function cleanAddress_(a) {
  return String(a || '').replace(/^日本、\s*/, '').replace(/^〒\d{3}-\d{4}\s*/, '');
}

function route_(p) {
  useQuota_('ROUTE_COUNT_', 2, DAILY_ROUTE_LIMIT);
  const withHighways = oneRoute_(p.origin, p.destination, false);
  const withoutHighways = oneRoute_(p.origin, p.destination, true);
  const leg = (withHighways || withoutHighways || {}).leg;
  const strip = r => (r ? { minutes: r.minutes, km: r.km } : null);
  return {
    withHighways: strip(withHighways),
    withoutHighways: strip(withoutHighways),
    destinationAddress: leg ? cleanAddress_(leg.end_address) : null,
    destination: leg ? { lat: leg.end_location.lat, lng: leg.end_location.lng } : null,
  };
}

function placeName_(r) {
  const named = (r.address_components || []).find(c => (c.types || []).some(t => t === 'establishment' || t === 'point_of_interest'));
  return named ? named.long_name : cleanAddress_(r.formatted_address);
}

function geocode_(p) {
  useQuota_('GEO_COUNT_', 1, DAILY_GEO_LIMIT);
  const g = Maps.newGeocoder().setLanguage('ja').setRegion('jp');
  if (p.near) g.setBounds(p.near.lat - 0.27, p.near.lng - 0.33, p.near.lat + 0.27, p.near.lng + 0.33);
  const res = mapsCall_(() => g.geocode(p.address));
  const results = (res && res.status === 'OK' ? res.results : []).slice(0, 5).map(r => ({
    name: placeName_(r), address: cleanAddress_(r.formatted_address),
    lat: r.geometry.location.lat, lng: r.geometry.location.lng,
  }));
  return { results: results };
}

function reverseGeocode_(p) {
  useQuota_('GEO_COUNT_', 1, DAILY_GEO_LIMIT);
  const res = mapsCall_(() => Maps.newGeocoder().setLanguage('ja').setRegion('jp').reverseGeocode(p.lat, p.lng));
  if (!res || res.status !== 'OK' || !res.results.length) return null;
  return { address: cleanAddress_(res.results[0].formatted_address) };
}

// ---- 50_settings.js ----
// 設定は「設定」シートの A1 に JSON で、B1 に保存した日時を入れる
function settingsSheet_() {
  const ss = spreadsheet_();
  return ss.getSheetByName(SETTINGS_SHEET) || ss.insertSheet(SETTINGS_SHEET);
}

function getSettings_() {
  const v = settingsSheet_().getRange('A1').getValue();
  if (!v) return null;
  try { return JSON.parse(v); } catch (e) { return null; }
}

function saveSettings_(settings) {
  const sheet = settingsSheet_();
  sheet.getRange('A1').setValue(JSON.stringify(settings));
  sheet.getRange('B1').setValue(Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm'));
  return null;
}

// ---- 60_backup.js ----
// 毎晩の控え（スプレッドシートに予定を丸ごと写す）と、控えから予定を戻す操作
const BACKUP_PREFIX = '控え_';
const BACKUP_KEEP = 14;
const BACKUP_HEADER = ['カレンダー', '予定ID', '状態', 'タイトル', '開始', '終了', '終日', '場所', 'メモ', '繰り返し', '元データ'];
const STRIP_ON_RESTORE = ['id', 'etag', 'htmlLink', 'iCalUID', 'recurringEventId', 'created', 'updated', 'creator', 'organizer'];

function nightlyBackup() {
  const now = new Date();
  const timeMin = new Date(now.getTime() - 400 * 86400000).toISOString();
  const timeMax = new Date(now.getTime() + 3 * 366 * 86400000).toISOString();
  const rows = [];
  const cals = (Calendar.CalendarList.list().items || []).filter(c => c.accessRole === 'owner' || c.accessRole === 'writer');
  cals.forEach(c => {
    let pageToken;
    do {
      const opt = { timeMin: timeMin, timeMax: timeMax, singleEvents: false, maxResults: 2500 };
      if (pageToken) opt.pageToken = pageToken;
      const res = Calendar.Events.list(c.id, opt);
      (res.items || []).forEach(ev => {
        const allDay = !!(ev.start && ev.start.date);
        rows.push([c.id, ev.id, ev.status || '', ev.summary || '',
          allDay ? ev.start.date : (ev.start && ev.start.dateTime) || '',
          allDay ? ev.end.date : (ev.end && ev.end.dateTime) || '',
          allDay, ev.location || '', ev.description || '', (ev.recurrence || []).join('\n'), JSON.stringify(ev)]);
      });
      pageToken = res.nextPageToken;
    } while (pageToken);
  });

  const ss = spreadsheet_();
  const name = BACKUP_PREFIX + Utilities.formatDate(now, TZ, 'yyyy-MM-dd');
  const old = ss.getSheetByName(name);
  if (old) ss.deleteSheet(old);
  const sheet = ss.insertSheet(name);
  sheet.getRange(1, 1, 1, BACKUP_HEADER.length).setValues([BACKUP_HEADER]);
  if (rows.length) sheet.getRange(2, 1, rows.length, BACKUP_HEADER.length).setValues(rows);
  sheet.setFrozenRows(1);

  // 古い控えを消す（新しいほうから 14 枚残す）
  ss.getSheets().filter(s => s.getName().indexOf(BACKUP_PREFIX) === 0)
    .sort((a, b) => (a.getName() < b.getName() ? 1 : -1))
    .slice(BACKUP_KEEP).forEach(s => ss.deleteSheet(s));

  // 古い日付の回数の記録を消す
  const today = Utilities.formatDate(now, TZ, 'yyyy-MM-dd');
  props_().getKeys().forEach(k => {
    if (/^(ROUTE|GEO)_COUNT_/.test(k) && k.slice(-10) !== today) props_().deleteProperty(k);
  });
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('ただしカレンダー').addItem('選んだ行の予定を戻す', 'restoreSelectedRow').addToUi();
}

function restoreSelectedRow() {
  const ui = SpreadsheetApp.getUi();
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  if (sheet.getName().indexOf(BACKUP_PREFIX) !== 0) { ui.alert('控えのシートで、戻したい予定の行を選んでから実行してください。'); return; }
  const row = sheet.getActiveRange().getRow();
  if (row < 2) { ui.alert('戻したい予定の行を選んでから実行してください。'); return; }
  const values = sheet.getRange(row, 1, 1, BACKUP_HEADER.length).getValues()[0];
  const calendarId = values[0];
  const raw = JSON.parse(values[10]);
  try {
    const now = Calendar.Events.get(calendarId, raw.id);
    if (now && now.status !== 'cancelled') { ui.alert('この予定は今もあります'); return; }
  } catch (e) {
    if (!/Not Found|has been deleted/i.test(String(e && e.message))) throw e;
  }
  const resource = {};
  Object.keys(raw).forEach(k => { if (STRIP_ON_RESTORE.indexOf(k) < 0) resource[k] = raw[k]; });
  resource.status = 'confirmed';
  Calendar.Events.insert(resource, calendarId);
  ui.alert('戻しました：' + (raw.summary || '（タイトルなし）'));
}
