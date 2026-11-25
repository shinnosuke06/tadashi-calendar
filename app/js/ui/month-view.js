// 月の画面。表を画面いっぱいに出し、日付を押すと下からその日の予定が出る。
// 横の形（初期値）: 1 か月 = 1 ページ、左右にめくる（上下には動かない）。
// 縦の形: 週を縦に途切れずつなげ、上下にスクロールする（同じ日付は 1 回だけ）。
import { h, clear } from './dom.js';
import { addDays, dayOfWeek, parseKey, dateOf, WEEKDAYS } from '../dates.js';
import { getHoliday } from '../holidays.js';
import { getRokuyo } from '../rokuyo.js';
import { eventColorHex } from '../event-model.js';
import { renderEventRow, dayHead, homeForecast } from './components.js';
import { routeTo } from './router.js';
import {
  weekStartOf, weekRange, weekIndexOf, weekLanes, cellItems, focusMonth, monthPageWeeks, monthList,
  eventsByDay, isMulti, addMonth, firstOf, ymOf, sameYm,
} from './month-layout.js';

const pad = n => String(n).padStart(2, '0');
const ymKey = ([y, m]) => `${y}-${pad(m)}`;
const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
let currentResize = null;
window.addEventListener('resize', () => currentResize?.());

export function titleOf([y, m]) {
  return [h('small', {}, `${y}年`), `${m}月`];
}

