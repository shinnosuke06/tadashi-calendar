import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS, mergeSettings } from '../../app/js/settings.js';

test('mergeSettings は欠けた値を埋め、おかしな値を直す', () => {
  assert.deepEqual(mergeSettings(null), DEFAULT_SETTINGS);
  assert.equal(mergeSettings({ fontLevel: 9 }).fontLevel, 4);
  assert.equal(mergeSettings({ theme: 'nope' }).theme, 'standard');
  assert.equal('junk' in mergeSettings({ junk: 1 }), false);
  assert.equal(mergeSettings({ categories: [{ id: 'x', name: '畑', colorId: '10' }] }).categories[0].name, '畑');
  assert.equal(mergeSettings({ categories: [{ id: 'x', name: '畑', colorId: '99' }] }).categories[0].colorId, '8');
});
test('初期値', () => {
  assert.equal(DEFAULT_SETTINGS.fontLevel, 2);
  assert.equal(DEFAULT_SETTINGS.monthScroll, 'h');
  assert.equal(DEFAULT_SETTINGS.departRoute, 'withoutHighways');
  assert.deepEqual(DEFAULT_SETTINGS.defaultNotify, { on: true, presets: ['1day', '1h'] });
});
test('mergeSettings は元の値を書き換えない', () => {
  const merged = mergeSettings(null);
  merged.categories[0].name = 'かわった';
  assert.equal(DEFAULT_SETTINGS.categories[0].name, '病院');
});
test('おかしな値の直し方', () => {
  assert.equal(mergeSettings({ monthScroll: 'x' }).monthScroll, 'h');
  assert.equal(mergeSettings({ bufferMinutes: -5 }).bufferMinutes, 10);
  assert.equal(mergeSettings({ departRoute: 'x' }).departRoute, 'withoutHighways');
  assert.equal(mergeSettings({ weekStart: 1 }).weekStart, 1);
  assert.deepEqual(mergeSettings({ home: { address: '横浜', lat: 35.4, lng: 139.6 } }).home, { address: '横浜', lat: 35.4, lng: 139.6 });
});
test('地図の絵（初期値は国土地理院）', () => {
  assert.equal(DEFAULT_SETTINGS.mapTiles, 'gsi');
  assert.equal(mergeSettings({ mapTiles: 'osm' }).mapTiles, 'osm');
  assert.equal(mergeSettings({ mapTiles: 'google' }).mapTiles, 'gsi');
});
