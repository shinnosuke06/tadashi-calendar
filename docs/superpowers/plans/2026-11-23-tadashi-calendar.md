# ただしカレンダー 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 父が iPhone のホーム画面から、ログインなしで使える大きな字のカレンダー Web アプリと、父の Google カレンダーにつなぐ Apps Script を作る。

**Architecture:** 画面は、ビルドのいらない素の JavaScript（ES モジュール）で作った PWA にして、GitHub Pages に置く。Google とのやりとりは、父のアカウントで動く Apps Script の Web アプリが受け持つ。Apps Script は、合言葉を確かめたうえで Calendar API・地図・スプレッドシートを中継するだけの薄い層にする。予定の変換・繰り返し・通知・出発の目安などの考えごとは、すべて画面側の、テストできる純粋な関数に置く（Apps Script の更新は家族の手作業になるため、変更をなるべく画面側だけで済ませる）。

**Tech Stack:** HTML/CSS/JavaScript（ES2022、フレームワークなし）、IndexedDB、Service Worker、Google Apps Script（V8、Calendar 拡張サービス v3、Maps サービス）、Open-Meteo、Node 22 の `node --test`、Playwright（あらかじめ入っている Chromium で iPhone を再現）、GitHub Actions と GitHub Pages。

**Spec:** `docs/superpowers/specs/2026-11-22-tadashi-calendar-design.md`

## Global Constraints

- 費用は 0 円。有料の API や CDN は使わない。外部へ通信してよいのは、Apps Script の URL と `api.open-meteo.com` だけ。
- 公開リポジトリなので、父の予定・住所・合言葉・Apps Script の URL をコード・テスト・テスト用データに入れない（見本の予定は架空のものにする）。
- viewport は `width=device-width, initial-scale=1, viewport-fit=cover` だけにする。`maximum-scale` と `user-scalable` は書かない（指での拡大を禁止しない）。
- 文字サイズは 5 段階 `[16, 18, 22, 26, 32]`px。初期値は 22px（2 番目、0 から数えた番号）。
- `input`・`select`・`textarea` の文字は、どの段階でも 16px 以上にする。
- 日付と時刻は、端末の時間帯に関係なく、必ず日本時間（Asia/Tokyo、+09:00）で計算する。
- 予定の開始・終了時刻は、父がフォームに入力した値だけから作る。移動時間・出発の目安・通知から時刻を書き換えない（アンチゴール 2）。
- 出発の時刻は、必ず「出発の目安」という言葉を付け、予定の時刻より小さい文字で、別の行に出す（アンチゴール 3）。
- 画面の言葉は、やさしい日本語にする。英語・技術用語・エラー番号を出さない。
- 押せる部分は、最低でも高さ 48px にする。アイコンだけのボタンは作らず、必ず文字を添える。
- Apps Script の時間帯は `Asia/Tokyo`。

## Review Focus

1. **Google カレンダーのアプリなど、このアプリ以外で作られた予定**（独自の記録なし、持ち物の区切りがないメモ、複数の曜日を指定した繰り返し、招待客付き、いつもの通知のまま）→ 落ちずに表示できる。直しても、このアプリが扱わない情報は消さない。扱えない繰り返しは、繰り返しの欄だけ直せないようにする。（Task 6、Task 10 のテスト）
2. **端末の時間帯が日本以外**（海外旅行など）→ 日付・時刻はすべて日本時間のまま。（単体テストは全部 `TZ=America/New_York` で動かす。E2E は Task 13 で `timezoneId` を変えて確かめる）
3. **一番大きい文字（32px）で、幅の狭い iPhone（幅 375px）**→ 横にはみ出さない。時刻が「…」で切れない。下のボタンの文字も見える。（Task 12、Task 13 の E2E）
4. **電波がない、または Apps Script の返事が遅い（起動に 10〜20 秒かかる）**→ 端末に保存した予定を表示する。保存は送り直し待ちに入れる。画面は真っ白にならず、日本語の案内を出す。（Task 8、Task 9、Task 19）
5. **地図で見つからない場所の名前**（「病院」だけ、打ち間違い）→ 予定の保存は成功させ、移動時間は「計算できませんでした」と案内する。天気は自宅の天気にする。（Task 10、Task 15）

---

## ファイル構成

```
package.json                 スクリプト定義（test は TZ=America/New_York で実行）
app/                         GitHub Pages に置くもの（ビルドなし）
  index.html  manifest.webmanifest  sw.js  icons/  fonts/
  css/base.css               レイアウト、CSS 変数（テーマ・文字サイズ）
  js/
    dates.js                 日本時間の日付計算
    holidays.js  rokuyo.js   祝日・六曜
    colors.js  themes.js  settings.js
    reminders.js  departure.js  recurrence.js
    event-model.js           AppEvent と Google の予定の相互変換
    weather.js               Open-Meteo
    api.js  demo-api.js      Apps Script との窓口・お試し用の偽物
    kv.js  cache.js  outbox.js  repository.js
    main.js
    ui/ dom.js router.js shell.js keyboard.js components.js
        setup-view.js month-view.js list-view.js week-view.js day-view.js
        event-detail.js event-form.js search-view.js settings-view.js
gas/src/*.js                 Apps Script の元ファイル（番号順に連結）
gas/appsscript.json
gas/dist/Code.gs             連結した完成品（家族が貼り付ける。コミットする）
scripts/build-gas.mjs  scripts/serve.mjs  scripts/make-icons.mjs  scripts/copy-fonts.mjs
tests/unit/*.test.js  tests/gas/*.test.js  tests/e2e/*.test.js  tests/fixtures/
docs/setup-guide.md          家族向けの手順書
.github/workflows/pages.yml
```

型の約束（すべてのタスクで共通）:
- `DateKey` = `'YYYY-MM-DD'`（日本時間）
- `LocalDateTime` = `'YYYY-MM-DDTHH:mm'`（日本時間）
- `AppEvent`:
```js
{
  calendarId, id, recurringEventId /* 繰り返しの 1 回分なら親の id */, originalStart /* LocalDateTime|DateKey */,
  title, allDay, start /* LocalDateTime or DateKey */, end /* 終日なら最終日を含む DateKey */,
  location, memo, categoryId /* string|null */, colorId /* '1'〜'11'|null */,
  recurrence /* string[]|null（親の RRULE 行）*/,
  notify: { on, presets /* string[] */, googleDefault /* bool */, custom /* number[] 分 */ },
  items: [{ text, done }],
  origin /* 'home' | 住所の文字列 */,
  route: { withHighways: {minutes, km}|null, withoutHighways: {minutes, km}|null,
           address, origin, computedAt } | null,
  geo: { lat, lng } | null,
  pending /* 送り直し待ちなら true */
}
```

---

### Task 1: 土台と日本時間の日付計算

**Files:**
- Create: `package.json`, `.gitignore`（`node_modules/`, `test-results/`）, `app/js/dates.js`
- Test: `tests/unit/dates.test.js`

**Interfaces:**
- Produces: `todayKey(now?: Date): DateKey`, `parseKey(key): {y, m, d}`, `addDays(key, n): DateKey`, `dayOfWeek(key): 0..6`（0=日）, `monthGrid(y, m, weekStart: 0|1): DateKey[]`（42 個）, `formatDateJa(key): string`, `formatMonthJa(y, m): string`, `toRfc3339(local): string`, `fromRfc3339(s): LocalDateTime`, `addMinutes(local, n): LocalDateTime`, `diffMinutes(a, b): number`（b − a）, `formatTime(local): string`（`'9:05'` のように時は 0 を付けない）, `nthWeekdayOfMonth(key): {n, isLast}`, `dateOf(localOrKey): DateKey`

- [ ] **Step 1: `package.json` を作る**。`"type": "module"`、scripts は次のとおり。`"test": "TZ=America/New_York node --test 'tests/unit/**/*.test.js' 'tests/gas/**/*.test.js'"`、`"test:e2e": "node --test --test-concurrency=1 'tests/e2e/**/*.test.js'"`、`"build:gas": "node scripts/build-gas.mjs"`、`"serve": "node scripts/serve.mjs"`。
- [ ] **Step 2: 失敗するテストを書く**

```js
test('todayKey は日本時間で日付を返す', () => {
  assert.equal(todayKey(new Date('2026-11-22T15:30:00Z')), '2026-11-23');
  assert.equal(todayKey(new Date('2026-11-22T14:59:00Z')), '2026-11-22');
});
test('addDays は月・年・うるう年をまたぐ', () => {
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
});
test('dayOfWeek', () => assert.equal(dayOfWeek('2026-11-23'), 1));
test('monthGrid', () => {
  assert.equal(monthGrid(2026, 12, 0).length, 42);
  assert.equal(monthGrid(2026, 12, 0)[0], '2026-11-29');
  assert.equal(monthGrid(2026, 12, 1)[0], '2026-11-30');
});
test('formatDateJa', () => assert.equal(formatDateJa('2026-12-02'), '12月2日（水）'));
test('RFC3339 の変換は日本時間', () => {
  assert.equal(toRfc3339('2026-12-02T10:00'), '2026-12-02T10:00:00+09:00');
  assert.equal(fromRfc3339('2026-12-02T01:00:00Z'), '2026-12-02T10:00');
  assert.equal(fromRfc3339('2026-12-01T20:00:00-05:00'), '2026-12-02T10:00');
});
test('addMinutes は日をまたぐ', () => assert.equal(addMinutes('2026-12-02T00:10', -30), '2026-12-01T23:40'));
test('formatTime', () => assert.equal(formatTime('2026-12-02T09:05'), '9:05'));
test('nthWeekdayOfMonth', () => {
  assert.deepEqual(nthWeekdayOfMonth('2026-12-08'), { n: 2, isLast: false });
  assert.deepEqual(nthWeekdayOfMonth('2026-12-29'), { n: 5, isLast: true });
});
```

- [ ] **Step 3: `npm test` を実行し、失敗することを確かめる**（`dates.js` がないため）。
- [ ] **Step 4: `app/js/dates.js` を実装する。** 計算は UTC の `Date` に 9 時間を足して `getUTC*` で読む形にし、端末の時間帯を一切使わない。
- [ ] **Step 5: `npm test` が通ることを確かめる。**
- [ ] **Step 6: コミット** `feat: 日本時間の日付計算と土台`

