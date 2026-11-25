import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startAll, stopAll, openApp, fontSizes } from './helpers.js';

before(startAll);
after(stopAll);

test('拡大を禁止しない viewport', async () => {
  const { page, close } = await openApp({});
  assert.equal(await page.getAttribute('meta[name=viewport]', 'content'), 'width=device-width, initial-scale=1, viewport-fit=cover');
  await close();
});
test('どの文字サイズでも入力欄は 16px 以上（初回設定の画面）', async () => {
  for (let lv = 0; lv < 5; lv++) {
    const { page, close } = await openApp({ connected: false, fontLevel: lv });
    const sizes = await fontSizes(page, 'input, select, textarea');
    assert.ok(sizes.length >= 2, 'inputs exist');
    for (const s of sizes) assert.ok(s >= 16, `level ${lv}: ${s}`);
    await close();
  }
});
test('一番大きい字でも、幅 375px で横にはみ出さない', async () => {
  const { page, close } = await openApp({ device: 'iPhone SE', fontLevel: 4 });
  const ow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(ow <= 0, `overflow ${ow}`);
  const labels = await page.$$eval('.tabs button', bs => bs.map(b => [b.textContent.trim(), b.scrollWidth <= b.clientWidth + 1, b.getBoundingClientRect().right <= innerWidth + 0.5]));
  assert.deepEqual(labels.map(l => l[0]), ['今日', '月', '週', '日', '一覧', '＋追加']);
  for (const [t, fits, inside] of labels) assert.ok(fits && inside, t);
  const title = await page.$eval('.bar h1', h => [h.textContent, h.scrollWidth <= h.clientWidth + 1]);
  assert.equal(title[0], '2026年12月');
  assert.ok(title[1], 'title not cut');
  await close();
});
test('入力中は下の段が隠れる', async () => {
  const { page, close } = await openApp({});
  await page.evaluate(() => { const i = document.createElement('input'); i.id = 'probe'; document.querySelector('.view').appendChild(i); });
  await page.focus('#probe');
  await page.waitForFunction(() => document.body.classList.contains('editing'));
  assert.equal(await page.$eval('.tabs', n => getComputedStyle(n).display), 'none');
  await page.$eval('#probe', i => i.blur());
  await page.waitForFunction(() => !document.body.classList.contains('editing'));
  assert.notEqual(await page.$eval('.tabs', n => getComputedStyle(n).display), 'none');
  await close();
});
test('設定がない時は初回設定の画面が出る', async () => {
  const { page, close } = await openApp({ connected: false });
  assert.ok((await page.textContent('body')).includes('この画面が出たら、家族に連絡してください'));
  assert.ok(await page.$('text=初めの設定（家族の方へ）'));
  await close();
});
test('つなげないときは日本語で出る、お試しで始められる', async () => {
  const { page, close } = await openApp({ connected: false });
  await page.fill('#setup-url', 'http://127.0.0.1:9/exec');
  await page.fill('#setup-key', 'x');
  await page.click('text=つなぐ');
  await page.waitForSelector('.setup-error');
  assert.match(await page.textContent('.setup-error'), /電波が弱いようです|うまくいきませんでした/);
  await page.click('text=お試し（見本の予定で使う）');
  await page.waitForFunction(() => location.hash.startsWith('#/month/'));
  assert.equal(await page.textContent('.bar h1'), '2026年12月');
  await close();
});
test('文字サイズの設定で根元の字の大きさが変わる', async () => {
  const { page, close } = await openApp({ fontLevel: 4 });
  assert.equal(await page.$eval('html', h => getComputedStyle(h).fontSize), '32px');
  await close();
});
test('テーマの色が入る', async () => {
  const { page, close } = await openApp({ theme: 'dark' });
  assert.equal(await page.$eval('body', b => getComputedStyle(b).backgroundColor), 'rgb(18, 20, 23)');
  await close();
});
