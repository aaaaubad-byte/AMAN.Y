/* AMAN — تصنيفات قرب انتهاء الاشتراك (U11: بنود 28 و47 و72 و85).
   دوال نقية + حفظ عبر AmanData.transact (لا تعديل على shared/data.js ولا على بنية التخزين الحالية).
   لا قيم تجارية افتراضية: القائمة الفارغة = التصنيف معطّل ولا يظهر فلتر «قرب الانتهاء».
   كل تصنيف: { name, upToDays, notify }. يطبَّق على الاشتراك الساري الذي تبقى له ≤ upToDays يومًا،
   ويُختار أضيق حد مطابق فقط، فلا يتداخل تصنيفان (بند 72). الأيام المتبقية = ceil((النهاية − الآن) / يوم)
   كما في طبقة البيانات. notify = هل يدخل التصنيف في قائمة التنبيهات الإدارية (بند 85). */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.AmanExpiry = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const MAX_CLASSES = 6, MAX_DAYS = 365, NAME_MAX = 24, DAY = 86400000;

  const daysLeft = (endsAt, at = Date.now()) => {
    const end = new Date(endsAt).getTime();
    return Number.isFinite(end) ? Math.ceil((end - at) / DAY) : NaN;
  };

  // تنقية وتحقق: يرمي خطأ عربيًا واضحًا ولا يُصلح بصمت. الناتج مرتب تصاعديًا بالحد.
  function clean(input) {
    if (input === undefined || input === null) return [];
    if (!Array.isArray(input)) throw new Error('صيغة التصنيفات غير صالحة.');
    if (input.length > MAX_CLASSES) throw new Error(`الحد الأقصى ${MAX_CLASSES} تصنيفات.`);
    const out = [], names = new Set(), limits = new Set();
    for (const [i, x] of input.entries()) {
      const name = String(x?.name ?? '').trim().replace(/\s+/g, ' ');
      if (!name) throw new Error(`اسم التصنيف ${i + 1} مطلوب.`);
      if (name.length > NAME_MAX) throw new Error(`اسم التصنيف ${i + 1} أطول من ${NAME_MAX} حرفًا.`);
      const raw = x?.upToDays, n = raw === null || raw === undefined || String(raw).trim() === '' ? NaN : Number(raw);
      if (!Number.isInteger(n) || n < 1 || n > MAX_DAYS) throw new Error(`عدد أيام التصنيف «${name}» يجب أن يكون عددًا صحيحًا بين 1 و${MAX_DAYS}.`);
      const key = name.toLocaleLowerCase();
      if (names.has(key)) throw new Error(`اسم التصنيف «${name}» مكرر.`);
      if (limits.has(n)) throw new Error(`عدد الأيام ${n} مكرر بين تصنيفين؛ يلزم حد مختلف لكل تصنيف حتى لا يتداخلا.`);
      names.add(key); limits.add(n);
      out.push({ name, upToDays: n, notify: x?.notify === true });
    }
    return out.sort((a, b) => a.upToDays - b.upToDays);
  }

  // القراءة من نسخة بيانات كاملة. إن كانت القيمة المخزنة تالفة تُعامَل كمعطّلة بدل كسر التطبيق (لا تُكتب فوقها).
  function read(db) {
    try { return clean(db?.settings?.expiryClasses?.classes); } catch { return []; }
  }

  // حفظ إداري: ذرّي وبسجل قبل/بعد في سجل العمليات. الفشل لا يغيّر المحفوظ.
  async function save(D, adminId, input) {
    const classes = clean(input);
    return D.transact(adminId, 'expiry_classes_saved', db => {
      const before = read(db);
      db.settings = { ...(db.settings || {}), expiryClasses: { classes } };
      return { entityType: 'settings', entityId: 'expiryClasses', summary: 'حفظ تصنيفات قرب انتهاء الاشتراك', details: { before, after: classes } };
    });
  }

  // ما يحتاجه تطبيق العميل فقط (الاسم والحد)؛ لا أعلام التنبيه الإدارية. readForCustomer يحذف settings عمدًا.
  function publicClasses(D) {
    return read(D.read()).map(({ name, upToDays }) => ({ name, upToDays }));
  }

  // حالة اشتراك واحد: none | expired | active (+ days و cls). يمرَّر الاشتراك الذي يقرره المستدعي (الساري أو الأحدث).
  function classify(classes, sub, at = Date.now()) {
    const none = { state: 'none', days: null, cls: null };
    if (!sub || sub.status !== 'active') return none;
    const end = new Date(sub.endsAt).getTime(), start = new Date(sub.startsAt || 0).getTime();
    if (!Number.isFinite(end) || !Number.isFinite(start)) return none;
    if (end <= at) return { state: 'expired', days: 0, cls: null };
    if (start > at) return none;
    const days = daysLeft(sub.endsAt, at);
    const cls = [...(classes || [])].sort((a, b) => a.upToDays - b.upToDays).find(c => days <= c.upToDays) || null;
    return { state: 'active', days, cls };
  }

  // شارة العرض (بند 28)
  function badge(r) {
    if (!r || r.state === 'none') return null;
    if (r.state === 'expired') return { key: 'expired', label: 'منتهٍ', tone: 'bad' };
    return r.cls ? { key: `cls:${r.cls.upToDays}`, label: r.cls.name, tone: 'warn' } : { key: 'active', label: 'فعال', tone: 'ok' };
  }

  // فلاتر الأرقام السريعة (بند 47): «قرب الانتهاء» وتصنيفاته لا تظهر إلا إذا عُرّفت تصنيفات
  function filterOptions(classes) {
    const near = (classes || []).length ? [['near', 'قرب الانتهاء'], ...classes.map(c => [`cls:${c.upToDays}`, c.name])] : [];
    return [['all', 'الكل'], ['active', 'الاشتراكات النشطة'], ...near, ['expired', 'المنتهية']];
  }
  function matches(filter, r) {
    if (!filter || filter === 'all') return true;
    if (!r) return false;
    if (filter === 'active') return r.state === 'active';
    if (filter === 'near') return r.state === 'active' && !!r.cls;
    if (filter === 'expired') return r.state === 'expired';
    if (String(filter).startsWith('cls:')) return r.state === 'active' && !!r.cls && `cls:${r.cls.upToDays}` === filter;
    return false;
  }

  // قائمة التنبيهات الإدارية (بند 85): الاشتراكات السارية داخل تصنيف مفعّل له التنبيه، الأقرب انتهاءً أولًا.
  // تُحسب عند الطلب من البيانات الحالية؛ لا مجدول خلفي ولا إرسال خارجي.
  function alerts(D, db, classes, at = Date.now()) {
    const out = [];
    for (const n of db.numbers || []) {
      const s = D.activeSubscription(db, n.id, at), r = classify(classes, s, at);
      if (r.state === 'active' && r.cls?.notify === true) out.push({ subscriptionId: s.id, numberId: n.id, customerId: s.customerId, companyId: s.companyId || n.companyId, days: r.days, className: r.cls.name });
    }
    return out.sort((a, b) => a.days - b.days);
  }

  return { MAX_CLASSES, MAX_DAYS, NAME_MAX, daysLeft, clean, read, save, publicClasses, classify, badge, filterOptions, matches, alerts };
});