### Task 2: 祝日と六曜

**Files:**
- Create: `app/js/holidays.js`, `app/js/rokuyo.js`
- Test: `tests/unit/holidays.test.js`, `tests/unit/rokuyo.test.js`

**Interfaces:**
- Consumes: `dates.js`
- Produces: `getHoliday(key): string|null`（2022〜2099 年。範囲外は null）, `toLunar(key): {month, day, leap}`, `getRokuyo(key): '先勝'|'友引'|'先負'|'仏滅'|'大安'|'赤口'`

- [ ] **Step 1: 失敗するテストを書く**

```js
const H = { '2026-01-01':'元日','2026-01-12':'成人の日','2026-02-11':'建国記念の日','2026-02-23':'天皇誕生日',
  '2026-03-20':'春分の日','2026-04-29':'昭和の日','2026-05-03':'憲法記念日','2026-05-04':'みどりの日',
  '2026-05-05':'こどもの日','2026-05-06':'振替休日','2026-07-20':'海の日','2026-08-11':'山の日',
  '2026-09-21':'敬老の日','2026-09-22':'国民の休日','2026-09-23':'秋分の日','2026-10-12':'スポーツの日',
  '2026-11-03':'文化の日','2026-11-23':'勤労感謝の日','2025-11-24':'振替休日','2027-03-21':'春分の日','2027-03-22':'振替休日' };
test('祝日', () => { for (const [k, v] of Object.entries(H)) assert.equal(getHoliday(k), v, k); });
test('祝日でない日', () => { assert.equal(getHoliday('2026-11-24'), null); assert.equal(getHoliday('2026-12-25'), null); });

test('旧暦の正月は先勝', () => {
  // 2027 年は朔が 2/6 15:56 UTC = 日本時間 2/7 0:56 なので、日本の旧正月は 2/7（中国の春節 2/6 とは違う）
  for (const k of ['2024-02-10', '2025-01-29', '2026-02-17', '2027-02-07']) {
    assert.deepEqual(toLunar(k), { month: 1, day: 1, leap: false }, k);
    assert.equal(getRokuyo(k), '先勝', k);
  }
});
test('朔の日付は日本時間で決める', () => {
  // 朔 2026-10-10 15:50 UTC → 日本時間 10/11。日本では 10/11 が旧暦 9 月 1 日
  assert.deepEqual(toLunar('2026-10-11'), { month: 9, day: 1, leap: false });
  assert.deepEqual(toLunar('2026-10-10'), { month: 8, day: 30, leap: false });
});
test('十五夜（旧暦 8 月 15 日）は仏滅', () => {
  for (const k of ['2024-09-17', '2025-10-06', '2026-09-25']) {
    assert.deepEqual(toLunar(k), { month: 8, day: 15, leap: false }, k);
    assert.equal(getRokuyo(k), '仏滅', k);
  }
});
```

- [ ] **Step 2: 失敗を確かめる。**
- [ ] **Step 3: `holidays.js` を実装する。** 決まった日の祝日、ハッピーマンデー（第 n 月曜）、春分・秋分は `floor(20.8431 + 0.242194*(Y-1980) - floor((Y-1980)/4))` と `floor(23.2488 + 0.242194*(Y-1980) - floor((Y-1980)/4))` で求める。振替休日は、日曜の祝日から後ろで最初の祝日でない日。国民の休日は、前後を祝日にはさまれた平日。
- [ ] **Step 4: `rokuyo.js` を実装する。** 外部のデータは使わず、次の手順で計算する。
  1. Meeus『Astronomical Algorithms』49 章の式で朔（新月）の時刻を求め、日本時間の日付に直す。その日が旧暦の 1 日になる。
  2. 25 章の簡易式で太陽の黄経を求め、二分法で中気（黄経が 30° の倍数になる時刻）を求める。
  3. 旧暦の月の番号は、その月に入る中気の黄経 L から `((L/30 + 2) % 12) || 12` で決める（春分 0° なら 2 月、雨水 330° なら 1 月）。中気のない月は閏月にし、前の月と同じ番号を付ける。
  4. 六曜は、`(旧暦の月 + 旧暦の日) % 6` の値で決める。0=大安、1=赤口、2=先勝、3=友引、4=先負、5=仏滅。
- [ ] **Step 5: テストが通ることを確かめる。**
- [ ] **Step 6: コミット** `feat: 祝日と六曜`

### Task 3: 色・テーマ・文字サイズ・設定のひな形

**Files:**
- Create: `app/js/colors.js`, `app/js/themes.js`, `app/js/settings.js`
- Test: `tests/unit/themes.test.js`, `tests/unit/settings.test.js`

**Interfaces:**
- Produces:
  - `GOOGLE_EVENT_COLORS: {id, name, hex}[]`。値は次のとおり。`1 ラベンダー #7986cb, 2 セージ #33b679, 3 ブドウ #8e24aa, 4 フラミンゴ #e67c73, 5 バナナ #f6bf26, 6 ミカン #f4511e, 7 ピーコック #039be5, 8 グラファイト #616161, 9 ブルーベリー #3f51b5, 10 バジル #0b8043, 11 トマト #d50000`
  - `FONT_LEVELS = [16, 18, 22, 26, 32]`
  - `THEMES: Record<'standard'|'sakura'|'wakaba'|'cream'|'dark'|'contrast', {label, bg, surface, text, subtext, border, accent, accentText, saturday, sunday, today, head, headText, band}>`。ラベルは「白」「さくら」「わかば」「クリーム」「黒地に白」「くっきり」。色の値は見本（`https://claude.ai/artifact/NfJsaR2UaeVQVKe3np77VE`）の `.app[data-apptheme=…]` を出発点にする。
  - `contrastRatio(hexA, hexB): number`（WCAG の式）
  - `DEFAULT_SETTINGS`、`mergeSettings(saved: object|null): Settings`
  - Settings の形と初期値:
```js
{ version: 1, fontLevel: 2, theme: 'standard', udFont: false, startView: 'month', weekStart: 0,
  showRokuyo: true, monthNames: true /* 月の表に予定の名前を出す。false なら色の点 */, visibleCalendars: null /* null = 父のメインのカレンダーだけ */,
  categories: [ {id:'hospital',name:'病院',colorId:'11'}, {id:'travel',name:'旅行',colorId:'7'},
                {id:'family',name:'家族',colorId:'2'}, {id:'errand',name:'用事',colorId:'6'}, {id:'other',name:'その他',colorId:'8'} ],
  itemSets: [ {id:'hospital',name:'病院セット',items:['保険証','診察券','お薬手帳','お金']},
              {id:'travel',name:'旅行セット',items:['着替え','薬','お薬手帳','保険証','充電器','財布']} ],
  templates: [ {id:'t-hospital',name:'病院',title:'病院',categoryId:'hospital',durationMinutes:60,location:'',
                itemSetId:'hospital',notify:{on:true,presets:['1day','1h']},memo:''} ],
  bufferMinutes: 10, departRoute: 'withoutHighways', home: { address: '', lat: null, lng: null },
  defaultNotify: { on: true, presets: ['1day', '1h'] } }
```

- [ ] **Step 1: 失敗するテストを書く**

```js
test('どのテーマも文字がはっきり読める', () => {
  for (const [name, t] of Object.entries(THEMES)) {
    assert.ok(contrastRatio(t.text, t.bg) >= 7, `${name} text`);
    assert.ok(contrastRatio(t.text, t.surface) >= 7, `${name} surface`);
    for (const k of ['subtext', 'saturday', 'sunday']) assert.ok(contrastRatio(t[k], t.bg) >= 4.5, `${name} ${k}`);
    assert.ok(contrastRatio(t.headText, t.head) >= 7, `${name} head`);
    assert.ok(contrastRatio(t.accentText, t.accent) >= 4.5, `${name} accent`);
  }
});
test('mergeSettings は欠けた値を埋め、おかしな値を直す', () => {
  assert.deepEqual(mergeSettings(null), DEFAULT_SETTINGS);
  assert.equal(mergeSettings({ fontLevel: 9 }).fontLevel, 4);
  assert.equal(mergeSettings({ theme: 'nope' }).theme, 'standard');
  assert.equal('junk' in mergeSettings({ junk: 1 }), false);
  assert.equal(mergeSettings({ categories: [{ id: 'x', name: '畑', colorId: '10' }] }).categories[0].name, '畑');
  assert.equal(mergeSettings({ categories: [{ id: 'x', name: '畑', colorId: '99' }] }).categories[0].colorId, '8');
});
```

- [ ] **Step 2: 失敗を確かめる。** → **Step 3: 実装する**（色の値は、テストを満たすように作る人が選ぶ）。 → **Step 4: 通ることを確かめる。**
- [ ] **Step 5: コミット** `feat: テーマ・文字サイズ・設定のひな形`

### Task 4: 出発の目安と通知

**Files:**
- Create: `app/js/departure.js`, `app/js/reminders.js`
- Test: `tests/unit/departure.test.js`, `tests/unit/reminders.test.js`

**Interfaces:**
- Consumes: `dates.js`、Settings
- Produces:
  - `computeDeparture(start: LocalDateTime, travelMinutes, bufferMinutes): LocalDateTime`（5 分単位で、早いほうへ丸める）
  - `departureSummary(ev: AppEvent, settings): {withHighways: {minutes, departAt}|null, withoutHighways: {...}|null} | null`（終日・route なしなら null）
  - `departureHintText(summary): string`。2 つあれば `'出発の目安 9:10〜9:25ごろ'`、1 つなら `'出発の目安 9:25ごろ'`。
  - `TIMED_PRESETS`: `week 1週間前 10080, 2days 2日前 2880, 1day 前日（同じ時刻） 1440, 3h 3時間前 180, 1h 1時間前 60, 30m 30分前 30, depart 出発の目安の時刻 null`
  - `ALLDAY_PRESETS`: `ad_week 1週間前の朝9時 9540, ad_2days 2日前の朝9時 2340, ad_prevMorning 前日の朝9時 900, ad_prevEvening 前日の夜8時 240`
  - `toGoogleReminders(ev: AppEvent, settings): {useDefault, overrides: {method:'popup', minutes}[]}`
  - `presetsFromOverrides(overrides, allDay): {presets, custom}`
  - `describeNotify(notify, allDay): string`（`'前日（同じ時刻）・1時間前'`、`'通知なし'`、`'いつもの通知（Google の設定）'`）
  - `defaultNotifyFor(allDay, settings)`（時刻ありなら `settings.defaultNotify`、終日なら `{on:true, presets:['ad_prevEvening']}`）