export async function monthView(app, params) {
  const S = app.settings;
  const horizontal = S.monthScroll !== 'v';
  const today = app.today();
  const st = (app.monthState ??= { sel: today, sheet: false, topWeek: null });
  st.ym = params.ym ? params.ym.split('-').map(Number) : ymOf(today);
  if (params.d) { st.sel = `${params.ym}-${params.d}`; st.sheet = true; }
  if (app.openDay) { st.sel = app.openDay; st.sheet = true; st.ym = ymOf(app.openDay); st.topWeek = null; app.openDay = null; }
  if (st.weekStart !== S.weekStart || st.mode !== S.monthScroll) { st.topWeek = null; st.weekStart = S.weekStart; st.mode = S.monthScroll; }
  app.sel = st.sel;

  const forecast = homeForecast(app);
  const eventMap = new Map();
  let byDay = new Map();
  const loaded = new Set();

  // ---- 表を作る（中身は後から入れる）
  const months = monthList(today);
  const cellEls = new Map(); // dateKey → [cell, ...]（横の形では前後の月のページにも同じ日がある）
  function makeCell(k, pageYm) {
    const d = dayOfWeek(k), hol = getHoliday(k);
    const cls = ['cell', pageYm && !sameYm(ymOf(k), pageYm) && 'out', k === today && 'today', d === 6 && 'sat', d === 0 && 'sun', hol && 'hol'].filter(Boolean).join(' ');
    const el = h('button', { class: cls, type: 'button', dataset: { d: k }, onClick: () => showDay(k, pageYm) });
    if (!cellEls.has(k)) cellEls.set(k, []);
    cellEls.get(k).push(el);
    return el;
  }
  let calendar, wr;
  if (horizontal) {
    calendar = h('div', { class: 'hmonths', id: 'hmonths' }, months.map(ym => {
      const { ws, rows } = monthPageWeeks(ym, S.weekStart);
      return h('div', { class: 'hpage', dataset: { ym: ymKey(ym) }, style: { '--rows': String(rows) } },
        Array.from({ length: rows }, (_, i) => h('div', { class: 'hweek', dataset: { ws: addDays(ws, i * 7) } },
          Array.from({ length: 7 }, (_, j) => makeCell(addDays(ws, i * 7 + j), ym)))));
    }));
  } else {
    wr = weekRange(today, S.weekStart);
    calendar = h('div', { class: 'months', id: 'months' }, Array.from({ length: wr.count }, (_, i) => {
      const ws = addDays(wr.week0, i * 7);
      return h('div', { class: 'week', dataset: { ws } }, Array.from({ length: 7 }, (_, j) => makeCell(addDays(ws, j), null)));
    }));
    markOut(st.ym);
  }
  const sheet = h('section', { class: 'sheet', id: 'sheet', 'aria-label': '選んだ日の予定' });
  const calwrap = h('div', { class: 'calwrap', id: 'calwrap' }, calendar, sheet);
  const wd = Array.from({ length: 7 }, (_, i) => (i + S.weekStart) % 7)
    .map(d => h('span', { class: d === 6 ? 'sat' : d === 0 ? 'sun' : '' }, WEEKDAYS[d]));
  const body = h('div', { class: 'view', style: { flex: '1' } }, h('div', { class: 'wdrow' }, wd), calwrap);

  // ---- マスの中身
  function cellContent(k, wl) {
    const { m, d } = parseKey(k);
    const hol = getHoliday(k), rk = S.showRokuyo ? getRokuyo(k) : null;
    const list = byDay.get(k) ?? [];
    const top = h('span', { class: 'ctop' },
      h('span', { class: 'nwrap' }, d === 1 ? h('span', { class: 'mtag' }, `${m}月`) : null, h('span', { class: 'num' }, String(d)),
        hol && !S.showRokuyo ? h('span', { class: 'hn1' }, hol) : null),
      S.showRokuyo ? h('span', { class: 'l2' }, rk ?? '', hol ? h('span', { class: 'hn' }, `${rk ? ' ' : ''}${hol}`) : null) : null);
    let lbs;
    if (S.monthNames) {
      const items = cellItems(k, wl, list), shown = items.slice(0, 3), hidden = items.slice(3).filter(Boolean).length;
      lbs = shown.map(e => {
        if (!e) return h('span', { class: 'lb gap' }, ' ');
        const color = { '--c': eventColorHex(e, S, null) };
        if (!isMulti(e)) return h('span', { class: 'lb', style: color }, e.title);
        const s = k === dateOf(e.start), en = k === dateOf(e.end), text = s || dayOfWeek(k) === S.weekStart;
        return h('span', { class: `lb span${s ? ' s' : ''}${en ? ' e' : ''}${text ? '' : ' cont'}`, style: color }, e.title);
      });
      if (hidden) lbs.push(h('span', { class: 'more' }, `+${hidden}`));
    } else {
      lbs = [h('span', { class: 'dots' }, list.slice(0, 4).map(e => h('span', { class: 'dot', style: { '--c': eventColorHex(e, S, null) } })))];
    }
    return [top, h('span', { class: 'lbs' }, lbs)];
  }
  function refreshWeek(weekEl) {
    const ws = weekEl.dataset.ws;
    const evs = [...new Set(Array.from({ length: 7 }, (_, j) => byDay.get(addDays(ws, j)) ?? []).flat())];
    const wl = weekLanes(ws, evs);
    for (const c of weekEl.children) {
      clear(c).append(...cellContent(c.dataset.d, wl));
      c.setAttribute('aria-label', `${c.dataset.d} 予定${(byDay.get(c.dataset.d) ?? []).length}件`);
    }
  }
  function refreshAll() {
    for (const w of calendar.querySelectorAll(horizontal ? '.hweek' : '.week')) refreshWeek(w);
  }
  refreshAll();

  // ---- 予定を読む（今の月の前後を取り、めくったら足りない月を足す）
  function mergeRange(a, b, evs) {
    for (const [key, ev] of eventMap) if (dateOf(ev.start) <= b && dateOf(ev.end) >= a) eventMap.delete(key);
    for (const ev of evs) eventMap.set(`${ev.calendarId}|${ev.id}`, ev);
    byDay = eventsByDay([...eventMap.values()]);
    refreshAll();
    if (st.sheet) refreshSheet();
  }
  function ensureLoaded(ym) {
    const need = [addMonth(ym, -1), ym, addMonth(ym, 1)].filter(x => !loaded.has(ymKey(x)));
    if (!need.length || !app.repo) return;
    need.forEach(x => loaded.add(ymKey(x)));
    const a = weekStartOf(firstOf(need[0]), S.weekStart);
    const b = addDays(firstOf(addMonth(need.at(-1), 1)), 6);
    app.repo.loadRange(a, b, evs => mergeRange(a, b, evs));
  }

  // ---- 下から出る予定
  function refreshSheet() {
    const list = byDay.get(st.sel) ?? [];
    clear(sheet).append(
      h('div', { class: 'sheet-head', id: 'sheethead' },
        h('span', { class: 'grab', 'aria-hidden': 'true' }),
        h('div', { class: 'sh-row' }, dayHead(st.sel, app, forecast), h('button', { class: 'hbtn', type: 'button', onClick: () => closeSheet() }, '閉じる'))),
      h('div', { class: 'sheet-body' },
        list.length ? list.map(ev => renderEventRow(ev, { app, dayKey: st.sel })) : h('p', { class: 'empty' }, 'この日の予定はありません'),
        h('div', { class: 'addwrap' }, h('button', { class: 'addpill', type: 'button', onClick: () => app.go('new', { date: st.sel }) }, '＋ この日に予定を追加'))));
  }
  function markSelected() {
    calendar.querySelectorAll('.cell.sel').forEach(c => c.classList.remove('sel'));
    (cellEls.get(st.sel) ?? []).forEach(c => c.classList.add('sel'));
  }
  function openSheet({ scroll = true } = {}) {
    st.sheet = true;
    app.sel = st.sel;
    refreshSheet();
    sheet.classList.add('open');
    calwrap.classList.add('sheet-open');
    markSelected();
    if (horizontal) { calendar.classList.add('locked'); applyShiftH(); } else if (scroll) ensureVisible(st.sel);
  }
  function closeSheet() {
    st.sheet = false;
    sheet.classList.remove('open');
    calwrap.classList.remove('sheet-open');
    if (horizontal) { calendar.classList.remove('locked'); calendar.style.transform = ''; }
  }
  function showDay(k, pageYm) {
    if (st.sheet && st.sel === k) { closeSheet(); return; }
    st.sel = k;
    app.sel = k;
    if (horizontal && !sameYm(ymOf(k), st.ym)) { closeSheet(); st.sel = k; scrollToPage(ymOf(k), () => openSheet()); return; }
    openSheet();
  }

  // ---- 見出しの月
  function setFocus(ym) {
    if (sameYm(ym, st.ym)) return;
    st.ym = ym;
    app.shell.setTitle(titleOf(ym));
    history.replaceState(null, '', routeTo('month', { ym: ymKey(ym) }));
    if (!horizontal) markOut(ym);
    if (!st.sheet && !sameYm(ymOf(st.sel), ym)) { st.sel = sameYm(ymOf(today), ym) ? today : firstOf(ym); app.sel = st.sel; }
    ensureLoaded(ym);
  }
  function markOut(ym) {
    for (const [k, els] of cellEls) for (const c of els) c.classList.toggle('out', !sameYm(ymOf(k), ym));
  }

  // ---- 横の形
  const pageIdx = ym => months.findIndex(x => sameYm(x, ym));
  function scrollToPage(ym, then) {
    const i = pageIdx(ym);
    if (i < 0) { then?.(); return; }
    setFocus(ym);
    const target = i * calendar.clientWidth;
    if (Math.abs(calendar.scrollLeft - target) < 1) { then?.(); return; }
    calendar.scrollTo({ left: target, behavior: reduceMotion() ? 'auto' : 'smooth' });
    if (!then) return;
    const t0 = performance.now();
    (function wait() { if (Math.abs(calendar.scrollLeft - target) < 1 || performance.now() - t0 > 900) then(); else requestAnimationFrame(wait); })();
  }
  function applyShiftH() {
    if (!st.sheet) { calendar.style.transform = ''; return; }
    const page = calendar.querySelector(`.hpage[data-ym="${ymKey(st.ym)}"]`);
    const cells = page ? [...page.querySelectorAll('.cell')] : [];
    const i = cells.findIndex(c => c.dataset.d === st.sel);
    if (i < 0) return;
    const rh = page.clientHeight / page.children.length, visible = calwrap.clientHeight - sheet.offsetHeight;
    const shift = Math.max(0, (Math.floor(i / 7) + 1) * rh - visible);
    calendar.style.transform = shift ? `translateY(${-shift}px)` : '';
  }

  // ---- 縦の形
  const rowH = () => calwrap.clientHeight / 6;
  const visibleRows = () => Math.max(1, Math.floor((calwrap.clientHeight - (st.sheet ? sheet.offsetHeight : 0)) / rowH() + 0.01));
  function scrollToWeek(i) {
    st.topWeek = Math.max(0, Math.min(wr.count - 6, i));
    calendar.scrollTo({ top: st.topWeek * rowH(), behavior: reduceMotion() ? 'auto' : 'smooth' });
  }
  function ensureVisible(k) {
    const i = weekIndexOf(wr.week0, k), n = visibleRows();
    if (i < st.topWeek) scrollToWeek(i); else if (i > st.topWeek + n - 1) scrollToWeek(i - n + 1);
  }

  // ---- なぞって閉じる
  function setupDrag() {
    let y0 = null, dy = 0;
    sheet.addEventListener('pointerdown', e => {
      if (!e.target.closest('#sheethead') || e.target.closest('button')) return;
      y0 = e.clientY; dy = 0; sheet.style.transition = 'none';
      try { sheet.setPointerCapture(e.pointerId); } catch { /* 古い端末 */ }
    });
    sheet.addEventListener('pointermove', e => { if (y0 === null) return; dy = Math.max(0, e.clientY - y0); sheet.style.transform = `translateY(${dy}px)`; });
    const end = () => { if (y0 === null) return; y0 = null; sheet.style.transition = ''; sheet.style.transform = ''; if (dy > 70) closeSheet(); };
    sheet.addEventListener('pointerup', end);
    sheet.addEventListener('pointercancel', end);
  }

  function layout() {
    if (horizontal) {
      calendar.scrollLeft = Math.max(0, pageIdx(st.ym)) * calendar.clientWidth;
      applyShiftH();
    } else {
      calendar.style.setProperty('--rowh', `${rowH()}px`);
      calendar.scrollTop = st.topWeek * rowH();
    }
  }

  function onMount() {
    currentResize = () => { if (calwrap.isConnected) layout(); };
    if (!horizontal && st.topWeek == null) st.topWeek = weekIndexOf(wr.week0, weekStartOf(firstOf(st.ym), S.weekStart));
    layout();
    let t;
    if (horizontal) {
      calendar.addEventListener('scroll', () => {
        clearTimeout(t);
        t = setTimeout(() => {
          if (st.sheet) return;
          const ym = months[Math.round(calendar.scrollLeft / calendar.clientWidth)];
          if (ym) setFocus(ym);
        }, 80);
      }, { passive: true });
    } else {
      calendar.addEventListener('scroll', () => {
        clearTimeout(t);
        t = setTimeout(() => {
          st.topWeek = Math.round(calendar.scrollTop / rowH());
          setFocus(focusMonth(wr.week0, st.topWeek, visibleRows()));
        }, 90);
      }, { passive: true });
    }
    setupDrag();
    if (st.sheet) {
      calwrap.classList.add('noanim');
      openSheet({ scroll: !horizontal });
      requestAnimationFrame(() => requestAnimationFrame(() => calwrap.classList.remove('noanim')));
    }
    ensureLoaded(st.ym);
  }

  return { title: titleOf(st.ym), header: 'main', body, tab: 'month', onMount };
}
