// gas/src/*.js を名前順につなげて gas/dist/Code.gs を作る（家族がこの 1 ファイルを Apps Script に貼る）
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const HEADER = [
  '// =====================================================================',
  '// ただしカレンダー（Google 側のプログラム）',
  '// このファイルは生成物です。直すときは gas/src を直して `npm run build:gas` を実行してください。',
  '// =====================================================================',
  '',
].join('\n');

export function buildGas() {
  const dir = new URL('gas/src/', root);
  const files = readdirSync(dir).filter(f => f.endsWith('.js')).sort();
  return HEADER + files.map(f => `// ---- ${f} ----\n${readFileSync(new URL(f, dir), 'utf8').trimEnd()}\n`).join('\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(new URL('gas/dist/Code.gs', root), buildGas());
  console.log('gas/dist/Code.gs を作りました');
}