- 設計書からの変更点: 終日の予定の「当日の朝」の通知は、Google の仕組み（予定の開始より前にしか鳴らせない）では作れない。そのため「前日の朝 9 時」「前日の夜 8 時」で代わりにする。

- [ ] **Step 1: 失敗するテストを書く**

```js
test('出発の目安は 5 分単位で早めに丸める', () => {
  assert.equal(computeDeparture('2026-12-02T10:00', 25, 10), '2026-12-02T09:25');
  assert.equal(computeDeparture('2026-12-02T10:00', 40, 10), '2026-12-02T09:10');
  assert.equal(computeDeparture('2026-12-02T10:00', 23, 10), '2026-12-02T09:25');
  assert.equal(computeDeparture('2026-12-02T00:20', 30, 10), '2026-12-01T23:40');
});
test('目安の文', () => {
  const ev = { allDay: false, start: '2026-12-02T10:00', route: { withHighways: { minutes: 25 }, withoutHighways: { minutes: 40 } } };
  assert.equal(departureHintText(departureSummary(ev, { bufferMinutes: 10 })), '出発の目安 9:10〜9:25ごろ');
});
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
```
（`S` は `DEFAULT_SETTINGS`）

- [ ] **Step 2: 失敗を確かめる。** → **Step 3: 実装する。** `depart` の分数は `diffMinutes(departAt, start)`。`googleDefault: true` の notify は `{useDefault: true}` を返す。`custom` の分数もそのまま残す。 → **Step 4: 通ることを確かめる。**
- [ ] **Step 5: コミット** `feat: 出発の目安と通知の変換`

### Task 5: 繰り返し

**Files:**
- Create: `app/js/recurrence.js`
- Test: `tests/unit/recurrence.test.js`

**Interfaces:**
- Consumes: `dates.js`
- Produces:
  - `RecurrenceRule = { freq: 'daily'|'weekly'|'monthlyDate'|'monthlyWeekday'|'yearly', end: {type:'none'}|{type:'until', date: DateKey}|{type:'count', count} }`
  - `toRRule(rule, startKey, allDay): string`
  - `fromRRule(lines: string[], startKey): RecurrenceRule | {unsupported: true}`
  - `describeRule(rule, startKey): string`
  - `untilBefore(lines: string[], instanceStart: LocalDateTime|DateKey, allDay): string[]`（RRULE 以外の行（EXDATE など）は残す）

- [ ] **Step 1: 失敗するテストを書く**

```js
test('RRULE を作る', () => {
  assert.equal(toRRule({ freq: 'weekly', end: { type: 'none' } }, '2026-12-08', false), 'RRULE:FREQ=WEEKLY;BYDAY=TU');
  assert.equal(toRRule({ freq: 'monthlyDate', end: { type: 'none' } }, '2026-12-02', false), 'RRULE:FREQ=MONTHLY;BYMONTHDAY=2');
  assert.equal(toRRule({ freq: 'monthlyWeekday', end: { type: 'none' } }, '2026-12-08', false), 'RRULE:FREQ=MONTHLY;BYDAY=2TU');
  assert.equal(toRRule({ freq: 'monthlyWeekday', end: { type: 'none' } }, '2026-12-29', false), 'RRULE:FREQ=MONTHLY;BYDAY=-1TU');
  assert.equal(toRRule({ freq: 'daily', end: { type: 'until', date: '2026-12-31' } }, '2026-12-01', false), 'RRULE:FREQ=DAILY;UNTIL=20261231T145959Z');
  assert.equal(toRRule({ freq: 'yearly', end: { type: 'until', date: '2030-12-02' } }, '2026-12-02', true), 'RRULE:FREQ=YEARLY;UNTIL=20301202');
  assert.equal(toRRule({ freq: 'weekly', end: { type: 'count', count: 10 } }, '2026-12-08', false), 'RRULE:FREQ=WEEKLY;BYDAY=TU;COUNT=10');
});
test('読み戻しと説明', () => {
  const r = fromRRule(['RRULE:FREQ=MONTHLY;BYDAY=2TU'], '2026-12-08');
  assert.deepEqual(r, { freq: 'monthlyWeekday', end: { type: 'none' } });
  assert.equal(describeRule(r, '2026-12-08'), '毎月 第2火曜');
  assert.equal(describeRule({ freq: 'monthlyWeekday', end: { type: 'none' } }, '2026-12-29'), '毎月 最後の火曜');
  assert.equal(describeRule({ freq: 'weekly', end: { type: 'count', count: 10 } }, '2026-12-08'), '毎週 火曜（10回）');
  assert.equal(describeRule({ freq: 'daily', end: { type: 'until', date: '2026-12-31' } }, '2026-12-01'), '毎日（12月31日まで）');
});
test('扱えない繰り返し', () => assert.deepEqual(fromRRule(['RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR'], '2026-12-07'), { unsupported: true }));
test('これ以降を分けるときの終わり', () => {
  assert.deepEqual(untilBefore(['RRULE:FREQ=WEEKLY;BYDAY=TU;COUNT=10', 'EXDATE;TZID=Asia/Tokyo:20261215T100000'], '2026-12-22T10:00', false),
    ['RRULE:FREQ=WEEKLY;BYDAY=TU;UNTIL=20261222T005900Z', 'EXDATE;TZID=Asia/Tokyo:20261215T100000']);
  assert.deepEqual(untilBefore(['RRULE:FREQ=DAILY'], '2026-12-22', true), ['RRULE:FREQ=DAILY;UNTIL=20261221']);
});
```

- [ ] **Step 2〜4: 失敗を確かめ、実装し、通ることを確かめる。** `monthlyWeekday` は、第 5 週なら `-1`、それ以外は第 n 週にする。
- [ ] **Step 5: コミット** `feat: 繰り返しの組み立てと説明`

### Task 6: 予定データの変換（AppEvent と Google の予定）

**Files:**
- Create: `app/js/event-model.js`
- Test: `tests/unit/event-model.test.js`、`tests/fixtures/google-events.json`（架空の予定。Google のアプリで作った形のものを含む）

**Interfaces:**
- Consumes: `dates.js`、`reminders.js`（`toGoogleReminders`, `presetsFromOverrides`, `defaultNotifyFor`）、Settings
- Produces:
  - `ITEMS_MARKER = '――― 持ち物 ―――'`
  - `fromGoogle(g, calendarId, settings): AppEvent`
  - `toGoogle(ev: AppEvent, settings): object`。中身は、このアプリが扱う項目だけ: `summary, location, description, start, end, recurrence?, colorId, reminders, extendedProperties.private`。
  - `buildDescription(memo, items): string`、`splitDescription(desc): {memo}`
  - `packItems(items): Record<string,string>`、`unpackItems(priv): Item[]`
  - `eventColorHex(ev, settings, calendarHex): string`
- 隠れた記録（`extendedProperties.private`）のキー: `tc_v='1'`、`tc_cat`、`tc_items_count`、`tc_items_0..n`（1 つ 1000 文字以下の JSON 片）、`tc_origin`、`tc_route`（JSON）、`tc_geo`（JSON）、`tc_reminders`（選んだ preset id の JSON）
- 時刻ありの予定: `start: {dateTime: toRfc3339(start), timeZone: 'Asia/Tokyo'}`。終日の予定: `start: {date}`、`end: {date: addDays(終わりの日, 1)}`（Google は終わりの日を含まない）。
- 種類の色: `categoryId` があれば、その種類の `colorId` を Google に書く。

- [ ] **Step 1: 失敗するテストを書く**

```js
test('予定の時刻は、移動時間や出発の通知があっても入力したまま', () => {
  const ev = { ...base, start: '2026-12-02T10:00', end: '2026-12-02T11:00', notify: { on: true, presets: ['depart'] },
    route: { withHighways: { minutes: 25 }, withoutHighways: { minutes: 40 }, address: 'x', origin: 'home', computedAt: 't' } };
  const g = toGoogle(ev, S);
  assert.equal(g.start.dateTime, '2026-12-02T10:00:00+09:00');
  assert.equal(g.end.dateTime, '2026-12-02T11:00:00+09:00');
});
test('複数日の終日予定', () => {
  const g = toGoogle({ ...base, allDay: true, start: '2026-12-20', end: '2026-12-22' }, S);
  assert.deepEqual([g.start, g.end], [{ date: '2026-12-20' }, { date: '2026-12-23' }]);
  assert.equal(fromGoogle(g, 'primary', S).end, '2026-12-22');
});
test('持ち物はメモ欄の最後にも書く', () => {
  assert.equal(buildDescription('メモ', [{ text: '保険証', done: false }, { text: '診察券', done: true }]),
    'メモ\n\n――― 持ち物 ―――\n☐ 保険証\n☑ 診察券');
  assert.equal(splitDescription('メモ\n\n――― 持ち物 ―――\n☐ 保険証').memo, 'メモ');
});
test('持ち物が多くても記録できる', () => {
  const items = Array.from({ length: 60 }, (_, i) => ({ text: `持ち物${i}`.padEnd(30, 'あ'), done: i % 2 === 0 }));
  const p = packItems(items);
  for (const v of Object.values(p)) assert.ok(v.length <= 1024);
  assert.deepEqual(unpackItems(p), items);
});
test('Google のアプリで作った予定も読める', () => {
  const ev = fromGoogle(fixtures.fromGoogleApp, 'primary', S);
  assert.equal(ev.categoryId, null); assert.equal(ev.colorId, '5');
  assert.deepEqual(ev.items, []); assert.equal(ev.notify.googleDefault, true);
  assert.equal(ev.memo, fixtures.fromGoogleApp.description);
});
test('行って戻っても同じ', () => assert.deepEqual(fromGoogle(toGoogle(full, S), 'primary', S), { ...full, pending: false }));
```

