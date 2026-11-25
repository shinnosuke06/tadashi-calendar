import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startAll, stopAll, openApp } from './helpers.js';

before(startAll);
after(stopAll);

test('地図で探して選ぶ', async () => {
  const { page, close } = await openApp({ hash: '#/new/2026-12-05' });
  await page.fill('#f-title', '目の検査');
  await page.fill('#f-place', 'さくら眼科');
  await page.click('text=地図で探す');
  await page.waitForSelector('.picker .cand');
  assert.equal(await page.$$eval('.picker .cand', cs => cs.length), 2);
  await page.click('.picker .cand >> nth=1');
  await page.waitForFunction(() => document.querySelector('.picker').dataset.lat === '35.452');
  assert.equal(await page.$eval('.picker', p => p.dataset.lng), '139.645');
  assert.ok(await page.$('.picker .leaflet-marker-icon'));
  assert.match(await page.textContent('.picker .attribution-note, .picker .leaflet-control-attribution'), /地理院タイル/);
  await page.click('text=この場所にする');
  await page.waitForSelector('.picker', { state: 'detached' });
  assert.equal(await page.inputValue('#f-place'), 'さくら眼科 駅前分院');
  await page.click('.form-bottom >> text=保存する');
  await page.waitForSelector('.route-box');
  assert.match(await page.textContent('.route-box'), /さくら市駅前3-4（架空）|として計算しました/);
  await close();
});
test('地図を押すとピンと住所が変わる', async () => {
  const { page, close } = await openApp({ hash: '#/new/2026-12-05' });
  await page.fill('#f-place', 'さくら眼科');
  await page.click('text=地図で探す');
  await page.waitForSelector('.picker .cand');
  await page.click('.picker .cand >> nth=0');
  const before = await page.textContent('.picker .picked');
  const box = await page.$eval('.picker .map', n => n.getBoundingClientRect().toJSON());
  await page.mouse.click(box.left + box.width * 0.25, box.top + box.height * 0.3);
  await page.waitForFunction(b => document.querySelector('.picker .picked').textContent !== b, before);
  assert.match(await page.textContent('.picker .picked'), /見本市/);
  await page.click('.picker >> text=やめる');
  await page.waitForSelector('.picker', { state: 'detached' });
  assert.equal(await page.inputValue('#f-place'), 'さくら眼科');
  await close();
});
test('見つからないときの案内', async () => {
  const { page, close } = await openApp({ hash: '#/new/2026-12-05' });
  await page.fill('#f-place', '不明な場所');
  await page.click('text=地図で探す');
  await page.waitForSelector('.picker >> text=見つかりませんでした。住所で探すか、地図を押して選んでください');
  await close();
});
