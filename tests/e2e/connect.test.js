import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startAll, stopAll, openApp } from './helpers.js';

before(startAll);
after(stopAll);

const GAS = 'https://script.google.com/macros/s/test/exec';

// Google 側（Apps Script）の偽物。合言葉と、予定の読み書きが失敗するかどうかを変えられる
async function fakeGas(page, state) {
  await page.route(GAS, async r => {
    const { key, action, params } = JSON.parse(r.request().postData());
    const reply = (body, status = 200) => r.fulfill({ status, json: body, headers: { 'Access-Control-Allow-Origin': '*' } });
    if (key !== state.key) return reply({ ok: false, error: { code: 'BAD_KEY' } });
    if (action === 'ping') return reply({ ok: true, data: { version: 1 } });
    if (action === 'settings.get' || action === 'settings.save') return reply({ ok: true, data: null });
    if (action === 'events.list') return state.listFails ? reply({}, 500) : reply({ ok: true, data: state.events });
    if (action === 'events.insert') {
      if (state.insertFails) return reply({}, 500);
      const ev = { ...params.resource, status: 'confirmed' };
      state.events.push(ev);
      return reply({ ok: true, data: ev });
    }
    return reply({ ok: true, data: null });
  });
}

async function connectTo(page, key) {
  await page.evaluate(() => { location.hash = '#/setup'; });
  await page.fill('#setup-url', GAS);
  await page.fill('#setup-key', key);
  await page.click('button:has-text("つなぐ")');
  await page.waitForSelector('.cell[data-d="2026-12-01"]');
}

test('お試しから本番につなぎ直すと、お試しの見本の予定は残らない', async () => {
  const { page, close } = await openApp({ hash: '#/month/2026-12' });
  await page.waitForSelector('.cell[data-d="2026-12-03"] >> text=眼科');
  const state = { key: 'k1', events: [], listFails: true }; // Google から読めない間は、端末に残っているものだけが出る
  await fakeGas(page, state);
  await connectTo(page, 'k1');
  await page.waitForTimeout(500);
  assert.equal(await page.locator('.cell[data-d="2026-12-03"] >> text=眼科').count(), 0);
  await close();
});

test('合言葉だけを入れ直しても、まだ送れていない予定は残って送られる', async () => {
  const { page, close } = await openApp({ hash: '#/month/2026-12', connected: false });
  const state = { key: 'k1', events: [], insertFails: true };
  await fakeGas(page, state);
  await connectTo(page, 'k1');
  await page.evaluate(() => { location.hash = '#/new/2026-12-05'; });
  await page.fill('#f-title', '送れていない予定');
  await page.click('.form-bottom >> text=保存');
  await page.waitForSelector('.pending-badge');
  // 合言葉を作り直して、入れ直す
  state.key = 'k2';
  state.insertFails = false;
  await connectTo(page, 'k2');
  await page.waitForFunction(() => true);
  await page.waitForSelector('.cell[data-d="2026-12-05"] >> text=送れていない予定');
  assert.equal(await page.locator('.pending-badge').count(), 0);
  assert.equal(state.events.filter(e => e.summary === '送れていない予定').length, 1);
  await close();
});