- [ ] **Step 2〜4: 失敗を確かめ、実装し、通ることを確かめる。**
- [ ] **Step 5: コミット** `feat: 予定データの変換`

### Task 7: 天気予報

**Files:**
- Create: `app/js/weather.js`
- Test: `tests/unit/weather.test.js`、`tests/fixtures/open-meteo.json`（日ごと 3 日分と、1 時間ごとの小さな見本）

**Interfaces:**
- Consumes: `dates.js`
- Produces: `forecastUrl(lat, lng): string`, `describeWeather(code): {label, icon}`, `parseForecast(json): {daily: Record<DateKey,{code,max,min,pop}>, hourly: Record<LocalDateTime,number>}`, `weatherFor(forecast, dateKeyOrEvent): {label, icon, max, min, pop, popAtTime?}|null`, `fetchForecast(lat, lng, {fetchImpl, kv, now}): Promise<Forecast|null>`（1 時間は保存したものを使う。キーは緯度経度を小数 2 桁に丸めたもの。日本時間の 1 日に 200 回を超えて取りに行こうとしたら、取りに行かず保存分か null を返す。回数は kv の `weatherCount:YYYY-MM-DD` に数える）、`WEATHER_CREDIT = '天気予報: Open-Meteo'`（天気を出す画面には必ず小さく添える）
- URL: `https://api.open-meteo.com/v1/forecast?latitude=..&longitude=..&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&hourly=precipitation_probability&timezone=Asia%2FTokyo&forecast_days=16`
- 天気の対応: `0→晴れ ☀️`、`1,2→晴れ時々くもり 🌤️`、`3→くもり ☁️`、`45,48→霧 🌫️`、`51–57,61–67,80–82→雨 🌧️`、`71–77,85,86→雪 ❄️`、`95–99→雷雨 ⛈️`、それ以外→`{label:'', icon:''}`

- [ ] **Step 1: 失敗するテストを書く**（対応表の各グループ、その日 200 回取りに行った後は fetch を呼ばない、`weatherFor` で範囲外の日は null、時刻ありの予定は `popAtTime` にその時間の降水確率、通信が失敗したら `fetchForecast` が null を返し例外を出さない、1 時間以内の 2 回目は fetch を呼ばない）
- [ ] **Step 2〜4: 失敗を確かめ、実装し、通ることを確かめる。**
- [ ] **Step 5: コミット** `feat: 天気予報`

### Task 8: Apps Script との窓口と、お試し用の偽物

**Files:**
- Create: `app/js/api.js`, `app/js/demo-api.js`
- Test: `tests/unit/api.test.js`, `tests/unit/demo-api.test.js`

**Interfaces:**
- Produces:
  - `class ApiError extends Error { kind: 'offline'|'timeout'|'badKey'|'notFound'|'limit'|'server' }`。`message` は日本語:
    - limit → `'今日は移動時間を計算できる回数を使い切りました。明日また計算できます。'`
    - offline・timeout → `'電波が弱いようです。少したってから、もう一度お試しください。'`
    - badKey → `'接続の設定が正しくありません。家族に連絡してください。'`
    - notFound → `'この予定は見つかりませんでした。'`
    - server → `'うまくいきませんでした。少したってから、もう一度お試しください。'`
  - `createApi({url, key}, {fetchImpl = fetch, timeoutMs = 25000}) → Api`
  - `Api` の関数: `ping(): {version}`, `listCalendars(): {id, summary, primary, backgroundColor}[]`, `listEvents({calendarId, timeMin, timeMax, q?}): GoogleEvent[]`, `getEvent({calendarId, eventId})`, `insertEvent({calendarId, resource})`, `patchEvent({calendarId, eventId, resource})`, `deleteEvent({calendarId, eventId})`, `getSettings(): object|null`, `saveSettings(settings)`, `route({origin, destination}): RouteResult`, `geocode({address, near?: {lat, lng}}): {results: {name, address, lat, lng}[]}`（最大 5 件）, `reverseGeocode({lat, lng}): {address}|null`
  - `RouteResult = {withHighways: {minutes, km}|null, withoutHighways: {minutes, km}|null, destinationAddress: string|null, destination: {lat, lng}|null}`
  - 送り方: `POST url`。ヘッダーは `Content-Type: text/plain;charset=utf-8`（Apps Script の CORS の事前確認を避けるため）。本文は `{"key","action","params"}`。action 名は `ping, calendars.list, events.list, events.get, events.insert, events.patch, events.delete, settings.get, settings.save, route, geocode, reverseGeocode`。返事は `{ok:true, data}` か `{ok:false, error:{code:'BAD_KEY'|'NOT_FOUND'|'LIMIT'|'INTERNAL'}}`。
  - `createDemoApi({now = () => new Date(), kv})` は `Api` と同じ関数を持つ。架空の見本の予定を、今日を基準にして作る。中身は次のとおり。
    - 今日から 2 日後 10:00〜11:00「眼科」。場所「さくら眼科」、病院、持ち物は病院セット。route は高速あり 25 分・高速なし 40 分。
    - 3 日後 14:30「歯医者」。route なし。
    - 10 日後から 3 日間の終日「旅行」。
    - 毎月同じ日の 9:00「内科」。今月から 3 回分を、`recurringEventId` 付きの 1 回分として作る。
    - 毎週 月・水・金 の 7:00「体操」。Google のアプリで作った形（独自の記録なし、`RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR`）。
    - 場所が「不明な場所」のとき、`route` は全部 null を返す。
    - 保存は kv にする。

- [ ] **Step 1: 失敗するテストを書く**

```js
test('POST で送り、合言葉は URL に入れない', async () => {
  let req; const api = createApi({ url: 'https://example.test/exec', key: 'k1' },
    { fetchImpl: async (u, o) => { req = { u, o }; return new Response(JSON.stringify({ ok: true, data: { version: 1 } })); } });
  await api.ping();
  assert.equal(req.u, 'https://example.test/exec'); assert.equal(req.o.method, 'POST');
  assert.equal(req.o.headers['Content-Type'], 'text/plain;charset=utf-8');
  assert.deepEqual(JSON.parse(req.o.body), { key: 'k1', action: 'ping', params: {} });
});
test('BAD_KEY は badKey', async () => { /* {ok:false,error:{code:'BAD_KEY'}} → kind 'badKey' と日本語 message */ });
test('通信できない → offline', async () => { /* fetchImpl が TypeError で失敗 → kind 'offline' */ });
test('遅すぎる → timeout', async () => { /* timeoutMs: 50、返事が 200ms 後 → kind 'timeout' */ });
test('お試し: 見本の予定が今日を基準に並ぶ', async () => { /* now=2026-12-01 → listEvents で '2026-12-03T10:00:00+09:00' の「眼科」 */ });
test('お試し: 不明な場所は道が見つからない', async () => { /* route({destination:'不明な場所'}) の値がすべて null */ });
```

- [ ] **Step 2〜4: 失敗を確かめ、実装し、通ることを確かめる。**
- [ ] **Step 5: コミット** `feat: Apps Script との窓口とお試しモード`

### Task 9: 端末への保存と、送り直し待ちの列

**Files:**
- Create: `app/js/kv.js`, `app/js/cache.js`, `app/js/outbox.js`
- Test: `tests/unit/cache.test.js`, `tests/unit/outbox.test.js`

**Interfaces:**
- Produces:
  - `createMemoryKV()`, `createIdbKV(dbName = 'tadashi-calendar')`。どちらも `{get(store, key), put(store, key, value), delete(store, key), getAll(store)}` を持つ。store は `'events'|'months'|'outbox'|'kv'`。
  - `createEventCache(kv)`: `putMonth(monthKey 'YYYY-MM', calendarIds, events: AppEvent[])`（その月の範囲にあった古い予定を、送り直し待ちのものを除いて入れ替える）, `getRange(startKey, endKey): AppEvent[]`（開始の早い順。終日の予定を先にする）, `get(calendarId, id)`, `upsert(ev)`, `remove(calendarId, id)`, `monthFetchedAt(monthKey): number|null`
  - `createOutbox(kv)`: `enqueue(op)`, `list()`, `process(api, cache): Promise<{sent, remaining}>`
  - `op = {opId, type: 'insert'|'patch'|'delete'|'saveSettings', calendarId, eventId, tempId, resource, settings, createdAt}`
- 送り直しの決まり:
  - 古い順に送る。
  - offline・timeout・badKey になったら、そこで止めて残す。
  - patch・delete で notFound になったら、その依頼は捨てる。
  - insert が成功したら、仮の id の予定を本物の id に差し替え、`pending: false` にする。
  - 後から来た patch の `eventId` が仮の id なら、本物の id に書き換える。

- [ ] **Step 1: 失敗するテストを書く**（memory KV と偽物の api を使う）

```js
test('電波がない間の追加は、送り直し待ちになり、戻ったら本物になる', async () => { /* enqueue insert(tempId 'tmp-1') → cache に pending:true → api 復活 → process → cache の id が 'real-1'、pending false、outbox 空 */ });
test('止まったら順番を守る', async () => { /* 1 件目が offline → 2 件目は送らない */ });
test('消された予定の修正は捨てる', async () => { /* patch が notFound → remaining 0 */ });
test('仮の id への修正は本物の id で送る', async () => { /* insert tmp-1 → patch tmp-1 → patchEvent の eventId は 'real-1' */ });
test('月の入れ替えで送り直し待ちは消さない', async () => { /* pending の予定がある月に putMonth → 残る */ });
```

- [ ] **Step 2〜4: 失敗を確かめ、実装し、通ることを確かめる。** `createIdbKV` は E2E（Task 19）で確かめる。
- [ ] **Step 5: コミット** `feat: 端末への保存と送り直し`

### Task 10: 予定の読み書きのまとめ役（repository）

**Files:**
- Create: `app/js/repository.js`
- Test: `tests/unit/repository.test.js`

