import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toGoogleReminders, presetsFromOverrides, describeNotify, defaultNotifyFor, TIMED_PRESETS, ALLDAY_PRESETS } from '../../app/js/reminders.js';
import { DEFAULT_SETTINGS as S } from '../../app/js/settings.js';

test('通知オフは Google のいつもの通知も付けない', () =>
  assert.deepEqual(toGoogleReminders({ allDay: false, notify: { on: false, presets: [] } }, S), { useDefault: false, overrides: [] }));
test('出発の目安の通知は、選んだ道で計算する', () => {
  const ev = { allDay: false, start: '2026-12-02T10:00', notify: { on: true, presets: ['depart'] },
    route: { withHighways: { minutes: 25 }, withoutHighways: { minutes: 40 } } };
  assert.deepEqual(toGoogleReminders(ev, { ...S, departRoute: 'withoutHighways' }).overrides, [{ method: 'popup', minutes: 50 }]);
  assert.deepEqual(toGoogleReminders(ev, { ...S, departRoute: 'withHighways' }).overrides, [{ method: 'popup', minutes: 35 }]);
});
test('道が分からなければ出発の通知は付けない', () =>
  assert.deepEqual(toGoogleReminders({ allDay: false, start: '2026-12-02T10:00', route: null, notify: { on: true, presets: ['depart', '1h'] } }, S).overrides, [{ method: 'popup', minutes: 60 }]));
test('通知は 5 つまで', () =>
  assert.equal(toGoogleReminders({ allDay: false, start: '2026-12-02T10:00', notify: { on: true, presets: ['week', '2days', '1day', '3h', '1h', '30m'] } }, S).overrides.length, 5));
test('Google の通知から選択肢に戻す', () =>
  assert.deepEqual(presetsFromOverrides([{ minutes: 1440 }, { minutes: 45 }], false), { presets: ['1day'], custom: [45] }));
test('終日の通知', () => {
  assert.deepEqual(toGoogleReminders({ allDay: true, start: '2026-12-11', notify: { on: true, presets: ['ad_prevEvening', 'ad_prevMorning'] } }, S).overrides,
    [{ method: 'popup', minutes: 900 }, { method: 'popup', minutes: 240 }]);
  assert.deepEqual(presetsFromOverrides([{ minutes: 240 }], true), { presets: ['ad_prevEvening'], custom: [] });
});
test('いつもの通知と、自分で決めた分数', () => {
  assert.deepEqual(toGoogleReminders({ allDay: false, start: '2026-12-02T10:00', notify: { on: true, presets: [], googleDefault: true } }, S), { useDefault: true });
  assert.deepEqual(toGoogleReminders({ allDay: false, start: '2026-12-02T10:00', notify: { on: true, presets: ['1h'], custom: [45] } }, S).overrides,
    [{ method: 'popup', minutes: 60 }, { method: 'popup', minutes: 45 }]);
});
test('通知の説明', () => {
  assert.equal(describeNotify({ on: true, presets: ['1day', '1h'] }, false), '前日（同じ時刻）・1時間前');
  assert.equal(describeNotify({ on: false, presets: [] }, false), '通知なし');
  assert.equal(describeNotify({ on: true, presets: [], googleDefault: true }, false), 'いつもの通知（Google の設定）');
  assert.equal(describeNotify({ on: true, presets: [], custom: [45, 120] }, false), '45分前・2時間前');
});
test('新しい予定の通知の初期値', () => {
  assert.deepEqual(defaultNotifyFor(false, S), { on: true, presets: ['1day', '1h'] });
  assert.deepEqual(defaultNotifyFor(true, S), { on: true, presets: ['ad_prevEvening'] });
});
test('選択肢の一覧', () => {
  assert.deepEqual(TIMED_PRESETS.map(p => p.id), ['week', '2days', '1day', '3h', '1h', '30m', 'depart']);
  assert.deepEqual(ALLDAY_PRESETS.map(p => [p.id, p.minutes]), [['ad_week', 9540], ['ad_2days', 2340], ['ad_prevMorning', 900], ['ad_prevEvening', 240]]);
});
