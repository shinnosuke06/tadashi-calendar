import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { forecastUrl, describeWeather, parseForecast, weatherFor, fetchForecast, WEATHER_CREDIT } from '../../app/js/weather.js';

const json = JSON.parse(readFileSync(new URL('../fixtures/open-meteo.json', import.meta.url)));
const memKV = () => { const m = new Map(); return { get: async (s, k) => m.get(`${s}|${k}`), put: async (s, k, v) => { m.set(`${s}|${k}`, v); } }; };
const okFetch = counter => async url => { counter.n++; counter.url = url; return new Response(JSON.stringify(json)); };
const at = iso => () => new Date(iso);

test('天気の対応表', () => {
  const cases = [[0, '晴れ', '☀️'], [1, '晴れ時々くもり', '🌤️'], [2, '晴れ時々くもり', '🌤️'], [3, 'くもり', '☁️'], [45, '霧', '🌫️'], [48, '霧', '🌫️'],
    [51, '雨', '🌧️'], [57, '雨', '🌧️'], [61, '雨', '🌧️'], [67, '雨', '🌧️'], [80, '雨', '🌧️'], [82, '雨', '🌧️'],
    [71, '雪', '❄️'], [77, '雪', '❄️'], [85, '雪', '❄️'], [86, '雪', '❄️'], [95, '雷雨', '⛈️'], [99, '雷雨', '⛈️']];
  for (const [code, label, icon] of cases) assert.deepEqual(describeWeather(code), { label, icon }, String(code));
  assert.deepEqual(describeWeather(42), { label: '', icon: '' });
});
test('URL', () => {
  assert.equal(forecastUrl(35.4437, 139.638),
    'https://api.open-meteo.com/v1/forecast?latitude=35.44&longitude=139.64&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&hourly=precipitation_probability&timezone=Asia%2FTokyo&forecast_days=16');
  assert.equal(WEATHER_CREDIT, '天気予報: Open-Meteo');
});
test('日ごとの天気と、時刻ありの予定の降水確率', () => {
  const f = parseForecast(json);
  assert.deepEqual(weatherFor(f, '2026-12-01'), { label: '晴れ', icon: '☀️', max: 14, min: 5, pop: 0 });
  assert.deepEqual(weatherFor(f, { allDay: false, start: '2026-12-02T10:00' }), { label: '雨', icon: '🌧️', max: 10, min: 6, pop: 80, popAtTime: 75 });
  assert.deepEqual(weatherFor(f, { allDay: true, start: '2026-12-03' }), { label: 'くもり', icon: '☁️', max: 11, min: 3, pop: 30 });
  assert.equal(weatherFor(f, '2026-12-20'), null);
  assert.equal(weatherFor(null, '2026-12-01'), null);
});
test('1 時間以内の 2 回目は取りに行かない', async () => {
  const kv = memKV(), c = { n: 0 };
  await fetchForecast(35.44, 139.64, { fetchImpl: okFetch(c), kv, now: at('2026-12-01T00:00:00Z') });
  const f = await fetchForecast(35.441, 139.639, { fetchImpl: okFetch(c), kv, now: at('2026-12-01T00:50:00Z') });
  assert.equal(c.n, 1);
  assert.equal(weatherFor(f, '2026-12-01').label, '晴れ');
  await fetchForecast(35.44, 139.64, { fetchImpl: okFetch(c), kv, now: at('2026-12-01T01:10:00Z') });
  assert.equal(c.n, 2);
});
test('通信が失敗しても例外を出さず null', async () => {
  const f = await fetchForecast(35.44, 139.64, { fetchImpl: async () => { throw new TypeError('offline'); }, kv: memKV(), now: at('2026-12-01T00:00:00Z') });
  assert.equal(f, null);
  const g = await fetchForecast(35.44, 139.64, { fetchImpl: async () => new Response('x', { status: 500 }), kv: memKV(), now: at('2026-12-01T00:00:00Z') });
  assert.equal(g, null);
});
test('1 日 200 回を超えたら取りに行かない', async () => {
  const kv = memKV(), c = { n: 0 };
  await kv.put('kv', 'weatherCount:2026-12-01', 200);
  const f = await fetchForecast(35.44, 139.64, { fetchImpl: okFetch(c), kv, now: at('2026-12-01T00:00:00Z') });
  assert.equal(c.n, 0);
  assert.equal(f, null);
  // 日本時間で日付が変われば数え直し（2026-12-01T15:00Z = 日本時間 12/2 0:00）
  await fetchForecast(35.44, 139.64, { fetchImpl: okFetch(c), kv, now: at('2026-12-01T15:00:00Z') });
  assert.equal(c.n, 1);
  assert.equal(await kv.get('kv', 'weatherCount:2026-12-02'), 1);
});
