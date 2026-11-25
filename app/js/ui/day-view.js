// 日の画面: 一番上に終日の予定、その下に 0〜23 時の欄。開いたら 7 時の欄が見えるところまで動かす
import { h, clear } from './dom.js';
import { addDays, formatDateJa } from '../dates.js';
import { renderEventRow, dayHead, homeForecast } from './components.js';
import { eventsByDay } from './month-layout.js';

export async function dayView(app, params) {
  const date = params.date ?? app.today();
  app.sel = date;
  const forecast = homeForecast(app);
  const allday = h('div', { class: 'allday-list' });
  const hours = Array.from({ length: 24 }, (_, hh) => h('div', { class: 'hour', dataset: { h: String(hh) } }, h('span', {}, `${hh}時`), h('div')));
  const nav = h('div', { class: 'navrow' },
    h('button', { class: 'btn', type: 'button', onClick: () => app.go('day', { date: addDays(date, -1) }) }, '◀ 前の日'),
    h('button', { class: 'btn', type: 'button', onClick: () => app.go('day', { date: app.today() }) }, '今日'),
    h('button', { class: 'btn', type: 'button', onClick: () => app.go('day', { date: addDays(date, 1) }) }, '次の日 ▶'));
  const scroll = h('div', { class: 'scroll' }, h('div', { class: 'screen' }, nav),
    h('section', { class: 'section', style: { margin: '0 max(10px, 0.45em)' } }, dayHead(date, app, forecast), allday, h('div', { class: 'hours' }, hours)));

  function render(events) {
    const evs = eventsByDay(events).get(date) ?? [];
    clear(allday).append(...evs.filter(ev => ev.allDay).map(ev => renderEventRow(ev, { app, dayKey: date })));
    hours.forEach((row, hh) => clear(row.lastChild).append(...evs
      .filter(ev => !ev.allDay && Number(ev.start.slice(0, 10) < date ? 0 : ev.start.slice(11, 13)) === hh)
      .map(ev => renderEventRow(ev, { app, dayKey: date }))));
  }

  return {
    title: formatDateJa(date), header: 'main', body: scroll, tab: 'day',
    onMount: () => {
      requestAnimationFrame(() => { scroll.scrollTop = hours[7].offsetTop - 8; });
      app.repo?.loadRange(date, date, render);
    },
  };
}
