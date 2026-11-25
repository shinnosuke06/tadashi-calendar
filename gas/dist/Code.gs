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
