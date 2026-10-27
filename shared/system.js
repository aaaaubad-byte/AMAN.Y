/* AMAN — منطق النظام (U13: بنود 76–81 و102 و103 و109): فحوص سلامة البيانات، استيراد نسخة احتياطية بمعاينة وتعارضات،
   حالة النظام، سلة المحذوفات، سجل تغييرات الإعدادات، كلمة مرور الإدارة، مطابقة المدفوعات، تتبع النسخ اليدوي والتذكير.
   فوق AmanData.transact بلا تعديل على shared/data.js. كل ما يُخزَّن هنا تحت settings (لا يصل إلى نسخة العميل).
   حدود موثقة: لا نسخ دوري تلقائي (تذكير + تتبع آخر تصدير يدوي)؛ سجل التدقيق محلي وقابل للتعديل من أدوات المتصفح (109). */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.AmanSystem = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const COLLECTIONS = ['customers', 'companies', 'packages', 'protectionPackages', 'paymentMethods', 'purchaseRequests', 'numbers', 'numberLinks', 'subscriptions', 'protectionOperations', 'pointTransactions', 'tasks', 'operations', 'financeEntries', 'notifications', 'idempotencyKeys'];
  const EXTRA = ['internalNotes', 'messageTemplates'];
  const SETTINGS_TYPES = ['company_saved', 'package_saved', 'protection_package_saved', 'payment_method_saved', 'task_settings_saved', 'content_updated', 'customer_classes_saved', 'expiry_class_saved', 'expiry_class_deleted', 'expiry_autorenew_class_saved', 'autorenew_company_saved', 'promotion_saved', 'promotion_deleted', 'coupon_saved', 'coupon_deleted', 'admin_setting_changed', 'template_saved', 'template_deleted', 'daily_close', 'daily_close_reopened', 'backup_imported', 'admin_password_changed', 'backup_reminder_saved', 'trash_restored'];
  const MAX_IMPORT = 20 * 1024 * 1024, TRASH_MAX = 100, PASSWORD_MIN = 8;
  const arr = x => (Array.isArray(x) ? x : []);
  const setSettings = (db, patch) => { db.settings = { ...(db.settings || {}), ...patch }; };

  /* ----- فحوص السلامة (بند 77) ----- */
  function checkIntegrity(db) {
    const out = [], add = (level, code, message, ref) => out.push({ level, code, message, ref: ref || null });
    const ids = n => new Set(arr(db[n]).map(x => x && x.id));
    for (const c of COLLECTIONS) { const s = new Set(); for (const x of arr(db[c])) { if (!x || !x.id) add('error', 'id-missing', `سجل بلا معرّف في ${c}.`); else if (s.has(x.id)) add('error', 'id-dup', `معرّف مكرر في ${c}.`, x.id); else s.add(x.id); } }
    const cust = ids('customers'), nums = ids('numbers'), cos = ids('companies'), subs = ids('subscriptions');
    for (const n of arr(db.numbers)) { if (!cos.has(n.companyId)) add('error', 'number-company', `الرقم ${n.number} بشركة غير موجودة.`, n.id); if (n.customerId && !cust.has(n.customerId)) add('error', 'number-customer', `الرقم ${n.number} بعميل غير موجود.`, n.id); }
    for (const l of arr(db.numberLinks)) if (!nums.has(l.numberId) || !cust.has(l.customerId)) add('error', 'link-orphan', 'ربط رقم بسجل غير موجود.', l.id);
    for (const s of arr(db.subscriptions)) {
      if (!cust.has(s.customerId) || !nums.has(s.numberId) || !cos.has(s.companyId)) add('error', 'sub-orphan', 'اشتراك بعلاقة غير موجودة.', s.id);
      if (!(new Date(s.endsAt) > new Date(s.startsAt))) add('error', 'sub-dates', 'اشتراك نهايته لا تلي بدايته.', s.id);
    }
    for (const t of arr(db.tasks)) if (!subs.has(t.subscriptionId)) add('error', 'task-orphan', 'مهمة باشتراك غير موجود.', t.id);
    const bal = new Map();
    for (const x of arr(db.pointTransactions)) { if (!cust.has(x.customerId)) add('error', 'tx-orphan', 'حركة نقاط بعميل غير موجود.', x.id); bal.set(x.customerId, (bal.get(x.customerId) || 0) + (x.type === 'credit' ? 1 : -1) * Number(x.points || 0)); }
    for (const [id, v] of bal) if (v < 0) add('error', 'balance-negative', 'رصيد نقاط سالب.', id);
    for (const op of arr(db.protectionOperations)) { const tx = arr(db.pointTransactions).filter(t => t.source === 'protection_operation' && t.sourceId === op.id); if (tx.length !== 1 || tx[0].type !== 'debit' || Number(tx[0].points) !== Number(op.pointsCost)) add('error', 'op-debit', 'عملية حماية بخصم نقاط غير متسق.', op.id); }
    for (const r of arr(db.purchaseRequests)) {
      if (!cust.has(r.customerId)) add('error', 'req-orphan', 'طلب بلا عميل.', r.id);
      const tx = arr(db.pointTransactions).some(t => t.source === 'purchase' && t.sourceId === r.id), fin = arr(db.financeEntries).some(f => f.sourceType === 'purchase' && f.sourceId === r.id && f.kind === 'revenue');
      if (r.status === 'approved' && !tx) add('error', 'req-no-points', 'طلب معتمد بلا حركة نقاط.', r.id);
      if (r.status === 'approved' && !fin) add('error', 'req-no-revenue', 'طلب معتمد بلا قيد إيراد.', r.id);
      if (r.status !== 'approved' && (tx || fin)) add('error', 'req-unapproved-effects', 'طلب غير معتمد له نقاط أو إيراد.', r.id);
    }
    for (const t of arr(db.tasks)) if (t.status === 'executed' && !arr(db.financeEntries).some(f => f.sourceType === 'task' && f.sourceId === t.id)) add('error', 'task-no-expense', 'مهمة منفذة بلا قيد مصروف.', t.id);
    const rev = new Set();
    for (const f of arr(db.financeEntries)) {
      if (!(Number(f.amount) > 0)) add('error', 'fin-amount', 'قيد مالي بمبلغ غير موجب.', f.id);
      if (['purchase', 'task'].includes(f.sourceType) && f.sourceId) { const dup = arr(db.financeEntries).filter(x => x.sourceType === f.sourceType && x.sourceId === f.sourceId && x.kind === f.kind).length; if (dup > 1) add('error', 'fin-dup-source', 'قيد مصدر مكرر.', f.id); }
      if (f.sourceType === 'reversal') {
        const oid = f.reversalOf || f.sourceId, o = arr(db.financeEntries).find(x => x.id === oid);
        if (!o || o.sourceType === 'reversal' || Number(o.amount) !== Number(f.amount) || o.kind === f.kind) add('error', 'fin-reversal', 'قيد عكسي غير متسق مع أصله.', f.id);
        if (rev.has(oid)) add('error', 'fin-reversal-twice', 'قيد معكوس أكثر من مرة.', oid); rev.add(oid);
      }
    }
    for (const co of Object.keys(db.settings?.expiryClasses?.byCompany || {})) if (!cos.has(co)) add('warn', 'expiry-company', 'إعداد تصنيفات لشركة غير موجودة.', co);
    return out;
  }

  /* ----- حالة النظام (بند 76) ----- */
  function systemStatus(db) {
    const counts = Object.fromEntries(COLLECTIONS.map(c => [c, arr(db[c]).length]));
    let bytes = 0; try { bytes = new TextEncoder().encode(JSON.stringify(db)).length; } catch { bytes = 0; }
    const issues = checkIntegrity(db);
    return { schemaVersion: db.schemaVersion, revision: db.revision, updatedAt: db.updatedAt, bytes, counts, errors: issues.filter(i => i.level === 'error').length, warnings: issues.filter(i => i.level === 'warn').length, trash: arr(db.settings?.trash).length };
  }

  /* ----- استيراد نسخة احتياطية بمعاينة وتعارضات (بند 78) ----- */
  function parseBackup(text) {
    if (typeof text !== 'string' || !text.trim()) throw new Error('الملف فارغ.');
    if (text.length > MAX_IMPORT) throw new Error('الملف أكبر من الحد المسموح (20 ميغابايت).');
    let o; try { o = JSON.parse(text); } catch { throw new Error('الملف ليس JSON صالحًا.'); }
    if (!o || typeof o !== 'object' || Array.isArray(o)) throw new Error('جذر الملف ليس كائنًا صالحًا.');
    if (Number(o.schemaVersion) !== 2) throw new Error('إصدار بنية النسخة غير مدعوم (المطلوب 2).');
    for (const c of [...COLLECTIONS, ...EXTRA]) {
      if (o[c] === undefined) continue;
      if (!Array.isArray(o[c])) throw new Error(`بنية ${c} في الملف غير صالحة.`);
      for (const x of o[c]) if (!x || typeof x !== 'object' || !x.id) throw new Error(`سجل بلا معرّف في ${c}.`);
    }
    return o;
  }
  function previewImport(db, text) {
    const o = parseBackup(text), rows = [];
    for (const name of [...COLLECTIONS, ...EXTRA]) {
      const cur = new Map(arr(db[name]).map(x => [x.id, x])); let added = 0, same = 0, conflicts = 0; const conflictIds = [];
      for (const x of arr(o[name])) { const e = cur.get(x.id); if (!e) added++; else if (JSON.stringify(e) === JSON.stringify(x)) same++; else { conflicts++; if (conflictIds.length < 20) conflictIds.push(x.id); } }
      if (arr(o[name]).length || cur.size) rows.push({ name, incoming: arr(o[name]).length, current: cur.size, added, same, conflicts, conflictIds });
    }
    return { revision: o.revision, updatedAt: o.updatedAt, rows, totals: rows.reduce((t, r) => ({ incoming: t.incoming + r.incoming, added: t.added + r.added, same: t.same + r.same, conflicts: t.conflicts + r.conflicts }), { incoming: 0, added: 0, same: 0, conflicts: 0 }) };
  }
  // merge: يضيف الجديد؛ التعارض (معرّف موجود بمحتوى مختلف) يُبقي الحالي أو يستبدله حسب conflicts. replace: يستبدل المجموعات كلها بالنسخة.
  // التحقق الشامل (D.transact → validate) يمنع حفظ أي نتيجة غير متسقة، فيفشل الاستيراد كله بلا أثر.
  async function importBackup(D, adminId, text, opts = {}) {
    const o = parseBackup(text), mode = opts.mode === 'replace' ? 'replace' : 'merge', overwrite = opts.conflicts === 'overwrite';
    return D.transact(adminId, 'backup_imported', db => {
      let added = 0, overwritten = 0, kept = 0;
      if (mode === 'replace') {
        for (const c of [...COLLECTIONS, ...EXTRA]) if (o[c] !== undefined || c === 'operations') db[c] = arr(o[c]);
        if (o.content && typeof o.content === 'object') db.content = { ...db.content, ...o.content };
        if (o.notificationSettings && typeof o.notificationSettings === 'object') db.notificationSettings = { ...db.notificationSettings, ...o.notificationSettings };
        if (o.settings && typeof o.settings === 'object') db.settings = { ...o.settings };
        added = COLLECTIONS.reduce((s, c) => s + arr(o[c]).length, 0);
      } else {
        for (const c of [...COLLECTIONS, ...EXTRA]) {
          if (c === 'operations') continue;
          const list = arr(db[c]); db[c] = list;
          for (const x of arr(o[c])) {
            const i = list.findIndex(y => y.id === x.id);
            if (i < 0) { list.push(x); added++; } else if (JSON.stringify(list[i]) !== JSON.stringify(x)) { if (overwrite) { list[i] = x; overwritten++; } else kept++; }
          }
        }
      }
      return { entityType: 'backup', entityId: null, summary: `${mode === 'replace' ? 'استبدال كامل' : 'دمج'} نسخة احتياطية: ${added} مضاف، ${overwritten} مستبدل، ${kept} تعارض أُبقي الحالي`, details: { mode, added, overwritten, kept, sourceRevision: o.revision ?? null } };
    });
  }

  /* ----- تتبع النسخ اليدوي والتذكير (بند 102) ----- */
  const backupInfo = db => ({ lastAt: db.settings?.backup?.lastAt || null, reminderDays: db.settings?.backup?.reminderDays ?? null });
  function backupStatus(db, at = Date.now()) {
    const b = backupInfo(db), days = b.lastAt ? Math.floor((at - new Date(b.lastAt).getTime()) / 86400000) : null;
    return { ...b, daysSince: days, due: b.reminderDays ? (days === null || days >= b.reminderDays) : false };
  }
  async function markBackup(D, adminId, at = Date.now()) {
    return D.transact(adminId, 'backup_exported', db => { setSettings(db, { backup: { ...(db.settings?.backup || {}), lastAt: new Date(at).toISOString() } }); return { entityType: 'backup', entityId: null, summary: 'تصدير نسخة احتياطية يدوية' }; });
  }
  async function saveBackupReminder(D, adminId, days) {
    const v = days === null || days === undefined || String(days).trim() === '' ? null : Number(days);
    if (v !== null && (!Number.isInteger(v) || v < 1 || v > 365)) throw new Error('مدة التذكير عدد صحيح بين 1 و365 أو فارغ للتعطيل.');
    return D.transact(adminId, 'backup_reminder_saved', db => { const before = backupInfo(db).reminderDays; setSettings(db, { backup: { ...(db.settings?.backup || {}), reminderDays: v } }); return { entityType: 'settings', entityId: 'backup', summary: v ? `تذكير النسخ الاحتياطي كل ${v} يومًا` : 'تعطيل تذكير النسخ الاحتياطي', details: { before, after: v } }; });
  }

  /* ----- سلة المحذوفات (بند 79): تُلتقط عناصر الإعداد المحذوفة وتُستعاد منها ----- */
  const trashList = db => arr(db.settings?.trash).slice().sort((a, b) => new Date(b.deletedAt) - new Date(a.deletedAt));
  async function trashPush(D, adminId, kind, label, item, extra = {}) {
    return D.transact(adminId, null, db => {
      const list = arr(db.settings?.trash).slice(); list.push({ id: D.uid('trash'), kind, label: String(label || ''), item, ...extra, deletedAt: D.now(), deletedBy: adminId });
      setSettings(db, { trash: list.slice(-TRASH_MAX) });
    });
  }
  async function trashRestore(D, adminId, trashId, X) {
    const t = trashList(D.read()).find(x => x.id === trashId);
    if (!t) throw new Error('العنصر غير موجود في السلة.');
    if (t.kind === 'expiryClass') {
      await X.saveClass(D, adminId, t.companyId, { name: t.item.name, upToDays: t.item.upToDays, notify: t.item.notify, noticeText: t.item.noticeText });
    }
    return D.transact(adminId, 'trash_restored', db => {
      if (t.kind === 'template') { if (db.messageTemplates.some(x => x.id === t.item.id)) throw new Error('القالب موجود بالفعل.'); db.messageTemplates.push(t.item); }
      else if (t.kind === 'note') { if (db.internalNotes.some(x => x.id === t.item.id)) throw new Error('الملاحظة موجودة بالفعل.'); if (!['customer', 'number', 'request'].includes(t.item.entityType)) throw new Error('نوع الملاحظة غير صالح.'); db.internalNotes.push(t.item); }
      else if (t.kind !== 'expiryClass') throw new Error('نوع العنصر غير قابل للاستعادة.');
      setSettings(db, { trash: arr(db.settings?.trash).filter(x => x.id !== trashId) });
      return { entityType: t.kind, entityId: t.item.id || null, summary: `استعادة «${t.label}» من سلة المحذوفات` };
    });
  }
  async function trashPurge(D, adminId, trashId) {
    return D.transact(adminId, 'trash_purged', db => { const n = arr(db.settings?.trash).length; setSettings(db, { trash: arr(db.settings?.trash).filter(x => x.id !== trashId) }); if (arr(db.settings?.trash).length === n) throw new Error('العنصر غير موجود في السلة.'); return { entityType: 'trash', entityId: trashId, summary: 'حذف نهائي من سلة المحذوفات' }; });
  }

  /* ----- سجل تغييرات الإعدادات (بند 80) ----- */
  const settingsLog = (db, limit = 100) => arr(db.operations).filter(o => SETTINGS_TYPES.includes(o.type)).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, limit);

  /* ----- كلمة مرور الإدارة (بند 81): PBKDF2 في المتصفح؛ لا تُخزَّن نصًا صريحًا ولا تُسجَّل ----- */
  const b64 = u => btoa(String.fromCharCode(...new Uint8Array(u))), unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  async function derive(pw, salt, iter) {
    const key = await globalThis.crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']);
    return new Uint8Array(await globalThis.crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, key, 256));
  }
  async function hashPassword(pw) {
    if (typeof pw !== 'string' || pw.length < PASSWORD_MIN) throw new Error(`كلمة مرور الإدارة ${PASSWORD_MIN} خانات على الأقل.`);
    const salt = globalThis.crypto.getRandomValues(new Uint8Array(16)), it = 100000;
    return `pbkdf2$${it}$${b64(salt)}$${b64(await derive(pw, salt, it))}`;
  }
  async function verifyPassword(pw, rec) {
    const [k, it, s, h] = String(rec || '').split('$');
    if (k !== 'pbkdf2' || !it || !s || !h) return false;
    return b64(await derive(String(pw), unb64(s), Number(it))) === h;
  }
  const adminHash = db => db.settings?.adminAuth?.hash || null;
  async function setAdminPassword(D, adminId, record) {
    if (!String(record || '').startsWith('pbkdf2$')) throw new Error('تجزئة كلمة المرور غير صالحة.');
    return D.transact(adminId, 'admin_password_changed', db => { setSettings(db, { adminAuth: { hash: record, changedAt: D.now() } }); return { entityType: 'admin', entityId: adminId, summary: 'تغيير كلمة مرور الإدارة' }; });
  }

  /* ----- مطابقة المدفوعات (بند 103): طلبات الشراء مقابل قيود الإيراد، لكل وسيلة دفع ----- */
  function reconcile(db, from, to, dayKey) {
    const inR = r => { const k = dayKey(r.createdAt); return k && k >= from && k <= to; };
    const entries = arr(db.financeEntries), reversed = new Set(entries.filter(f => f.sourceType === 'reversal').map(f => f.reversalOf || f.sourceId));
    const methods = new Map(), issues = [];
    const slot = r => { const id = r.paymentMethodId || 'unknown'; if (!methods.has(id)) methods.set(id, { id, name: r.paymentMethodSnapshot?.name || 'وسيلة غير معروفة', pending: { n: 0, amount: 0 }, approved: { n: 0, amount: 0 }, rejected: { n: 0, amount: 0 }, cancelled: { n: 0, amount: 0 }, revenue: 0 }); return methods.get(id); };
    const refs = new Map();
    for (const r of arr(db.purchaseRequests).filter(inR)) {
      const m = slot(r), s = m[r.status] || (m[r.status] = { n: 0, amount: 0 }), price = Number(r.packageSnapshot?.price) || 0;
      s.n++; s.amount += price;
      const rk = `${r.paymentMethodId}|${String(r.paymentReference || '').trim().toLowerCase()}`; refs.set(rk, [...(refs.get(rk) || []), r.id]);
      if (r.status === 'approved') {
        const fin = entries.filter(f => f.sourceType === 'purchase' && f.sourceId === r.id && f.kind === 'revenue');
        if (!fin.length) issues.push({ code: 'no-revenue', requestId: r.id, message: 'طلب معتمد بلا قيد إيراد.' });
        for (const f of fin) { if (reversed.has(f.id)) issues.push({ code: 'reversed', requestId: r.id, message: 'قيد إيراد الطلب معكوس.' }); else { m.revenue += Number(f.amount); if (Number(f.amount) !== price) issues.push({ code: 'amount', requestId: r.id, message: `قيمة الإيراد ${f.amount} تخالف سعر الباقة ${price}.` }); } }
      } else if (entries.some(f => f.sourceType === 'purchase' && f.sourceId === r.id)) issues.push({ code: 'unapproved-revenue', requestId: r.id, message: 'قيد إيراد لطلب غير معتمد.' });
    }
    for (const [k, list] of refs) if (list.length > 1 && !k.endsWith('|')) for (const id of list) issues.push({ code: 'dup-ref', requestId: id, message: 'مرجع دفع مكرر بالوسيلة نفسها.' });
    const rows = [...methods.values()].map(m => ({ ...m, diff: m.approved.amount - m.revenue })).sort((a, b) => a.name.localeCompare(b.name, 'ar'));
    return { rows, issues, totals: rows.reduce((t, m) => ({ approved: t.approved + m.approved.amount, revenue: t.revenue + m.revenue }), { approved: 0, revenue: 0 }) };
  }

  return { COLLECTIONS, SETTINGS_TYPES, PASSWORD_MIN, checkIntegrity, systemStatus, parseBackup, previewImport, importBackup, backupStatus, markBackup, saveBackupReminder, trashList, trashPush, trashRestore, trashPurge, settingsLog, hashPassword, verifyPassword, adminHash, setAdminPassword, reconcile };
});
