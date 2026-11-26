// 公開のときに app/sw.js の BUILD をコミットの印に書き換える。sw.js が 1 文字でも変わると、
// iPhone は新しい版を受け取り、次に開いたときに切り替える。
// 使い方: node scripts/stamp-build.mjs <印>
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PLACEHOLDER = "const BUILD = 'dev';";

export function stampBuild(code, build) {
  if (!code.includes(PLACEHOLDER)) throw new Error(`sw.js に ${PLACEHOLDER} が見つかりません（BUILD を書き換えられません）`);
  if (!/^[0-9A-Za-z._-]+$/.test(build)) throw new Error(`BUILD の印に使えない文字があります: ${build}`);
  return code.replace(PLACEHOLDER, `const BUILD = '${build}';`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const build = process.argv[2];
  if (!build) throw new Error('印を指定してください（例: node scripts/stamp-build.mjs abc1234）');
  const file = new URL('../app/sw.js', import.meta.url);
  writeFileSync(file, stampBuild(readFileSync(file, 'utf8'), build));
  console.log(`app/sw.js の BUILD を ${build} にしました`);
}
