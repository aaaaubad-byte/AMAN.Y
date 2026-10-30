/* AMAN — طبقة اللغة (البند 106): عربي (RTL) وإنجليزي (LTR).
 * الأصل عربي. الإنجليزية تُطبَّق على DOM بقاموس مطابقة تامة (+ أنماط قليلة) دون تغيير منطق التطبيقين.
 * ما لا يوجد له ترجمة يبقى عربيًا ويُسجَّل في AmanI18n.missing() ليكمله فحص U18.
 * لغة العرض تُحفظ في localStorage بمفتاح مستقل (aman.lang) خارج سجل البيانات (AMAN_SHARED_REGISTRY_V2). */
(function (root) {
  'use strict';
  const KEY = 'aman.lang';
  const AR_RE = /[\u0600-\u06FF]/;

  const EN = {
    // عام
    'رجوع': 'Back', 'إغلاق': 'Close', 'جارٍ التحميل': 'Loading', 'التنقل الرئيسي': 'Main navigation',
    'إظهار كلمة المرور': 'Show password', 'إخفاء كلمة المرور': 'Hide password', 'تصفية حسب الشركة': 'Filter by company',
    'تخطَّ إلى المحتوى': 'Skip to content', 'إعادة المحاولة': 'Retry', 'بحث': 'Search', 'حفظ': 'Save', 'إلغاء': 'Cancel', 'تأكيد': 'Confirm',
    'نسخ': 'Copy', 'لصق': 'Paste',
    'أمان | العميل — مرجع محلي': 'AMAN | Customer — Local reference',
    'أمان | الإدارة — مرجع محلي': 'AMAN | Admin — Local reference',
    // تنقل وأقسام شائعة
    'الرئيسية': 'Home', 'الأرقام': 'Numbers', 'الاشتراكات': 'Subscriptions', 'الرصيد': 'Balance', 'الحساب': 'Account', 'المزيد': 'More',
    'الطلبات': 'Orders', 'المهام': 'Tasks', 'العملاء': 'Customers', 'المساعدة': 'Help', 'الإشعارات': 'Notifications',
    'التجديد التلقائي': 'Auto-renew', 'تشغيل التجديد التلقائي الآن': 'Run auto-renew now',
    // الدخول
    'تسجيل الدخول': 'Log in', 'إنشاء حساب': 'Create account', 'تسجيل الخروج': 'Log out',
    'البريد الإلكتروني': 'Email', 'كلمة المرور': 'Password', 'الاسم': 'Name',
    // قوة كلمة المرور
    'ضعيفة': 'Weak', 'متوسطة': 'Fair', 'جيدة': 'Good',
    'أقصر من الحد الأدنى (4 خانات)': 'Shorter than the minimum (4 characters)',
    'مؤشر استرشادي. الحد الأدنى 4 خانات ولا تُفرض شروط أخرى.': 'Indicative only. Minimum 4 characters; no other rules are enforced.',
    // رسائل التحقق (customer-kit.validate)
    'أدخل البريد الإلكتروني.': 'Enter your email.',
    'صيغة البريد الإلكتروني غير صحيحة.': 'The email format is invalid.',
    'أدخل كلمة المرور.': 'Enter your password.',
    'كلمة المرور يجب ألا تقل عن 4 خانات.': 'The password must be at least 4 characters.',
    'أدخل الاسم.': 'Enter your name.',
    'وافق على الشروط والأحكام للمتابعة.': 'Accept the terms and conditions to continue.',
    'اختر باقة النقاط.': 'Choose a points package.',
    'اختر وسيلة الدفع.': 'Choose a payment method.',
    'أدخل مرجع التحويل.': 'Enter the transfer reference.',
    'أدخل كلمة المرور الحالية.': 'Enter your current password.',
    'أدخل كلمة المرور الجديدة.': 'Enter the new password.',
    'أعد إدخال كلمة المرور الجديدة.': 'Re-enter the new password.',
    'كلمتا المرور غير متطابقتين.': 'The passwords do not match.',
    'أدخل كلمة المرور لتأكيد الحذف.': 'Enter your password to confirm deletion.',
    'أدخل رقم الهاتف.': 'Enter the phone number.',
    // PWA
    'يتوفر إصدار أحدث. أعد فتح التطبيق للتحديث.': 'A newer version is available. Reopen the app to update.',
    'تثبيت التطبيق': 'Install app'
  };

  // أنماط ذات جزء متغيّر؛ $n يُترجَم بدوره إن أمكن
  const PATTERNS = [
    [/^نسخ (.+)$/, 'Copy $1'],
    [/^تم نسخ (.+)$/, '$1 copied']
  ];

  const missing = new Set();
  let lang = 'ar';

  const norm = s => String(s).replace(/\s+/g, ' ').trim();

  // ترجمة نص واحد بصرف النظر عن الحالة العامة (قابلة للاختبار في Node)
  function translateText(text, to, track) {
    const src = String(text == null ? '' : text);
    if (to !== 'en') return src;
    const m = src.match(/^(\s*)([\s\S]*?)(\s*)$/);
    const core = norm(m[2]);
    if (!core || !AR_RE.test(core)) return src;
    if (Object.prototype.hasOwnProperty.call(EN, core)) return m[1] + EN[core] + m[3];
    for (const [re, out] of PATTERNS) {
      const x = core.match(re);
      if (x) return m[1] + out.replace(/\$(\d)/g, (_, n) => translateText(x[Number(n)] || '', 'en', track)) + m[3];
    }
    if (track) missing.add(core);
    return src;
  }

  const locale = () => (lang === 'en' ? 'en-GB' : 'ar-YE');
  const t = text => translateText(text, lang, true);

  const api = { translateText, t, locale, missing: () => Array.from(missing), dictionary: () => Object.assign({}, EN), get lang() { return lang; }, EN };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof document === 'undefined') return;

  /* ===== جانب المتصفح ===== */
  const ATTRS = ['aria-label', 'title', 'placeholder', 'alt'];
  const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'NOSCRIPT']);
  const textState = new WeakMap(); // عقدة نص → { orig, out }
  const attrState = new WeakMap(); // عنصر → { attr: { orig, out } }
  let observer = null;

  const skipped = el => !el || SKIP.has(el.tagName) || (el.closest && el.closest('[data-no-i18n]'));

  function applyText(node) {
    const el = node.parentElement;
    if (skipped(el)) return;
    const st = textState.get(node);
    const cur = node.data;
    if (st && cur === st.out) return; // لم يتغير منذ آخر ترجمة
    const orig = st && cur === st.orig ? st.orig : cur; // محتوى جديد من التطبيق يصبح الأصل
    const out = lang === 'en' ? translateText(orig, 'en', true) : orig;
    textState.set(node, { orig, out });
    if (out !== cur) node.data = out;
  }

  function applyAttrs(el) {
    if (skipped(el) || !el.getAttribute) return;
    let rec = attrState.get(el);
    for (const a of ATTRS) {
      if (!el.hasAttribute(a)) continue;
      const cur = el.getAttribute(a);
      const st = rec && rec[a];
      if (st && cur === st.out) continue;
      const orig = st && cur === st.orig ? st.orig : cur;
      const out = lang === 'en' ? translateText(orig, 'en', true) : orig;
      if (!rec) { rec = {}; attrState.set(el, rec); }
      rec[a] = { orig, out };
      if (out !== cur) el.setAttribute(a, out);
    }
  }

  function walk(rootNode) {
    if (!rootNode) return;
    if (rootNode.nodeType === 3) { applyText(rootNode); return; }
    if (rootNode.nodeType !== 1) return;
    if (skipped(rootNode)) return;
    applyAttrs(rootNode);
    const tw = document.createTreeWalker(rootNode, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    let n = tw.nextNode();
    while (n) {
      if (n.nodeType === 3) applyText(n);
      else if (skipped(n)) { /* العناصر المُستثناة وأبناؤها يُفحصون في applyText عبر closest */ }
      else applyAttrs(n);
      n = tw.nextNode();
    }
  }

  function run(fn) {
    if (observer) observer.disconnect();
    try { fn(); } finally { if (observer) observe(); }
  }

  function observe() {
    observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }

  function onMutations(list) {
    run(() => {
      for (const m of list) {
        if (m.type === 'characterData') applyText(m.target);
        else if (m.type === 'attributes') applyAttrs(m.target);
        else m.addedNodes.forEach(walk);
      }
    });
  }

  function readStored() {
    try { const v = root.localStorage.getItem(KEY); return v === 'en' ? 'en' : 'ar'; } catch (e) { return 'ar'; }
  }
  function writeStored(v) { try { root.localStorage.setItem(KEY, v); } catch (e) { /* التخزين غير متاح: يبقى الاختيار للجلسة */ } }

  function syncChrome() {
    const de = document.documentElement;
    de.lang = lang;
    de.dir = lang === 'en' ? 'ltr' : 'rtl';
    const b = document.querySelector('[data-lang-switch]');
    if (b) {
      b.textContent = lang === 'en' ? 'عربي' : 'EN';
      b.setAttribute('lang', lang === 'en' ? 'ar' : 'en');
      b.setAttribute('aria-label', lang === 'en' ? 'التبديل إلى العربية' : 'Switch to English');
    }
  }

  function setLang(next, persist) {
    const to = next === 'en' ? 'en' : 'ar';
    lang = to;
    if (persist !== false) writeStored(to);
    run(() => { syncChrome(); walk(document.documentElement); });
    try { document.dispatchEvent(new CustomEvent('aman:langchange', { detail: { lang: to } })); } catch (e) { /* بيئة قديمة */ }
    return to;
  }

  function mountSwitch() {
    if (document.querySelector('[data-lang-switch]')) return;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'lang-switch';
    b.setAttribute('data-lang-switch', '');
    b.setAttribute('data-no-i18n', '');
    b.addEventListener('click', () => setLang(lang === 'en' ? 'ar' : 'en'));
    document.body.appendChild(b);
    syncChrome();
  }

  api.setLang = setLang;
  api.apply = () => run(() => walk(document.documentElement));

  function boot() {
    lang = readStored();
    observer = new MutationObserver(onMutations);
    mountSwitch();
    syncChrome();
    run(() => walk(document.documentElement));
    observe();
  }

  root.AmanI18n = api;
  if (document.body) boot(); else document.addEventListener('DOMContentLoaded', boot);
})(typeof window !== 'undefined' ? window : globalThis);
