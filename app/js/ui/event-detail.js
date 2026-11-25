// 予定の詳しい画面。予定の時刻をいちばん大きく出し、出発の目安は予定の時刻とのつながりが分かる形で別に出す。
import { h, clear } from './dom.js';
import { formatDateJa, formatTime, dateOf } from '../dates.js';
import { departureSummary } from '../departure.js';
import { describeNotify } from '../reminders.js';
import { fromRRule, describeRule } from '../recurrence.js';
import { fetchForecast, weatherFor, WEATHER_CREDIT } from '../weather.js';
import { eventColorHex } from '../event-model.js';
import { homeForecast } from './components.js';

const mapsUrl = (origin, destination, mode) =>
  `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&travelmode=${mode}`;

export async function eventDetailView(app, params) {
  const { calId, eventId } = params;
  let ev;
  try {
    ev = await app.repo.getEvent(calId, eventId);
  } catch (e) {
    return {
      title: '予定', header: 'sub', tab: null,
      body: h('div', { class: 'scroll' }, h('div', { class: 'screen' }, h('p', { class: 'err' }, e?.message || 'この予定は見つかりませんでした。'))),
    };
  }
  const S = app.settings;
  const routeBox = h('div');
  const itemsBox = h('div');
  const repeatLine = h('dd');
  const wxLine = h('p', { class: 'wx-line' }, '…');

  function renderRoute() {
    clear(routeBox);
    if (!ev.location) return;
    const summary = departureSummary(ev, S);
    const origin = ev.origin === 'home' ? S.home.address : ev.origin;
    const destination = ev.route?.address || ev.location;
    const recompute = h('button', { class: 'btn', type: 'button' }, '計算し直す');
    recompute.addEventListener('click', async () => {
      recompute.disabled = true;
      recompute.textContent = '計算しています…';
      try {
        ev = await app.repo.recomputeRoute(ev);
        if (app.repo.lastRouteError) app.toast(app.repo.lastRouteError.message);
      } catch (e) { app.toast(e?.message || 'うまくいきませんでした。'); }
      renderRoute();
    });
    const links = h('div', { class: 'btnrow' },
      origin ? h('a', { class: 'btn', href: mapsUrl(origin, destination, 'driving'), target: '_blank', rel: 'noopener' }, 'Google マップで道を見る') : null,
      origin ? h('a', { class: 'btn', href: mapsUrl(origin, destination, 'transit'), target: '_blank', rel: 'noopener' }, '電車・バスの道を見る') : null,
      recompute);
    if (ev.allDay) {
      routeBox.append(h('section', { class: 'box route-box' }, h('h2', {}, '移動（車）'),
        ev.route?.withoutHighways || ev.route?.withHighways
          ? h('p', {}, `高速あり 約${ev.route.withHighways?.minutes ?? '-'}分／高速なし 約${ev.route.withoutHighways?.minutes ?? '-'}分`)
          : h('p', {}, '移動時間はまだ計算していません。'), links));
      return;
    }
    if (!summary) {
      routeBox.append(h('section', { class: 'box route-box' }, h('h2', {}, '出発の目安'),
        h('p', {}, ev.route || !origin ? '場所が見つからず、移動時間を計算できませんでした。住所を入れると計算できます。' : '移動時間はまだ計算していません。'),
        !origin ? h('p', { class: 'small' }, '自宅の住所が登録されていません（家族向けの設定）。') : null, links));
      return;
    }
    const row = (label, r) => (r ? h('p', { class: 'route-row' }, h('span', {}, `${label} 約${r.minutes}分`), h('span', {}, ` → ${formatTime(r.departAt)}ごろ`)) : null);
    routeBox.append(h('section', { class: 'box route-box' },
      h('h2', {}, `${formatTime(ev.start)} に間に合う出発の目安（車）`),
      row('高速あり', summary.withHighways), row('高速なし', summary.withoutHighways),
      h('p', { class: 'small' }, `${ev.origin === 'home' ? '自宅から。' : `${ev.origin} から。`}余裕の時間 ${S.bufferMinutes}分を含みます。渋滞は含みません。`),
      ev.route?.address ? h('p', { class: 'small' }, `${ev.route.address} として計算しました`) : null,
      links));
  }

  function renderItems() {
    clear(itemsBox);
    if (!ev.items?.length) return;
    itemsBox.append(h('section', { class: 'box' }, h('h2', {}, '持ち物'), h('ul', { class: 'checks' }, ev.items.map((it, i) => {
      const input = h('input', { type: 'checkbox', checked: it.done, 'aria-label': it.text });
      input.addEventListener('change', async () => {
        input.disabled = true;
        try { ev = await app.repo.toggleItem(ev, i); } catch (e) { app.toast(e?.message || 'うまくいきませんでした。'); }
        renderItems();
      });
      return h('li', {}, h('label', { class: `check${it.done ? ' done' : ''}` }, input, h('span', {}, it.text)));
    }))));
  }

  async function remove() {
    const series = !!ev.recurringEventId;
    const scope = await app.confirm(series
      ? { message: '繰り返しの予定です。どれを消しますか？', buttons: [
        { label: 'この予定だけ', value: 'one', cls: 'danger' }, { label: 'これ以降すべて', value: 'following', cls: 'danger' },
        { label: 'すべて', value: 'all', cls: 'danger' }, { label: 'やめる', value: null }] }
      : { message: `「${ev.title}」を消しますか？`, buttons: [{ label: '消す', value: 'one', cls: 'danger' }, { label: 'やめる', value: null }] });
    if (!scope) return;
    try {
      await app.repo.deleteEvent(ev, scope);
      app.toast(app.repo.lastError ? '電波が弱いので、あとで自動で消します' : '消しました');
      app.go('month', { ym: dateOf(ev.start).slice(0, 7) });
    } catch (e) {
      app.toast(e?.message || 'うまくいきませんでした。');
    }
  }

  const category = S.categories.find(c => c.id === ev.categoryId);
  const dateText = ev.allDay && dateOf(ev.end) !== dateOf(ev.start)
    ? `${formatDateJa(dateOf(ev.start))} 〜 ${formatDateJa(dateOf(ev.end))}` : formatDateJa(dateOf(ev.start));
  const timeText = ev.allDay ? '終日' : `${formatTime(ev.start)} 〜 ${formatTime(ev.end)}`;
  renderRoute();
  renderItems();

  const body = h('div', { class: 'scroll' }, h('div', { class: 'screen' },
    h('p', { class: 'd-date' }, dateText),
    h('p', { class: 'detail-time' }, timeText),
    h('h2', { class: 'd-title' }, ev.title, ev.pending ? h('span', { class: 'pending-badge' }, 'まだ保存中') : null),
    category ? h('span', { class: 'd-cat', style: { '--c': eventColorHex(ev, S, null) } }, h('span', { class: 'swatch' }), category.name) : null,
    ev.location ? h('dl', { class: 'kv' }, h('dt', {}, '場所'), h('dd', {}, ev.location)) : null,
    routeBox,
    h('section', { class: 'box' }, h('h2', {}, '天気'), wxLine, h('p', { class: 'credit' }, WEATHER_CREDIT)),
    itemsBox,
    h('dl', { class: 'kv' },
      h('dt', {}, '通知'), h('dd', {}, describeNotify(ev.notify, ev.allDay)),
      h('dt', { class: 'repeat-dt', hidden: !ev.recurringEventId && !ev.recurrence }, '繰り返し'), repeatLine,
      ev.memo ? [h('dt', {}, 'メモ'), h('dd', { style: { 'white-space': 'pre-wrap' } }, ev.memo)] : null),
    h('div', { class: 'btnrow' },
      h('button', { class: 'btn', type: 'button', onClick: () => app.go('edit', { calId: ev.calendarId, eventId: ev.id }) }, '直す'),
      h('button', { class: 'btn danger', type: 'button', onClick: remove }, 'この予定を消す'))));

  function onMount() {
    const f = ev.geo ? fetchForecast(ev.geo.lat, ev.geo.lng, { kv: app.kv }).catch(() => null) : homeForecast(app);
    f.then(fc => {
      const w = weatherFor(fc, ev.allDay ? dateOf(ev.start) : ev);
      wxLine.textContent = w ? `${w.icon} ${w.label}　${w.max}℃／${w.min}℃　雨 ${w.popAtTime ?? w.pop ?? '-'}%` : '近くなったら表示されます';
    });
    if (ev.recurringEventId || ev.recurrence) {
      repeatLine.textContent = '…';
      app.repo.getRecurrence(ev).then(lines => {
        const rule = fromRRule(lines ?? [], dateOf(ev.originalStart ?? ev.start));
        repeatLine.textContent = rule.unsupported ? 'Google で設定された繰り返し' : describeRule(rule, dateOf(ev.originalStart ?? ev.start));
      }).catch(() => { repeatLine.textContent = '繰り返しの予定'; });
    }
  }

  return {
    title: '予定', header: 'sub', tab: null, body, onMount,
    right: h('button', { class: 'hbtn', type: 'button', onClick: () => app.go('edit', { calId: ev.calendarId, eventId: ev.id }) }, '直す'),
  };
}