**Interfaces:**
- Consumes: `api.js`, `cache.js`, `outbox.js`, `event-model.js`, `recurrence.js`, `reminders.js`, Settings
- Produces: `createRepository({api, kv, getSettings})` が返すもの:
  - `loadRange(startKey, endKey, onUpdate: (events) => void): Promise<void>`。まず保存してある分ですぐ `onUpdate` を呼ぶ。そのあと、見えているカレンダー（`settings.visibleCalendars ?? ['primary']`）ごとに `listEvents` で取り直し、もう一度呼ぶ。失敗しても例外は出さず、`onUpdate` は保存分のまま。
  - `saveEvent(ev, {scope: 'one'|'following'|'all', original?: AppEvent}): Promise<AppEvent>`
  - `deleteEvent(ev, scope): Promise<void>`
  - `toggleItem(ev, index): Promise<AppEvent>`
  - `recomputeRoute(ev): Promise<AppEvent>`
  - `search(q): Promise<AppEvent[]>`（範囲は 1 年前から 2 年後まで）
  - `syncOutbox(): Promise<{sent, remaining}>`
  - `lastError: ApiError|null`
- 保存の決まり:
  - 場所か出発する場所が変わったとき、または route がまだないときは、保存の前に `api.route` を呼ぶ。失敗したら route は null にして、保存は続ける。
  - 予定の route は `{withHighways, withoutHighways, address: destinationAddress, origin, computedAt}` にする。geo は `destination` から取る。
  - 新しい予定は `calendarId: 'primary'` に入れる。
  - 送るのは `toGoogle()` の中身だけ（扱わない項目は Google 側にそのまま残る）。
  - 送信に失敗したら outbox に入れ、`pending: true` の予定を返す。
  - 繰り返しの予定で scope が:
    - `one` → 1 回分の id に patch・delete する。
    - `all` → 親を `getEvent` して、時刻の差分（新しい開始 − その回のもとの開始）を親の開始・終了に足して patch する。
    - `following` → 親の recurrence を `untilBefore()` で区切って patch し、フォームの内容と新しい繰り返しで insert する。その回が最初の回なら `all` と同じにする。delete は区切るだけ。

- [ ] **Step 1: 失敗するテストを書く**

```js
test('保存しても予定の時刻は入力のまま（Google に送る開始時刻）', async () => { /* saveEvent(start 10:00, depart 通知) → insertEvent の resource.start.dateTime === '2026-12-02T10:00:00+09:00' */ });
test('場所が変わったときだけ道を計算する', async () => { /* 同じ場所で再保存 → route 呼び出し 1 回のまま。場所を変える → 2 回 */ });
test('道が見つからなくても保存できる', async () => { /* api.route が全部 null → 保存成功、route.withHighways null */ });
test('このアプリ以外の情報は送らない', async () => { /* attendees 付きの元予定を直す → patchEvent の resource に attendees がない */ });
test('すべてを直す: 親の時刻を差分でずらす', async () => { /* 親 9:00 開始、2 回目を 10:00 に → 親の patch の start は 10:00 */ });
test('これ以降を直す: 親を区切り、新しい繰り返しを作る', async () => { /* patchEvent(親, recurrence に UNTIL) と insertEvent の 2 回 */ });
test('1 回分だけ消す', async () => { /* deleteEvent の eventId === 1 回分の id */ });
test('取り直しに失敗しても保存分を返す', async () => { /* listEvents が offline → onUpdate は保存分で 1 回、例外なし、lastError.kind==='offline' */ });
```

- [ ] **Step 2〜4: 失敗を確かめ、実装し、通ることを確かめる。**
- [ ] **Step 5: コミット** `feat: 予定の読み書きのまとめ役`

### Task 11: Apps Script（合言葉・予定の中継・設定）

**Files:**
- Create: `gas/src/00_config.js`（`const API_VERSION = 1;`）, `gas/src/10_auth.js`, `gas/src/20_api.js`, `gas/src/30_calendar.js`, `gas/src/50_settings.js`, `gas/appsscript.json`, `scripts/build-gas.mjs`, `gas/dist/Code.gs`（生成物）
- Test: `tests/gas/fake-gas.js`（Calendar・PropertiesService・SpreadsheetApp・ContentService・Utilities・ScriptApp・Logger の偽物）, `tests/gas/load-gas.js`（`gas/src` を番号順に `vm` で読み込む）, `tests/gas/api.test.js`, `tests/gas/build.test.js`

**Interfaces:**
- Consumes: Task 8 の通信の約束（action 名・返事の形）
- Produces（Apps Script の全体関数）:
  - `doPost(e)`
  - `setup()`: 合言葉がなければ作る（`Utilities.getUuid()` を 2 つ、ハイフンを除いてつなぐ）。`SPREADSHEET_ID` に紐付いたスプレッドシートの id を記録する。「設定」シートを作る。毎晩 3 時の `nightlyBackup` の予約を、重複しないように作る。合言葉を `Logger.log` に出す。
  - `showKey()`、`reissueKey()`
  - 内部: `checkKey_(key)`, `ok_(data)`, `fail_(code)`
- `appsscript.json`: `{"timeZone":"Asia/Tokyo","runtimeVersion":"V8","exceptionLogging":"STACKDRIVER","dependencies":{"enabledAdvancedServices":[{"userSymbol":"Calendar","serviceId":"calendar","version":"v3"}]},"webapp":{"executeAs":"USER_DEPLOYING","access":"ANYONE_ANONYMOUS"}}`
- 中継の中身:
  - `events.list` → `Calendar.Events.list(calendarId, {timeMin, timeMax, q, singleEvents: true, orderBy: 'startTime', maxResults: 2500, pageToken})` を、ページが終わるまで繰り返す。
  - `events.insert` → `Calendar.Events.insert(resource, calendarId)`、`events.patch` → `Calendar.Events.patch(resource, calendarId, eventId)`、`events.delete` → `Calendar.Events.remove(calendarId, eventId)`、`calendars.list` → `Calendar.CalendarList.list()`。
  - 例外のメッセージに `Not Found` を含めば `NOT_FOUND`、それ以外は `INTERNAL`（中身は `console.error` だけに出す）。
  - 設定は「設定」シートの A1 に JSON で、B1 に保存日時を入れる。
- `scripts/build-gas.mjs`: `gas/src/*.js` を名前順に連結し、先頭に「このファイルは生成物」という注意を付けて `gas/dist/Code.gs` に書く。

- [ ] **Step 1: 失敗するテストを書く**

```js
test('合言葉が違えば BAD_KEY', () => assert.deepEqual(post({ key: 'x', action: 'ping' }), { ok: false, error: { code: 'BAD_KEY' } }));
test('ping は版を返す', () => assert.deepEqual(post({ key: KEY, action: 'ping' }).data, { version: 1 }));
test('events.list はページをたどる', () => { /* 偽 Calendar が 2 ページ返す → items 3 件 */ });
test('events.insert は引数の順番が正しい', () => { /* fake の記録: insert(resource, 'primary') */ });
test('見つからない予定は NOT_FOUND', () => { /* fake が Error('API call ... Not Found') */ });
test('設定の保存と読み出し', () => { /* settings.save → settings.get で同じ */ });
test('setup は何度実行しても予約が 1 つ', () => { /* setup() 2 回 → ScriptApp の trigger 1 件、合言葉は変わらない */ });
test('dist/Code.gs は最新', () => { /* build の出力 === 保存されている gas/dist/Code.gs */ });
```

- [ ] **Step 2〜4: 失敗を確かめ、実装し、`npm run build:gas` してから通ることを確かめる。**
- [ ] **Step 5: コミット** `feat: Apps Script の合言葉と予定の中継`

### Task 12: Apps Script（地図・毎晩の控え・戻す）

**Files:**
- Create: `gas/src/40_maps.js`, `gas/src/60_backup.js`。`gas/dist/Code.gs` を作り直す。
- Test: `tests/gas/maps.test.js`, `tests/gas/backup.test.js`（`fake-gas.js` に Maps と、シート操作の偽物を足す）

**Interfaces:**
- Produces:
  - action `route({origin, destination}) → RouteResult`。`Maps.newDirectionFinder().setOrigin().setDestination().setMode(DRIVING).setLanguage('ja').setRegion('jp')` を、`setAvoid(Maps.DirectionFinder.Avoid.HIGHWAYS)` あり・なしで 2 回呼ぶ。`minutes = Math.round(秒/60)`、`km = Math.round(m/100)/10`。status が `OK` でなければ、その道は null。
    - 1 日の回数制限: スクリプトのプロパティ `ROUTE_COUNT_yyyy-MM-dd`（日本時間）に道順の回数を数え、今回の 2 回を足すと 100 を超えるなら地図を呼ばずに `LIMIT` を返す（Google の上限 1 日 1,000 回の 1 割）。古い日付のキーは毎晩の控えのときに消す。地図機能が上限の例外を出したときも `LIMIT` にする。
    - geocode と reverseGeocode は、合わせて同じ数え方（`GEO_COUNT_yyyy-MM-dd`）で 1 日 100 回まで（場所探しと自宅の住所の確認に使う）。
  - action `geocode({address, near?}) → {results: {name, address, lat, lng}[]}`（`Maps.newGeocoder().setLanguage('ja').setRegion('jp')`。`near` があれば `setBounds` でその周り約 30km を優先。最大 5 件。`name` は結果の先頭の部分（施設名があればそれ）、`address` は `formatted_address`）
  - action `reverseGeocode({lat, lng}) → {address}|null`（`Maps.newGeocoder().reverseGeocode(lat, lng)` の先頭）
  - `nightlyBackup()`: 父の書き込めるカレンダー（`accessRole` が owner か writer）の予定を、400 日前から 3 年後まで `singleEvents: false` で取る。`控え_yyyy-MM-dd` シートに書く。列は「カレンダー, 予定ID, 状態, タイトル, 開始, 終了, 終日, 場所, メモ, 繰り返し, 元データ」。控えのシートは新しいほうから 14 枚だけ残す。
  - `onOpen()`: メニュー「ただしカレンダー」→「選んだ行の予定を戻す」
  - `restoreSelectedRow()`: 元データの JSON から `id, etag, htmlLink, iCalUID, recurringEventId, created, updated, creator, organizer` を除いて insert する。同じ id の予定がまだあれば、戻さずに「この予定は今もあります」と出す。

