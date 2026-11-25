// 予定を探す（タイトル・場所・メモから）
import { h, fill } from './dom.js';
import { dateOf } from '../dates.js';
import { renderEventRow, dayHead } from './components.js';

export async function searchView(app) {
  const q = h('input', { type: 'search', id: 'q', value: app.lastQuery ?? '', placeholder: '例：眼科', autocomplete: 'off', 'aria-label': '探す言葉', enterkeyhint: 'search' });
  const results = h('div', { class: 'results' }, h('p', { class: 'empty' }, 'タイトル・場所・メモから探します'));
  async function run() {
    const text = q.value.trim();
    app.lastQuery = text;
    if (!text) return;
    fill(results, h('p', { class: 'empty' }, '探しています…'));
    const found = await app.repo.search(text);
    const byDay = new Map();
    for (const ev of found) { const k = dateOf(ev.start); if (!byDay.has(k)) byDay.set(k, []); byDay.get(k).push(ev); }
    fill(results, found.length
      ? [...byDay].map(([k, evs]) => h('section', { class: 'section' }, dayHead(k, app), evs.map(ev => renderEventRow(ev, { app, dayKey: k }))))
      : h('p', { class: 'empty' }, '見つかりませんでした'),
    app.repo.lastError ? h('p', { class: 'small' }, '電波が弱いので、この端末に保存してある予定から探しました。') : null);
  }
  const body = h('div', { class: 'scroll' }, h('div', { class: 'screen' },
    h('form', { class: 'addrow search-form', onSubmit: e => { e.preventDefault(); run(); } }, q, h('button', { class: 'btn primary', type: 'submit' }, '探す')),
    results));
  return { title: '予定を探す', header: 'sub', tab: null, body, onMount: () => { if (q.value) run(); else q.focus(); } };
}
