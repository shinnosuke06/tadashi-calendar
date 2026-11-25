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
