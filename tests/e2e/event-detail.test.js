import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startAll, stopAll, openApp, addDemoEvents, timed } from './helpers.js';

before(startAll);
after(stopAll);

const openEvent = (id, extra = {}) => openApp({ hash: `#/event/primary/${id}`, ...extra });

test('時刻が一番大きく、目安の箱は予定の時刻とのつながりが分かる', async () => {
  const { page, close } = await openEvent('demo-eye');
  await page.waitForSelector('.detail-time');
  assert.equal(await page.textContent('.detail-time'), '10:00 〜 11:00');
  const sizes = await page.$$eval('.view *', els => els.filter(e => e.children.length === 0 && e.textContent.trim()).map(e => [e.className, parseFloat(getComputedStyle(e).fontSize)]));
  const max = Math.max(...sizes.map(s => s[1]));
  assert.equal(sizes.find(s => s[1] === max)[0], 'detail-time');
  const box = await page.textContent('.route-box');
  assert.match(box, /10:00 に間に合う出発の目安（車）/);
  assert.match(box, /高速あり 約25分 → 9:25ごろ/);
  assert.match(box, /高速なし 約40分 → 9:10ごろ/);
  assert.match(box, /渋滞は含みません/);
  assert.match(box, /さくら市中央1-2（架空） として計算しました/);
  const links = await page.$$eval('.route-box a', as => as.map(a => a.href));
  assert.ok(links[0].startsWith('https://www.google.com/maps/dir/?api=1&origin=') && links[0].endsWith('travelmode=driving'));
  assert.ok(links[1].endsWith('travelmode=transit'));
  await page.waitForSelector('.wx-line >> text=くもり');
  assert.match(await page.textContent('.view'), /天気予報: Open-Meteo/);
  assert.match(await page.textContent('.view'), /前日（同じ時刻）・1時間前/);
  assert.match(await page.textContent('.view'), /目薬を持っていく/);
  await close();
});
test('持ち物のチェックは開き直しても残る', async () => {
  const { page, close } = await openEvent('demo-eye');
  const box = page.locator('.check', { hasText: '診察券' }).locator('input');
  assert.equal(await box.isChecked(), false);
  await box.check();
  await page.waitForFunction(() => [...document.querySelectorAll('.check')].find(c => c.textContent.includes('診察券'))?.classList.contains('done'));
  await page.waitForTimeout(300);
  await page.reload();
  await page.waitForSelector('.check');
  assert.equal(await page.locator('.check', { hasText: '診察券' }).locator('input').isChecked(), true);
  await close();
});
test('道が見つからない場所の案内', async () => {
  const { page, close } = await openEvent('lost');
  // アプリで保存したが、場所が見つからなかった予定（道の記録はあるが中身は空）
  const tcRoute = JSON.stringify({ withHighways: null, withoutHighways: null, address: null, origin: 'home', computedAt: '2026-12-01T09:00' });
  await addDemoEvents(page, [{ ...timed('lost', '2026-12-05', '13:00', '集まり'), location: '不明な場所', extendedProperties: { private: { tc_v: '1', tc_route: tcRoute } } }]);
  await page.waitForSelector('.route-box');
  assert.match(await page.textContent('.route-box'), /場所が見つからず、移動時間を計算できませんでした。住所を入れると計算できます。/);
  await close();
  // Google のアプリで作った、まだ計算していない予定
  const fresh = await openEvent('fresh');
  await addDemoEvents(fresh.page, [{ ...timed('fresh', '2026-12-06', '13:00', '会合'), location: 'みどり歯科' }]);
  await fresh.page.waitForSelector('.route-box');
  assert.match(await fresh.page.textContent('.route-box'), /移動時間はまだ計算していません/);
  await fresh.page.click('text=計算し直す');
  await fresh.page.waitForSelector('.route-box >> text=13:00 に間に合う出発の目安（車）');
  await fresh.close();
  const none = await openEvent('demo-trip');
  await none.page.waitForSelector('.detail-time');
  assert.equal(await none.page.$('.route-box'), null);
  assert.equal(await none.page.textContent('.detail-time'), '終日');
  await none.close();
});
test('消すときは確かめる', async () => {
  const { page, close } = await openEvent('demo-dentist');
  await page.click('text=この予定を消す');
  await page.click('.dialog >> text=やめる');
  assert.ok(await page.$('.detail-time'));
  await page.click('text=この予定を消す');
  await page.click('.dialog >> text=消す');
  await page.waitForFunction(() => location.hash.startsWith('#/month/'));
  await page.evaluate(() => { location.hash = '#/list'; });
  await page.waitForSelector('.ev >> text=眼科');
  assert.doesNotMatch(await page.textContent('.view'), /歯医者/);
  await close();
});
test('繰り返しは 3 つから選ぶ', async () => {
  const { page, close } = await openEvent('demo-naika_20261208');
  await page.waitForSelector('.detail-time');
  await page.waitForSelector('text=毎月 8日（3回）');
  await page.click('text=この予定を消す');
  const labels = await page.$$eval('.dialog button', bs => bs.map(b => b.textContent));
  assert.deepEqual(labels, ['この予定だけ', 'これ以降すべて', 'すべて', 'やめる']);
  await page.click('.dialog >> text=やめる');
  await close();
});
test('見つからない予定', async () => {
  const { page, close } = await openEvent('nothing-here');
  await page.waitForSelector('text=この予定は見つかりませんでした。');
  await close();
});

test('通知やメモは、名前の下に横書きで出る（繰り返しでない予定・一番大きい字・幅の狭い iPhone）', async () => {
  const { page, close } = await openEvent('demo-trip', { device: 'iPhone SE', fontLevel: 4 });
  await page.waitForSelector('.detail-time');
  const notifyLabel = await page.locator('.kv dt', { hasText: '通知' }).boundingBox();
  const notifyValue = await page.locator('.kv dd', { hasText: '前日の夜8時' }).boundingBox();
  const memoLabel = await page.locator('.kv dt', { hasText: 'メモ' }).boundingBox();
  const memoValue = await page.locator('.kv dd', { hasText: '宿の電話番号' }).boundingBox();
  const lineH = parseFloat(await page.$eval('.kv dd', e => getComputedStyle(e).lineHeight));
  // 縦に 1 文字ずつ並ばない（1 行に収まる）
  assert.ok(notifyValue.height < lineH * 1.6, `通知の高さ ${notifyValue.height}（1 行 ${lineH}）`);
  // 名前の真下に中身が出て、名前どうしは左がそろう
  assert.ok(notifyValue.y >= notifyLabel.y + notifyLabel.height - 1);
  assert.ok(Math.abs(notifyValue.x - notifyLabel.x) < 2);
  assert.ok(Math.abs(memoLabel.x - notifyLabel.x) < 2);
  assert.ok(memoValue.y >= memoLabel.y + memoLabel.height - 1);
  // 繰り返しでない予定には、繰り返しの欄（空の行）を出さない
  assert.equal(await page.locator('.kv dd:visible:empty').count(), 0);
  await close();
});
