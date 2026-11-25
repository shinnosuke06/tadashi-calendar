// アプリと一緒に置く外部の部品（地図の Leaflet）を node_modules から app/vendor に写す
import { cpSync, mkdirSync } from 'node:fs';

const from = new URL('../node_modules/leaflet/', import.meta.url);
const to = new URL('../app/vendor/leaflet/', import.meta.url);
mkdirSync(to, { recursive: true });
for (const f of ['dist/leaflet.js', 'dist/leaflet.css', 'LICENSE']) cpSync(new URL(f, from), new URL(f.replace('dist/', ''), to));
cpSync(new URL('dist/images/', from), new URL('images/', to), { recursive: true });
console.log('app/vendor/leaflet に写しました');
