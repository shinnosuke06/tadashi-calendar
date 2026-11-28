// アプリの始まり。設定と接続を読み、経路に合わせて画面を出す。
import { createIdbKV, createMemoryKV } from './kv.js';
import { mergeSettings, applySettings } from './settings.js';
import { createApi } from './api.js';
import { createDemoApi } from './demo-api.js';
import { registerServiceWorker } from './sw-register.js';
import { createRepository } from './repository.js';
import { todayKey, parseKey } from './dates.js';
import { parseRoute, routeTo } from './ui/router.js';
import { createShell } from './ui/shell.js';
import { installKeyboardHelper } from './ui/keyboard.js';
import { h } from './ui/dom.js';
import { setupView } from './ui/setup-view.js';
import { monthView } from './ui/month-view.js';
import { listView } from './ui/list-view.js';
import { weekView } from './ui/week-view.js';
import { dayView } from './ui/day-view.js';
import { eventDetailView } from './ui/event-detail.js';
import { eventFormView } from './ui/event-form.js';
import { searchView } from './ui/search-view.js';
import { settingsView } from './ui/settings-view.js';

export const REQUIRED_GAS_VERSION = 1;
const pad = n => String(n).padStart(2, '0');
const ymOf = key => key.slice(0, 7);

// 画面の一覧（まだない画面は「準備中」）
const VIEWS = {
  setup: setupView,
  month: monthView,
  list: listView,
  week: weekView,
  day: dayView,
  event: eventDetailView,
  new: eventFormView,
  edit: eventFormView,
  search: searchView,
  settings: settingsView,
};

function placeholder(app, params, name) {
  const key = params.date ?? (params.ym ? `${params.ym}-01` : app.today());
  const { y, m } = parseKey(key);
  return {
    title: name === 'month' ? [h('small', {}, `${y}年`), `${m}月`] : '予定表',
    header: name === 'month' ? 'main' : 'sub',
    body: h('div', { class: 'scroll' }, h('p', { class: 'empty' }, '準備中です')),
    tab: name === 'month' ? 'month' : null,
  };
}

const app = {
  kv: null, settings: mergeSettings(null), connection: null, api: null, repo: null, shell: null, gasVersion: null,
  sel: null,
  REQUIRED_GAS_VERSION,
  today: () => todayKey(new Date()),
  go(name, params = {}) { location.hash = routeTo(name, params); },
  toast(msg) { app.shell.showToast(msg); },
  confirm(opts) { return app.shell.confirmDialog(opts); },
  async saveSettings(next, { sync = true } = {}) {
    app.settings = mergeSettings(next);
    applySettings(document, app.settings);
    await app.kv.put('kv', 'settings', app.settings);
    if (sync && app.repo) {
      await app.repo.outbox.enqueue({ type: 'saveSettings', settings: app.settings });
      syncNow();
    }
  },
  async connect(conn) {
    // つなぎ先（お試し⇔本番、別の Google 側）が変わったら、前のつなぎ先の予定と送り待ちを端末から消す。
    // 合言葉だけを入れ直したとき（同じ Google 側）は、まだ送れていない予定を残して、あとで送る。
    const prev = app.connection;
    const sameBackend = prev && prev.mode === conn.mode && (prev.url ?? '') === (conn.url ?? '');
    if (!sameBackend) {
      for (const store of ['events', 'months', 'outbox']) await app.kv.clear(store);
      await app.kv.delete('kv', 'idMap');
    }
    app.connection = conn;
    await app.kv.put('kv', 'connection', conn);
    buildBackend();
    afterConnect();
    location.hash = homeHash();
  },
  render: () => route(),
};

function buildBackend() {
  const c = app.connection;
  // お試しでも、電波がないときは本物と同じく「まだ保存中」になる
  app.api = !c ? null : c.mode === 'demo' ? createDemoApi({ kv: app.kv, isOffline: () => !navigator.onLine }) : createApi({ url: c.url, key: c.key });
  app.repo = app.api ? createRepository({ api: app.api, kv: app.kv, getSettings: () => app.settings }) : null;
}

async function afterConnect() {
  try {
    app.gasVersion = (await app.api.ping())?.version ?? null;
    const remote = await app.api.getSettings();
    if (remote) await app.saveSettings({ ...app.settings, ...remote }, { sync: false });
  } catch { /* 電波がなくても動く */ }
  syncNow();
}

// 入力の途中かどうか（このときは画面を描き直さない・新しい版に切り替えない）
const isEditing = () => /^#\/(new|edit)\//.test(location.hash);

// たまっている保存を送る。予定を送れたら、予定を出している画面を描き直して「まだ保存中」の印を消す
function syncNow() {
  app.repo?.syncOutbox().then(r => {
    if (r?.sent && ['month', 'week', 'day', 'list', 'event'].includes(parseRoute(location.hash).name)) route();
  }).catch(() => {});
}

function homeHash() {
  const t = app.today();
  const v = app.settings.startView;
  if (v === 'list') return routeTo('list');
  if (v === 'week' || v === 'day') return routeTo(v, { date: t });
  return routeTo('month', { ym: ymOf(t) });
}

function onTab(name) {
  const base = app.sel ?? app.today();
  if (name === 'today') { app.sel = app.today(); app.openDay = app.today(); app.go('month', { ym: ymOf(app.today()) }); if (location.hash === routeTo('month', { ym: ymOf(app.today()) })) route(); return; }
  if (name === 'month') app.go('month', { ym: ymOf(base) });
  else if (name === 'week' || name === 'day') app.go(name, { date: base });
  else if (name === 'list') app.go('list');
  else if (name === 'new') app.go('new', { date: base });
}

let rendering = 0;
async function route() {
  const r = parseRoute(location.hash);
  if (!app.connection && r.name !== 'setup') { location.replace('#/setup'); if (r.name === 'home' && !location.hash) return route(); return; }
  if (r.name === 'home') { location.replace(homeHash()); return; }
  if ((r.name === 'event' || r.name === 'edit') && app.repo) {
    const real = await app.repo.resolveId(r.params.eventId);
    if (real !== r.params.eventId) { location.replace(routeTo(r.name, { ...r.params, eventId: real })); return; }
  }
  const my = ++rendering;
  const view = VIEWS[r.name];
  const spec = view ? await view(app, r.params) : placeholder(app, r.params, r.name);
  if (my !== rendering) return; // もっと新しい画面に移った
  app.shell.show(spec);
}

async function boot() {
  try {
    app.kv = createIdbKV();
    await app.kv.get('kv', 'settings');
  } catch {
    app.kv = createMemoryKV();
  }
  app.settings = mergeSettings(await app.kv.get('kv', 'settings'));
  applySettings(document, app.settings);
  app.connection = (await app.kv.get('kv', 'connection')) ?? null;
  buildBackend();
  const root = document.getElementById('app');
  app.shell = createShell(root, { onTab, onSearch: () => app.go('search'), onSettings: () => app.go('settings') });
  installKeyboardHelper(document);
  window.addEventListener('hashchange', route);
  window.addEventListener('online', syncNow);
  await route();
  root.dataset.ready = '1';
  if (app.api) afterConnect();
  registerServiceWorker({ isBusy: isEditing });
}

boot();
