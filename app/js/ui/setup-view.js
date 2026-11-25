// 初めの設定（家族の方へ）: Google 側のアドレスと合言葉を入れてつなぐ。お試しモードもここから。
import { h } from './dom.js';
import { createApi } from '../api.js';

export function setupView(app) {
  const url = h('input', { type: 'url', id: 'setup-url', autocomplete: 'off', inputmode: 'url', placeholder: 'https://script.google.com/macros/s/…/exec' });
  const key = h('input', { type: 'text', id: 'setup-key', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' });
  const error = h('p', { class: 'err setup-error', hidden: true, role: 'alert' });
  const connect = h('button', { class: 'btn primary wide', type: 'button' }, 'つなぐ');
  connect.addEventListener('click', async () => {
    error.hidden = true;
    const conn = { mode: 'google', url: url.value.trim(), key: key.value.trim() };
    if (!conn.url || !conn.key) { error.textContent = 'アドレスと合言葉を、両方入れてください。'; error.hidden = false; return; }
    connect.disabled = true;
    connect.textContent = 'つないでいます…';
    try {
      await createApi(conn, { timeoutMs: 20000 }).ping();
      await app.connect(conn);
    } catch (e) {
      error.textContent = e?.message || 'つなげませんでした。アドレスと合言葉を確かめてください。';
      error.hidden = false;
    } finally {
      connect.disabled = false;
      connect.textContent = 'つなぐ';
    }
  });
  const body = h('div', { class: 'scroll' }, h('div', { class: 'screen setup' },
    h('h2', {}, '初めの設定（家族の方へ）'),
    h('p', { class: 'note' }, 'この画面が出たら、家族に連絡してください。'),
    h('div', { class: 'field' }, h('label', { for: 'setup-url' }, 'Google 側のアドレス'), url),
    h('div', { class: 'field' }, h('label', { for: 'setup-key' }, '合言葉'), key),
    error, connect,
    h('p', { class: 'small' }, '手順書の「Google 側の準備」で控えたアドレスと合言葉を貼り付けます。'),
    h('button', { class: 'btn wide', type: 'button', onClick: () => app.connect({ mode: 'demo' }) }, 'お試し（見本の予定で使う）'),
  ));
  return { title: '予定表', header: 'plain', body, tab: null };
}
