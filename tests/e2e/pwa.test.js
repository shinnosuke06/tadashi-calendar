import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startAll, stopAll, openApp } from './helpers.js';

before(startAll);
after(stopAll);

test('manifest とアイコン', async () => {
  const { page, url, close } = await openApp({ hash: '#/month/2026-12' });
  const href = await page.$eval('link[rel="manifest"]', l => l.getAttribute('href'));
  const res = await page.request.get(`${url}/${href}`);
  assert.equal(res.status(), 200);
  const m = await res.json();
  assert.equal(m.short_name, '予定表');
  assert.equal(m.display, 'standalone');
  for (const size of ['192x192', '512x512']) {
    const icon = m.icons.find(i => i.sizes === size);
    assert.ok(icon, size);
    const r = await page.request.get(`${url}/${icon.src}`);
    assert.equal(r.status(), 200);
    assert.equal(r.headers()['content-type'], 'image/png');
  }
  const touch = await page.$eval('link[rel="apple-touch-icon"]', l => l.getAttribute('href'));
  assert.equal((await page.request.get(`${url}/${touch}`)).status(), 200);
  assert.equal(await page.$eval('meta[name="apple-mobile-web-app-title"]', m => m.content), '予定表');
  assert.equal(await page.$eval('meta[name="apple-mobile-web-app-capable"]', m => m.content), 'yes');
  await close();
});

test('電波がなくても開ける', async () => {
  const { page, ctx, errors, close } = await openApp({ hash: '#/month/2026-12', serviceWorkers: 'allow' });
  await page.waitForSelector('.cell[data-d="2026-12-03"] >> text=眼科');
  // sw が部品をすべて保存し終えて動き出すまで待つ
  await page.waitForFunction(async () => (await navigator.serviceWorker.getRegistration())?.active?.state === 'activated');
  await ctx.setOffline(true);
  await page.reload();
  await page.waitForSelector('#app[data-ready]');
  await page.waitForSelector('.cell[data-d="2026-12-03"] >> text=眼科');
  assert.ok(await page.locator('.tabs').isVisible());
  // 画面の部品がすべて手元から出ている（読み込めなかった CSS で崩れていない）
  assert.notEqual(await page.$eval('.bar', b => getComputedStyle(b).display), 'inline');
  assert.deepEqual(errors, []);
  await close();
});

test('電波がない間の保存は、戻ったら送られる', async () => {
  const { page, ctx, close } = await openApp({ hash: '#/new/2026-12-05' });
  await ctx.setOffline(true);
  await page.fill('#f-title', '電波なしの予定');
  await page.click('.form-bottom >> text=保存');
  await page.waitForSelector('.d-title >> text=電波なしの予定');
  await page.waitForSelector('.pending-badge');
  await ctx.setOffline(false);
  await page.waitForSelector('.pending-badge', { state: 'detached' });
  assert.match(await page.textContent('.d-title'), /電波なしの予定/);
  assert.doesNotMatch(await page.evaluate(() => location.hash), /tmp-/);
  await close();
});

test('UD フォントの切り替え', async () => {
  const { page, close } = await openApp({ hash: '#/settings' });
  assert.doesNotMatch(await page.$eval('body', b => getComputedStyle(b).fontFamily), /BIZ UDPGothic/);
  await page.click('text=読みやすい文字の形（UD フォント）');
  assert.match(await page.$eval('body', b => getComputedStyle(b).fontFamily), /BIZ UDPGothic/);
  // 使う文字の分だけ、手元のフォントを読む
  await page.waitForFunction(() => document.fonts.check('16px "BIZ UDPGothic"', '予定'));
  await page.evaluate(() => document.fonts.ready);
  const loaded = await page.evaluate(() => [...document.fonts].filter(f => f.family.includes('BIZ UDPGothic') && f.status === 'loaded').length);
  assert.ok(loaded > 0 && loaded < 60, `読んだフォントの数 ${loaded}`);
  await close();
});
