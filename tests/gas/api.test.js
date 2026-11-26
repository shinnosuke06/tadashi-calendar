import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadGas } from './load-gas.js';

function ready(options) {
  const env = loadGas(options);
  env.gas.setup();
  return { ...env, KEY: env.props.get('API_KEY') };
}

test('setup で合言葉ができ、ログに出る', () => {
  const { KEY, log } = ready();
  assert.match(KEY, /^[0-9a-f]{64}$/);
  assert.ok(log.logger.some(l => l.includes(KEY)));
});
test('合言葉が違えば BAD_KEY', () => {
  const { post } = ready();
  assert.deepEqual(post({ key: 'x', action: 'ping' }), { ok: false, error: { code: 'BAD_KEY' } });
  assert.deepEqual(post({ action: 'ping' }), { ok: false, error: { code: 'BAD_KEY' } });
});
test('合言葉ができる前は誰も入れない', () => {
  const { post } = loadGas();
  assert.deepEqual(post({ key: '', action: 'ping' }), { ok: false, error: { code: 'BAD_KEY' } });
});
test('ping は版を返す', () => { const { post, KEY } = ready(); assert.deepEqual(post({ key: KEY, action: 'ping' }).data, { version: 1 }); });
test('events.list はページをたどる', () => {
  const { post, KEY, log } = ready({ pages: [[{ id: 'a' }, { id: 'b' }], [{ id: 'c' }]] });
  const res = post({ key: KEY, action: 'events.list', params: { calendarId: 'primary', timeMin: 't1', timeMax: 't2', q: '眼科' } });
  assert.deepEqual(res.data.map(e => e.id), ['a', 'b', 'c']);
  const first = log.calls.find(c => c[0] === 'Events.list');
  assert.deepEqual(first[2], { timeMin: 't1', timeMax: 't2', q: '眼科', singleEvents: true, orderBy: 'startTime', maxResults: 2500 });
});
test('events.insert・patch・delete の引数の順番が正しい', () => {
  const { post, KEY, log } = ready();
  const made = post({ key: KEY, action: 'events.insert', params: { calendarId: 'primary', resource: { summary: '眼科' } } }).data;
  post({ key: KEY, action: 'events.patch', params: { calendarId: 'primary', eventId: made.id, resource: { summary: '歯医者' } } });
  post({ key: KEY, action: 'events.delete', params: { calendarId: 'primary', eventId: made.id } });
  assert.deepEqual(log.calls.find(c => c[0] === 'Events.insert').slice(1), [{ summary: '眼科' }, 'primary']);
  assert.deepEqual(log.calls.find(c => c[0] === 'Events.patch').slice(1), [{ summary: '歯医者' }, 'primary', made.id]);
  assert.deepEqual(log.calls.find(c => c[0] === 'Events.remove').slice(1), ['primary', made.id]);
});
test('見つからない予定は NOT_FOUND、それ以外は INTERNAL（中身は返さない）', () => {
  const { post, KEY, gas, log } = ready();
  assert.deepEqual(post({ key: KEY, action: 'events.get', params: { calendarId: 'primary', eventId: 'nope' } }), { ok: false, error: { code: 'NOT_FOUND' } });
  gas.Calendar.Events.list = () => { throw new Error('secret detail'); };
  const res = post({ key: KEY, action: 'events.list', params: { calendarId: 'primary' } });
  assert.deepEqual(res, { ok: false, error: { code: 'INTERNAL' } });
  assert.ok(log.errors.some(e => e.includes('secret detail')));
  assert.deepEqual(post({ key: KEY, action: 'nope' }), { ok: false, error: { code: 'INTERNAL' } });
});
test('カレンダーの一覧', () => {
  const { post, KEY } = ready();
  assert.deepEqual(post({ key: KEY, action: 'calendars.list' }).data[0], { id: 'primary@example.com', summary: '父', primary: true, backgroundColor: '#039be5', accessRole: 'owner' });
});
test('設定の保存と読み出し', () => {
  const { post, KEY, bound } = ready();
  assert.equal(post({ key: KEY, action: 'settings.get' }).data, null);
  post({ key: KEY, action: 'settings.save', params: { settings: { fontLevel: 4 } } });
  assert.deepEqual(post({ key: KEY, action: 'settings.get' }).data, { fontLevel: 4 });
  assert.ok(bound.getSheetByName('設定').getRange('B1').getValue());
});
test('setup は何度実行しても予約が 1 つ、合言葉は変わらない', () => {
  const { gas, triggers, props, KEY } = ready();
  gas.setup();
  assert.equal(triggers.filter(t => t.getHandlerFunction() === 'nightlyBackup').length, 1);
  assert.equal(props.get('API_KEY'), KEY);
  assert.equal(props.get('SPREADSHEET_ID'), 'ss-bound');
});
test('合言葉の作り直し', () => {
  const { gas, post, props, KEY } = ready();
  gas.reissueKey();
  assert.notEqual(props.get('API_KEY'), KEY);
  assert.deepEqual(post({ key: KEY, action: 'ping' }), { ok: false, error: { code: 'BAD_KEY' } });
});
test('events.insert は同じ番号で 2 回届いても、予定を 1 つだけ作る（送り直し対策）', () => {
  const { post, KEY } = ready();
  const params = { calendarId: 'primary', resource: { id: 'abcdefghij0123456789', summary: '眼科' } };
  const first = post({ key: KEY, action: 'events.insert', params });
  const again = post({ key: KEY, action: 'events.insert', params });
  assert.equal(first.ok, true);
  assert.equal(again.ok, true);
  assert.equal(again.data.id, 'abcdefghij0123456789');
  assert.equal(again.data.summary, '眼科');
  const list = post({ key: KEY, action: 'events.list', params: { calendarId: 'primary', timeMin: 'a', timeMax: 'b' } }).data;
  assert.equal(list.length, 1);
});
