// 電波がなくても開けるように、アプリの部品を端末に保存しておく係（Service Worker）。
// ・同じサイトのものは、保存してあるものを先に使う（フォントや地図の部品は、使ったときに保存する）。
// ・Apps Script・天気予報・地図の絵は、ここを通さずにそのまま取りに行く。
// ・新しい版は裏で受け取っておき、次に開いたときに切り替える（js/sw-register.js）。
// 版を上げるときは VERSION を js/config.js の APP_VERSION と同じにする。BUILD は公開のときに自動で書き換わる。
const VERSION = '1.0.0';
const BUILD = 'dev';
const CACHE = `yoteihyo-${VERSION}-${BUILD}`;
const PRECACHE = [
  'css/base.css',
  'fonts/ud-gothic.css',
  'icons/icon-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'index.html',
  'js/api.js',
  'js/cache.js',
  'js/colors.js',
  'js/config.js',
  'js/dates.js',
  'js/demo-api.js',
  'js/departure.js',
  'js/event-model.js',
  'js/holidays.js',
  'js/import.js',
  'js/kv.js',
  'js/main.js',
  'js/outbox.js',
  'js/recurrence.js',
  'js/reminders.js',
  'js/repository.js',
  'js/rokuyo.js',
  'js/settings.js',
  'js/sw-register.js',
  'js/themes.js',
  'js/ui/components.js',
  'js/ui/day-view.js',
  'js/ui/dom.js',
  'js/ui/event-detail.js',
  'js/ui/event-form.js',
  'js/ui/keyboard.js',
  'js/ui/list-view.js',
  'js/ui/month-layout.js',
  'js/ui/month-view.js',
  'js/ui/place-picker.js',
  'js/ui/router.js',
  'js/ui/search-view.js',
  'js/ui/settings-view.js',
  'js/ui/setup-view.js',
  'js/ui/shell.js',
  'js/ui/week-view.js',
  'js/weather.js',
  'manifest.webmanifest',
  'vendor/leaflet/images/layers-2x.png',
  'vendor/leaflet/images/layers.png',
  'vendor/leaflet/images/marker-icon-2x.png',
  'vendor/leaflet/images/marker-icon.png',
  'vendor/leaflet/images/marker-shadow.png',
  'vendor/leaflet/leaflet.css',
  'vendor/leaflet/leaflet.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE.map(p => new Request(p, { cache: 'reload' })))));
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const name of await caches.keys()) if (name.startsWith('yoteihyo-') && name !== CACHE) await caches.delete(name);
    await self.clients.claim();
  })());
});

self.addEventListener('message', e => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const scope = new URL(self.registration.scope);
  const isPage = req.mode === 'navigate' && (url.pathname === scope.pathname || url.pathname.endsWith('/index.html'));
  e.respondWith(fromCache(isPage ? 'index.html' : req));
});

async function fromCache(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req, { ignoreSearch: true });
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok && res.type === 'basic') await cache.put(req, res.clone());
  return res;
}
