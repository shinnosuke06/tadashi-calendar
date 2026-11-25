import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startAll, stopAll, openApp, fontSizes } from './helpers.js';

before(startAll);
after(stopAll);

const newForm = (extra = {}) => openApp({ hash: '#/new/2026-12-05', ...extra });
const checked = (page, label) => page.locator('.notify .check', { hasText: label }).locator('input').isChecked();

test('よく使う予定から入れる', async () => {
  const { page, close } = await newForm();
  await page.click('.tpl >> text=病院');
  assert.equal(await page.inputValue('#f-title'), '病院');
  assert.equal(await page.$$eval('.items .itemrow', rs => rs.length), 4);
  assert.equal(await checked(page, '前日（同じ時刻）'), true);
  assert.equal(await checked(page, '1時間前'), true);
  assert.equal(await checked(page, '3時間前'), false);
  await close();
});
test('入力した時刻がそのまま保存される', async () => {
  const { page, close } = await newForm();
  await page.fill('#f-title', '散髪');
  await page.fill('#f-start', '10:00');
  assert.equal(await page.inputValue('#f-end'), '11:00');
  assert.match(await page.textContent('.sumline'), /12月5日（土） 10:00 〜 11:00/);
  await page.click('.form-bottom >> text=保存する');
  await page.waitForSelector('.detail-time');
  assert.equal(await page.textContent('.detail-time'), '10:00 〜 11:00');
  assert.match(page.url(), /#\/event\/primary\//);
  await close();
});
test('開始時刻を変えると、終了は長さを保ってずれる', async () => {
  const { page, close } = await newForm();
  await page.fill('#f-start', '09:00');
  await page.fill('#f-end', '09:30');
  await page.fill('#f-start', '14:00');
  assert.equal(await page.inputValue('#f-end'), '14:30');
  await close();
});
test('どの文字サイズでも入力欄は 16px 以上', async () => {
  for (let lv = 0; lv < 5; lv++) {
    const { page, close } = await newForm({ fontLevel: lv });
    await page.waitForSelector('#f-title');
    for (const s of await fontSizes(page, '.view input, .view select, .view textarea')) assert.ok(s >= 16, `level ${lv}: ${s}`);
    await close();
  }
});
test('キーボードが出ても入力欄が見える', async () => {
  const { page, close } = await newForm();
  await page.waitForSelector('#f-memo');
  await page.evaluate(() => {
    const kb = 300;
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: { height: innerHeight - kb, offsetTop: 0, addEventListener() {} } });
    document.documentElement.style.setProperty('--kb-inset', `${kb}px`);
  });
  await page.focus('#f-memo');
  await page.waitForTimeout(500);
  const [bottom, ih] = await page.$eval('#f-memo', n => [n.getBoundingClientRect().bottom, innerHeight]);
  assert.ok(bottom <= ih - 300, `${bottom} > ${ih - 300}`);
  await close();
});
test('タイトルが空なら案内', async () => {
  const { page, close } = await newForm();
  await page.click('.form-bottom >> text=保存する');
  await page.waitForSelector('.err >> text=タイトルを入れてください');
  assert.match(page.url(), /#\/new\//);
  await page.fill('#f-title', 'x');
  await page.fill('#f-start', '10:00');
  await page.fill('#f-end', '09:00');
  await page.click('.form-bottom >> text=保存する');
  await page.waitForSelector('.err >> text=終わりの時刻が始まりより前になっています');
  await close();
});
test('保存ボタンを 2 回押しても予定は 1 つ', async () => {
  const { page, close } = await newForm();
  await page.fill('#f-title', '二重のテスト');
  await page.$eval('.form-bottom button', b => { b.click(); b.click(); });
  await page.waitForSelector('.detail-time');
  await page.evaluate(() => { location.hash = '#/day/2026-12-05'; });
  await page.waitForSelector('.hour .ev');
  assert.equal(await page.locator('.ev', { hasText: '二重のテスト' }).count(), 1);
  await close();
});
test('通知は 5 つまで、出発の目安は道がないと選べない', async () => {
  const { page, close } = await newForm();
  const boxes = page.locator('.notify .check input');
  assert.equal(await page.locator('.notify .check', { hasText: '出発の目安の時刻' }).locator('input').isDisabled(), true);
  assert.match(await page.textContent('.notify'), /場所を入れて保存すると選べます/);
  for (const label of ['1週間前', '2日前', '3時間前']) await page.locator('.notify .check', { hasText: label }).locator('input').check();
  assert.equal(await page.locator('.notify .check', { hasText: '30分前' }).locator('input').isDisabled(), true);
  assert.ok((await boxes.count()) >= 6);
  await close();
});
test('直す画面は今の内容が入っている', async () => {
  const { page, close } = await openApp({ hash: '#/edit/primary/demo-eye' });
  await page.waitForSelector('#f-title');
  assert.equal(await page.inputValue('#f-title'), '眼科');
  assert.equal(await page.inputValue('#f-start'), '10:00');
  assert.equal(await page.inputValue('#f-place'), 'さくら眼科');
  assert.equal(await page.locator('.notify .check', { hasText: '出発の目安の時刻' }).locator('input').isDisabled(), false);
  await page.fill('#f-start', '10:30');
  await page.click('.form-bottom >> text=保存する');
  await page.waitForSelector('.detail-time');
  assert.equal(await page.textContent('.detail-time'), '10:30 〜 11:30');
  await close();
});
test('扱えない繰り返しは直せない', async () => {
  const { page, close } = await openApp({ hash: '#/edit/primary/demo-taiso_20261202' });
  await page.waitForSelector('text=Google で設定された繰り返し（ここでは直せません）');
  assert.equal(await page.isDisabled('#f-repeat'), true);
  await page.fill('#f-title', '体操（雨天中止）');
  await page.click('.form-bottom >> text=保存する');
  await page.click('.dialog >> text=この予定だけ');
  await page.waitForSelector('.detail-time');
  assert.match(await page.textContent('.d-title'), /体操（雨天中止）/);
  await close();
});
test('新しい繰り返しの予定', async () => {
  const { page, close } = await newForm();
  await page.fill('#f-title', '整骨院');
  await page.selectOption('#f-repeat', 'weekly');
  await page.click('.form-bottom >> text=保存する');
  await page.waitForSelector('.detail-time');
  await page.waitForSelector('text=毎週 土曜');
  await close();
});
