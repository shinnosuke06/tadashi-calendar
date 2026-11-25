import { test } from 'node:test';
import assert from 'node:assert/strict';
import { THEMES, FONT_LEVELS, contrastRatio } from '../../app/js/themes.js';
import { GOOGLE_EVENT_COLORS } from '../../app/js/colors.js';

test('どのテーマも文字がはっきり読める', () => {
  for (const [name, t] of Object.entries(THEMES)) {
    assert.ok(contrastRatio(t.text, t.bg) >= 7, `${name} text`);
    assert.ok(contrastRatio(t.text, t.surface) >= 7, `${name} surface`);
    for (const k of ['subtext', 'saturday', 'sunday']) assert.ok(contrastRatio(t[k], t.bg) >= 4.5, `${name} ${k}`);
    assert.ok(contrastRatio(t.headText, t.head) >= 7, `${name} head`);
    assert.ok(contrastRatio(t.accentText, t.accent) >= 4.5, `${name} accent`);
  }
});
test('テーマは 6 つで、ラベルが決まっている', () => {
  assert.deepEqual(Object.values(THEMES).map(t => t.label), ['白', 'さくら', 'わかば', 'クリーム', '黒地に白', 'くっきり']);
});
test('文字サイズは 5 段階', () => assert.deepEqual(FONT_LEVELS, [16, 18, 22, 26, 32]));
test('contrastRatio は WCAG の式', () => {
  assert.equal(Math.round(contrastRatio('#000000', '#ffffff') * 10) / 10, 21);
  assert.equal(contrastRatio('#777777', '#777777'), 1);
});
test('Google の予定の色は 11 色', () => {
  assert.equal(GOOGLE_EVENT_COLORS.length, 11);
  assert.deepEqual(GOOGLE_EVENT_COLORS[10], { id: '11', name: 'トマト', hex: '#d50000' });
});
