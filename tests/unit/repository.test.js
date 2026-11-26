import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryKV } from '../../app/js/kv.js';
import { createDemoApi } from '../../app/js/demo-api.js';
import { createRepository } from '../../app/js/repository.js';
import { ApiError } from '../../app/js/api.js';
import { DEFAULT_SETTINGS } from '../../app/js/settings.js';

const now = () => new Date('2026-12-01T00:00:00Z'); // 日本時間 12/1 9:00
const settings = { ...DEFAULT_SETTINGS, home: { address: '自宅（見本）', lat: 35.47, lng: 139.6 } };

// お試し用の窓口を包んで、呼び出しを記録する（offline にもできる）
function spyApi(kv) {
  const real = createDemoApi({ now, kv });
  const calls = [];
  const state = { offline: false, failRoute: false };
  const api = {};
  for (const name of Object.keys(real)) {
    api[name] = async p => {
      calls.push([name, structuredClone(p)]);
      if (state.offline) throw new ApiError('offline');
      if (name === 'route' && state.failRoute) throw new ApiError('limit');
      return real[name](p);
    };
  }
  return { api, calls, state, count: name => calls.filter(c => c[0] === name).length, last: name => calls.filter(c => c[0] === name).at(-1)?.[1] };
}
async function setup() {
  const kv = createMemoryKV();
  const spy = spyApi(createMemoryKV());
  const repo = createRepository({ api: spy.api, kv, getSettings: () => settings, now });
  return { repo, spy, kv };
}
const newEvent = (o = {}) => ({
  calendarId: 'primary', id: null, recurringEventId: null, originalStart: null, title: '散髪', allDay: false,
  start: '2026-12-02T10:00', end: '2026-12-02T11:00', location: '', memo: '', categoryId: null, colorId: null, recurrence: null,
  notify: { on: true, presets: ['depart', '1h'], googleDefault: false, custom: [] }, items: [], origin: 'home', route: null, geo: null, pending: false, ...o,
});
async function loadDec(repo) { let got = []; await repo.loadRange('2026-12-01', '2026-12-31', evs => { got = evs; }); return got; }

