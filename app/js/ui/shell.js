// 画面の枠: 上の段・中身・下のボタン・お知らせ・確かめる画面
import { h, clear } from './dom.js';

const TABS = [['today', '今日'], ['month', '月'], ['week', '週'], ['day', '日'], ['list', '一覧']];

export function createShell(root, { onTab, onSearch, onSettings }) {
  const bar = h('header', { class: 'bar' });
  const view = h('main', { class: 'view' });
  const tabButtons = TABS.map(([name, label]) => h('button', { class: 'tab', type: 'button', dataset: { tab: name }, onClick: () => onTab(name) }, label));
  const plus = h('button', { class: 'plus', type: 'button', 'aria-label': '予定を入れる', dataset: { tab: 'new' }, onClick: () => onTab('new') },
    h('span', { class: 'p1', 'aria-hidden': 'true' }, '＋'), h('span', { class: 'p2' }, '追加'));
  const tabs = h('nav', { class: 'tabs', 'aria-label': '表示の切り替え' }, tabButtons, plus);
  root.append(bar, view, tabs);

  function header(spec) {
    if (spec.header === 'plain') return [h('h1', { class: 'center' }, spec.title)];
    if (spec.header === 'sub') {
      return [
        h('button', { class: 'hbtn', type: 'button', onClick: spec.back ?? (() => history.back()) }, '← もどる'),
        h('h1', { class: 'center' }, spec.title),
        spec.right ?? h('span', { class: 'hbtn-space' }),
      ];
    }
    return [
      h('h1', {}, spec.title),
      h('button', { class: 'hbtn', type: 'button', onClick: onSearch }, '🔍 探す'),
      h('button', { class: 'hbtn', type: 'button', onClick: onSettings }, '⚙ 設定'),
    ];
  }

  return {
    root, view,
    show(spec) {
      clear(bar).append(...header(spec));
      clear(view).append(spec.body);
      tabs.hidden = !spec.tab;
      for (const b of tabButtons) {
        if (b.dataset.tab === spec.tab) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
      }
      spec.onMount?.(view);
    },
    setTitle(title) {
      const h1 = bar.querySelector('h1');
      if (h1) clear(h1).append(title);
    },
    showToast(message, ms = 2600) {
      const t = h('div', { class: 'toast', role: 'status' }, message);
      root.append(t);
      setTimeout(() => t.remove(), ms);
    },
    confirmDialog({ message, buttons }) {
      return new Promise(resolve => {
        const back = h('div', { class: 'dialog-back' });
        const box = h('div', { class: 'dialog', role: 'dialog', 'aria-modal': 'true' }, h('p', {}, message),
          buttons.map(b => h('button', { class: `btn wide ${b.cls ?? ''}`, type: 'button', onClick: () => { back.remove(); resolve(b.value); } }, b.label)));
        back.append(box);
        root.append(back);
        box.querySelector('button')?.focus();
      });
    },
  };
}
