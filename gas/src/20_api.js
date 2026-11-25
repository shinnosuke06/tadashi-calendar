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
