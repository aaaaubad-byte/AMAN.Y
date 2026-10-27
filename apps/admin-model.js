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

  return { STATUS, status, tone, company, customer, number, finance, firstTask, isDue, canExecute, taskClass, taskLabel, taskAvailableNow, elapsedText, sinceDue, companyName, groupByCompany, availableOrder, nextAvailableAfter, unrecordedTasks, TASK_LABEL, TASK_TONE, isLive, initials };
});
