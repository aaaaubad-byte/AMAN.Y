/* AMAN Admin — آباء مسارات U12/U13/U14 لزر الرجوع عند الدخول المباشر برابط (بلا سجل رجوع).
   admin.js يعالج الرجوع عبر history.back() متى وُجد سجل؛ هذا الملف يتدخل فقط حين لا يوجد سجل (d = 0)
   فيعيد المستخدم إلى الشاشة الأم الصحيحة بدل الرئيسية. لا يمس منطق التوجيه في admin.js. */
(function (root) {
  'use strict';
  const parent = r => {
    const [n, a, b] = String(r || '').split('/');
    if (n === 'reports') return 'finance';
    if (n === 'daily-close') return a ? 'daily-close' : 'finance';
    if (n === 'system') return !a ? 'more' : (a === 'backup' && b === 'preview') ? 'system/backup' : 'system';
    if (n === 'support') return 'more';
    if (n === 'support-ticket') return 'support';
    if (n === 'promotions' || n === 'coupons') return a ? n : 'more';
    return null;
  };
  const route = () => { try { return decodeURIComponent(location.hash.replace(/^#\/?/, '')) || 'home'; } catch { return 'home'; } };
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('[data-act="back"]');
    if (!b) return;
    const st = history.state, depth = st && st.amanAdmin ? st.d || 0 : 0;
    if (depth > 0) return;
    const to = parent(route());
    if (!to) return;
    e.preventDefault(); e.stopImmediatePropagation();
    history.replaceState({ amanAdmin: true, route: to, d: 0 }, '', '#/' + to);
    root.dispatchEvent(new PopStateEvent('popstate', { state: history.state }));
  }, true);
  root.AmanAdminRoutes = { parent };
})(window);
