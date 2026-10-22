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
  const isOverdue = (t, d) => isDue(t, d) && new Date(t.dueAt) < Date.now();
  const canExecute = (d, t, D) => {
    if (!['due', 'planned'].includes(t.status)) return false;
    const first = firstTask(d, t);
    if (first?.id !== t.id || new Date(t.visibleAt || t.dueAt) > Date.now()) return false;
    const sub = d.subscriptions.find(x => x.id === t.subscriptionId), cfg = company(d, t.companyId)?.taskSchedule || {};
    return !sub || (new Date(sub.startsAt || 0) <= Date.now() && (new Date(sub.endsAt) > Date.now() || (cfg.allowDuringGrace === true && Date.now() <= new Date(D.datePlus(sub.endsAt, Number(cfg.graceDays || 0))).getTime())));
  };
  // التصنيف الموحد للفلاتر: completed | cancelled | early | overdue | due | planned
  const taskClass = (t, d, D) => {
    if (t.status === 'executed') return 'completed';
    if (t.status === 'cancelled') return 'cancelled';
    if (canExecute(d, t, D) && new Date(t.dueAt) > Date.now()) return 'early';
    if (isOverdue(t, d)) return 'overdue';
    if (isDue(t, d)) return 'due';
    return 'planned';
  };
  const TASK_LABEL = { completed: 'مكتملة', cancelled: 'ملغاة', early: 'متاحة للتنفيذ المبكر', overdue: 'متأخرة', due: 'مستحقة', planned: 'قادمة' };
  const TASK_TONE = { completed: 'ok', cancelled: 'bad', early: '', overdue: 'bad', due: 'warn', planned: '' };
  const taskLabel = (t, d, D) => TASK_LABEL[taskClass(t, d, D)];
  // المتاحة الآن: ما كانت تعرضه شاشة «المهام المستحقة» الأصلية (مفتوحة وإما مستحقة أو قابلة للتنفيذ المبكر)
  const taskAvailableNow = (t, d, D) => ['due', 'planned'].includes(t.status) && (isDue(t, d) || canExecute(d, t, D));

  /* ----- الاشتراك والأرقام ----- */
  const isLive = s => !!s && s.status === 'active' && new Date(s.startsAt || 0) <= new Date() && new Date(s.endsAt) > Date.now();
  const initials = name => String(name || '؟').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('') || '؟';

  return { STATUS, status, tone, company, customer, number, finance, firstTask, isDue, isOverdue, canExecute, taskClass, taskLabel, taskAvailableNow, TASK_LABEL, TASK_TONE, isLive, initials };
});