- [ ] **Step 1: 失敗するテストを書く**（2 つの道の分数と km、片方が `ZERO_RESULTS` なら null、その日 98 回使った後の route は地図を呼ばずに `LIMIT`、日付が変われば数え直し、geocode が見つからなければ null、控えのシート名と行数、15 枚目で一番古いシートを消す、戻すときに id を除いて insert、すでにある予定は戻さない）
- [ ] **Step 2〜4: 失敗を確かめ、実装し、`npm run build:gas` してから通ることを確かめる。**
- [ ] **Step 5: コミット** `feat: Apps Script の地図・控え・戻す`

### Task 13: アプリの骨組み（画面の土台・初回設定・お試し）

**Files:**
- Create: `app/index.html`, `app/css/base.css`, `app/js/main.js`, `app/js/ui/dom.js`, `app/js/ui/router.js`, `app/js/ui/shell.js`, `app/js/ui/keyboard.js`, `app/js/ui/setup-view.js`, `scripts/serve.mjs`
- Test: `tests/e2e/helpers.js`, `tests/e2e/shell.test.js`, `tests/unit/router.test.js`

**Interfaces:**
- Consumes: `settings.js`, `themes.js`, `api.js`, `demo-api.js`, `kv.js`, `repository.js`
- Produces:
  - `h(tag, attrs, ...children): HTMLElement`
  - `parseRoute(hash): {name, params}` / `routeTo(name, params): string`。経路は `#/setup`, `#/month/YYYY-MM`（選んだ日は `?d=DD`）, `#/week/DateKey`, `#/day/DateKey`, `#/list`, `#/event/<calId>/<eventId>`, `#/new/DateKey`, `#/edit/<calId>/<eventId>`, `#/search`, `#/settings`。id は `encodeURIComponent`。
  - `applySettings(doc, settings)`: `--font-base` に `FONT_LEVELS[level]px` を入れ、テーマの CSS 変数と、`data-theme`・`data-udfont` を設定する。
  - `app` の状態（`main.js`）: `{settings, repo, connection: {mode: 'google'|'demo', url?, key?}}`。kv の `'kv'` ストアに `connection` と `settings` を保存する。
  - `installKeyboardHelper(doc)`: 入力欄にフォーカスすると `body.editing`（下のボタンを隠す）を付け、300ms 後に `scrollIntoView({block: 'center'})` する。`visualViewport` の resize で `--kb-inset`（キーボードの高さ）を設定し、フォームの下に余白を足す。
  - 画面の部品: 上の段（左にタイトル、右に「🔍 探す」「⚙ 設定」）、下の段（「今日」「月」「週」「日」「一覧」と右端の丸い「＋ 追加」）、`showToast(message)`、`confirmDialog({message, buttons: [{label, value}]}) → Promise<value>`。画面は 1 枚に収め（`html, body { height: 100% }`）、中身ごとにスクロールする。
  - 初回設定の画面: 見出し「初めの設定（家族の方へ）」と、説明「この画面が出たら、家族に連絡してください」。入力欄は「Google 側のアドレス」と「合言葉」。「つなぐ」ボタンで ping が成功したら保存し、最初の画面へ進む。失敗したら日本語で出す。「お試し（見本の予定で使う）」ボタンでお試しモードにする。
  - 起動したら裏で `ping` し、`version < REQUIRED_GAS_VERSION`（`main.js` の定数、今は 1）なら、設定の「家族向けの設定」に「Google 側の更新が必要です」と出す。
  - `scripts/serve.mjs`: `app/` を、決めたポートで正しい MIME とキャッシュなしで配る、静的なサーバー。
  - `tests/e2e/helpers.js`: `openApp({device = 'iPhone 13', fontLevel = 2, theme, timezoneId = 'Asia/Tokyo', now = '2026-12-01T09:00:00+09:00'}) → {page, close}`。サーバーを起動し、Chromium で `devices[device]` を再現する。`page.clock.install({time: now})` で時計を止め、お試しモードで設定を入れて開く。

- [ ] **Step 1: 失敗するテストを書く**

```js
test('拡大を禁止しない viewport', async () => {
  const { page, close } = await openApp({});
  assert.equal(await page.getAttribute('meta[name=viewport]', 'content'), 'width=device-width, initial-scale=1, viewport-fit=cover');
  await close();
});
test('どの文字サイズでも入力欄は 16px 以上（初回設定の画面）', async () => {
  for (let lv = 0; lv < 5; lv++) { /* #/setup の input/select/textarea の computed fontSize >= 16 */ }
});
test('一番大きい字でも、幅 375px で横にはみ出さない', async () => { /* device 'iPhone SE', fontLevel 4 → scrollWidth <= clientWidth、下の段の 5 つの文字と「＋ 追加」が見える、上の段の年月が「…」で切れない */ });
test('入力中は下の段が隠れる', async () => { /* 入力欄に focus → body.editing、nav が非表示 → blur で戻る */ });
test('設定がない時は初回設定の画面が出る', async () => { /* 空の状態で開く → 「この画面が出たら、家族に連絡してください」 */ });
test('文字サイズの設定で根元の字の大きさが変わる', async () => { /* fontLevel 4 → html の computed fontSize '32px' */ });
```
`tests/unit/router.test.js` では、`parseRoute('#/event/primary/abc%2F1')` が `{name: 'event', params: {calId: 'primary', eventId: 'abc/1'}}` になることと、`routeTo` から戻せることを確かめる。

- [ ] **Step 2: 失敗を確かめる**（`npm test` と `npm run test:e2e`）。 → **Step 3: 実装する。** → **Step 4: 通ることを確かめる。**
- [ ] **Step 5: コミット** `feat: 画面の土台・初回設定・お試しモード`

### Task 14: 月の画面（つながった週の表と、下から出る予定）と一覧の画面

**Files:**
- Create: `app/js/ui/components.js`, `app/js/ui/month-view.js`, `app/js/ui/month-layout.js`, `app/js/ui/list-view.js`
- Test: `tests/unit/month-layout.test.js`, `tests/e2e/month-list.test.js`

**Interfaces:**
- Consumes: `repository.loadRange`, `departure.js`（`departureSummary`, `departureHintText`）, `holidays.js`, `rokuyo.js`, `weather.js`, `event-model.eventColorHex`, `dates.js`
- Produces:
  - `month-layout.js`（DOM を使わない、テストできる計算）:
    - `weekStartOf(key, weekStart): DateKey`
    - `weekRange(today: DateKey, weekStart): {week0: DateKey, count: number}`（今月の 12 か月前の月初の週から、24 か月先の月末の週まで）
    - `weekIndexOf(week0, key): number`
    - `weekLanes(weekStartKey, events: AppEvent[]): {lane: Map<AppEvent, number>, count: number}`。複数日の予定を、開始日・長いほうの順に、空いている一番上の段へ入れる。
    - `cellItems(key, weekLanes, dayEvents): (AppEvent|null)[]`。先頭は段に合わせた複数日の予定（空き段は null）で、末尾の空きは削る。その後に 1 日の予定が続く。
    - `focusMonth(week0, topWeek, visibleRows): [y, m]`（見えている上から `min(2, visibleRows-1)` 番目の週の最後の日の月）
  - `renderEventRow(ev, ctx): HTMLElement`。左の列に時刻（`.ev-t1` は開始で 1.12em の太字、`.ev-t2` は終了で 0.75em。終日なら「終日」）、色の帯、`.ev-title`、出発の目安があれば `.ev-hint`（0.8em）で `departureHintText`。`pending` なら「まだ保存中」の印。押すと `#/event/...` へ移る。
  - 月の画面（設計書 9.6 のとおり）:
    - 年月の見出し（`<small>2026年</small>11月`）。曜日の行。
    - `.months` は週の行（`.week`、高さ = 表の高さ ÷ 6）を縦に並べ、`scroll-snap-type: y mandatory` で週の区切りに止める。
    - マス（`.cell[data-d]`）の中は、`.num`（`clamp(16px, 0.85em, 28px)`）と、六曜がオンのときの `.l2`（六曜と祝日名）、予定の札 `.lb`（`clamp(11px, 0.5em, 15px)`、最大 3 つと「+n」）。六曜がオフのときは、祝日名を `.num` の右に出す。
    - 複数日の帯（`.lb.span`、始まり `.s`・終わり `.e`、名前を出さない日は `.cont`）は、左に -3px・右に -2px はみ出してマスの区切り線を覆う。
    - スクロールが止まったら（90ms 待つ）`focusMonth` で見出しを変え、その月以外のマスに `.out` を付ける。各月 1 日のマスに `.mtag`（「12月」）。
    - 日付を押すと `.sheet`（表の高さの 58%）が下から出る。押した週が隠れるときは、`visibleRows` に収まるまで表を週単位でスクロールする。同じ日をもう一度押す、「閉じる」、上の部分を 70px 以上下へなぞる、のどれかで閉じる。
    - 下の段の「今日」で、今月の最初の週へ戻って今日の予定を出す。
    - 詳しい画面から戻ったときは、表の位置と、出ていた予定をそのまま戻す。
  - 一覧の画面: 一番上に「今日の天気（自宅）」（自宅が未設定なら出さない）。今日から 60 日分を日付ごとに並べ、最後に「もっと見る」ボタン（さらに 60 日）。予定がなければ「この先の予定はありません」。

- [ ] **Step 1: 失敗するテストを書く**

```js
// tests/unit/month-layout.test.js
test('同じ日付は 1 回だけ', () => {
  const { week0, count } = weekRange('2026-11-24', 0);
  const days = Array.from({ length: count * 7 }, (_, i) => addDays(week0, i));
  assert.equal(new Set(days).size, days.length);
  assert.equal(dayOfWeek(week0), 0);
});
test('重なる旅行は段が分かれ、どの日も同じ段', () => {
  const A = { id: 'a', allDay: true, start: '2026-12-04', end: '2026-12-06' };
  const B = { id: 'b', allDay: true, start: '2026-12-05', end: '2026-12-08' };
  const w = weekLanes('2026-11-29', [A, B]);
  assert.equal(w.lane.get(A), 0); assert.equal(w.lane.get(B), 1);
  assert.deepEqual(cellItems('2026-12-04', w, [A]).map(e => e && e.id), ['a']);
  assert.deepEqual(cellItems('2026-12-07', w, [B]).map(e => e && e.id), [null, 'b']);
});
test('見出しの月', () => {
  const { week0 } = weekRange('2026-11-24', 0);
  const top = weekIndexOf(week0, '2026-11-29');
  assert.deepEqual(focusMonth(week0, top, 6), [2026, 12]);
});
```

