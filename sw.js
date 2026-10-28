/* AMAN — service worker (البند 105): أصول ثابتة فقط.
 * لا يعترض أي طلب غير GET ولا أي طلب خارج الأصل، ولا يخزّن بيانات أو استجابات عمليات.
 * الاستراتيجية: الشبكة أولًا مع تحديث النسخة المخزنة، والرجوع للمخزن عند انقطاع الاتصال.
 * عند تغيير أي أصل ثابت يُرفع رقم VERSION ليُنشأ مخزن جديد ويُحذف القديم عند التفعيل. */
const VERSION = 'aman-static-v2';
const PRECACHE = [
  'index.html',
  'apps/customer.html', 'apps/customer.css', 'apps/customer.js', 'apps/customer-kit.js', 'apps/customer-screens.js',
  'apps/customer-support.js', 'apps/customer-autorenew.js',
  'apps/admin.html', 'apps/admin.css', 'apps/admin.js', 'apps/admin-model.js', 'apps/admin-kit.js', 'apps/admin-screens.js',
  'apps/admin-expiry.js', 'apps/admin-finance.js', 'apps/admin-system.js', 'apps/admin-support.js', 'apps/admin-autorenew.js',
  'apps/admin-routes.js',
  'apps/customer.webmanifest', 'apps/admin.webmanifest', 'apps/icons/customer.svg', 'apps/icons/admin.svg',
  'apps/icons/maskable.svg', 'apps/icons/maskable-admin.svg',
  'fonts/AMAN-Arabic-Regular.ttf', 'fonts/AMAN-Arabic-Bold.ttf',
  'shared/data.js', 'shared/expiry.js', 'shared/finance-reports.js', 'shared/system.js', 'shared/support.js',
  'shared/autorenew.js', 'shared/ui.js', 'shared/a11y.js', 'shared/a11y.css', 'shared/pwa.js'
];
const STATIC_EXT = /\.(?:html|js|css|svg|png|webp|woff2?|ttf|otf|webmanifest)$/i;
const abs = p => new URL(p, self.registration.scope).href;

/* صفحة احتياطية مضمّنة تظهر فقط إن انقطع الاتصال ولم يوجد أي نسخة مخزنة (أول زيارة دون اتصال) */
const OFFLINE_HTML = '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>أمان — لا يوجد اتصال</title></head>'
  + '<body style="font-family:Tahoma,Arial,sans-serif;background:#f1f3f2;color:#0b0c0c;display:grid;place-items:center;min-height:100vh;margin:0;padding:20px">'
  + '<main role="main" style="max-width:360px;text-align:center;line-height:1.9"><h1 style="font-size:22px">لا يوجد اتصال</h1>'
  + '<p>لم يُحفظ التطبيق على هذا الجهاز بعد. اتصل بالإنترنت وافتح التطبيق مرة واحدة ليعمل لاحقًا بدون اتصال.</p></main></body></html>';

function fallbackFor(url) {
  const p = url.pathname;
  if (/\/apps\/admin(?:\.html)?$/i.test(p)) return abs('apps/admin.html');
  if (/\/apps\/customer(?:\.html)?$/i.test(p)) return abs('apps/customer.html');
  if (/\/(?:index\.html)?$/i.test(p) && !/\/apps\//i.test(p)) return abs('index.html');
  return abs('apps/customer.html');
}

self.addEventListener('install', event => {
  event.waitUntil(caches.open(VERSION).then(cache => Promise.all(
    PRECACHE.map(p => cache.add(new Request(abs(p), { cache: 'reload' })).catch(() => { /* ملف ناقص لا يُفشل التثبيت */ }))
  )));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(k => k.startsWith('aman-static-') && k !== VERSION).map(k => caches.delete(k))
  )).then(() => self.clients.claim()));
});

self.addEventListener('message', event => {
  const d = event.data;
  if (!d) return;
  if (d.type === 'SKIP_WAITING') self.skipWaiting();
  else if (d.type === 'GET_VERSION' && event.source) event.source.postMessage({ type: 'VERSION', version: VERSION });
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
  }).catch(() => caches.match(req, { ignoreSearch: true }).then(hit => {
    if (hit) return hit;
    if (!isNav) return Response.error();
    return caches.match(fallbackFor(url)).then(page => page || new Response(OFFLINE_HTML, { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }));
  })));
});
