import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadGas } from './load-gas.js';

const leg = (sec, m, address = '神奈川県さくら市中央1-2（架空）') => ({ status: 'OK', routes: [{ legs: [{ duration: { value: sec }, distance: { value: m }, end_address: address, end_location: { lat: 35.4437, lng: 139.638 } }] }] });
function ready(options) {
  const env = loadGas(options);
  env.gas.setup();
  const KEY = env.props.get('API_KEY');
  return { ...env, KEY, call: (action, params) => env.post({ key: KEY, action, params }) };
}
const today = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);

test('高速あり・なしの 2 通り', () => {
  const { call, log } = ready({ directions: q => (q.avoid ? leg(2400, 10140) : leg(1500, 12290)) });
  const r = call('route', { origin: '自宅', destination: 'さくら眼科' }).data;
  assert.deepEqual(r, {
    withHighways: { minutes: 25, km: 12.3 }, withoutHighways: { minutes: 40, km: 10.1 },
    destinationAddress: '神奈川県さくら市中央1-2（架空）', destination: { lat: 35.4437, lng: 139.638 },
  });
  const qs = log.calls.filter(c => c[0] === 'Maps.directions').map(c => c[1]);
  assert.equal(qs.length, 2);
  assert.deepEqual(qs.map(q => [q.mode, q.language, q.region, q.avoid ?? null]), [['driving', 'ja', 'jp', null], ['driving', 'ja', 'jp', 'highways']]);
});
test('片方が見つからなければ、その道は null', () => {
  const { call } = ready({ directions: q => (q.avoid ? { status: 'ZERO_RESULTS', routes: [] } : leg(1500, 12290)) });
  const r = call('route', { origin: '自宅', destination: 'x' }).data;
  assert.equal(r.withoutHighways, null);
  assert.equal(r.withHighways.minutes, 25);
});
test('1 日 100 回まで（今回の 2 回を足して 100 を超えるなら地図を呼ばない）', () => {
  const { call, props, log } = ready({ directions: () => leg(600, 5000) });
  props.set(`ROUTE_COUNT_${today()}`, '98');
  assert.equal(call('route', { origin: 'a', destination: 'b' }).ok, true);
  assert.equal(props.get(`ROUTE_COUNT_${today()}`), '100');
  const before = log.calls.length;
  assert.deepEqual(call('route', { origin: 'a', destination: 'b' }), { ok: false, error: { code: 'LIMIT' } });
  assert.equal(log.calls.filter(c => c[0] === 'Maps.directions').length, 2);
  assert.equal(log.calls.length, before);
});
test('日付が変われば数え直す', () => {
  const { call, props } = ready({ directions: () => leg(600, 5000) });
  props.set('ROUTE_COUNT_2000-01-01', '100');
  assert.equal(call('route', { origin: 'a', destination: 'b' }).ok, true);
  assert.equal(props.get(`ROUTE_COUNT_${today()}`), '2');
});
test('地図の上限の例外も LIMIT', () => {
  const { call } = ready({ directions: () => { throw new Error('Service invoked too many times for one day: route.'); } });
  assert.deepEqual(call('route', { origin: 'a', destination: 'b' }), { ok: false, error: { code: 'LIMIT' } });
});
test('場所の候補（自宅の近くを優先、最大 5 件、施設名があれば名前に）', () => {
  const results = Array.from({ length: 7 }, (_, i) => ({
    formatted_address: `日本、〒231-000${i} 神奈川県さくら市中央${i}-1`,
    geometry: { location: { lat: 35.4 + i / 100, lng: 139.6 } },
    address_components: i === 0 ? [{ long_name: 'さくら眼科', types: ['establishment', 'point_of_interest'] }] : [{ long_name: '1', types: ['premise'] }],
  }));
  const { call, log } = ready({ geocodeResults: () => ({ status: 'OK', results }) });
  const r = call('geocode', { address: 'さくら眼科', near: { lat: 35.47, lng: 139.6 } }).data;
  assert.equal(r.results.length, 5);
  assert.deepEqual(r.results[0], { name: 'さくら眼科', address: '神奈川県さくら市中央0-1', lat: 35.4, lng: 139.6 });
  assert.equal(r.results[1].name, '神奈川県さくら市中央1-1');
  const q = log.calls.find(c => c[0] === 'Maps.geocode')[1];
  assert.equal(q.address, 'さくら眼科');
  assert.ok(q.bounds[0] < 35.47 && q.bounds[2] > 35.47);
});
test('見つからなければ候補 0 件、位置からの住所は null', () => {
  const { call } = ready();
  assert.deepEqual(call('geocode', { address: '不明' }).data, { results: [] });
  assert.equal(call('reverseGeocode', { lat: 35, lng: 139 }).data, null);
});
test('位置から住所', () => {
  const { call } = ready({ reverseResults: () => ({ status: 'OK', results: [{ formatted_address: '日本、〒231-0001 神奈川県さくら市中央1-1' }] }) });
  assert.deepEqual(call('reverseGeocode', { lat: 35.4, lng: 139.6 }).data, { address: '神奈川県さくら市中央1-1' });
});
test('住所探しも 1 日 100 回まで', () => {
  const { call, props } = ready();
  props.set(`GEO_COUNT_${today()}`, '100');
  assert.deepEqual(call('geocode', { address: 'x' }), { ok: false, error: { code: 'LIMIT' } });
  assert.deepEqual(call('reverseGeocode', { lat: 1, lng: 2 }), { ok: false, error: { code: 'LIMIT' } });
});
