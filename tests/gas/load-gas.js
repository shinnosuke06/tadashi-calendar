// gas/src を番号順に読み込み、偽物の Apps Script の中で動かす
import vm from 'node:vm';
import { buildGas } from '../../scripts/build-gas.mjs';
import { createFakeGas } from './fake-gas.js';

export function loadGas(options) {
  const fake = createFakeGas(options);
  vm.createContext(fake.ctx);
  vm.runInContext(buildGas(), fake.ctx, { filename: 'Code.gs' });
  const post = body => JSON.parse(fake.ctx.doPost({ postData: { contents: JSON.stringify(body) } }).getContent());
  return { ...fake, gas: fake.ctx, post };
}
