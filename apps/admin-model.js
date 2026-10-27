/* AMAN Admin — اشتقاقات العرض من بيانات المخزن المحلي. دوال نقية بلا كتابة ولا DOM.
   القواعد منقولة من واجهة الإدارة الأصلية كما هي: أهلية المهمة، تصنيفها، المشترك، صافي السجل المالي. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.AmanAdminModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const STATUS = { pending: 'معلق', approved: 'معتمد', rejected: 'مرفوض', planned: 'مخطط', due: 'مستحق', executed: 'منفذ', active: 'فعال', expired: 'منتهٍ', extended: 'ممدد', cancelled: 'ملغاة' };
  const status = s => STATUS[s] || s;
  const tone = s => ({ approved: 'ok', active: 'ok', executed: 'ok', rejected: 'bad', expired: 'bad', cancelled: 'bad', pending: 'warn', due: 'warn' })[s] || '';

  const company = (d, id) => d.companies.find(c => c.id === id);
  const customer = (d, id) => d.customers.find(c => c.id === id);
  const number = (d, id) => d.numbers.find(n => n.id === id);
  const finance = d => {
    const rev = d.financeEntries.filter(x => x.kind === 'revenue').reduce((s, x) => s + Number(x.amount), 0);
    const exp = d.financeEntries.filter(x => x.kind === 'expense').reduce((s, x) => s + Number(x.amount), 0);
    return { revenue: rev, expense: exp, net: rev - exp };
  };

  /* ----- المهام ----- */
  const firstTask = (d, t) => d.tasks.filter(x => x.subscriptionId === t.subscriptionId && ['due', 'planned'].includes(x.status)).sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt))[0];
  const isDue = (t, d) => firstTask(d, t)?.id === t.id && new Date(t.dueAt) <= Date.now();
  const canExecute = (d, t, D) => {
    if (!['due', 'planned'].includes(t.status)) return false;
    const first = firstTask(d, t);
    if (first?.id !== t.id || new Date(t.visibleAt || t.dueAt) > Date.now()) return false;
    const sub = d.subscriptions.find(x => x.id === t.subscriptionId), cfg = company(d, t.companyId)?.taskSchedule || {};
    return !sub || (new Date(sub.startsAt || 0) <= Date.now() && (new Date(sub.endsAt) > Date.now() || (cfg.allowDuringGrace === true && Date.now() <= new Date(D.datePlus(sub.endsAt, Number(cfg.graceDays || 0))).getTime())));
  };
  // التصنيف الموحد للفلاتر: completed | cancelled | early | due | planned (لا توجد حالة «متأخرة» بقرار المالك: بنود 35 و99)
  const taskClass = (t, d, D) => {
    if (t.status === 'executed') return 'completed';
    if (t.status === 'cancelled') return 'cancelled';
    if (canExecute(d, t, D) && new Date(t.dueAt) > Date.now()) return 'early';
    if (isDue(t, d)) return 'due';
    return 'planned';
  };
  const TASK_LABEL = { completed: 'مكتملة', cancelled: 'ملغاة', early: 'متاحة للتنفيذ المبكر', due: 'مستحقة', planned: 'قادمة' };
  const TASK_TONE = { completed: 'ok', cancelled: 'bad', early: '', due: 'warn', planned: '' };
  const taskLabel = (t, d, D) => TASK_LABEL[taskClass(t, d, D)];
  // المتاحة الآن: ما كانت تعرضه شاشة «المهام المستحقة» الأصلية (مفتوحة وإما مستحقة أو قابلة للتنفيذ المبكر)
  const taskAvailableNow = (t, d, D) => ['due', 'planned'].includes(t.status) && (isDue(t, d) || canExecute(d, t, D));

  /* ----- ترتيب المهام وتجميعها بشركة الاتصالات (بند 52) والانتقال للتالية (بند 23) ----- */
  // مضى على الموعد: وصف محايد للمدة فقط، لا حالة ولا لون إنذار (بنود 35 و99)
  const elapsedText = ms => {
    if (!(ms > 0)) return '';
    const h = Math.floor(ms / 3600000);
    if (h < 1) return 'منذ أقل من ساعة';
    if (h < 48) return `منذ ${h} ساعة`;
    return `منذ ${Math.floor(h / 24)} يومًا`;
  };
  const sinceDue = t => ['due', 'planned'].includes(t.status) && new Date(t.dueAt) <= Date.now() ? elapsedText(Date.now() - new Date(t.dueAt).getTime()) : '';
  const companyName = (d, t) => company(d, t.companyId)?.name || 'شركة غير محددة';
  // الأقدم استحقاقًا أولًا ضمن كل شركة؛ الشركات بترتيب الاسم
  const byCompanyThenDue = d => (a, b) => companyName(d, a).localeCompare(companyName(d, b), 'ar') || new Date(a.dueAt) - new Date(b.dueAt);
  const groupByCompany = (tasks, d, cmp) => {
    const sorted = [...tasks].sort(cmp || byCompanyThenDue(d)), groups = [];
    for (const t of sorted) { const name = companyName(d, t); let g = groups.find(x => x.name === name); if (!g) groups.push(g = { name, companyId: t.companyId, tasks: [] }); g.tasks.push(t); }
    return groups;
  };
  // المهام الجاهزة للتنفيذ الآن بترتيب التجميع نفسه الذي يراه المدير
  const availableOrder = (d, D) => d.tasks.filter(t => taskAvailableNow(t, d, D)).sort(byCompanyThenDue(d));
  // «التالية» = المهمة الجاهزة التي تلي الحالية في الترتيب؛ لا تُنفَّذ تلقائيًا
  const nextAvailableAfter = (d, D, id) => { const list = availableOrder(d, D), i = list.findIndex(t => t.id === id); return (i < 0 ? list : list.slice(i + 1).concat(list.slice(0, i))).find(t => t.id !== id) || null; };
  // مهام مرّ موعدها ولم يُسجَّل تنفيذها (بند 99): غياب التسجيل لا يعني بالضرورة أن السداد لم يحدث
  const unrecordedTasks = (d, D) => d.tasks.filter(t => ['due', 'planned'].includes(t.status) && new Date(t.dueAt) <= Date.now() && isDue(t, d)).sort(byCompanyThenDue(d));

  /* ----- الاشتراك والأرقام ----- */
  const isLive = s => !!s && s.status === 'active' && new Date(s.startsAt || 0) <= new Date() && new Date(s.endsAt) > Date.now();
  const initials = name => String(name || '؟').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('') || '؟';

  /* ----- العملاء: شارات وسجل زمني ونسخ (U10: بنود 25، 33، 50، 53، 74، 75) ----- */
  const CUSTOMER_STATUS = { active: 'فعال', suspended: 'موقوف', blocked: 'محظور', deleted: 'محذوف' };
  const RESTRICTION_LABEL = { login: 'تسجيل الدخول', purchase: 'شراء النقاط', protection: 'خدمات الحماية' };
  const APPROVED = ['approved', 'معتمد', 'مكتملة'];
  const PREMIUM_TAG = 'مميز';
  const approvedOrders = (d, id) => d.purchaseRequests.filter(r => r.customerId === id && APPROVED.includes(r.status)).length;
  const hasTag = (c, tag) => (c.tags || []).some(t => String(t).toLocaleLowerCase() === String(tag).toLocaleLowerCase());
  // مشترك = اعتُمد له طلب شراء نقاط واحد على الأقل؛ مستخدم = غير ذلك (قرار المالك)
  const customerKind = (d, c) => approvedOrders(d, c.id) > 0 ? 'subscriber' : 'user';
  const kindLabel = k => k === 'subscriber' ? 'مشترك' : 'مستخدم';
  // «جديد» و«مميز» بإعدادات إدارية: القيمة الفارغة = معطّل؛ «مميز» أيضًا بوسم يدوي
  const isNewCustomer = (d, c) => {
    const days = Number(d.settings?.customerClasses?.newWithinDays), at = new Date(c.createdAt).getTime();
    return Number.isInteger(days) && days > 0 && Number.isFinite(at) && Date.now() - at <= days * 86400000 && c.status !== 'deleted';
  };
  const isPremiumCustomer = (d, c) => {
    const min = Number(d.settings?.customerClasses?.premiumMinApprovedOrders);
    return hasTag(c, PREMIUM_TAG) || (Number.isInteger(min) && min > 0 && approvedOrders(d, c.id) >= min);
  };
  const customerBadges = (d, c) => {
    const out = [];
    if (c.status === 'blocked') out.push({ key: 'blocked', label: 'محظور', tone: 'bad' });
    else if (c.status === 'suspended') out.push({ key: 'suspended', label: 'موقوف', tone: 'warn' });
    else if (c.status === 'deleted') out.push({ key: 'deleted', label: 'محذوف', tone: 'bad' });
    const kind = customerKind(d, c);
    out.push({ key: kind, label: kindLabel(kind), tone: kind === 'subscriber' ? 'ok' : '' });
    if (isNewCustomer(d, c)) out.push({ key: 'new', label: 'جديد', tone: '' });
    if (isPremiumCustomer(d, c)) out.push({ key: 'premium', label: 'مميز', tone: 'ok' });
    return out;
  };
  const restrictionList = (c, D) => { const r = D.restrictionsOf(c); return Object.keys(RESTRICTION_LABEL).filter(k => r[k]).map(k => RESTRICTION_LABEL[k]); };
  // السجل الزمني من السجلات الفعلية فقط، الأحدث أولًا. ملاحظة: الاشتراكات التي لها عملية حماية تُعرض مرة واحدة عبر العملية.
  const customerTimeline = (d, id) => {
    const c = customer(d, id), ev = [], num = nid => number(d, nid)?.number || 'رقم غير معروف';
    if (!c) return ev;
    const push = (at, kind, icon, title, sub = '', tone = '') => { if (at && Number.isFinite(new Date(at).getTime())) ev.push({ at, kind, icon, title, sub, tone }); };
    push(c.createdAt, 'signup', 'user', 'تسجيل الحساب');
    for (const r of d.purchaseRequests.filter(x => x.customerId === id)) {
      const name = r.packageSnapshot?.name || 'باقة';
      push(r.createdAt, 'request', 'receipt', `طلب نقاط: ${name}`, `المرجع ${r.paymentReference || '—'}`, 'warn');
      if (r.reviewedAt && r.status === 'approved') push(r.reviewedAt, 'approved', 'check', `اعتماد طلب: ${name}`, `${r.packageSnapshot?.points ?? 0} نقطة`, 'ok');
      if (r.reviewedAt && r.status === 'rejected') push(r.reviewedAt, 'rejected', 'close', `رفض طلب: ${name}`, r.reviewNote || '', 'bad');
      if (r.cancelledAt) push(r.cancelledAt, 'cancelled', 'close', `إلغاء طلب: ${name}`, r.cancelledBy === 'customer' ? 'بطلب العميل' : '', 'bad');
    }
    const TYPE = { subscribe: 'اشتراك حماية', extend: 'تمديد حماية', renew: 'تجديد حماية' };
    const opSubs = new Set(d.protectionOperations.map(o => o.subscriptionId));
    for (const o of d.protectionOperations.filter(x => x.customerId === id)) push(o.createdAt, 'protection', 'shield', `${TYPE[o.type] || 'عملية حماية'} للرقم ${num(o.numberId)}`, `${o.pointsCost} نقطة`, 'ok');
    for (const s of d.subscriptions.filter(x => x.customerId === id && !opSubs.has(x.id))) push(s.createdAt, 'subscription', 'shield', `${s.previousSubscriptionId ? 'تمديد' : 'تفعيل'} اشتراك الرقم ${num(s.numberId)}`, `${s.pointsCost ?? 0} نقطة`, 'ok');
    for (const t of d.tasks.filter(x => x.customerId === id && x.status === 'executed')) push(t.executedAt, 'task', 'tasks', `تنفيذ مهمة للرقم ${num(t.numberId)}`, '', '');
    for (const o of d.operations) {
      const det = o.details || {};
      if (o.type === 'customer_status_changed' && o.entityId === id) push(o.createdAt, 'status', 'lock', `تغيّر الحالة: ${CUSTOMER_STATUS[det.from] || det.from || '—'} ← ${CUSTOMER_STATUS[det.to] || det.to || '—'}`, [det.reason, (det.to === 'suspended' ? Object.keys(RESTRICTION_LABEL).filter(k => det.restrictions?.[k]).map(k => RESTRICTION_LABEL[k]).join('، ') : '')].filter(Boolean).join(' · '), det.to === 'active' ? 'ok' : 'bad');
      else if (['customer_tags_added', 'customer_tag_removed'].includes(o.type) && (det.customerIds || []).includes(id)) push(o.createdAt, 'tag', 'text', `${o.type === 'customer_tags_added' ? 'إضافة' : 'إزالة'} وسم «${det.tag}»`);
      else if (o.type === 'password_changed' && o.entityId === id) push(o.createdAt, 'password', 'lock', 'تغيير كلمة المرور');
      else if (o.type === 'account_deleted' && o.entityId === id) push(o.createdAt, 'deleted', 'close', 'حذف الحساب وإخفاء الهوية', '', 'bad');
    }
    for (const n of (d.internalNotes || []).filter(x => x.entityType === 'customer' && x.entityId === id)) push(n.createdAt, 'note', 'edit', 'ملاحظة داخلية', n.text);
    return ev.sort((a, b) => new Date(b.at) - new Date(a.at));
  };
  // نص نسخ بيانات العميل: لا يتضمن أبدًا تجزئة كلمة المرور ولا أي أسرار
  const customerCopyText = (d, c, D) => {
    const kind = kindLabel(customerKind(d, c)), nums = D.customerNumbers(c.id, d);
    const lines = [`الاسم: ${c.name}`, `البريد الإلكتروني: ${c.email}`, `معرّف الحساب: ${c.accountId || c.id}`, `الحالة: ${CUSTOMER_STATUS[c.status] || c.status || 'فعال'}`, `الصفة: ${kind}`, `الرصيد: ${D.balance(c.id, d)} نقطة`];
    if (c.status === 'suspended' || c.status === 'blocked') { lines.push(`الأثر: ${restrictionList(c, D).join('، ') || '—'}`); if (c.statusReason) lines.push(`السبب: ${c.statusReason}`); }
    if ((c.tags || []).length) lines.push(`الوسوم: ${c.tags.join('، ')}`);
    lines.push(`تاريخ التسجيل: ${String(c.createdAt || '').slice(0, 10) || '—'}`, `طلبات النقاط: ${d.purchaseRequests.filter(r => r.customerId === c.id).length} (معتمد ${approvedOrders(d, c.id)})`);
    lines.push(`الأرقام (${nums.length}):`);
    for (const n of nums) { const s = D.activeSubscription(d, n.id); lines.push(`- ${n.number} · ${company(d, n.companyId)?.name || '—'} · ${s ? 'ينتهي ' + String(s.endsAt).slice(0, 10) : 'بلا اشتراك فعال'}`); }
    return lines.join('\n');
  };

  return { CUSTOMER_STATUS, RESTRICTION_LABEL, PREMIUM_TAG, approvedOrders, hasTag, customerKind, kindLabel, isNewCustomer, isPremiumCustomer, customerBadges, restrictionList, customerTimeline, customerCopyText, STATUS, status, tone, company, customer, number, finance, firstTask, isDue, canExecute, taskClass, taskLabel, taskAvailableNow, elapsedText, sinceDue, companyName, groupByCompany, availableOrder, nextAvailableAfter, unrecordedTasks, TASK_LABEL, TASK_TONE, isLive, initials };
});
