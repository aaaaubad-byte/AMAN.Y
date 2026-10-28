/* AMAN — إمكانية الوصول المشتركة (البند 107). لا تغيّر منطق التطبيقين:
 * رابط تخطٍّ للمحتوى، نقل التركيز عند تغيّر المسار، تشغيل العناصر غير الأصلية بلوحة المفاتيح،
 * حبس التركيز داخل النوافذ المنبثقة وإعادته عند إغلاقها، وربط أخطاء الحقول بالحقول (aria-invalid). */
(function (root) {
  'use strict';
  if (typeof document === 'undefined') return;

  const NATIVE = new Set(['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA', 'SUMMARY', 'LABEL', 'OPTION']);
  const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

  /* ----- رابط التخطّي ----- */
  function mountSkip() {
    if (document.querySelector('.skip-link')) return;
    const main = document.getElementById('screen') || document.querySelector('main');
    if (!main) return;
    if (!main.hasAttribute('tabindex')) main.setAttribute('tabindex', '-1');
    const a = document.createElement('a');
    a.className = 'skip-link';
    a.href = '#screen';
    a.textContent = 'تخطَّ إلى المحتوى';
    a.addEventListener('click', e => { e.preventDefault(); main.focus({ preventScroll: false }); });
    document.body.insertBefore(a, document.body.firstChild);
  }

  /* ----- تركيز عند تغيّر المسار (hashchange فقط؛ إعادة الرسم بعد الإجراءات لا تسرق التركيز) ----- */
  function focusScreen() {
    const main = document.getElementById('screen');
    if (!main) return;
    const h = main.querySelector('h1');
    const target = h || main;
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
  }
  root.addEventListener('hashchange', () => setTimeout(focusScreen, 60));

  /* ----- عناصر تفاعلية غير أصلية ----- */
  function enhance(scope) {
    if (!scope || !scope.querySelectorAll) return;
    const list = scope.matches && scope.matches('[data-act],[data-action],[data-to]') ? [scope] : [];
    scope.querySelectorAll('[data-act],[data-action],[data-to]').forEach(e => list.push(e));
    for (const el of list) {
      if (NATIVE.has(el.tagName)) continue;
      if (!el.hasAttribute('role')) el.setAttribute('role', 'button');
      if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
    }
  }
  document.addEventListener('keydown', e => {
    const el = e.target;
    if (!el || el.nodeType !== 1 || NATIVE.has(el.tagName)) return;
    if (el.getAttribute('role') !== 'button') return;
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.click(); }
  });

  /* ----- أخطاء الحقول → aria-invalid ----- */
  function syncInvalid() {
    document.querySelectorAll('.ferr[id$="-err"]').forEach(err => {
      const input = document.getElementById(err.id.slice(0, -4));
      if (!input) return;
      const shown = !err.classList.contains('hidden') && err.textContent.trim() !== '';
      if (shown) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
    });
  }

  /* ----- النوافذ المنبثقة: حبس التركيز وإعادته ----- */
  const DIALOG = '[role="dialog"][aria-modal="true"]';
  let opener = null;
  let lastDialog = null;

  const visible = el => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
  const topDialog = () => { const all = document.querySelectorAll(DIALOG); return all.length ? all[all.length - 1] : null; };

  function checkDialog() {
    const d = topDialog();
    if (d && d !== lastDialog) {
      if (!lastDialog) opener = document.activeElement && document.activeElement !== document.body ? document.activeElement : opener;
      lastDialog = d;
      if (!d.contains(document.activeElement)) {
        const first = Array.from(d.querySelectorAll(FOCUSABLE)).find(visible);
        if (first) first.focus();
      }
    } else if (!d && lastDialog) {
      lastDialog = null;
      const back = opener; opener = null;
      if (back && document.contains(back) && typeof back.focus === 'function') back.focus();
    }
  }
  document.addEventListener('keydown', e => {
    if (e.key !== 'Tab') return;
    const d = topDialog();
    if (!d) return;
    const items = Array.from(d.querySelectorAll(FOCUSABLE)).filter(visible);
    if (!items.length) { e.preventDefault(); return; }
    const first = items[0], last = items[items.length - 1], a = document.activeElement;
    if (!d.contains(a)) { e.preventDefault(); first.focus(); }
    else if (e.shiftKey && a === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && a === last) { e.preventDefault(); first.focus(); }
  });

  /* ----- المراقبة ----- */
  let queued = false;
  function schedule() {
    if (queued) return;
    queued = true;
    (root.requestAnimationFrame || setTimeout)(() => { queued = false; syncInvalid(); checkDialog(); });
  }
  function boot() {
    mountSkip();
    enhance(document.body);
    syncInvalid();
    new MutationObserver(list => {
      for (const m of list) m.addedNodes.forEach(n => { if (n.nodeType === 1) enhance(n); });
      schedule();
    }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  }
  root.AmanA11y = { focusScreen, syncInvalid };
  if (document.body) boot(); else document.addEventListener('DOMContentLoaded', boot);
})(window);
