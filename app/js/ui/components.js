// いろいろな画面で使う部品: 予定の行・日付の見出し・天気
import { h } from './dom.js';
import { formatTime, formatDateJa, dateOf } from '../dates.js';
import { departureSummary, departureHintText } from '../departure.js';
import { eventColorHex } from '../event-model.js';
import { getHoliday } from '../holidays.js';
import { getRokuyo } from '../rokuyo.js';
import { fetchForecast, weatherFor } from '../weather.js';

const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);

// 予定の行: 左に時刻（開始を大きく、終了を小さく）、色の帯、タイトル、その下に小さく出発の目安
export function renderEventRow(ev, { app, dayKey }) {
  const color = eventColorHex(ev, app.settings, null);
  const multi = ev.allDay && dateOf(ev.start) !== dateOf(ev.end);
  const span = multi ? `（${daysBetween(dateOf(ev.start), dayKey ?? dateOf(ev.start)) + 1}日目／${daysBetween(dateOf(ev.start), dateOf(ev.end)) + 1}日間）` : '';
  const hint = departureHintText(departureSummary(ev, app.settings));
  const times = ev.allDay
    ? [h('span', { class: 'ev-t1 allday' }, '終日')]
    : [h('span', { class: 'ev-t1' }, formatTime(ev.start)), h('span', { class: 'ev-t2' }, formatTime(ev.end))];
  return h('button', {
    class: 'ev', type: 'button', style: { '--c': color },
    onClick: () => app.go('event', { calId: ev.calendarId, eventId: ev.id }),
  },
  h('span', { class: 'ev-times' }, times),
  h('span', { class: 'ev-bar' }),
  h('span', { class: 'ev-main' },
    h('span', { class: 'ev-title' }, `${ev.title}${span}`, ev.pending ? h('span', { class: 'pending-badge' }, 'まだ保存中') : null),
    hint ? h('span', { class: 'ev-hint' }, `🚗 ${hint}`) : null),
  h('span', { class: 'ev-chev', 'aria-hidden': 'true' }, '›'));
}

// 自宅の天気予報（自宅が未設定なら null）
export function homeForecast(app) {
  const home = app.settings.home;
  if (home?.lat == null || home?.lng == null) return Promise.resolve(null);
  return fetchForecast(home.lat, home.lng, { kv: app.kv }).catch(() => null);
}

// 日付の見出し（日付・今日・祝日・六曜・天気）
export function dayHead(dayKey, app, forecastPromise = null) {
  const hol = getHoliday(dayKey);
  const rk = app.settings.showRokuyo ? getRokuyo(dayKey) : null;
  const wx = h('span', { class: 'wx' });
  forecastPromise?.then(f => {
    const w = weatherFor(f, dayKey);
    if (w) wx.textContent = `${w.icon} ${w.max}℃/${w.min}℃`;
  });
  return h('h2', { class: 'dayhead' },
    h('span', {}, `${formatDateJa(dayKey)}${dayKey === app.today() ? '・今日' : ''}`),
    hol ? h('span', { class: 'hol' }, hol) : null,
    rk ? h('span', { class: 'rk' }, rk) : null,
    wx);
}