```js
// tests/e2e/month-list.test.js
test('月の表に同じ日付が 2 回出ない', async () => { /* .cell[data-d] の値がすべて異なる */ });
test('旅行の帯がつながる', async () => {
  // 12/11 と 12/12 の .lb.span: 左の帯の right >= 右の帯の left - 0.5、top が同じ
});
test('どの文字サイズでも日付が読める', async () => {
  // 0〜4 段階で、予定が 4 つある日の .num が、マスの中に収まり、ほかの要素に重なられていない（elementFromPoint で .num に当たる）
});
test('日付を押すと下から予定が出て、その週は見えたまま', async () => {
  // 12/3 を押す → .sheet.open。12/3 のマスの bottom <= .sheet の top。行の .ev-t1 === '10:00'、.ev-hint に '出発の目安'
  // fontSize(.ev-t1) > fontSize(.ev-hint)
});
test('閉じる 3 通り', async () => { /* 「閉じる」、同じ日をもう一度押す、上の部分を 100px 下へなぞる → どれも .sheet.open がなくなる */ });
test('スクロールで見出しの月が変わり、ほかの月は薄くなる', async () => { /* 3 週下へ → 見出し「12月」、11/30 のマスに .out */ });
test('一番大きい字でも時刻が切れない', async () => { /* iPhone SE, fontLevel 4 → .ev-t1 の scrollWidth <= clientWidth */ });
test('祝日と六曜', async () => { /* 11/23 に「勤労感謝の日」、赤い字。六曜をオフ → .l2 がなくなり、祝日名は数字の右 */ });
test('海外の時間帯でも日付がずれない', async () => { /* timezoneId 'America/New_York' → 眼科は 12月3日 のマス */ });
test('一覧に今日の天気と予定', async () => { /* page.route で open-meteo を fixture に置き換え → 「今日の天気」と ☀️ */ });
```

- [ ] **Step 2〜4: 失敗を確かめ、実装し、通ることを確かめる。**
- [ ] **Step 5: コミット** `feat: 月の画面（つながった週の表と下から出る予定）と一覧`

### Task 15: 週と日の画面

**Files:**
- Create: `app/js/ui/week-view.js`, `app/js/ui/day-view.js`
- Test: `tests/e2e/week-day.test.js`

**Interfaces:**
- Consumes: `renderEventRow`, `repository.loadRange`
- Produces:
  - 週の画面: 7 日を縦に並べ、各日に見出し（`formatDateJa`・祝日・六曜）と `renderEventRow` の一覧を出す。「◀ 前の週」「今週」「次の週 ▶」。週の始まりは設定に従う。
  - 日の画面: 一番上に終日の予定。その下に 0〜23 時の時間の欄を並べ、予定は開始の時間の欄に `renderEventRow` で入れる。開いたら 7 時の欄が見えるところまで動かす。「◀ 前の日」「今日」「次の日 ▶」。

- [ ] **Step 1: 失敗するテストを書く**（週の画面に 7 つの日付見出し。週の始まりを月曜にすると最初が月曜。日の画面で 12月3日 の「10時」の欄に眼科。一番大きい字でも 375px ではみ出さない）
- [ ] **Step 2〜4: 失敗を確かめ、実装し、通ることを確かめる。**
- [ ] **Step 5: コミット** `feat: 週と日の画面`

### Task 16: 予定の詳しい画面

**Files:**
- Create: `app/js/ui/event-detail.js`
- Test: `tests/e2e/event-detail.test.js`

**Interfaces:**
- Consumes: `repository`（`toggleItem`, `deleteEvent`, `recomputeRoute`）, `departureSummary`, `weather.js`, `describeNotify`, `describeRule`, `confirmDialog`
- Produces（並び順）:
  1. 日付
  2. 時刻（`.detail-time`、画面で一番大きい字）
  3. タイトル
  4. 場所
  5. 移動の目安の箱。見出しは `「{開始時刻} に間に合う出発の目安（車）」`。行は `「高速あり 約25分 → 9:25ごろ」` と `「高速なし 約40分 → 9:10ごろ」`。その下に「渋滞は含みません」と `「{address} として計算しました」`。ボタンは「Google マップで道を見る」（`https://www.google.com/maps/dir/?api=1&origin=..&destination=..&travelmode=driving`）、「電車・バスの道を見る」（`travelmode=transit`）、「計算し直す」。
     - route がなく場所があれば「場所が見つからず、移動時間を計算できませんでした。住所を入れると計算できます。」を出す。
     - 場所がなければ、箱そのものを出さない。
  6. 天気（geo がなければ自宅の緯度経度を使う。予報の範囲外なら「近くなったら表示されます」）
  7. 持ち物（大きなチェックの四角。押すと `toggleItem`）
  8. 通知（`describeNotify`）
  9. 繰り返し（`describeRule`）
  10. メモ
  11. ボタン「直す」「この予定を消す」。消すときは、繰り返しなら「この予定だけ」「これ以降すべて」「すべて」「やめる」、そうでなければ「消す」「やめる」から選ぶ。

- [ ] **Step 1: 失敗するテストを書く**

```js
test('時刻が一番大きく、目安の箱は予定の時刻とのつながりが分かる', async () => {
  // 眼科を開く → .detail-time === '10:00 〜 11:00'。fontSize は画面の中で最大
  // 箱の見出し === '10:00 に間に合う出発の目安（車）'、'高速あり 約25分 → 9:25ごろ'、'高速なし 約40分 → 9:10ごろ'
});
test('持ち物のチェックは開き直しても残る', async () => { /* 診察券をチェック → reload → checked */ });
test('道が見つからない場所の案内', async () => { /* 場所「不明な場所」の予定 → 案内文が出る、保存は済んでいる */ });
test('消すときは確かめる', async () => { /* 消す → やめる → 残る。消す → 消す → 一覧から消える */ });
test('繰り返しは 3 つから選ぶ', async () => { /* 内科 → この予定を消す → 3 つの選択肢 */ });
```

- [ ] **Step 2〜4: 失敗を確かめ、実装し、通ることを確かめる。**
- [ ] **Step 5: コミット** `feat: 予定の詳しい画面`

### Task 17: 予定の入力画面

**Files:**
- Create: `app/js/ui/event-form.js`, `app/js/ui/place-picker.js`, `app/vendor/leaflet/`（npm の `leaflet@1.9.4` から `scripts/copy-vendor.mjs` で写す。BSD-2 のライセンスも置く）
- Test: `tests/e2e/event-form.test.js`, `tests/e2e/place-picker.test.js`

**Interfaces:**
- Consumes: `repository.saveEvent`, `reminders.js`（`TIMED_PRESETS`, `ALLDAY_PRESETS`, `defaultNotifyFor`）, `recurrence.js`, Settings（templates, itemSets, categories）, `confirmDialog`
- Produces（画面の並び）:
  - 上の段: 「やめる」「保存する」
  - よく使う予定のボタン（押すと、タイトル・種類・場所・長さ・持ち物・通知・メモを入れる）
  - タイトル、日付（`input type=date`）、「終日」の切り替え、開始・終了の時刻（`input type=time`、選んだ値をすぐ下に大きく表示）。複数日なら終わりの日。
  - 場所（入力欄と「地図で探す」ボタン）、出発する場所（「自宅」または「別の場所」。別の場所も「地図で探す」で選べる）、種類（色付きの大きなボタン）
  - `openPlacePicker({query, near}) → Promise<{name, address, lat, lng}|null>`（`place-picker.js`）: 全画面で開く。上に検索欄（初期値は入力中の場所）と「探す」、候補の一覧（名前を大きく、住所を小さく。押すと選ぶ）、その下に地図（Leaflet。タイルの URL は `app/js/config.js` の `MAP_TILES` で切り替える。国土地理院 `https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png` と OpenStreetMap `https://tile.openstreetmap.org/{z}/{x}/{y}.png` を用意し、どちらも出典を地図の右下に出す。どちらを初期値にするかは設計書 14 章の答えで決める）。地図を押すとピンが動き、`reverseGeocode` で住所を出し直す。一番下に「この場所にする」「やめる」。候補が 0 件なら「見つかりませんでした。住所で探すか、地図を押して選んでください」。`LIMIT` のときは `ApiError` の文を出す。
  - 選んだ場所は、場所の欄に `name`（なければ住所）を入れ、予定の `geo` と、移動時間の計算に使う住所（`address`）を記録する。
  - 繰り返し（なし・毎日・毎週・毎月（同じ日）・毎月（第 n 曜日）・毎年と、終わり）。扱えない繰り返しは「Google で設定された繰り返し（ここでは直せません）」と出して触れないようにする。
  - 通知（オン・オフと選択肢のチェック。5 つ選んだら残りは押せない。「出発の目安の時刻」は route がないと押せず、「場所を入れて保存すると選べます」と添える）
  - 持ち物（セットから入れる、1 つずつ足す・消す）、メモ
  - 下の段: 「保存する」
- 決まり:
  - 開始時刻を変えたら、終了は元の長さを保ってずらす。
  - 新しい予定の長さは、よく使う予定の長さ。なければ 60 分。
  - 入力の誤り: タイトルが空なら「タイトルを入れてください」。終わりが始まりより前なら「終わりの時刻が始まりより前になっています」。その欄のすぐ下に赤い字で出し、その欄まで画面を動かす。
  - 繰り返しの予定を直すときは、保存の前に「この予定だけ」「これ以降すべて」「すべて」から選ぶ。
  - 保存中はボタンを押せなくし、「保存しています…」と出す。
  - 保存したら詳しい画面へ移る。送り直し待ちになったら「電波が弱いので、あとで自動で保存します」と出す。

- [ ] **Step 1: 失敗するテストを書く**