test('保存しても予定の時刻は入力のまま（Google に送る開始時刻）', async () => {
  const { repo, spy } = await setup();
  const saved = await repo.saveEvent(newEvent({ location: 'さくら眼科' }));
  assert.equal(spy.last('insertEvent').resource.start.dateTime, '2026-12-02T10:00:00+09:00');
  assert.equal(saved.start, '2026-12-02T10:00');
  assert.equal(saved.calendarId, 'primary');
  assert.ok(saved.id && !saved.pending);
  assert.equal(saved.route.withoutHighways.minutes, 40);
  assert.equal(saved.route.address, 'さくら市中央1-2（架空）');
  assert.deepEqual(saved.geo, { lat: 35.4437, lng: 139.638 });
});
test('場所が変わったときだけ道を計算する', async () => {
  const { repo, spy } = await setup();
  const first = await repo.saveEvent(newEvent({ location: 'さくら眼科' }));
  await repo.saveEvent({ ...first, title: '眼科（再）' }, { original: first });
  assert.equal(spy.count('route'), 1);
  await repo.saveEvent({ ...first, location: 'みどり歯科' }, { original: first });
  assert.equal(spy.count('route'), 2);
  assert.equal(spy.last('route').origin, '自宅（見本）');
});
test('場所がなければ道を計算しない', async () => {
  const { repo, spy } = await setup();
  const saved = await repo.saveEvent(newEvent());
  assert.equal(spy.count('route'), 0);
  assert.equal(saved.route, null);
});
test('道が見つからなくても保存できる', async () => {
  const { repo } = await setup();
  const saved = await repo.saveEvent(newEvent({ location: '不明な場所' }));
  assert.ok(saved.id);
  assert.equal(saved.route.withHighways, null);
  assert.equal(saved.route.withoutHighways, null);
});
test('道の計算が回数の上限でも保存できる', async () => {
  const { repo, spy } = await setup();
  spy.state.failRoute = true;
  const saved = await repo.saveEvent(newEvent({ location: 'さくら眼科' }));
  assert.ok(saved.id);
  assert.equal(saved.route, null);
  assert.equal(repo.lastRouteError.kind, 'limit');
});
test('このアプリ以外の情報は送らない', async () => {
  const { repo, spy } = await setup();
  await spy.api.insertEvent({ calendarId: 'primary', resource: { summary: '会合', attendees: [{ email: 'friend@example.com' }],
    start: { dateTime: '2026-12-09T13:00:00+09:00' }, end: { dateTime: '2026-12-09T14:00:00+09:00' }, reminders: { useDefault: true } } });
  const ev = (await loadDec(repo)).find(e => e.title === '会合');
  await repo.saveEvent({ ...ev, title: '会合（場所変更）' }, { original: ev });
  const res = spy.last('patchEvent').resource;
  assert.equal(res.attendees, undefined);
  assert.equal(res.summary, '会合（場所変更）');
  assert.deepEqual(res.reminders, { useDefault: true });
});
test('すべてを直す: 親の時刻を差分でずらす', async () => {
  const { repo, spy } = await setup();
  const first = (await loadDec(repo)).find(e => e.title === '内科'); // 12 月は 12/8 の 1 回だけ
  assert.equal(first.start, '2026-12-08T09:00');
  await repo.saveEvent({ ...first, start: '2026-12-08T10:00', end: '2026-12-08T11:00' }, { scope: 'all', original: first });
  const p = spy.last('patchEvent');
  assert.equal(p.eventId, 'demo-naika');
  assert.equal(p.resource.start.dateTime, '2026-12-08T10:00:00+09:00');
  assert.equal(p.resource.end.dateTime, '2026-12-08T11:00:00+09:00');
  assert.match(p.resource.recurrence[0], /^RRULE:FREQ=MONTHLY/);
});
test('これ以降を直す: 親を区切り、新しい繰り返しを作る', async () => {
  const { repo, spy } = await setup();
  const naika = (await loadDec(repo)).filter(e => e.title === '内科');
  await repo.loadRange('2026-12-01', '2027-03-31', () => {});
  const second = (await repo.cache.getRange('2027-01-01', '2027-01-31')).find(e => e.title === '内科');
  await repo.saveEvent({ ...second, title: '内科（新しい先生）' }, { scope: 'following', original: second });
  const patch = spy.last('patchEvent'), insert = spy.last('insertEvent');
  assert.equal(patch.eventId, 'demo-naika');
  assert.match(patch.resource.recurrence[0], /UNTIL=20270107T235900Z/); // 1/8 9:00（日本時間）の 1 分前
  assert.doesNotMatch(patch.resource.recurrence[0], /COUNT/);
  assert.equal(insert.resource.summary, '内科（新しい先生）');
  assert.equal(insert.resource.start.dateTime, '2027-01-08T09:00:00+09:00');
  assert.ok(insert.resource.recurrence);
  assert.ok(naika.length >= 1);
});
test('1 回分だけ消す', async () => {
  const { repo, spy } = await setup();
  const naika = (await loadDec(repo)).filter(e => e.title === '内科');
  await repo.deleteEvent(naika[0], 'one');
  assert.equal(spy.last('deleteEvent').eventId, naika[0].id);
  assert.equal((await loadDec(repo)).filter(e => e.title === '内科').length, 0);
});
test('取り直しに失敗しても保存分を返す', async () => {
  const { repo, spy } = await setup();
  await loadDec(repo);
  spy.state.offline = true;
  const updates = [];
  await repo.loadRange('2026-12-01', '2026-12-31', evs => updates.push(evs));
  assert.equal(updates.length, 1);
  assert.ok(updates[0].find(e => e.title === '眼科'));
  assert.equal(repo.lastError.kind, 'offline');
});
test('電波がない間の保存は送り直し待ちになり、戻ったら送られる', async () => {
  const { repo, spy } = await setup();
  spy.state.offline = true;
  const saved = await repo.saveEvent(newEvent({ title: '電波なしの予定' }));
  assert.equal(saved.pending, true);
  assert.ok((await repo.cache.getRange('2026-12-02', '2026-12-02')).find(e => e.title === '電波なしの予定' && e.pending));
  spy.state.offline = false;
  assert.deepEqual(await repo.syncOutbox(), { sent: 1, remaining: 0 });
  const got = (await loadDec(repo)).find(e => e.title === '電波なしの予定');
  assert.equal(got.pending, false);
  assert.doesNotMatch(got.id, /^tmp-/);
});
test('持ち物のチェックを保存する', async () => {
  const { repo } = await setup();
  const eye = (await loadDec(repo)).find(e => e.title === '眼科');
  const updated = await repo.toggleItem(eye, 1);
  assert.equal(updated.items[1].done, true);
  assert.equal((await loadDec(repo)).find(e => e.title === '眼科').items[1].done, true);
});
test('探す', async () => {
  const { repo } = await setup();
  assert.deepEqual((await repo.search('眼科')).map(e => e.title), ['眼科']);
});
test('計算し直す', async () => {
  const { repo, spy } = await setup();
  const eye = (await loadDec(repo)).find(e => e.title === '眼科');
  const again = await repo.recomputeRoute(eye);
  assert.equal(spy.count('route'), 1);
  assert.equal(again.route.withHighways.minutes, 25);
});

test('電波がない間に作った予定は、送ったあとも仮の番号で開ける', async () => {
  const { repo, spy } = await setup();
  spy.state.offline = true;
  const saved = await repo.saveEvent(newEvent({ title: '仮の番号の予定' }));
  assert.match(saved.id, /^tmp-/);
  spy.state.offline = false;
  await repo.syncOutbox();
  const got = await repo.getEvent('primary', saved.id);
  assert.equal(got.title, '仮の番号の予定');
  assert.doesNotMatch(got.id, /^tmp-/);
  assert.equal(await repo.resolveId(saved.id), got.id);
});

test('Google には届いたのに返事が切れても、送り直しで予定が 2 つにならない', async () => {
  const { repo, spy } = await setup();
  const realInsert = spy.api.insertEvent;
  let cut = true;
  spy.api.insertEvent = async p => {
    const made = await realInsert(p);
    if (cut) { cut = false; throw new ApiError('timeout'); } // 作れたが、返事が届かなかった
    return made;
  };
  const saved = await repo.saveEvent(newEvent({ title: '一度だけの予定' }));
  assert.equal(saved.pending, true);
  assert.match(spy.last('insertEvent').resource.id, /^[0-9a-v]{26}$/);
  await repo.syncOutbox();
  const got = (await loadDec(repo)).filter(e => e.title === '一度だけの予定');
  assert.equal(got.length, 1);
  assert.equal(got[0].pending, false);
});
