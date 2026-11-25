import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startAll, stopAll, openApp, addDemoEvents, timed, fontSizes } from './helpers.js';

before(startAll);
after(stopAll);

const cell = d => `.cell[data-d="${d}"]`;
const visibleCell = d => `.hpage[data-ym="2026-12"] .cell[data-d="${d}"]`;
const title = page => page.textContent('.bar h1');
const waitCells = page => page.waitForSelector(`${cell('2026-12-03')} .lb`);

test('縦の形: 月の表に同じ日付が 2 回出ない', async () => {
  const { page, close } = await openApp({ settings: { monthScroll: 'v' } });
  await page.waitForSelector('.months .week');
  const ds = await page.$$eval('.cell', cs => cs.map(c => c.dataset.d));
  assert.ok(ds.length > 1000);
  assert.equal(new Set(ds).size, ds.length);
  assert.equal(await title(page), '2026年12月');
  await close();
});
test('横の形: 上下に動かず、左右にめくれる', async () => {
  const { page, close } = await openApp({});
  await page.waitForSelector('.hmonths .hpage');
  assert.equal(await page.$eval('.hmonths', n => getComputedStyle(n).overflowY), 'hidden');
  assert.equal(await title(page), '2026年12月');
  for (const ds of await page.$$eval('.hpage', ps => ps.map(p => [...p.querySelectorAll('.cell')].map(c => c.dataset.d)))) assert.equal(new Set(ds).size, ds.length);
  await page.$eval('.hmonths', n => { n.scrollLeft += n.clientWidth; });
  await page.waitForFunction(() => document.querySelector('.bar h1').textContent === '2027年1月');
  await close();
});
test('横の形: 薄い日を押すとその月へめくって予定が出る', async () => {
  const { page, close } = await openApp({});
  await page.click(`.hpage[data-ym="2026-12"] ${cell('2027-01-01')}`);
  await page.waitForSelector('.sheet.open');
  assert.equal(await title(page), '2027年1月');
  assert.match(await page.textContent('.sheet .dayhead'), /1月1日（金）/);
  await close();
});
test('旅行の帯がつながる', async () => {
  const { page, close } = await openApp({});
  await page.waitForSelector(`${visibleCell('2026-12-12')} .lb.span`);
  const [a, b] = await Promise.all(['2026-12-11', '2026-12-12'].map(d => page.$eval(`${visibleCell(d)} .lb.span`, n => n.getBoundingClientRect().toJSON())));
  assert.ok(a.right >= b.left - 0.5, `${a.right} ${b.left}`);
  assert.equal(Math.round(a.top), Math.round(b.top));
  await close();
});
test('どの文字サイズでも日付が読める', async () => {
  for (let lv = 0; lv < 5; lv++) {
    const { page, close } = await openApp({ fontLevel: lv });
    if (lv === 0) await addDemoEvents(page, ['a', 'b', 'c', 'd'].map((id, i) => timed(`many-${id}`, '2026-12-09', `${10 + i}:00`, `予定${id}`)));
    await page.waitForSelector(`${visibleCell('2026-12-09')} .lb`);
    const ok = await page.$eval(visibleCell('2026-12-09'), c => {
      const n = c.querySelector('.num'), r = n.getBoundingClientRect(), cr = c.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { inside: r.left >= cr.left - 0.5 && r.right <= cr.right + 0.5 && r.top >= cr.top - 0.5 && r.bottom <= cr.bottom + 0.5, hit: n.contains(hit) };
    });
    assert.deepEqual(ok, { inside: true, hit: true }, `level ${lv}`);
    await close();
  }
});
test('日付を押すと下から予定が出て、その週は見えたまま', async () => {
  const { page, close } = await openApp({});
  await page.click(visibleCell('2026-12-03'));
  await page.waitForSelector('.sheet.open .ev');
  await page.waitForTimeout(400);
  const [c, s] = await Promise.all([page.$eval(visibleCell('2026-12-03'), n => n.getBoundingClientRect().bottom), page.$eval('.sheet', n => n.getBoundingClientRect().top)]);
  assert.ok(c <= s + 1, `${c} ${s}`);
  assert.equal(await page.textContent('.sheet .ev .ev-t1'), '10:00');
  assert.match(await page.textContent('.sheet .ev .ev-hint'), /出発の目安 9:10〜9:25ごろ/);
  const [t1] = await fontSizes(page, '.sheet .ev .ev-t1');
  const [hint] = await fontSizes(page, '.sheet .ev .ev-hint');
  assert.ok(t1 > hint);
  await close();
});
test('閉じる 3 通り', async () => {
  const { page, close } = await openApp({});
  const open = async () => { await page.click(visibleCell('2026-12-03')); await page.waitForSelector('.sheet.open'); };
  const closed = () => page.waitForFunction(() => !document.querySelector('.sheet.open'));
  await open(); await page.click('.sheet >> text=閉じる'); await closed();
  await open(); await page.click(visibleCell('2026-12-03')); await closed();
  await open();
  const box = await page.$eval('.sheet-head', n => n.getBoundingClientRect().toJSON());
  await page.mouse.move(box.left + box.width / 2, box.top + 8);
  await page.mouse.down();
  await page.mouse.move(box.left + box.width / 2, box.top + 120, { steps: 6 });
  await page.mouse.up();
  await closed();
  await close();
});
test('縦の形: スクロールで見出しの月が変わり、ほかの月は薄くなる', async () => {
  const { page, close } = await openApp({ settings: { monthScroll: 'v' } });
  await page.waitForSelector('.months .week');
  assert.equal(await page.$eval(cell('2026-12-31'), c => c.classList.contains('out')), false);
  await page.$eval('.months', n => { n.scrollTop += 4 * n.clientHeight / 6; });
  await page.waitForFunction(() => document.querySelector('.bar h1').textContent === '2027年1月');
  assert.equal(await page.$eval(cell('2026-12-31'), c => c.classList.contains('out')), true);
  await close();
});
test('一番大きい字でも時刻が切れない', async () => {
  const { page, close } = await openApp({ device: 'iPhone SE', fontLevel: 4 });
  await page.click(visibleCell('2026-12-03'));
  await page.waitForSelector('.sheet.open .ev-t1');
  for (const fit of await page.$$eval('.sheet .ev-t1, .sheet .ev-t2', ns => ns.map(n => n.scrollWidth <= n.clientWidth + 1))) assert.ok(fit);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
  await close();
});
test('祝日と六曜', async () => {
  const { page, close } = await openApp({ hash: '#/month/2026-11' });
  const nov = d => `.hpage[data-ym="2026-11"] ${cell(d)}`;
  await page.waitForSelector(nov('2026-11-23'));
  assert.match(await page.textContent(nov('2026-11-23')), /勤労感謝の日/);
  assert.equal(await page.$eval(`${nov('2026-11-23')} .num`, n => getComputedStyle(n).color), 'rgb(197, 34, 31)');
  assert.ok(await page.$(`${nov('2026-11-23')} .l2`));
  await close();
  const off = await openApp({ hash: '#/month/2026-11', settings: { showRokuyo: false } });
  await off.page.waitForSelector(nov('2026-11-23'));
  assert.equal(await off.page.$(`${nov('2026-11-23')} .l2`), null);
  assert.equal(await off.page.textContent(`${nov('2026-11-23')} .hn1`), '勤労感謝の日');
  await off.close();
});
test('海外の時間帯でも日付がずれない', async () => {
  const { page, close } = await openApp({ timezoneId: 'America/New_York' });
  await page.waitForSelector(`${visibleCell('2026-12-03')} .lb`);
  assert.match(await page.textContent(visibleCell('2026-12-03')), /眼科/);
  assert.equal(await title(page), '2026年12月');
  await close();
});
test('一覧に今日の天気と予定', async () => {
  const { page, close } = await openApp({ hash: '#/list' });
  await page.waitForSelector('.wx-card');
  assert.match(await page.textContent('.wx-card'), /今日の天気（自宅）/);
  assert.match(await page.textContent('.wx-card'), /☀️/);
  assert.match(await page.textContent('.view'), /天気予報: Open-Meteo/);
  await page.waitForSelector('.ev >> text=眼科');
  await page.click('text=もっと見る');
  await close();
});
