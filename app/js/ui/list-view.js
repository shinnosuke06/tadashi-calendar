// 一覧の画面: 今日の天気（自宅）と、今日から先の予定を日付ごとに並べる
import { h, clear } from './dom.js';
import { addDays, dateOf } from '../dates.js';
import { weatherFor, WEATHER_CREDIT } from '../weather.js';
import { renderEventRow, dayHead, homeForecast } from './components.js';
import { eventsByDay } from './month-layout.js';

export async function listView(app) {
  const today = app.today();
  const forecast = homeForecast(app);
  let days = 60;
  const weather = h('div');
  const list = h('div', { class: 'screen', style: { 'padding-top': '0' } });
  const more = h('button', { class: 'btn wide', type: 'button' }, 'もっと見る');
  const body = h('div', { class: 'scroll' }, h('div', { class: 'screen' }, weather), list, h('div', { class: 'screen' }, more));

  forecast.then(f => {
    const w = weatherFor(f, today);
    if (!w) return;
    weather.append(h('div', { class: 'box wx-card' }, h('span', { class: 'ic', 'aria-hidden': 'true' }, w.icon),
      h('div', {}, h('p', {}, h('b', {}, '今日の天気（自宅）')), h('p', {}, `${w.label}　${w.max}℃／${w.min}℃　雨 ${w.pop ?? '-'}%`))),
    h('p', { class: 'credit' }, WEATHER_CREDIT));
  });

  function render(events) {
    const byDay = eventsByDay(events);
    const sections = [];
    for (let i = 0; i < days; i++) {
      const k = addDays(today, i), evs = byDay.get(k);
      if (evs?.length) sections.push(h('section', { class: 'section' }, dayHead(k, app, forecast), evs.map(ev => renderEventRow(ev, { app, dayKey: k }))));
    }
    clear(list).append(...(sections.length ? sections : [h('p', { class: 'empty' }, 'この先の予定はありません')]));
  }
  const load = () => app.repo?.loadRange(today, addDays(today, days - 1), evs => render(evs.filter(e => dateOf(e.end) >= today)));
  more.addEventListener('click', () => { days += 60; load(); });

  return { title: 'これからの予定', header: 'main', body, tab: 'list', onMount: load };
}
