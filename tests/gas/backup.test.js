import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadGas } from './load-gas.js';

function ready() {
  const env = loadGas();
  env.gas.setup();
  return env;
}
const today = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const addEvent = (env, e) => env.events.set(e.id, { calendarId: 'primary@example.com', status: 'confirmed', ...e });

test('毎晩の控え: シート名・見出し・行', () => {
  const env = ready();
  addEvent(env, { id: 'e1', summary: '眼科', start: { dateTime: '2026-12-03T10:00:00+09:00' }, end: { dateTime: '2026-12-03T11:00:00+09:00' }, location: 'さくら眼科', description: 'メモ', etag: 'x' });
  addEvent(env, { id: 'e2', summary: '内科', start: { date: '2026-12-08' }, end: { date: '2026-12-09' }, recurrence: ['RRULE:FREQ=MONTHLY;BYMONTHDAY=8'] });
  env.gas.nightlyBackup();
  const sheet = env.bound.getSheetByName(`控え_${today()}`);
  assert.ok(sheet);
  assert.deepEqual(sheet.getRange(1, 1, 1, 11).getValues()[0], ['カレンダー', '予定ID', '状態', 'タイトル', '開始', '終了', '終日', '場所', 'メモ', '繰り返し', '元データ']);
  assert.equal(sheet.getLastRow(), 3);
  const rows = sheet.getRange(2, 1, 2, 11).getValues();
  assert.deepEqual(rows[0].slice(0, 10), ['primary@example.com', 'e1', 'confirmed', '眼科', '2026-12-03T10:00:00+09:00', '2026-12-03T11:00:00+09:00', false, 'さくら眼科', 'メモ', '']);
  assert.equal(rows[1][6], true);
  assert.equal(rows[1][9], 'RRULE:FREQ=MONTHLY;BYMONTHDAY=8');
  assert.equal(JSON.parse(rows[0][10]).etag, 'x');
  // 読むだけのカレンダー（祝日など）は控えない
  const listCalls = env.log.calls.filter(c => c[0] === 'Events.list').map(c => c[1]);
  assert.deepEqual([...new Set(listCalls)], ['primary@example.com']);
  assert.equal(env.log.calls.find(c => c[0] === 'Events.list')[2].singleEvents, false);
});
test('控えは新しいほうから 14 枚だけ残す', () => {
  const env = ready();
  for (let d = 1; d <= 14; d++) env.bound.insertSheet(`控え_2000-01-${String(d).padStart(2, '0')}`);
  env.gas.nightlyBackup();
  const names = env.bound.getSheets().map(s => s.getName()).filter(n => n.startsWith('控え_'));
  assert.equal(names.length, 14);
  assert.ok(!names.includes('控え_2000-01-01'));
  assert.ok(names.includes(`控え_${today()}`));
});
test('古い日付の回数の記録を消す', () => {
  const env = ready();
  env.props.set('ROUTE_COUNT_2000-01-01', '5');
  env.props.set('GEO_COUNT_2000-01-01', '5');
  env.props.set(`ROUTE_COUNT_${today()}`, '4');
  env.gas.nightlyBackup();
  assert.equal(env.props.get('ROUTE_COUNT_2000-01-01'), undefined);
  assert.equal(env.props.get('GEO_COUNT_2000-01-01'), undefined);
  assert.equal(env.props.get(`ROUTE_COUNT_${today()}`), '4');
});
test('選んだ行の予定を戻す（id などを除いて入れ直す）', () => {
  const env = ready();
  addEvent(env, { id: 'e1', summary: '眼科', etag: 'x', htmlLink: 'h', iCalUID: 'u', created: 'c', updated: 'u2', creator: {}, organizer: {}, start: { dateTime: '2026-12-03T10:00:00+09:00' }, end: { dateTime: '2026-12-03T11:00:00+09:00' } });
  env.gas.nightlyBackup();
  env.events.delete('e1');
  const sheet = env.bound.getSheetByName(`控え_${today()}`);
  env.bound._activeSheet = sheet;
  sheet._active = { getRow: () => 2 };
  env.gas.restoreSelectedRow();
  const ins = env.log.calls.find(c => c[0] === 'Events.insert');
  assert.deepEqual(Object.keys(ins[1]).sort(), ['calendarId', 'end', 'start', 'status', 'summary']);
  assert.equal(ins[2], 'primary@example.com');
  assert.ok(env.log.logger.some(l => l.startsWith('alert:戻しました')));
});
test('まだある予定は戻さない', () => {
  const env = ready();
  addEvent(env, { id: 'e1', summary: '眼科', start: { dateTime: '2026-12-03T10:00:00+09:00' }, end: { dateTime: '2026-12-03T11:00:00+09:00' } });
  env.gas.nightlyBackup();
  const sheet = env.bound.getSheetByName(`控え_${today()}`);
  env.bound._activeSheet = sheet;
  sheet._active = { getRow: () => 2 };
  env.gas.restoreSelectedRow();
  assert.equal(env.log.calls.filter(c => c[0] === 'Events.insert').length, 0);
  assert.ok(env.log.logger.includes('alert:この予定は今もあります'));
});
test('メニュー', () => { const env = ready(); env.gas.onOpen(); });
