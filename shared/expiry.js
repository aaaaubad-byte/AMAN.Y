/* AMAN — تصنيفات قرب انتهاء الاشتراك لكل شركة (U11: بنود 28 و47 و72 و85؛ القرار ق-1 في docs/DECISIONS_112_AMENDMENTS.md).
   منطق نقي + حفظ عبر AmanData.transact (لا تعديل على shared/data.js ولا على بنية التخزين الحالية).
   التخزين: settings.expiryClasses.byCompany[companyId] = { classes: [...], autoRenewClassId }.
   لا أسماء ولا قيم افتراضية ولا حد لعدد التصنيفات؛ الشركة بلا تصنيفات = لا شارة ولا إشعار.
   التصنيف { id, name, upToDays, notify, noticeText }: حد «≤ N يوم متبقٍ»، والأيام المتبقية = ceil((النهاية − الآن) / يوم).
   يُطبَّق على الاشتراك أضيق تصنيف مطابق فقط، وحدود الأيام داخل الشركة الواحدة غير مكررة فلا يتداخل تصنيفان.
   ربط التجديد التلقائي بتصنيف (autoRenewClassId) إعداد محفوظ فقط: لا يوجد هنا أي تنفيذ تجديد. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.AmanExpiry = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const NAME_MAX = 40, NOTICE_MAX = 300, DAY = 86400000;
  const own = (o, k) => (o && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined);
  const newId = () => `ecls_${(globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`).replaceAll('-', '')}`;

  const daysLeft = (endsAt, at = Date.now()) => {
    const end = new Date(endsAt).getTime();
    return Number.isFinite(end) ? Math.ceil((end - at) / DAY) : NaN;
  };

  // تنقية وتحقق: يرمي خطأ عربيًا واضحًا ولا يُصلح بصمت. الناتج مرتب تصاعديًا بالحد. لا حد لعدد التصنيفات.
  function cleanClasses(input) {
    if (input === undefined || input === null) return [];
    if (!Array.isArray(input)) throw new Error('صيغة التصنيفات غير صالحة.');
    const out = [], ids = new Set(), names = new Set(), limits = new Set();
    for (const [i, x] of input.entries()) {
      const name = String(x?.name ?? '').trim().replace(/\s+/g, ' ');
      if (!name) throw new Error(`اسم التصنيف ${i + 1} مطلوب.`);
      if (name.length > NAME_MAX) throw new Error(`اسم التصنيف ${i + 1} أطول من ${NAME_MAX} حرفًا.`);
      const raw = x?.upToDays, n = raw === null || raw === undefined || String(raw).trim() === '' ? NaN : Number(raw);
      if (!Number.isSafeInteger(n) || n < 1) throw new Error(`عدد أيام التصنيف «${name}» يجب أن يكون عددًا صحيحًا موجبًا.`);
      const notify = x?.notify === true, text = String(x?.noticeText ?? '').trim();
      if (text.length > NOTICE_MAX) throw new Error(`نص إشعار التصنيف «${name}» أطول من ${NOTICE_MAX} حرف.`);
      if (notify && !text) throw new Error(`اكتب نص الإشعار للتصنيف «${name}» أو عطّل الإشعار.`);
      const id = typeof x?.id === 'string' && x.id ? x.id : newId(), key = name.toLocaleLowerCase();
      if (ids.has(id)) throw new Error('معرّف تصنيف مكرر.');
      if (names.has(key)) throw new Error(`اسم التصنيف «${name}» مكرر في هذه الشركة.`);
      if (limits.has(n)) throw new Error(`عدد الأيام ${n} مكرر بين تصنيفين في هذه الشركة؛ يلزم حد مختلف لكل تصنيف حتى لا يتداخلا.`);
      ids.add(id); names.add(key); limits.add(n);
      out.push({ id, name, upToDays: n, notify, noticeText: text });
    }
    return out.sort((a, b) => a.upToDays - b.upToDays);
  }

  // قراءة إعداد شركة من نسخة بيانات كاملة. القيمة المخزنة التالفة تُعامَل كمعطّلة بدل كسر التطبيق (ولا تُكتب فوقها).
  function forCompany(db, companyId) {
    const c = own(own(own(db?.settings, 'expiryClasses'), 'byCompany'), companyId);
    let classes = [];
    try { classes = cleanClasses(own(c, 'classes')); } catch { classes = []; }
    const link = own(c, 'autoRenewClassId');
    return { classes, autoRenewClassId: classes.some(k => k.id === link) ? link : null };
  }

  function writeCompany(db, companyId, cfg) {
    const cur = own(db.settings, 'expiryClasses') || {};
    const by = { ...(own(cur, 'byCompany') || {}) };
    by[companyId] = { classes: cfg.classes, autoRenewClassId: cfg.autoRenewClassId || null };
    db.settings = { ...(db.settings || {}), expiryClasses: { ...cur, byCompany: by } };
  }
  function needCompany(db, companyId) {
    const co = companyId === '__proto__' ? null : (db.companies || []).find(c => c.id === companyId);
    if (!co) throw new Error('الشركة غير موجودة.');
    return co;
  }

  /* ----- الإدارة: حفظ مستقل لكل شركة، ذرّي، وبسجل قبل/بعد. الفشل لا يغيّر المحفوظ. ----- */
  async function saveClass(D, adminId, companyId, input = {}) {
    return D.transact(adminId, 'expiry_class_saved', db => {
      const co = needCompany(db, companyId), cur = forCompany(db, companyId);
      const exists = input.id ? cur.classes.find(c => c.id === input.id) : null;
      if (input.id && !exists) throw new Error('التصنيف غير موجود.');
      const item = { id: exists?.id, name: input.name, upToDays: input.upToDays, notify: input.notify === true, noticeText: input.noticeText };
      const next = cleanClasses([...cur.classes.filter(c => c.id !== exists?.id), item]);
      const saved = next.find(c => (exists ? c.id === exists.id : !cur.classes.some(o => o.id === c.id)));
      writeCompany(db, companyId, { classes: next, autoRenewClassId: cur.autoRenewClassId });
      return { entityType: 'expiry_class', entityId: saved.id, summary: `${exists ? 'تعديل' : 'إضافة'} تصنيف «${saved.name}» لشركة ${co.name}`, details: { companyId, before: cur.classes, after: next } };
    });
  }
  async function deleteClass(D, adminId, companyId, classId) {
    return D.transact(adminId, 'expiry_class_deleted', db => {
      const co = needCompany(db, companyId), cur = forCompany(db, companyId), k = cur.classes.find(c => c.id === classId);
      if (!k) throw new Error('التصنيف غير موجود.');
      if (cur.autoRenewClassId === classId) throw new Error('التصنيف مرتبط بالتجديد التلقائي؛ عطّل الربط أولًا.');
      const next = cur.classes.filter(c => c.id !== classId);
      writeCompany(db, companyId, { classes: next, autoRenewClassId: cur.autoRenewClassId });
      return { entityType: 'expiry_class', entityId: classId, summary: `حذف تصنيف «${k.name}» من شركة ${co.name}`, details: { companyId, before: cur.classes, after: next } };
    });
  }
  // ربط التجديد التلقائي بتصنيف (أو تعطيله بقيمة فارغة). إعداد فقط: لا تجديد ينفَّذ من هنا (ق-1).
  async function setAutoRenewClass(D, adminId, companyId, classId) {
    const id = classId === undefined || classId === null || String(classId).trim() === '' ? null : String(classId);
    return D.transact(adminId, 'expiry_autorenew_class_saved', db => {
      const co = needCompany(db, companyId), cur = forCompany(db, companyId);
      if (id && !cur.classes.some(c => c.id === id)) throw new Error('التصنيف المختار غير موجود في هذه الشركة.');
      writeCompany(db, companyId, { classes: cur.classes, autoRenewClassId: id });
      return { entityType: 'expiry_autorenew', entityId: companyId, summary: `${id ? 'ربط' : 'تعطيل ربط'} التجديد التلقائي بتصنيف في شركة ${co.name}`, details: { companyId, before: cur.autoRenewClassId, after: id } };
    });
  }

  /* ----- التصنيف والعرض ----- */
  // حالة اشتراك واحد: none | expired | active (+ days و cls). يمرَّر الاشتراك الذي يقرره المستدعي (الساري عادةً).
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
  // نتيجة رقم بتصنيفات شركته (بند 28)
  function resultFor(D, db, number, at = Date.now()) {
    return classify(forCompany(db, number.companyId).classes, D.activeSubscription(db, number.id, at), at);
  }
  function badge(r) {
    if (!r || r.state === 'none') return null;
    if (r.state === 'expired') return { key: 'expired', label: 'منتهٍ', tone: 'bad' };
    return r.cls ? { key: `cls:${r.cls.id}`, label: r.cls.name, tone: 'warn' } : { key: 'active', label: 'فعال', tone: 'ok' };
  }
  // فلاتر الأرقام داخل شركة (بند 47): «قرب الانتهاء» وتصنيفاته لا تظهر إلا إذا عُرّفت تصنيفات للشركة
  function filterOptions(classes) {
    const near = (classes || []).length ? [['near', 'قرب الانتهاء'], ...classes.map(c => [`cls:${c.id}`, c.name])] : [];
    return [['all', 'الكل'], ['active', 'الاشتراكات النشطة'], ...near, ['expired', 'المنتهية']];
  }
  function matches(filter, r) {
    if (!filter || filter === 'all') return true;
    if (!r) return false;
    if (filter === 'active') return r.state === 'active';
    if (filter === 'near') return r.state === 'active' && !!r.cls;
    if (filter === 'expired') return r.state === 'expired';
    if (String(filter).startsWith('cls:')) return r.state === 'active' && !!r.cls && `cls:${r.cls.id}` === filter;
    return false;
  }
  // اشتراكات شركة بتصنيفها (للإدارة): الساري فقط، الأقرب انتهاءً أولًا
  function entries(D, db, companyId, at = Date.now()) {
    const classes = forCompany(db, companyId).classes, out = [];
    for (const n of (db.numbers || []).filter(x => x.companyId === companyId)) {
      const sub = D.activeSubscription(db, n.id, at);
      if (sub) out.push({ number: n, sub, result: classify(classes, sub, at) });
    }
    return out.sort((a, b) => a.result.days - b.result.days);
  }
  // ما يحتاجه تطبيق العميل فقط (الاسم والحد)؛ لا نصوص الإشعارات ولا الربط الإداري. readForCustomer يحذف settings عمدًا.
  function publicClassesMap(D) {
    const db = D.read(), out = {};
    for (const co of db.companies || []) {
      const list = forCompany(db, co.id).classes.map(({ name, upToDays }) => ({ name, upToDays }));
      if (list.length) out[co.id] = list;
    }
    return out;
  }

  /* ----- إشعارات العميل (ق-1 بند 4) ----- */
  const noticeKey = (sub, cls) => `expiry:${sub.id}:${cls.id}:${sub.endsAt}`;
  // الإشعارات المستحقة ولم تُنشأ بعد. المفتاح = اشتراك + تصنيف + نهاية الاشتراك؛ التمديد يغيّر النهاية فيتيح إشعارًا جديدًا.
  function pendingNotices(D, db, at = Date.now()) {
    if (db.notificationSettings?.subscriptionExpiring === false) return [];
    const out = [], seen = new Set((db.notifications || []).map(n => n.dedupeKey).filter(Boolean));
    for (const co of db.companies || []) {
      const { classes } = forCompany(db, co.id);
      if (!classes.some(c => c.notify)) continue;
      for (const n of (db.numbers || []).filter(x => x.companyId === co.id)) {
        const sub = D.activeSubscription(db, n.id, at), r = classify(classes, sub, at);
        if (r.state !== 'active' || !r.cls?.notify) continue;
        const cust = (db.customers || []).find(c => c.id === sub.customerId);
        if (!cust || cust.status === 'deleted') continue;
        const key = noticeKey(sub, r.cls);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ key, customerId: sub.customerId, numberId: n.id, number: n.number, subscriptionId: sub.id, cls: r.cls, days: r.days });
      }
    }
    return out;
  }
  // يُنشئ المستحق مرة واحدة فقط؛ إعادة الاستدعاء لا تكرر شيئًا ولا تكتب إن لم يوجد مستحق.
  async function evaluate(D, actorId = 'system', at = Date.now()) {
    if (!pendingNotices(D, D.read(), at).length) return { created: 0 };
    let created = 0;
    await D.transact(actorId, 'expiry_notices_created', db => {
      const list = pendingNotices(D, db, at), stamp = new Date().toISOString();
      created = list.length;
      for (const p of list) db.notifications.unshift({ id: D.uid('notice'), customerId: p.customerId, numberId: p.numberId, title: `قرب انتهاء اشتراك الرقم ${p.number}`, body: p.cls.noticeText, status: 'delivered-local', createdAt: stamp, readAt: null, kind: 'expiry', classId: p.cls.id, dedupeKey: p.key });
      return { entityType: 'notification', entityId: null, summary: `إنشاء ${created} إشعار قرب انتهاء اشتراك`, details: { count: created } };
    });
    return { created };
  }

  return { NAME_MAX, NOTICE_MAX, daysLeft, cleanClasses, forCompany, saveClass, deleteClass, setAutoRenewClass, classify, resultFor, badge, filterOptions, matches, entries, publicClassesMap, pendingNotices, evaluate };
});
