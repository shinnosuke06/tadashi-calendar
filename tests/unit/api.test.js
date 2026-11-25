import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApi, ApiError } from '../../app/js/api.js';

const reply = body => async () => new Response(JSON.stringify(body));

test('POST で送り、合言葉は URL に入れない', async () => {
  let req; const api = createApi({ url: 'https://example.test/exec', key: 'k1' },
    { fetchImpl: async (u, o) => { req = { u, o }; return new Response(JSON.stringify({ ok: true, data: { version: 1 } })); } });
  assert.deepEqual(await api.ping(), { version: 1 });
  assert.equal(req.u, 'https://example.test/exec'); assert.equal(req.o.method, 'POST');
  assert.equal(req.o.headers['Content-Type'], 'text/plain;charset=utf-8');
  assert.deepEqual(JSON.parse(req.o.body), { key: 'k1', action: 'ping', params: {} });
});
test('関数と action 名の対応', async () => {
  const seen = [];
  const api = createApi({ url: 'u', key: 'k' }, { fetchImpl: async (u, o) => { seen.push(JSON.parse(o.body)); return new Response(JSON.stringify({ ok: true, data: null })); } });
  await api.listEvents({ calendarId: 'primary', timeMin: 'a', timeMax: 'b' });
  await api.patchEvent({ calendarId: 'primary', eventId: 'e1', resource: { summary: 'x' } });
  await api.reverseGeocode({ lat: 1, lng: 2 });
  assert.deepEqual(seen.map(s => s.action), ['events.list', 'events.patch', 'reverseGeocode']);
  assert.deepEqual(seen[1].params, { calendarId: 'primary', eventId: 'e1', resource: { summary: 'x' } });
});
test('BAD_KEY は badKey', async () => {
  const api = createApi({ url: 'u', key: 'k' }, { fetchImpl: reply({ ok: false, error: { code: 'BAD_KEY' } }) });
  await assert.rejects(api.ping(), e => e instanceof ApiError && e.kind === 'badKey' && e.message === '接続の設定が正しくありません。家族に連絡してください。');
});
test('NOT_FOUND・LIMIT・INTERNAL', async () => {
  for (const [code, kind, message] of [['NOT_FOUND', 'notFound', 'この予定は見つかりませんでした。'],
    ['LIMIT', 'limit', '今日は移動時間を計算できる回数を使い切りました。明日また計算できます。'],
    ['INTERNAL', 'server', 'うまくいきませんでした。少したってから、もう一度お試しください。']]) {
    const api = createApi({ url: 'u', key: 'k' }, { fetchImpl: reply({ ok: false, error: { code } }) });
    await assert.rejects(api.getEvent({ calendarId: 'primary', eventId: 'x' }), e => e.kind === kind && e.message === message);
  }
});
test('通信できない → offline', async () => {
  const api = createApi({ url: 'u', key: 'k' }, { fetchImpl: async () => { throw new TypeError('Failed to fetch'); } });
  await assert.rejects(api.ping(), e => e.kind === 'offline' && e.message === '電波が弱いようです。少したってから、もう一度お試しください。');
});
test('遅すぎる → timeout', async () => {
  const slow = (u, o) => new Promise((resolve, reject) => {
    const t = setTimeout(() => resolve(new Response('{}')), 200);
    o.signal.addEventListener('abort', () => { clearTimeout(t); reject(new DOMException('aborted', 'AbortError')); });
  });
  const api = createApi({ url: 'u', key: 'k' }, { fetchImpl: slow, timeoutMs: 50 });
  await assert.rejects(api.ping(), e => e.kind === 'timeout' && e.message === '電波が弱いようです。少したってから、もう一度お試しください。');
});
test('おかしな返事 → server', async () => {
  const api = createApi({ url: 'u', key: 'k' }, { fetchImpl: async () => new Response('<html>', { status: 200 }) });
  await assert.rejects(api.ping(), e => e.kind === 'server');
  const api2 = createApi({ url: 'u', key: 'k' }, { fetchImpl: async () => new Response('{}', { status: 502 }) });
  await assert.rejects(api2.ping(), e => e.kind === 'server');
});
