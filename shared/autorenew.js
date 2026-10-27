/* AMAN — التجديد التلقائي (U15: بنود 29 و62 و84) فوق قرار ق-1 (ربط التجديد بتصنيف قرب الانتهاء لكل شركة).
   لا تعديل على shared/data.js ولا على shared/expiry.js. التخزين تحت settings.autoRenew:
     { companies: { [companyId]: { allowed } }, optIns: { [numberId]: { customerId, packageId, enabled, enabledAt } }, log: [] }
   القواعد: (1) سماح إداري لكل شركة؛ (2) تفعيل العميل لكل رقم باختيار باقة حماية (قراره هو لا قرارنا)؛
   (3) لا يُنفَّذ شيء إلا إن دخل الاشتراك السارِي تصنيف «التجديد التلقائي» المحدد للشركة (أضيق تصنيف مطابق)؛
   (4) التنفيذ عبر D.performProtectionOperation بعملية «تمديد» (تحافظ على كل قواعد الرصيد والقيود والمهام) ومفتاح منع تكرار
       auto:<اشتراك>:<نهاية> فلا خصم مكرر؛ (5) عند فشل (رصيد غير كافٍ أو تقييد) لا شيء يُخصم ويُسجَّل السبب ويُشعَر العميل مرة واحدة لكل مفتاح.
   توقيت التنفيذ: لا مجدول خلفي، فيجري بزر «تشغيل الآن» في الإدارة فقط (لا تشغيل عند فتحها لأنه يخصم نقاط العملاء؛ سؤال مفتوح موثق). المنفِّذ في السجل: صاحب الاشتراك بعملية بمفتاح auto:. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.AmanAutoRenew = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const DAY = 86400000, LOG_MAX = 200;
  const arr = x => (Array.isArray(x) ? x : []);
  const cfg = db => { const a = db?.settings?.autoRenew || {}; return { companies: { ...(a.companies || {}) }, optIns: { ...(a.optIns || {}) }, log: arr(a.log) }; };
  const put = (db, c) => { db.settings = { ...(db.settings || {}), autoRenew: { companies: c.companies, optIns: c.optIns, log: c.log.slice(-LOG_MAX) } }; };
  const companyAllowed = (db, companyId) => cfg(db).companies[companyId]?.allowed === true;
  const classCfg = (X, db, companyId) => (X ? X.forCompany(db, companyId) : { classes: [], autoRenewClassId: '' });

  // أضيق تصنيف مطابق لأيام متبقية موجبة؛ null إن لم يطابق أي تصنيف
  function classOf(classes, remaining) {
    if (!(remaining > 0)) return null;
    return arr(classes).filter(k => remaining <= Number(k.upToDays)).sort((a, b) => Number(a.upToDays) - Number(b.upToDays))[0] || null;
  }
  const remainingDays = (sub, at) => Math.ceil((new Date(sub.endsAt).getTime() - at) / DAY);
  const keyOf = sub => `auto:${sub.id}:${sub.endsAt}`;

  /* ----- الإدارة: سماح الشركة (62) ----- */
  async function setCompanyAllowed(D, adminId, companyId, allowed, X) {
    return D.transact(adminId, 'autorenew_company_saved', db => {
      const co = db.companies.find(c => c.id === companyId); if (!co) throw new Error('الشركة غير موجودة.');
      const c = cfg(db), was = c.companies[companyId]?.allowed === true;
      if (allowed === true && !classCfg(X, db, companyId).autoRenewClassId) throw new Error('اربط التجديد التلقائي بتصنيف لهذه الشركة أولًا من «تصنيفات قرب الانتهاء».');
      c.companies[companyId] = { allowed: allowed === true, changedAt: D.now(), changedBy: adminId };
      put(db, c);
      return { entityType: 'autorenew_company', entityId: companyId, summary: `${allowed ? 'السماح' : 'منع'} بالتجديد التلقائي لشركة ${co.name}`, details: { before: was, after: allowed === true } };
    });
  }

  /* ----- العميل: تفعيل الرقم (62) ----- */
  async function setOptIn(D, customerId, numberId, packageId, enabled, X) {
    return D.transact(customerId, enabled ? 'autorenew_enabled' : 'autorenew_disabled', db => {
      const c = cfg(db), n = db.numbers.find(x => x.id === numberId);
      const linked = n && (db.numberLinks.some(l => l.numberId === n.id && l.customerId === customerId) || n.customerId === customerId);
      if (!n || !linked) throw new Error('هذا الرقم غير موجود ضمن أرقام حسابك.');
      if (!enabled) { if (c.optIns[numberId]) c.optIns[numberId] = { ...c.optIns[numberId], enabled: false, disabledAt: D.now() }; put(db, c); return { entityType: 'autorenew_optin', entityId: numberId, summary: `إيقاف التجديد التلقائي للرقم ${n.number}` }; }
      if (!companyAllowed(db, n.companyId)) throw new Error('التجديد التلقائي غير متاح لشركة هذا الرقم.');
      const cc = classCfg(X, db, n.companyId); if (!cc.autoRenewClassId || !arr(cc.classes).some(k => k.id === cc.autoRenewClassId)) throw new Error('لم تحدد الإدارة توقيت التجديد لهذه الشركة.');
      const sub = D.activeSubscription(db, n.id); if (!sub || sub.customerId !== customerId) throw new Error('التجديد التلقائي متاح لصاحب اشتراك سارٍ فقط.');
      const p = db.protectionPackages.find(x => x.id === packageId && x.companyId === n.companyId && x.active !== false); if (!p) throw new Error('اختر باقة حماية متاحة لشركة الرقم.');
      c.optIns[numberId] = { customerId, packageId: p.id, enabled: true, enabledAt: D.now() }; put(db, c);
      return { entityType: 'autorenew_optin', entityId: numberId, summary: `تفعيل التجديد التلقائي للرقم ${n.number} بباقة ${p.name}`, details: { packageId: p.id } };
    });
  }

  /* ----- الأهلية (62 و84): تُحسب من البيانات وقت التقييم، ولا تعتمد على حالة محفوظة ----- */
  function check(db, numberId, X, at = Date.now()) {
    const o = cfg(db).optIns[numberId];
    if (!o || o.enabled !== true) return { eligible: false, code: 'off', reason: 'غير مفعّل لهذا الرقم.' };
    const n = db.numbers.find(x => x.id === numberId); if (!n) return { eligible: false, code: 'number', reason: 'الرقم غير موجود.' };
    if (!companyAllowed(db, n.companyId)) return { eligible: false, code: 'company', reason: 'لم يعد التجديد التلقائي مسموحًا لهذه الشركة.' };
    const cc = classCfg(X, db, n.companyId), target = arr(cc.classes).find(k => k.id === cc.autoRenewClassId);
    if (!target) return { eligible: false, code: 'class', reason: 'لا يوجد تصنيف مربوط بالتجديد التلقائي.' };
    const sub = D_activeFor(db, n.id, at); if (!sub || sub.customerId !== o.customerId) return { eligible: false, code: 'sub', reason: 'لا يوجد اشتراك ساريٍ باسم صاحب التفعيل.' };
    const remaining = remainingDays(sub, at), cur = classOf(cc.classes, remaining);
    if (!cur || cur.id !== target.id) return { eligible: false, code: 'wait', reason: 'لم يدخل الاشتراك تصنيف التجديد بعد.', remaining, sub };
    const p = db.protectionPackages.find(x => x.id === o.packageId && x.companyId === n.companyId && x.active !== false);
    if (!p) return { eligible: false, code: 'package', reason: 'الباقة المختارة لم تعد متاحة.', sub, remaining };
    return { eligible: true, code: 'ready', reason: 'مؤهل للتجديد الآن.', sub, remaining, optIn: o, package: p, key: keyOf(sub), cost: Number(p.pointsCost) };
  }
  // نسخة مستقلة من activeSubscription (لا اعتماد على D داخل الدالة النقية)
  function D_activeFor(db, numberId, at) {
    return db.subscriptions.filter(s => s.numberId === numberId && s.status === 'active' && new Date(s.startsAt || 0).getTime() <= at && new Date(s.endsAt).getTime() > at).sort((a, b) => new Date(b.endsAt) - new Date(a.endsAt))[0] || null;
  }

  /* ----- التنفيذ (84) ----- */
  async function logEntry(D, entry) {
    await D.transact('autorenew', null, db => { const c = cfg(db); c.log.push({ id: D.uid('arlog'), at: D.now(), ...entry }); put(db, c); });
  }
  async function run(D, X, at = Date.now()) {
    const snap = D.read(), out = { renewed: 0, failed: 0, waiting: 0, skipped: 0, details: [] };
    for (const numberId of Object.keys(cfg(snap).optIns)) {
      const db = D.read(), r = check(db, numberId, X, at), num = db.numbers.find(x => x.id === numberId);
      if (!r.eligible) { if (r.code === 'wait' || r.code === 'off') out.waiting++; else out.skipped++; continue; }
      const already = cfg(db).log.some(l => l.key === r.key && l.result === 'renewed');
      if (already) { out.skipped++; continue; }
      const customerId = r.optIn.customerId;
      const balance = D.balance(customerId, db);
      try {
        if (balance < r.cost) throw new Error('رصيد أمان غير كافٍ للتجديد التلقائي.');
        await D.performProtectionOperation(customerId, numberId, r.package.id, 'extend', r.key);
        await logEntry(D, { numberId, customerId, subscriptionId: r.sub.id, key: r.key, result: 'renewed', message: `مُدّد الرقم ${num?.number} بباقة ${r.package.name} وخُصمت ${r.cost} نقطة.` });
        out.renewed++; out.details.push({ numberId, ok: true });
      } catch (e) {
        const msg = String(e?.message || 'تعذر التجديد التلقائي.'), first = !cfg(D.read()).log.some(l => l.key === r.key && l.result === 'failed' && l.message === msg);
        if (first) {
          await logEntry(D, { numberId, customerId, subscriptionId: r.sub.id, key: r.key, result: 'failed', message: msg });
          await D.transact('autorenew', null, d2 => { d2.notifications.unshift({ id: D.uid('notice'), customerId, numberId, title: 'تعذر التجديد التلقائي', body: `لم يُجدَّد الرقم ${num?.number} تلقائيًا: ${msg} لم تُخصم أي نقاط.`, status: 'delivered-local', createdAt: D.now(), readAt: null }); });
        }
        out.failed++; out.details.push({ numberId, ok: false, message: msg });
      }
    }
    return out;
  }

  /* ----- العرض ----- */
  // شارة التجديد التلقائي (29): لا تظهر إلا إن كانت الشركة مسموحة والعميل مفعّلها فعلًا
  const badgeFor = (db, numberId, customerId) => { const o = cfg(db).optIns[numberId]; const n = db.numbers.find(x => x.id === numberId); return !!(o && o.enabled === true && o.customerId === customerId && n && companyAllowed(db, n.companyId)); };
  const logList = (db, limit = 50) => cfg(db).log.slice().reverse().slice(0, limit);

  return { cfg, companyAllowed, classOf, remainingDays, keyOf, setCompanyAllowed, setOptIn, check, run, badgeFor, logList };
});
