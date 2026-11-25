// 週の画面: 文字が大きいと横に 7 列は読めないので、7 日を縦に並べる
import { h, clear } from './dom.js';
import { addDays, parseKey } from '../dates.js';
import { renderEventRow, dayHead, homeForecast } from './components.js';
import { weekStartOf, eventsByDay } from './month-layout.js';

export async function weekView(app, params) {
  const date = params.date ?? app.today();
  app.sel = date;
  const ws = weekStartOf(date, app.settings.weekStart), we = addDays(ws, 6);
  const forecast = homeForecast(app);
  const list = h('div', { class: 'screen', style: { 'padding-top': '0' } });
  const s = parseKey(ws), e = parseKey(we);
  const title = `${s.m}/${s.d}〜${e.m}/${e.d}`; // 一番大きい字でも 1 行に収まる短い形
  const nav = h('div', { class: 'navrow' },
    h('button', { class: 'btn', type: 'button', onClick: () => app.go('week', { date: addDays(date, -7) }) }, '◀ 前の週'),
    h('button', { class: 'btn', type: 'button', onClick: () => app.go('week', { date: app.today() }) }, '今週'),
    h('button', { class: 'btn', type: 'button', onClick: () => app.go('week', { date: addDays(date, 7) }) }, '次の週 ▶'));
  const body = h('div', { class: 'scroll' }, h('div', { class: 'screen' }, nav), list);

  function render(events) {
    const byDay = eventsByDay(events);
    clear(list).append(...Array.from({ length: 7 }, (_, i) => {
      const k = addDays(ws, i), evs = byDay.get(k) ?? [];
      return h('section', { class: 'section week-day' }, dayHead(k, app, forecast),
        evs.length ? evs.map(ev => renderEventRow(ev, { app, dayKey: k })) : h('p', { class: 'empty' }, '予定なし'));
    }));
  }
  render([]);
  return { title, header: 'main', body, tab: 'week', onMount: () => app.repo?.loadRange(ws, we, render) };
}
