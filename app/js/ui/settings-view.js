// 設定の画面。変えたらすぐに画面に反映し、この端末と Google 側に保存する。
import { h, fill } from './dom.js';
import { FONT_LEVELS, FONT_LEVEL_LABELS, THEMES } from '../themes.js';
import { GOOGLE_EVENT_COLORS, colorHex } from '../colors.js';
import { APP_VERSION } from '../config.js';
import { parseImportFile, findDuplicates } from '../import.js';
import { formatDateJa, formatTime, dateOf, addDays } from '../dates.js';
import { openPlacePicker } from './place-picker.js';

const clone = v => JSON.parse(JSON.stringify(v));
const BUFFERS = [0, 5, 10, 15, 20, 30];
const DURATIONS = [30, 60, 90, 120, 180];

export async function settingsView(app) {
  const S = clone(app.settings);
  const save = async (patch, { rerender = true } = {}) => {
    Object.assign(S, patch);
    await app.saveSettings(S);
    if (rerender) { app.settingsScroll = body.scrollTop; app.render(); }
  };
  const section = (title, ...children) => h('section', { class: 'set-section box' }, h('h2', {}, title), children);
  const select = (id, label, value, options, onChange) => {
    const s = h('select', { id }, options.map(([v, l]) => h('option', { value: String(v), selected: String(v) === String(value) }, l)));
    s.addEventListener('change', () => onChange(s.value));
    return h('div', { class: 'field' }, h('label', { for: id }, label), s);
  };
  const toggle = (label, value, onChange) => {
    const c = h('input', { type: 'checkbox', checked: value });
    c.addEventListener('change', () => onChange(c.checked));
    return h('label', { class: 'toggle' }, c, label);
  };

  // ---- 予定の種類
  const cats = S.categories.map((c, i) => {
    const name = h('input', { type: 'text', value: c.name, 'aria-label': '種類の名前' });
    name.addEventListener('change', () => { S.categories[i].name = name.value.trim() || c.name; save({ categories: S.categories }, { rerender: false }); });
    return h('div', { class: 'cat-row field', dataset: { cat: c.id } }, h('div', { class: 'addrow' }, name,
      h('button', { class: 'btn', type: 'button', disabled: S.categories.length <= 1, onClick: () => save({ categories: S.categories.filter((_, j) => j !== i) }) }, '消す')),
    h('div', { class: 'chips' }, GOOGLE_EVENT_COLORS.map(col => h('button', {
      class: 'chip', type: 'button', 'aria-label': col.name, 'aria-pressed': String(c.colorId === col.id), title: col.name,
      style: { '--c': col.hex, 'min-width': '48px', 'justify-content': 'center' },
      onClick: () => { S.categories[i].colorId = col.id; save({ categories: S.categories }); },
    }, h('span', { class: 'swatch', style: { width: '1.1em', height: '1.1em' } })))));
  });

  // ---- よく使う予定
  const templates = S.templates.map((t, i) => {
    const open = app.editingTemplate === t.id;
    const row = h('div', { class: 'itemrow' }, h('b', {}, t.name),
      h('span', { class: 'btnrow' },
        h('button', { class: 'btn', type: 'button', onClick: () => { app.editingTemplate = open ? null : t.id; app.settingsScroll = body.scrollTop; app.render(); } }, open ? '閉じる' : '直す'),
        h('button', { class: 'btn', type: 'button', onClick: () => save({ templates: S.templates.filter((_, j) => j !== i) }) }, '消す')));
    if (!open) return row;
    const f = (name, label, value) => h('div', { class: 'field' }, h('label', {}, label, h('input', { type: 'text', name, value: value ?? '', autocomplete: 'off' })));
    const ed = h('div', { class: 'tpl-editor box' },
      f('name', 'ボタンの名前', t.name), f('title', 'タイトル', t.title), f('location', '場所', t.location),
      select(`tpl-cat-${i}`, '種類', t.categoryId ?? '', [['', 'なし'], ...S.categories.map(c => [c.id, c.name])], v => { t.categoryId = v || null; }),
      select(`tpl-dur-${i}`, '長さ', t.durationMinutes, DURATIONS.map(m => [m, m < 60 ? `${m}分` : `${m / 60}時間`]), v => { t.durationMinutes = Number(v); }),
      select(`tpl-set-${i}`, '持ち物セット', t.itemSetId ?? '', [['', 'なし'], ...S.itemSets.map(s => [s.id, s.name])], v => { t.itemSetId = v || null; }),
      f('memo', 'メモ', t.memo),
      h('button', { class: 'btn primary', type: 'button', onClick: () => {
        for (const k of ['name', 'title', 'location', 'memo']) t[k] = ed.querySelector(`input[name="${k}"]`).value.trim();
        if (!t.name) t.name = t.title || 'よく使う予定';
        if (!t.title) t.title = t.name;
        app.editingTemplate = null;
        save({ templates: S.templates });
      } }, '決める'));
    return h('div', {}, row, ed);
  });
  const addTemplate = () => {
    const t = { id: `t-${Date.now()}`, name: '新しい予定', title: '', categoryId: S.categories[0]?.id ?? null, durationMinutes: 60, location: '', itemSetId: null, notify: clone(S.defaultNotify), memo: '' };
    app.editingTemplate = t.id;
    save({ templates: [...S.templates, t] });
  };

  // ---- 持ち物セット
  const itemSets = S.itemSets.map((set, i) => {
    const name = h('input', { type: 'text', value: set.name, 'aria-label': 'セットの名前' });
    const items = h('textarea', { 'aria-label': `${set.name}の中身（1 行に 1 つ）` });
    items.value = set.items.join('\n');
    const apply = () => { S.itemSets[i] = { ...set, name: name.value.trim() || set.name, items: items.value.split('\n').map(x => x.trim()).filter(Boolean) }; save({ itemSets: S.itemSets }, { rerender: false }); };
    name.addEventListener('change', apply);
    items.addEventListener('change', apply);
    return h('div', { class: 'field' }, h('div', { class: 'addrow' }, name, h('button', { class: 'btn', type: 'button', onClick: () => save({ itemSets: S.itemSets.filter((_, j) => j !== i) }) }, '消す')),
      h('span', { class: 'small' }, '中身（1 行に 1 つ）'), items);
  });

  // ---- 表示するカレンダー
  const calBox = h('div', {}, h('p', { class: 'small' }, '読み込んでいます…'));
  app.api?.listCalendars().then(list => {
    const visible = S.visibleCalendars ?? ['primary'];
    const isOn = c => visible.includes(c.id) || (c.primary && visible.includes('primary'));
    fill(calBox, list.map(c => toggle(c.summary + (c.primary ? '（メイン）' : ''), isOn(c), on => {
      const ids = new Set(list.filter(isOn).map(x => (x.primary ? 'primary' : x.id)));
      const id = c.primary ? 'primary' : c.id;
      if (on) ids.add(id); else ids.delete(id);
      save({ visibleCalendars: ids.size ? [...ids] : ['primary'] }, { rerender: false });
    })));
  }).catch(e => fill(calBox, h('p', { class: 'small' }, e?.message || '読み込めませんでした')));

  // ---- 家族向け: 自宅・取り込み・接続・版
  const homeNote = h('p', { class: 'small home-note' }, S.home.address ? `今の自宅: ${S.home.address}` : '自宅の住所がまだ登録されていません。');
  const pickHome = async () => {
    const p = await openPlacePicker(app, { query: S.home.address });
    if (!p) return;
    await save({ home: { address: p.address || p.name, lat: p.lat, lng: p.lng } }, { rerender: false });
    homeNote.textContent = `${p.address || p.name} として登録しました`;
  };
  const importBox = h('div', { class: 'import-list' });
  const fileIn = h('input', { type: 'file', id: 'import-file', accept: '.json,application/json' });
  fileIn.addEventListener('change', async () => {
    const file = fileIn.files?.[0];
    if (!file) return;
    const { events, errors } = parseImportFile(await file.text(), app.settings);
    if (!events.length) { fill(importBox, h('p', { class: 'err' }, errors[0] ?? 'このファイルは取り込めません')); return; }
    const dates = events.map(e => dateOf(e.start)).sort();
    const existing = [];
    await app.repo.loadRange(dates[0], addDays(dates.at(-1), 1), evs => { existing.splice(0, existing.length, ...evs); });
    const dup = findDuplicates(events, existing);
    const boxes = events.map((ev, i) => h('input', { type: 'checkbox', checked: !dup.has(i) }));
    const go = h('button', { class: 'btn primary wide', type: 'button' }, '取り込む');
    go.addEventListener('click', async () => {
      go.disabled = true; go.textContent = '取り込んでいます…';
      let n = 0;
      for (const [i, ev] of events.entries()) {
        if (!boxes[i].checked) continue;
        try { await app.repo.saveEvent(ev); n++; } catch { /* 1 件の失敗で止めない */ }
      }
      app.toast(`${n}件取り込みました`);
      fill(importBox);
      fileIn.value = '';
    });
    fill(importBox,
      errors.length ? h('p', { class: 'small' }, `読めなかった予定: ${errors.join('、')}`) : null,
      h('ul', { class: 'checks' }, events.map((ev, i) => h('li', {}, h('label', { class: 'check' }, boxes[i],
        h('span', {}, `${formatDateJa(dateOf(ev.start))} ${ev.allDay ? '終日' : formatTime(ev.start)} ${ev.title}`, dup.has(i) ? h('span', { class: 'small' }, '（すでにあります）') : null))))),
      go);
  });
  const gasOld = app.gasVersion != null && app.gasVersion < app.REQUIRED_GAS_VERSION;

  const sizes = h('div', { class: 'sizes' }, FONT_LEVELS.map((px, i) => h('button', {
    type: 'button', 'aria-pressed': String(S.fontLevel === i), 'aria-label': FONT_LEVEL_LABELS[i], style: { 'font-size': `${px}px` },
    onClick: () => save({ fontLevel: i }),
  }, 'あ')));
  const themes = h('div', { class: 'themes' }, Object.entries(THEMES).map(([id, t]) => h('button', {
    type: 'button', 'aria-pressed': String(S.theme === id), style: { background: t.head, color: t.headText, 'border-color': t.headText },
    onClick: () => save({ theme: id }),
  }, t.label)));

  const body = h('div', { class: 'scroll' }, h('div', { class: 'screen' },
    section('文字の大きさ', sizes, h('p', { class: 'preview' }, h('b', {}, FONT_LEVEL_LABELS[S.fontLevel]), h('br'), '12月2日（水）10:00 眼科')),
    section('色', themes, toggle('読みやすい文字の形（UD フォント）', S.udFont, v => save({ udFont: v }))),
    section('予定の種類', cats, h('button', { class: 'btn', type: 'button', onClick: () => save({ categories: [...S.categories, { id: `c-${Date.now()}`, name: '新しい種類', colorId: '1' }] }) }, '足す')),
    section('表示',
      select('s-start', '最初に開く画面', S.startView, [['month', '月'], ['list', '一覧'], ['week', '週'], ['day', '日']], v => save({ startView: v }, { rerender: false })),
      select('s-scroll', '月のめくり方', S.monthScroll, [['h', '左右にめくる（横）'], ['v', '上下にスクロール（縦）']], v => save({ monthScroll: v }, { rerender: false })),
      select('s-week', '週の始まり', S.weekStart, [[0, '日曜日'], [1, '月曜日']], v => save({ weekStart: Number(v) }, { rerender: false })),
      toggle('六曜（大安・仏滅など）を出す', S.showRokuyo, v => save({ showRokuyo: v }, { rerender: false })),
      toggle('月の表の中に予定の名前を出す（切ると色の点だけ）', S.monthNames, v => save({ monthNames: v }, { rerender: false }))),
    section('表示するカレンダー', calBox),
    section('よく使う予定', templates, h('button', { class: 'btn', type: 'button', onClick: addTemplate }, '足す')),
    section('持ち物セット', itemSets, h('button', { class: 'btn', type: 'button', onClick: () => save({ itemSets: [...S.itemSets, { id: `s-${Date.now()}`, name: '新しいセット', items: [] }] }) }, '足す')),
    section('出発の目安',
      select('s-buffer', '余裕の時間', S.bufferMinutes, BUFFERS.map(m => [m, `${m}分`]), v => save({ bufferMinutes: Number(v) }, { rerender: false })),
      select('s-route', '出発の目安の通知に使う道', S.departRoute, [['withoutHighways', '高速なし（早めの時刻）'], ['withHighways', '高速あり']], v => save({ departRoute: v }, { rerender: false }))),
    h('details', { class: 'family box' }, h('summary', {}, '家族向けの設定'),
      h('div', { class: 'field' }, h('span', { class: 'lbl' }, '自宅の住所'), homeNote, h('button', { class: 'btn', type: 'button', onClick: pickHome }, '地図で探して登録する')),
      h('div', { class: 'field' }, h('span', { class: 'lbl' }, 'まとめて取り込む'), h('p', { class: 'small' }, '今のアプリのスクショから作ったファイル（.json）を選びます。'), fileIn, importBox),
      select('s-map', '地図の絵', S.mapTiles, [['gsi', '国土地理院'], ['osm', 'OpenStreetMap']], v => save({ mapTiles: v }, { rerender: false })),
      h('div', { class: 'field' }, h('span', { class: 'lbl' }, '接続'),
        h('p', { class: 'small' }, app.connection?.mode === 'demo' ? '今はお試しモード（見本の予定）です。' : 'Google につながっています。'),
        h('button', { class: 'btn', type: 'button', onClick: () => app.go('setup') }, '接続をやり直す')),
      h('p', { class: 'small' }, `作りの番号: アプリ ${APP_VERSION} ／ Google 側 ${app.gasVersion ?? '―'}`),
      gasOld ? h('p', { class: 'err' }, 'Google 側の更新が必要です（手順書の「アプリの更新」を見てください）') : null)));

  return {
    title: '設定', header: 'sub', tab: null, body,
    onMount: () => { if (app.settingsScroll) { body.scrollTop = app.settingsScroll; app.settingsScroll = 0; } },
  };
}
