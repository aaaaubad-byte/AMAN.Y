/* AMAN — PWA (البند 105): تسجيل service worker لأصول ثابتة فقط وزر تثبيت وزر تحديث عند توفر نسخة أحدث.
 * لا تُخزَّن أي بيانات أو عمليات مالية في ذاكرة الـ worker؛ البيانات تبقى في التخزين المحلي للتطبيق.
 * لا اتصال بخادم: التسجيل والتحديث يخصان ملفات التطبيق الثابتة فقط. */
(function (root) {
  'use strict';
  if (typeof document === 'undefined') return;

  const state = { supported: 'serviceWorker' in navigator, registered: false, installEvent: null, waiting: null };
  const t = s => (root.AmanI18n && root.AmanI18n.t ? root.AmanI18n.t(s) : s);
  const say = s => { try { root.AmanUI && root.AmanUI.toast(t(s)); } catch (e) { /* لا شيء */ } };
  let reloading = false;
  let updateRequested = false;

  function register() {
    if (!state.supported || !/^https?:$/.test(location.protocol)) return; // file:// لا يدعم الـ worker
    navigator.serviceWorker.register(new URL('../sw.js', location.href).href).then(reg => {
      state.registered = true;
      const offer = w => { state.waiting = w; showUpdate(); say('يتوفر إصدار أحدث. اضغط «تحديث التطبيق».'); };
      const watch = w => w && w.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) offer(w);
      });
      if (reg.waiting && navigator.serviceWorker.controller) { state.waiting = reg.waiting; showUpdate(); }
      watch(reg.installing);
      reg.addEventListener('updatefound', () => watch(reg.installing));
      // فحص هادئ عن نسخة أحدث عند العودة للتطبيق أو عودة الاتصال (ملفات ثابتة فقط)
      const check = () => { if (navigator.onLine !== false) reg.update().catch(() => { /* لا اتصال: لا شيء */ }); };
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
      root.addEventListener('online', check);
    }).catch(() => { /* التسجيل اختياري: التطبيق يعمل بدونه */ });

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!updateRequested || reloading) return; // لا إعادة تحميل إلا بطلب المستخدم، حفاظًا على ما يكتبه
      reloading = true;
      root.location.reload();
    });
  }

  function floatButton(cls, label, onClick) {
    if (document.querySelector('.' + cls)) return null;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = cls;
    b.setAttribute('data-no-i18n', '');
    b.textContent = t(label);
    b.addEventListener('click', onClick);
    document.addEventListener('aman:langchange', () => { b.textContent = t(label); });
    document.body.appendChild(b);
    return b;
  }

  function showInstall() {
    if (!state.installEvent) return;
    floatButton('pwa-install', 'تثبيت التطبيق', () => install());
  }

  function showUpdate() {
    if (!state.waiting) return;
    floatButton('pwa-update', 'تحديث التطبيق', () => applyUpdate());
  }

  function install() {
    const ev = state.installEvent;
    if (!ev) return Promise.resolve(false);
    state.installEvent = null;
    const b = document.querySelector('.pwa-install');
    if (b) b.remove();
    ev.prompt();
    return ev.userChoice.then(c => c && c.outcome === 'accepted').catch(() => false);
  }

  function applyUpdate() {
    const w = state.waiting;
    if (!w) return false;
    updateRequested = true;
    const b = document.querySelector('.pwa-update');
    if (b) b.remove();
    w.postMessage({ type: 'SKIP_WAITING' });
    return true;
  }

  root.addEventListener('beforeinstallprompt', e => { e.preventDefault(); state.installEvent = e; showInstall(); });
  root.addEventListener('appinstalled', () => { state.installEvent = null; const b = document.querySelector('.pwa-install'); if (b) b.remove(); });

  function markNet() { document.documentElement.setAttribute('data-online', navigator.onLine === false ? 'false' : 'true'); }
  root.addEventListener('online', markNet);
  root.addEventListener('offline', markNet);
  markNet();

  root.AmanPWA = {
    state, install, applyUpdate,
    canInstall: () => !!state.installEvent,
    hasUpdate: () => !!state.waiting,
    isOnline: () => navigator.onLine !== false
  };

  if (document.readyState === 'complete') register(); else root.addEventListener('load', register);
})(window);
