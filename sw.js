/* AMAN — service worker (البند 105): أصول ثابتة فقط.
 * لا يعترض أي طلب غير GET ولا أي طلب خارج الأصل، ولا يخزّن بيانات أو استجابات عمليات.
 * الاستراتيجية: الشبكة أولًا مع تحديث النسخة المخزنة، والرجوع للمخزن عند انقطاع الاتصال. */
const VERSION = 'aman-static-v1';
const PRECACHE = [
  'apps/customer.html', 'apps/customer.css', 'apps/customer.js', 'apps/customer-kit.js', 'apps/customer-screens.js',
  'apps/customer-support.js', 'apps/customer-autorenew.js',
  'apps/admin.html', 'apps/admin.css', 'apps/admin.js', 'apps/admin-model.js', 'apps/admin-kit.js', 'apps/admin-screens.js',
  'apps/admin-expiry.js', 'apps/admin-finance.js', 'apps/admin-system.js', 'apps/admin-support.js', 'apps/admin-autorenew.js',
  'apps/admin-routes.js',
  'apps/customer.webmanifest', 'apps/admin.webmanifest', 'apps/icons/customer.svg', 'apps/icons/admin.svg',
  'apps/icons/maskable.svg',
  'shared/data.js', 'shared/expiry.js', 'shared/finance-reports.js', 'shared/system.js', 'shared/support.js',
  'shared/autorenew.js', 'shared/ui.js', 'shared/i18n.js', 'shared/a11y.js', 'shared/a11y.css', 'shared/pwa.js'
];
const STATIC_EXT = /\.(?:html|js|css|svg|png|webp|woff2?|ttf|otf|webmanifest)$/i;

self.addEventListener('install', event => {
  event.waitUntil(caches.open(VERSION).then(cache => Promise.all(
    PRECACHE.map(p => cache.add(new Request(new URL(p, self.registration.scope).href, { cache: 'reload' })).catch(() => { /* ملف ناقص لا يُفشل التثبيت */ }))
  )));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(k => k.startsWith('aman-static-') && k !== VERSION).map(k => caches.delete(k))
  )).then(() => self.clients.claim()));
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const isNav = req.mode === 'navigate';
  if (!isNav && !STATIC_EXT.test(url.pathname)) return;
  if (/\/(?:tests|docs)\//.test(url.pathname)) return;

  event.respondWith(fetch(req).then(res => {
    if (res && res.ok && res.type === 'basic' && STATIC_EXT.test(url.pathname)) {
      const copy = res.clone();
      caches.open(VERSION).then(c => c.put(req, copy)).catch(() => { /* التخزين اختياري */ });
    }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true }).then(hit => hit || (isNav
    ? caches.match(new URL('apps/customer.html', self.registration.scope).href)
    : Response.error()))));
});
