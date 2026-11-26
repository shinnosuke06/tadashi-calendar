// ホーム画面のアイコン（カレンダーの絵）を SVG から PNG にする。Playwright の Chromium で描く。
// 使い方: node scripts/make-icons.mjs
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const { chromium } = createRequire(import.meta.url)('playwright');

const BLUE = '#0b57d0', RED = '#d93025', CELL = '#d7deea';
const cells = [];
for (let r = 0; r < 3; r++) {
  for (let c = 0; c < 4; c++) {
    const x = 136 + c * 62, y = 224 + r * 56;
    cells.push(r === 1 && c === 2
      ? `<circle cx="${x + 22}" cy="${y + 19}" r="27" fill="${BLUE}"/>`
      : `<rect x="${x}" y="${y}" width="44" height="38" rx="9" fill="${CELL}"/>`);
  }
}
export const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="${BLUE}"/>
  <rect x="100" y="118" width="312" height="300" rx="36" fill="#ffffff"/>
  <path d="M136 118h240a36 36 0 0 1 36 36v48H100v-48a36 36 0 0 1 36-36z" fill="${RED}"/>
  <rect x="166" y="86" width="26" height="66" rx="13" fill="#ffffff" stroke="${BLUE}" stroke-width="8"/>
  <rect x="320" y="86" width="26" height="66" rx="13" fill="#ffffff" stroke="${BLUE}" stroke-width="8"/>
  ${cells.join('\n  ')}
</svg>`;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = new URL('../app/icons/', import.meta.url);
  mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  for (const size of [180, 192, 512]) {
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    await page.setContent(`<style>html,body{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${ICON_SVG}`);
    await page.screenshot({ path: fileURLToPath(new URL(`icon-${size}.png`, out)) });
    await page.close();
  }
  await browser.close();
  console.log('app/icons に 180・192・512 のアイコンを作りました');
}
