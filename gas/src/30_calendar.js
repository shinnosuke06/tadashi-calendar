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
