// 予定の入力画面（新しく入れる・直す）。予定の時刻は入力したままを保存する。
import { h, clear, fill } from './dom.js';
import { formatDateJa, formatTime, dateOf, addMinutes, diffMinutes } from '../dates.js';
import { TIMED_PRESETS, ALLDAY_PRESETS, defaultNotifyFor } from '../reminders.js';
import { toRRule, fromRRule, describeRule } from '../recurrence.js';
import { colorHex } from '../colors.js';
import { routeTo } from './router.js';
import { openPlacePicker } from './place-picker.js';

const MAX_NOTIFY = 5;
const REPEATS = [['none', 'なし'], ['daily'], ['weekly'], ['monthlyDate'], ['monthlyWeekday'], ['yearly']];
const toMin = t => { const [hh, mm] = t.split(':').map(Number); return hh * 60 + mm; };
const fromMin = n => { n = Math.max(0, Math.min(23 * 60 + 59, n)); return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`; };

export async function eventFormView(app, params) {
  const S = app.settings;
  let original = null;
  if (params.eventId) {
    try { original = await app.repo.getEvent(params.calId, params.eventId); } catch (e) {
      return { title: '予定を直す', header: 'sub', tab: null, body: h('div', { class: 'scroll' }, h('div', { class: 'screen' }, h('p', { class: 'err' }, e?.message || 'この予定は見つかりませんでした。'))) };
    }
  }

  // ---- 下書き
  const date0 = original ? dateOf(original.start) : params.date ?? app.today();
  const d = original ? {
    title: original.title === '（タイトルなし）' ? '' : original.title, date: date0, endDate: dateOf(original.end), allDay: original.allDay,
    start: original.allDay ? '10:00' : original.start.slice(11, 16), end: original.allDay ? '11:00' : original.end.slice(11, 16),
    location: original.location, geo: original.geo, origin: original.origin ?? 'home', categoryId: original.categoryId,
    repeat: 'none', repeatEnd: { type: 'none', date: '', count: 10 }, ruleKnown: !original.recurringEventId && !original.recurrence,
    notify: structuredClone(original.notify ?? defaultNotifyFor(original.allDay, S)), items: structuredClone(original.items ?? []), memo: original.memo,
  } : {
    title: '', date: date0, endDate: date0, allDay: false, start: '10:00', end: '11:00', location: '', geo: null, origin: 'home',
    categoryId: S.categories[0]?.id ?? null, repeat: 'none', repeatEnd: { type: 'none', date: '', count: 10 }, ruleKnown: true,
    notify: defaultNotifyFor(false, S), items: [], memo: '',
  };
  if (d.notify.googleDefault) d.notify = { ...d.notify, googleDefault: false, presets: [], on: true };
  let originalRule = null;
  if (original && (original.recurringEventId || original.recurrence)) {
    try {
      const lines = await app.repo.getRecurrence(original);
      const rule = fromRRule(lines ?? [], dateOf(original.originalStart ?? original.start));
      if (rule.unsupported) d.repeat = 'unsupported';
      else { d.repeat = rule.freq; d.repeatEnd = { ...d.repeatEnd, ...rule.end }; originalRule = rule; }
    } catch { d.repeat = 'unsupported'; }
    d.ruleKnown = true;
  }
  const canDepart = () => !d.allDay && !!original?.route && (original.route.withHighways || original.route.withoutHighways) && d.location === original.location;

  // ---- 入力欄
  const err = { title: h('p', { class: 'err', hidden: true }), time: h('p', { class: 'err', hidden: true }) };
  const title = h('input', { type: 'text', id: 'f-title', value: d.title, autocomplete: 'off' });
  const dateIn = h('input', { type: 'date', id: 'f-date', value: d.date });
  const allDay = h('input', { type: 'checkbox', id: 'f-allday', checked: d.allDay });
  const startIn = h('input', { type: 'time', id: 'f-start', value: d.start, step: 300 });
  const endIn = h('input', { type: 'time', id: 'f-end', value: d.end, step: 300 });
  const endDateIn = h('input', { type: 'date', id: 'f-enddate', value: d.endDate });
  const sum = h('p', { class: 'sumline' });
  const timesBox = h('div', { class: 'two' },
    h('div', { class: 'field' }, h('label', { for: 'f-start' }, '始まり'), startIn),
    h('div', { class: 'field' }, h('label', { for: 'f-end' }, '終わり'), endIn));
  const endDateBox = h('div', { class: 'field' }, h('label', { for: 'f-enddate' }, '終わりの日（旅行など何日も続くとき）'), endDateIn);
  const place = h('input', { type: 'text', id: 'f-place', value: d.location, autocomplete: 'off' });
  const originBox = h('div', { class: 'field' });
  const catBox = h('div', { class: 'chips' });
  const repeatSel = h('select', { id: 'f-repeat' });
  const repeatEndBox = h('div', { class: 'field' });
  const repeatNote = h('p', { class: 'small' });
  const notifyBox = h('div', { class: 'field notify' });
  const itemsBox = h('div', { class: 'field items' });
  const memo = h('textarea', { id: 'f-memo' }, '');
  memo.value = d.memo ?? '';

  function updateSum() {
    sum.textContent = d.allDay
      ? (d.endDate > d.date ? `${formatDateJa(d.date)} 〜 ${formatDateJa(d.endDate)}` : `${formatDateJa(d.date)} 終日`)
      : `${formatDateJa(d.date)} ${formatTime(`${d.date}T${d.start}`)} 〜 ${formatTime(`${d.date}T${d.end}`)}`;
    timesBox.hidden = d.allDay;
    endDateBox.hidden = !d.allDay;
  }
  title.addEventListener('input', () => { d.title = title.value; });
  dateIn.addEventListener('input', () => {
    if (!dateIn.value) return;
    const span = Math.round((Date.parse(d.endDate) - Date.parse(d.date)) / 864e5);
    d.date = dateIn.value;
    d.endDate = dateOf(addMinutes(`${d.date}T00:00`, Math.max(0, span) * 1440));
    endDateIn.value = d.endDate;
    updateSum(); renderRepeat();
  });
  allDay.addEventListener('change', () => { d.allDay = allDay.checked; d.notify = defaultNotifyFor(d.allDay, S); updateSum(); renderNotify(); });
  startIn.addEventListener('input', () => {
    if (!startIn.value) return;
    const len = toMin(d.end) - toMin(d.start);
    d.start = startIn.value;
    d.end = fromMin(toMin(d.start) + (len > 0 ? len : 60));
    endIn.value = d.end;
    updateSum();
  });
  endIn.addEventListener('input', () => { if (endIn.value) { d.end = endIn.value; updateSum(); } });
  endDateIn.addEventListener('input', () => { if (endDateIn.value) { d.endDate = endDateIn.value; updateSum(); } });
  place.addEventListener('input', () => { d.location = place.value; d.geo = null; renderNotify(); });
  memo.addEventListener('input', () => { d.memo = memo.value; });

  async function pickPlace() {
    const p = await openPlacePicker(app, { query: place.value.trim() });
    if (!p) return;
    d.location = p.name || p.address;
    d.geo = { lat: p.lat, lng: p.lng };
    place.value = d.location;
    renderNotify();
  }

  function renderOrigin() {
    const other = d.origin !== 'home';
    const otherIn = h('input', { type: 'text', id: 'f-origin', value: other ? d.origin : '', autocomplete: 'off', 'aria-label': '出発する場所の住所', hidden: !other });
    otherIn.addEventListener('input', () => { d.origin = otherIn.value || ' '; });
    const pick = h('button', { class: 'btn', type: 'button', hidden: !other }, '地図で探す');
    pick.addEventListener('click', async () => {
      const p = await openPlacePicker(app, { query: otherIn.value.trim() });
      if (p) { d.origin = p.address || p.name; renderOrigin(); }
    });
    fill(originBox, h('span', { class: 'lbl' }, '出発する場所'),
      h('div', { class: 'chips' },
        h('button', { class: 'chip', type: 'button', 'aria-pressed': String(!other), onClick: () => { d.origin = 'home'; renderOrigin(); } }, '自宅'),
        h('button', { class: 'chip', type: 'button', 'aria-pressed': String(other), onClick: () => { if (d.origin === 'home') d.origin = ' '; renderOrigin(); } }, '別の場所')),
      h('div', { class: 'addrow' }, otherIn, pick));
  }

  function renderCats() {
    clear(catBox).append(...S.categories.map(c => h('button', {
      class: 'chip', type: 'button', 'aria-pressed': String(d.categoryId === c.id), style: { '--c': colorHex(c.colorId) },
      onClick: () => { d.categoryId = c.id; renderCats(); },
    }, h('span', { class: 'swatch' }), c.name)));
  }

  function renderRepeat() {
    const unsupported = d.repeat === 'unsupported';
    clear(repeatSel).append(...(unsupported ? [h('option', { value: 'unsupported' }, 'Google で設定された繰り返し')] : REPEATS.map(([v, label]) =>
      h('option', { value: v, selected: d.repeat === v }, label ?? describeRule({ freq: v, end: { type: 'none' } }, d.date)))));
    repeatSel.disabled = unsupported;
    repeatNote.textContent = unsupported ? 'Google で設定された繰り返し（ここでは直せません）' : '';
    clear(repeatEndBox);
    if (unsupported || d.repeat === 'none') return;
    const endSel = h('select', { id: 'f-repeat-end', 'aria-label': '繰り返しの終わり' },
      h('option', { value: 'none', selected: d.repeatEnd.type === 'none' }, 'ずっと'),
      h('option', { value: 'until', selected: d.repeatEnd.type === 'until' }, '日付まで'),
      h('option', { value: 'count', selected: d.repeatEnd.type === 'count' }, '回数'));
    endSel.addEventListener('change', () => { d.repeatEnd.type = endSel.value; renderRepeat(); });
    const extra = d.repeatEnd.type === 'until'
      ? h('input', { type: 'date', id: 'f-until', value: d.repeatEnd.date || d.date, 'aria-label': '終わりの日' })
      : d.repeatEnd.type === 'count' ? h('input', { type: 'text', inputmode: 'numeric', id: 'f-count', value: String(d.repeatEnd.count), 'aria-label': '回数' }) : null;
    extra?.addEventListener('input', () => { if (extra.id === 'f-until') d.repeatEnd.date = extra.value; else d.repeatEnd.count = Math.max(1, parseInt(extra.value, 10) || 1); });
    repeatEndBox.append(h('label', { for: 'f-repeat-end' }, '繰り返しの終わり'), endSel, extra);
  }
  repeatSel.addEventListener('change', () => { d.repeat = repeatSel.value; renderRepeat(); });

  function renderNotify() {
    const presets = d.allDay ? ALLDAY_PRESETS : TIMED_PRESETS;
    const onBox = h('input', { type: 'checkbox', id: 'f-notify', checked: d.notify.on });
    onBox.addEventListener('change', () => { d.notify.on = onBox.checked; renderNotify(); });
    const count = d.notify.presets.length + (d.notify.custom?.length ?? 0);
    const list = d.notify.on ? h('ul', { class: 'checks' }, presets.map(p => {
      const isDepart = p.id === 'depart', on = d.notify.presets.includes(p.id);
      const disabled = (isDepart && !canDepart()) || (!on && count >= MAX_NOTIFY);
      const box = h('input', { type: 'checkbox', checked: on && !(isDepart && !canDepart()), disabled });
      box.addEventListener('change', () => {
        d.notify.presets = box.checked ? [...d.notify.presets, p.id] : d.notify.presets.filter(x => x !== p.id);
        renderNotify();
      });
      return h('li', {}, h('label', { class: 'check' }, box, h('span', {}, p.label,
        isDepart && !canDepart() ? h('span', { class: 'small', style: { display: 'block' } }, '場所を入れて保存すると選べます') : null)));
    })) : null;
    fill(notifyBox, h('label', { class: 'toggle' }, onBox, '通知する'), list,
      d.notify.on && count >= MAX_NOTIFY ? h('p', { class: 'small' }, '通知は 5 つまでです') : null);
  }

  function renderItems() {
    const add = h('input', { type: 'text', id: 'f-item', placeholder: '持ち物を書く', autocomplete: 'off', 'aria-label': '足す持ち物' });
    const addBtn = h('button', { class: 'btn', type: 'button' }, '足す');
    const doAdd = () => { const v = add.value.trim(); if (v) { d.items.push({ text: v, done: false }); renderItems(); itemsBox.querySelector('#f-item')?.focus(); } };
    addBtn.addEventListener('click', doAdd);
    add.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); doAdd(); } });
    fill(itemsBox, h('span', { class: 'lbl' }, '持ち物'),
      h('div', { class: 'chips' }, S.itemSets.map(set => h('button', {
        class: 'chip', type: 'button', onClick: () => {
          for (const t of set.items) if (!d.items.some(i => i.text === t)) d.items.push({ text: t, done: false });
          renderItems();
        },
      }, `${set.name}を入れる`))),
      d.items.map((it, i) => h('div', { class: 'itemrow' }, h('span', {}, `☐ ${it.text}`),
        h('button', { class: 'btn', type: 'button', onClick: () => { d.items.splice(i, 1); renderItems(); } }, '消す'))),
      h('div', { class: 'addrow' }, add, addBtn));
  }

  function applyTemplate(t) {
    d.title = t.title; title.value = d.title;
    d.categoryId = t.categoryId ?? d.categoryId;
    if (t.location) { d.location = t.location; d.geo = null; place.value = d.location; }
    d.end = fromMin(toMin(d.start) + (t.durationMinutes || 60)); endIn.value = d.end;
    const set = S.itemSets.find(s => s.id === t.itemSetId);
    if (set) d.items = set.items.map(text => ({ text, done: false }));
    d.notify = { on: t.notify.on, presets: [...t.notify.presets], custom: [], googleDefault: false };
    if (t.memo) { d.memo = t.memo; memo.value = t.memo; }
    renderCats(); renderItems(); renderNotify(); updateSum();
    app.toast(`「${t.name}」を入れました。日付と時刻を確かめてください`);
  }

  // ---- 保存
  let saving = false;
  const saveButtons = [];
  function showError(which, text) {
    err[which].textContent = text;
    err[which].hidden = false;
    err[which].previousElementSibling?.scrollIntoView?.({ block: 'center' });
  }
  async function save() {
    if (saving) return;
    err.title.hidden = true; err.time.hidden = true;
    d.title = title.value;
    if (!d.title.trim()) { showError('title', 'タイトルを入れてください'); title.focus(); return; }
    if (!d.allDay && toMin(d.end) < toMin(d.start)) { showError('time', '終わりの時刻が始まりより前になっています'); return; }
    if (d.allDay && d.endDate < d.date) { showError('time', '終わりの日が始まりの日より前になっています'); return; }
    let scope = 'one';
    if (original?.recurringEventId) {
      scope = await app.confirm({ message: '繰り返しの予定です。どれを直しますか？', buttons: [
        { label: 'この予定だけ', value: 'one' }, { label: 'これ以降すべて', value: 'following' }, { label: 'すべて', value: 'all' }, { label: 'やめる', value: null }] });
      if (!scope) return;
    }
    saving = true;
    saveButtons.forEach(b => { b.disabled = true; b.textContent = '保存しています…'; });
    const rule = d.repeat !== 'none' && d.repeat !== 'unsupported'
      ? { freq: d.repeat, end: d.repeatEnd.type === 'until' ? { type: 'until', date: d.repeatEnd.date || d.date } : d.repeatEnd.type === 'count' ? { type: 'count', count: d.repeatEnd.count } : { type: 'none' } }
      : null;
    const ruleChanged = JSON.stringify(rule) !== JSON.stringify(originalRule);
    const recurrence = original?.recurringEventId
      ? (rule && ruleChanged && scope !== 'one' ? [toRRule(rule, d.date, d.allDay)] : null)
      : (rule ? [toRRule(rule, d.date, d.allDay)] : (original?.recurrence ?? null));
    const ev = {
      calendarId: 'primary', id: null, recurringEventId: null, originalStart: null, colorId: null, route: null, pending: false,
      ...(original ?? {}),
      title: d.title.trim(), allDay: d.allDay,
      start: d.allDay ? d.date : `${d.date}T${d.start}`,
      end: d.allDay ? d.endDate : (original && !original.allDay && dateOf(original.end) > dateOf(original.start) ? `${dateOf(addMinutes(`${d.date}T00:00`, diffMinutes(`${dateOf(original.start)}T00:00`, `${dateOf(original.end)}T00:00`)))}T${d.end}` : `${d.date}T${d.end}`),
      location: d.location.trim(), geo: d.geo, origin: d.origin === 'home' ? 'home' : (d.origin.trim() || 'home'),
      categoryId: d.categoryId, notify: { ...d.notify, presets: canDepart() ? d.notify.presets : d.notify.presets.filter(p => p !== 'depart') },
      items: d.items, memo: d.memo, recurrence,
    };
    try {
      const saved = await app.repo.saveEvent(ev, { scope, original });
      if (saved.pending) app.toast('電波が弱いので、あとで自動で保存します');
      else if (app.repo.lastRouteError) app.toast(app.repo.lastRouteError.message);
      app.sel = d.date;
      if (app.monthState) { app.monthState.sel = d.date; }
      location.replace(routeTo('event', { calId: saved.calendarId, eventId: saved.id }));
    } catch (e) {
      saving = false;
      saveButtons.forEach(b => { b.disabled = false; b.textContent = '保存する'; });
      app.toast(e?.message || 'うまくいきませんでした。少したってから、もう一度お試しください。');
    }
  }
  const saveBtn = (cls) => { const b = h('button', { class: cls, type: 'button', onClick: save }, '保存する'); saveButtons.push(b); return b; };

  updateSum(); renderOrigin(); renderCats(); renderRepeat(); renderNotify(); renderItems();
  const tpl = !original && S.templates.length ? h('div', { class: 'field tpl' }, h('span', { class: 'lbl' }, 'よく使う予定から入れる'),
    h('div', { class: 'chips' }, S.templates.map(t => h('button', { class: 'chip', type: 'button', onClick: () => applyTemplate(t) }, t.name)))) : null;

  const body = h('div', { class: 'scroll' }, h('form', { class: 'screen', id: 'form', novalidate: true, onSubmit: e => { e.preventDefault(); save(); } },
    tpl,
    h('div', { class: 'field' }, h('label', { for: 'f-title' }, 'タイトル'), title, err.title),
    h('div', { class: 'field' }, h('label', { for: 'f-date' }, '日付'), dateIn),
    h('label', { class: 'toggle' }, allDay, '終日の予定（時刻を決めない）'),
    timesBox, endDateBox, err.time, sum,
    h('div', { class: 'field' }, h('label', { for: 'f-place' }, '場所'), h('div', { class: 'addrow' }, place, h('button', { class: 'btn', type: 'button', onClick: pickPlace }, '地図で探す'))),
    originBox,
    h('div', { class: 'field' }, h('span', { class: 'lbl' }, '種類'), catBox),
    h('div', { class: 'field' }, h('label', { for: 'f-repeat' }, '繰り返し'), repeatSel, repeatNote), repeatEndBox,
    notifyBox, itemsBox,
    h('div', { class: 'field' }, h('label', { for: 'f-memo' }, 'メモ'), memo),
    h('div', { class: 'form-bottom' }, saveBtn('btn primary wide'))));

  return {
    title: original ? '予定を直す' : '予定を入れる', header: 'sub', tab: null, body,
    back: () => history.back(),
    right: saveBtn('hbtn primary'),
  };
}
