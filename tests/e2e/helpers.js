// 画面のテストの道具: サーバーとブラウザを立ち上げ、お試しモードでアプリを開く
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { startServer } from '../../scripts/serve.mjs';

// この環境の Playwright は全体に入っているので require で読む
const { chromium, devices } = createRequire(import.meta.url)('playwright');

const weather = JSON.parse(readFileSync(new URL('../fixtures/open-meteo.json', import.meta.url)));
const PNG_1x1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
export const HOME = { address: '自宅（見本）', lat: 35.47, lng: 139.6 };

let server, browser;
export async function startAll() {
  server = await startServer();
  browser = await chromium.launch();
}
export async function stopAll() {
  await browser?.close();
  await server?.close();
}

// IndexedDB に接続と設定を入れる（アプリと同じ入れ物）
async function seed(page, data) {
  await page.evaluate(async d => {
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('tadashi-calendar', 1);
      req.onupgradeneeded = () => { for (const s of ['events', 'months', 'outbox', 'kv', 'demo']) if (!req.result.objectStoreNames.contains(s)) req.result.createObjectStore(s); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction('kv', 'readwrite');
      for (const [k, v] of Object.entries(d)) tx.objectStore('kv').put(v, k);
      tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, data);
}

export async function openApp({
  device = 'iPhone 13', fontLevel = 2, theme = 'standard', timezoneId = 'Asia/Tokyo', now = '2026-12-01T09:00:00+09:00',
  connected = true, settings = {}, hash = '',
} = {}) {
  const ctx = await browser.newContext({ ...devices[device], deviceScaleFactor: 1, timezoneId, locale: 'ja-JP' });
  const page = await ctx.newPage();
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.clock.install({ time: new Date(now) });
  await page.route('https://api.open-meteo.com/**', r => r.fulfill({ json: weather, headers: { 'Access-Control-Allow-Origin': '*' } }));
  await page.route('https://cyberjapandata.gsi.go.jp/**', r => r.fulfill({ body: PNG_1x1, contentType: 'image/png' }));
  await page.route('https://tile.openstreetmap.org/**', r => r.fulfill({ body: PNG_1x1, contentType: 'image/png' }));
  await page.goto(`${server.url}/`);
  await page.waitForSelector('#app[data-ready]');
  const data = { settings: { fontLevel, theme, home: HOME, ...settings } };
  if (connected) data.connection = { mode: 'demo' };
  await seed(page, data);
  // # だけ違う URL への移動は読み直しにならないので、いったん離れてから開く
  await page.goto('about:blank');
  await page.goto(`${server.url}/${hash}`);
  await page.waitForSelector('#app[data-ready]');
  return { page, ctx, errors, url: server.url, close: () => ctx.close() };
}

export const fontSizes = (page, selector) => page.$$eval(selector, els => els.map(e => parseFloat(getComputedStyle(e).fontSize)));

// お試しの予定（Google の形）を足して開き直す
export async function addDemoEvents(page, events) {
  await page.evaluate(async evs => {
    const db = await new Promise((resolve, reject) => { const r = indexedDB.open('tadashi-calendar', 1); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    const get = () => new Promise(resolve => { const tx = db.transaction('demo'); const q = tx.objectStore('demo').get('events'); q.onsuccess = () => resolve(q.result ?? []); });
    const list = await get();
    await new Promise(resolve => { const tx = db.transaction('demo', 'readwrite'); tx.objectStore('demo').put([...list, ...evs], 'events'); tx.oncomplete = resolve; });
    db.close();
  }, events);
  await page.reload();
  await page.waitForSelector('#app[data-ready]');
}

export const timed = (id, date, hhmm, title) => ({
  id, status: 'confirmed', summary: title,
  start: { dateTime: `${date}T${hhmm}:00+09:00`, timeZone: 'Asia/Tokyo' },
  end: { dateTime: `${date}T${String(Number(hhmm.slice(0, 2)) + 1).padStart(2, '0')}${hhmm.slice(2)}:00+09:00`, timeZone: 'Asia/Tokyo' },
  reminders: { useDefault: true },
});
