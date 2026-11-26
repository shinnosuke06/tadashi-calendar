import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import vm from 'node:vm';
import { APP_VERSION } from '../../app/js/config.js';

const APP = new URL('../../app/', import.meta.url).pathname;
const code = readFileSync(join(APP, 'sw.js'), 'utf8');
const ctx = vm.createContext({ self: { addEventListener() {} } });
vm.runInContext(code, ctx);
const PRECACHE = vm.runInContext('PRECACHE', ctx);
const CACHE = vm.runInContext('CACHE', ctx);

const walk = dir => readdirSync(dir).flatMap(n => (statSync(join(dir, n)).isDirectory() ? walk(join(dir, n)) : [join(dir, n)]));

test('アプリの部品はすべて、電波なしのために保存しておく', () => {
  const files = walk(APP).map(f => relative(APP, f))
    .filter(f => f !== 'sw.js' && !/(^|\/)(LICENSE|OFL\.txt)$/.test(f) && !/\.woff2?$/.test(f));
  const missing = files.filter(f => !PRECACHE.includes(f));
  assert.deepEqual(missing, []);
});
test('保存の一覧にあるものは、実際にある', () => {
  for (const f of PRECACHE) if (f !== './') assert.ok(existsSync(join(APP, f)), f);
});
test('保存の入れ物の名前は、アプリの版を含む', () => {
  assert.ok(CACHE.includes(APP_VERSION), CACHE);
});
