// 読みやすい文字の形（BIZ UDPゴシック）を node_modules から app/fonts に写す。
// 文字ごとに分かれたファイルを unicode-range で指定するので、端末は使う文字の分だけ読む。
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync } from 'node:fs';

const from = new URL('../node_modules/@fontsource/biz-udpgothic/', import.meta.url);
const to = new URL('../app/fonts/', import.meta.url);
rmSync(to, { recursive: true, force: true });
mkdirSync(to, { recursive: true });

const files = new Set();
const blocks = [];
for (const weight of ['400', '700']) {
  const css = readFileSync(new URL(`${weight}.css`, from), 'utf8');
  for (const block of css.match(/@font-face\s*{[^}]*}/g)) {
    const woff2 = block.match(/url\(\.\/files\/([^)]+\.woff2)\)/)[1];
    files.add(woff2);
    blocks.push(block.replace(/src:[^;]*;/, `src: url(./${woff2}) format('woff2');`));
  }
}
for (const f of files) cpSync(new URL(`files/${f}`, from), new URL(f, to));
cpSync(new URL('LICENSE', from), new URL('OFL.txt', to));
writeFileSync(new URL('ud-gothic.css', to),
  `/* BIZ UDPGothic（SIL Open Font License 1.1。OFL.txt を見てください）。scripts/copy-fonts.mjs で作ります */\n${blocks.join('\n')}\n`);
console.log(`app/fonts に ${files.size} 個のファイルを写しました`);
