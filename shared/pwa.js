/* AMAN — PWA (البند 105): تسجيل service worker لأصول ثابتة فقط وزر تثبيت عند توفره.
 * لا تُخزَّن أي بيانات أو عمليات مالية في ذاكرة الـ worker؛ البيانات تبقى في التخزين المحلي للتطبيق. */
(function (root) {
  'use strict';
  if (typeof document === 'undefined') return;

  const state = { supported: 'serviceWorker' in navigator, registered: false, installEvent: null };
  const t = s => (root.AmanI18n && root.AmanI18n.t ? root.AmanI18n.t(s) : s);
  const say = s => { try { root.AmanUI && root.AmanUI.toast(t(s)); } catch (e) { /* لا شيء */ } };

  function register() {
    if (!state.supported || !/^https?:$/.test(location.protocol)) return; // file:// لا يدعم الـ worker
    navigator.serviceWorker.register(new URL('../sw.js', location.href).href).then(reg => {
      state.registered = true;
      const watch = w => w && w.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) say('يتوفر إصدار أحدث. أعد فتح التطبيق للتحديث.');
      });
      watch(reg.installing);
      reg.addEventListener('updatefound', () => watch(reg.installing));
    }).catch(() => { /* التسجيل اختياري: التطبيق يعمل بدونه */ });
  }

  function showInstall() {
    if (document.querySelector('.pwa-install') || !state.installEvent) return;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pwa-install';
    b.setAttribute('data-no-i18n', '');
    const label = () => t('تثبيت التطبيق');
    b.textContent = label();
    b.addEventListener('click', () => install());
    document.addEventListener('aman:langchange', () => { b.textContent = label(); });
    document.body.appendChild(b);
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

  root.addEventListener('beforeinstallprompt', e => { e.preventDefault(); state.installEvent = e; showInstall(); });
  root.addEventListener('appinstalled', () => { state.installEvent = null; const b = document.querySelector('.pwa-install'); if (b) b.remove(); });

  function markNet() { document.documentElement.setAttribute('data-online', navigator.onLine === false ? 'false' : 'true'); }
  root.addEventListener('online', markNet);
  root.addEventListener('offline', markNet);
  markNet();

  root.AmanPWA = { state, install, canInstall: () => !!state.installEvent, isOnline: () => navigator.onLine !== false };

  if (document.readyState === 'complete') register(); else root.addEventListener('load', register);
})(window);
