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

// 画面が番号を決めて送ってくる。同じ番号で 2 回届いたとき（返事が途中で切れて送り直したとき）は、
// 新しく作らずに、すでにある予定を返す（同じ予定が 2 つにならないように）
function insertEvent_(p) {
  try {
    return Calendar.Events.insert(p.resource, p.calendarId);
  } catch (err) {
    if (p.resource && p.resource.id && /already exists/i.test(String(err && err.message))) return Calendar.Events.get(p.calendarId, p.resource.id);
    throw err;
  }
}
