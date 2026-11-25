import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startAll, stopAll, openApp } from './helpers.js';

before(startAll);
after(stopAll);

test('週の画面: 7 日を縦に並べる', async () => {
  const { page, close } = await openApp({ hash: '#/week/2026-12-03' });
  await page.waitForSelector('.week-day .dayhead');
  const heads = await page.$$eval('.week-day .dayhead span:first-child', ns => ns.map(n => n.textContent));
  assert.deepEqual(heads, ['11月29日（日）', '11月30日（月）', '12月1日（火）・今日', '12月2日（水）', '12月3日（木）', '12月4日（金）', '12月5日（土）']);
  await page.waitForSelector('.week-day .ev >> text=眼科');
  assert.equal(await page.textContent('.bar h1'), '11/29〜12/5');
  await page.click('text=次の週 ▶');
  await page.waitForFunction(() => location.hash === '#/week/2026-12-10');
  await page.waitForSelector('.week-day .dayhead >> text=12月6日（日）');
  await close();
});
test('週の始まりを月曜にすると最初が月曜', async () => {
  const { page, close } = await openApp({ hash: '#/week/2026-12-03', settings: { weekStart: 1 } });
  await page.waitForSelector('.week-day .dayhead');
  assert.equal(await page.$eval('.week-day .dayhead span', n => n.textContent), '11月30日（月）');
  await close();
});
test('日の画面: 10 時の欄に眼科、終日は一番上', async () => {
  const { page, close } = await openApp({ hash: '#/day/2026-12-03' });
  await page.waitForSelector('.hour[data-h="10"] .ev');
  assert.match(await page.textContent('.hour[data-h="10"]'), /眼科/);
  assert.equal(await page.$$eval('.hour', hs => hs.length), 24);
  assert.equal(await page.textContent('.bar h1'), '12月3日（木）');
  await close();
  const trip = await openApp({ hash: '#/day/2026-12-12' });
  await trip.page.waitForSelector('.allday-list .ev');
  assert.match(await trip.page.textContent('.allday-list'), /旅行（2日目／3日間）/);
  await trip.page.click('text=次の日 ▶');
  await trip.page.waitForFunction(() => location.hash === '#/day/2026-12-13');
  await trip.close();
});
test('日の画面: 開いたら 7 時の欄が見える', async () => {
  const { page, close } = await openApp({ hash: '#/day/2026-12-03' });
  await page.waitForSelector('.hour[data-h="7"]');
  await page.waitForTimeout(200);
  const r = await page.$eval('.hour[data-h="7"]', n => { const r = n.getBoundingClientRect(); return [r.top, r.bottom, innerHeight]; });
  assert.ok(r[0] >= 0 && r[1] <= r[2], JSON.stringify(r));
  await close();
});
test('一番大きい字でも 375px ではみ出さない', async () => {
  for (const hash of ['#/week/2026-12-03', '#/day/2026-12-03']) {
    const { page, close } = await openApp({ hash, device: 'iPhone SE', fontLevel: 4 });
    await page.waitForSelector('.ev');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), hash);
    assert.ok(await page.$eval('.bar h1', h => h.scrollWidth <= h.clientWidth + 1), `${hash} title`);
    await close();
  }
});