```js
test('よく使う予定から入れる', async () => { /* 「病院」 → タイトル '病院'、持ち物 4 つ、通知「前日（同じ時刻）」「1時間前」にチェック */ });
test('入力した時刻がそのまま保存される', async () => { /* 12/5 10:00 で保存 → 詳しい画面の .detail-time が '10:00 〜 11:00' で始まる */ });
test('どの文字サイズでも入力欄は 16px 以上', async () => { /* 0〜4 段階で、フォームの input/select/textarea がすべて >= 16 */ });
test('キーボードが出ても入力欄が見える', async () => {
  // メモ欄に focus し、--kb-inset を 300px として visualViewport の高さを 300 減らしたことにする（page.evaluate で
  // window.visualViewport を差し替え、resize を出す） → メモ欄の getBoundingClientRect().bottom <= innerHeight - 300
});
test('タイトルが空なら案内', async () => { /* 保存 → 「タイトルを入れてください」、保存されない */ });
test('保存ボタンを 2 回押しても予定は 1 つ', async () => { /* 速く 2 回押す → その日の眼科以外の新しい予定は 1 件 */ });
test('通知は 5 つまで', async () => { /* 5 つチェック → 6 つ目は disabled */ });
test('地図で探して選ぶ', async () => { /* お試し api: geocode('さくら眼科') → 2 件。2 件目を押す → 地図のピンがその位置。「この場所にする」→ 場所の欄が 2 件目の名前、保存後の route.address が 2 件目の住所 */ });
test('地図を押すとピンと住所が変わる', async () => { /* 地図の別の位置を押す → reverseGeocode が呼ばれ、住所の表示が変わる */ });
test('扱えない繰り返しは直せない', async () => { /* 体操を直す → 「Google で設定された繰り返し（ここでは直せません）」、繰り返しの欄は disabled、タイトルは直して保存できる */ });
```

- [ ] **Step 2〜4: 失敗を確かめ、実装し、通ることを確かめる。**
- [ ] **Step 5: コミット** `feat: 予定の入力画面`

### Task 18: 検索と設定の画面

**Files:**
- Create: `app/js/ui/search-view.js`, `app/js/ui/settings-view.js`
- Test: `tests/e2e/search-settings.test.js`

**Interfaces:**
- Consumes: `repository.search`, `api.geocode`, `api.listCalendars`, `mergeSettings`, `applySettings`, `GOOGLE_EVENT_COLORS`, `FONT_LEVELS`, `THEMES`
- Produces:
  - 検索の画面: 入力欄と「探す」ボタン。結果を日付ごとに `renderEventRow` で並べる。なければ「見つかりませんでした」。
  - 設定の画面（上から）:
    - 文字の大きさ（5 つの大きな「あ」のボタンと見本の文）
    - 色のテーマ（6 つ。見本付き）、読みやすい文字（UD フォント）
    - 予定の種類（名前と 11 色。足す・消す）
    - 最初に開く画面、週の始まり、六曜を表示、月の表に予定の名前を出す（切ると色の点）
    - 表示するカレンダー（`listCalendars` の結果を切り替え）
    - よく使う予定（足す・直す・消す）、持ち物セット（足す・直す・消す）
    - 余裕の時間（0・5・10・15・20・30 分）、出発の目安の通知に使う道
    - 「家族向けの設定」（押すと開く）: 自宅の住所（`openPlacePicker` で選び、`「{address} として登録しました」`）、まとめて取り込む、接続の入れ直し（`#/setup`）、作りの番号（アプリの版と Apps Script の版）
  - まとめて取り込む（`app/js/import.js` の `parseImportFile(text): {events: AppEvent[], errors: string[]}` と `findDuplicates(events, existing): Set<number>`）: ファイルを選ぶと、設計書 13 章の JSON 形式を読み、取り込む予定の一覧をチェック付きで出す（同じ日・同じ開始時刻・同じタイトルがすでにあるものはチェックを外し「すでにあります」）。「取り込む」で、チェックした予定を `repository.saveEvent` で 1 件ずつ入れる（通知・種類の色は新しい予定の初期値。途中で電波が切れたら残りは送り直し待ち）。最後に「○件取り込みました」。形式が違うファイルなら「このファイルは取り込めません」。
  - 設定は変えたらすぐ `applySettings` し、`kv` に保存する。`saveSettings` は outbox を通して送る。開くときは、Google 側の設定と端末の設定を `mergeSettings` し、Google 側を優先する。

- [ ] **Step 1: 失敗するテストを書く**（`tests/unit/import.test.js`: 正しい JSON から AppEvent を作る、終日・複数日、`format` が違えば errors、同じ予定は重複に入る。E2E: 取り込みファイルを選ぶ → 一覧 → 取り込む → 月の画面に出る。「眼科」で探すと 1 件。「あいうえお」では「見つかりませんでした」。文字の大きさを最大にすると html が 32px になり、開き直しても残る。テーマを「黒地に白」にすると body の背景が暗い。種類「病院」の色を変えると眼科の行の帯の色が変わる。よく使う予定を足すと入力画面にボタンが出る。家族向けの設定は最初は閉じている）
- [ ] **Step 2〜4: 失敗を確かめ、実装し、通ることを確かめる。**
- [ ] **Step 5: コミット** `feat: 検索と設定の画面`

### Task 19: ホーム画面のアプリにする（PWA・電波なし・UD フォント）

**Files:**
- Create: `app/manifest.webmanifest`, `app/sw.js`, `app/icons/`（180・192・512px の PNG。`scripts/make-icons.mjs` で SVG から Playwright を使って作る）, `scripts/copy-fonts.mjs`, `app/fonts/`（`@fontsource/biz-udpgothic` の 400・700 の日本語分割ファイルと OFL ライセンス）
- Modify: `app/index.html`（manifest、`apple-touch-icon`、`apple-mobile-web-app-capable`、`apple-mobile-web-app-title`、sw の登録）, `package.json`（devDependencies に `@fontsource/biz-udpgothic`）
- Test: `tests/e2e/pwa.test.js`

**Interfaces:**
- Produces:
  - ホーム画面での名前は `予定表`（Apple の「カレンダー」と区別するため。家族と相談して変えてよい）。
  - `sw.js`: 版の番号付きのキャッシュに、アプリの部品をすべて入れておく。同じサイトのものはキャッシュを先に使う。フォントは使った分だけ保存する。Apps Script と Open-Meteo は sw を通さない。新しい版は次に開いたときに切り替える。
  - UD フォントは `data-udfont="true"` のときだけ `font-family: 'BIZ UDPGothic'` を使う（`unicode-range` で必要な文字の分だけ読む）。

- [ ] **Step 1: 失敗するテストを書く**

```js
test('manifest とアイコン', async () => { /* manifest を取得 → short_name '予定表'、icons 192/512 が 200 で返る */ });
test('電波がなくても開ける', async () => {
  // 開いて sw の準備ができるのを待つ → context.setOffline(true) → reload
  // 月の画面と、保存しておいた「眼科」が出る。画面は真っ白ではない
});
test('電波がない間の保存は、戻ったら送られる', async () => { /* お試し api の通信を止めて保存 → 「まだ保存中」→ 戻す → 印が消える */ });
test('UD フォントの切り替え', async () => { /* 設定でオン → body の font-family に BIZ UDPGothic */ });
```

- [ ] **Step 2〜4: 失敗を確かめ、実装し、通ることを確かめる。**
- [ ] **Step 5: コミット** `feat: ホーム画面のアプリ化と電波なし対応`

### Task 20: 公開の仕組みと手順書

**Files:**
- Create: `.github/workflows/pages.yml`, `docs/setup-guide.md`, `README.md`

**Interfaces:**
- Produces:
  - `pages.yml`: `main` への push で `npm ci && npm test`、それが通ったら `actions/upload-pages-artifact`（path: `app`）と `actions/deploy-pages` で公開する。
  - `docs/setup-guide.md`（家族向け、やさしい日本語、画面の名前は Google の表示どおり）。内容は設計書の 10 章と 13 章に沿う。
    1. GitHub Pages を有効にする（リポジトリの Settings → Pages → Source: GitHub Actions）。作業用のブランチを main に入れる。
    2. Google 側: スプレッドシートを作る → 拡張機能 → Apps Script → `gas/dist/Code.gs` と `appsscript.json` を貼る（「appsscript.json をエディタで表示」の設定も説明）→ `setup` を実行 → 許可（「Google で確認されていません」→「詳細」→「（安全ではないページ）に移動」）→ デプロイ → 新しいデプロイ → ウェブアプリ（実行するユーザー: 自分、アクセスできるユーザー: 全員）→ URL を控える → `showKey` で合言葉を控える。
    3. iPhone: Safari で公開アドレスを開く → 共有 → ホーム画面に追加 → **アイコンから**開く → URL と合言葉を貼る → 「つなぐ」。
    4. Google カレンダーのアプリを確かめて入れる、通知を許可、ウィジェットを置く。iPhone 標準のカレンダーとの通知の二重を避ける。
    5. 自宅の住所・文字の大きさ・色。
    6. 今のアプリからの引っ越し（設計書 13 章の手順）。
    7. 実機での確認表: 入力欄をタップしても画面が拡大されない／指で広げると拡大できる／キーボードが出ても入力中の文字が見える／一番大きい字でも時刻が切れない／通知が届く（5 分後の予定で試す）／機内モードでも予定が見える／機内モード中に入れた予定が、戻したら Google カレンダーに出る。
    8. 困ったとき: 合言葉の作り直し（`reissueKey` → iPhone で入れ直し）、アプリの更新（Pages は自動。Apps Script はコードを貼り直し、「デプロイを管理」→ 編集 → 新しいバージョン（URL は変わらない））、消した予定の戻し方（Google カレンダーのゴミ箱、控えのシートから「選んだ行の予定を戻す」）。
  - `README.md`: 何のアプリか、構成、`npm test`・`npm run test:e2e`・`npm run build:gas`、手順書へのリンク。

- [ ] **Step 1: `npm test` と `npm run test:e2e` がすべて通ることを確かめる。**
- [ ] **Step 2: ワークフローを書き、YAML として正しいことを確かめる。** `npx --yes yaml@2.6.1 valid < .github/workflows/pages.yml` が何も出さずに終われば OK。
- [ ] **Step 3: 手順書と README を書く。** 手順書の各手順が、実装した関数名（`setup`, `showKey`, `reissueKey`, `nightlyBackup`, `restoreSelectedRow`）と画面の言葉に合っていることを見比べる。
- [ ] **Step 4: コミット** `docs: 手順書と公開の仕組み`
