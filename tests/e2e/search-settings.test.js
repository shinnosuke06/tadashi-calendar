import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startAll, stopAll, openApp } from './helpers.js';

before(startAll);
after(stopAll);

const section = (page, title) => page.locator('.set-section', { hasText: title });

test('探す', async () => {
  const { page, close } = await openApp({ hash: '#/search' });
  await page.fill('#q', '眼科');
  await page.click('.search-form >> text=探す');
  await page.waitForSelector('.results .ev');
  assert.equal(await page.locator('.results .ev').count(), 1);
  assert.match(await page.textContent('.results'), /12月3日（木）/);
  await page.fill('#q', 'あいうえお');
  await page.press('#q', 'Enter');
  await page.waitForSelector('.results >> text=見つかりませんでした');
  await close();
});
test('文字の大きさを最大にすると、開き直しても残る', async () => {
  const { page, close } = await openApp({ hash: '#/settings' });
  await page.click('.sizes button >> nth=4');
  assert.equal(await page.$eval('html', h => getComputedStyle(h).fontSize), '32px');
  await page.waitForTimeout(300);
  await page.reload();
  await page.waitForSelector('#app[data-ready]');
  assert.equal(await page.$eval('html', h => getComputedStyle(h).fontSize), '32px');
  assert.equal(await page.$eval('.sizes button >> nth=4', b => b.getAttribute('aria-pressed')), 'true');
  await close();
});
test('テーマを「黒地に白」にすると背景が暗い', async () => {
  const { page, close } = await openApp({ hash: '#/settings' });
  await page.click('.themes >> text=黒地に白');
  assert.equal(await page.$eval('body', b => getComputedStyle(b).backgroundColor), 'rgb(18, 20, 23)');
  await close();
});
test('種類の色を変えると予定の帯の色が変わる', async () => {
  const { page, close } = await openApp({ hash: '#/settings' });
  await page.click('.cat-row[data-cat="hospital"] button[aria-label="ブドウ"]');
  await page.waitForTimeout(200);
  await page.evaluate(() => { location.hash = '#/list'; });
  await page.waitForSelector('.ev >> text=眼科');
  assert.equal(await page.locator('.ev', { hasText: '眼科' }).locator('.ev-bar').evaluate(n => getComputedStyle(n).backgroundColor), 'rgb(142, 36, 170)');
  await close();
});
test('よく使う予定を足すと入力画面にボタンが出る', async () => {
  const { page, close } = await openApp({ hash: '#/settings' });
  await section(page, 'よく使う予定').locator('text=足す').click();
  await page.fill('.tpl-editor input[name="name"]', '歯医者');
  await page.fill('.tpl-editor input[name="title"]', '歯医者');
  await page.click('.tpl-editor >> text=決める');
  await page.evaluate(() => { location.hash = '#/new/2026-12-07'; });
  await page.waitForSelector('.tpl .chip >> text=歯医者');
  await close();
});
test('家族向けの設定は最初は閉じている', async () => {
  const { page, close } = await openApp({ hash: '#/settings' });
  assert.equal(await page.$eval('details.family', d => d.open), false);
  await page.click('details.family summary');
  assert.match(await page.textContent('details.family'), /自宅の住所/);
  assert.match(await page.textContent('details.family'), /自宅（見本）/);
  assert.match(await page.textContent('details.family'), /まとめて取り込む/);
  assert.match(await page.textContent('details.family'), /アプリ 1\.0\.0/);
  await close();
});
test('まとめて取り込む', async () => {
  const { page, close } = await openApp({ hash: '#/settings' });
  await page.click('details.family summary');
  const body = JSON.stringify({ format: 'tadashi-calendar-import', version: 1, events: [
    { date: '2026-12-20', allDay: false, start: '10:00', end: '11:00', title: '整形外科（取り込み）', category: 'hospital' },
    { date: '2026-12-03', allDay: false, start: '10:00', end: '11:00', title: '眼科' },
  ] });
  await page.setInputFiles('#import-file', { name: 'yotei.json', mimeType: 'application/json', buffer: Buffer.from(body) });
  await page.waitForSelector('.import-list .check');
  assert.equal(await page.locator('.import-list .check', { hasText: '整形外科' }).locator('input').isChecked(), true);
  assert.equal(await page.locator('.import-list .check', { hasText: '眼科' }).locator('input').isChecked(), false);
  assert.match(await page.textContent('.import-list'), /すでにあります/);
  await page.click('.import-list button');
  await page.waitForSelector('.toast >> text=1件取り込みました');
  await page.evaluate(() => { location.hash = '#/day/2026-12-20'; });
  await page.waitForSelector('.ev >> text=整形外科（取り込み）');
  await close();
});
test('取り込めないファイル', async () => {
  const { page, close } = await openApp({ hash: '#/settings' });
  await page.click('details.family summary');
  await page.setInputFiles('#import-file', { name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('nope') });
  await page.waitForSelector('text=このファイルは取り込めません');
  await close();
});
