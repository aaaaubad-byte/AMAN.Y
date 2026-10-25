/* AMAN Admin — بناء الشاشات. كل دالة تقرأ البيانات وتعيد وصف عرض فقط؛ لا كتابة هنا. */
(function (root) {
  'use strict';
  const D = root.AmanData, U = root.AmanUI, K = root.AmanAdminKit, M = root.AmanAdminModel;
  const E = K.esc, N = U.fmt, DT = U.date, DY = U.day;
  const ltr = s => `<span class="ltr">${E(s)}</span>`;
  const YER = v => `${N(v)} ر.ي`;
  const taskDays = n => `${N(n)} يوم`;
  const RS = { pending: 'معلقة', approved: 'معتمدة', rejected: 'مرفوضة' };
  const SRC = { manual: 'قيد يدوي', purchase: 'بيع نقاط', task: 'مصروف مهمة', reversal: 'قيد عكسي' };
  const match = (q, ...parts) => !q || parts.join(' ').toLowerCase().includes(q.trim().toLowerCase());

  /* ------------------------------------------------------------------ */
  function login(saved, demo = false) {
    return { chrome: 'auth', auth: true, html: `<div class="brand"><h1>أمان</h1><p>إدارة نظام أمان</p></div>
<form id="admin-login" data-form="login">
 <div class="afield"><label for="l_email">البريد الإلكتروني</label><input id="l_email" name="email" type="email" autocomplete="username" dir="ltr" style="text-align:right" value="${E(saved.email || (demo ? 'admin@aman.test' : ''))}" required aria-describedby="l_email-err"><small class="ferr hidden" id="l_email-err" role="alert"></small></div>
 <div class="afield"><label for="l_pass">كلمة المرور</label><input id="l_pass" name="password" type="password" minlength="4" autocomplete="current-password" dir="ltr" style="text-align:right" value="${demo ? 'admin1234' : ''}" required aria-describedby="l_pass-err"><small class="ferr hidden" id="l_pass-err" role="alert"></small></div>
 <label class="remember"><input type="checkbox" name="remember" ${saved.enabled ? 'checked' : ''}><span>تذكرني وحفظ بيانات الدخول على هذا الجهاز</span></label>
 <div id="form-error" class="form-error hidden" role="alert"></div>
 <button class="btn primary" type="submit" data-submit>دخول</button>
</form>` };
  }

  /* ------------------------------------------------------------------ */
  function home(d, ui) {
    const fin = M.finance(d), pending = d.purchaseRequests.filter(r => r.status === 'pending');
    const avail = d.tasks.filter(t => M.taskAvailableNow(t, d, D)), overdue = avail.filter(t => M.taskClass(t, d, D) === 'overdue');
    const soon = d.subscriptions.filter(s => M.isLive(s) && new Date(s.endsAt) <= Date.now() + 7 * 86400000);
    const open = d.tasks.filter(t => ['due', 'planned'].includes(t.status)).length;
    const demoKeys = ['customers', 'companies', 'packages', 'paymentMethods', 'purchaseRequests', 'numbers', 'subscriptions', 'pointTransactions', 'tasks', 'operations', 'financeEntries', 'notifications', 'idempotencyKeys', 'protectionPackages', 'protectionOperations', 'numberLinks'];
    const demoEmpty = demoKeys.every(k => !(d[k] || []).length);
    const demo = ui.demo ? `<div class="section"><span>بيانات معاينة محلية</span></div><div class="card"><p class="note in-card">سجلات مصطنعة للاختبار فقط. لا تُحمّل فوق أي مخزن يحتوي بيانات، ولا تستخدمها للإنتاج.</p><div style="padding:0 16px 16px">${demoEmpty ? K.btn('تحميل بيانات الاختبار', 'demo-seed') : '<p class="note" style="margin:0">المخزن غير فارغ؛ لن تُستبدل أي بيانات.</p>'}</div></div>` : '';
    const chip = `<button type="button" id="financeTop" class="chip-black" data-act="go" data-to="finance" title="صافي الإيرادات ناقص المصروفات؛ ليس رصيد النقدية" aria-label="السجل المالي: صافي الإيرادات ناقص المصروفات، وليس رصيد النقدية"><span class="dot">${K.ico('spark')}</span>${YER(fin.net)}</button>`;
    return { tab: 'home', chrome: 'tabs', html: `<header class="lead">${chip}<div class="lead-end">${K.tileAction('go', 'search', 'البحث الشامل', 'data-to="search"')}${K.tileAction('go', 'user', 'الحساب الإداري', 'data-to="account"')}</div></header>
<h1 class="display">لوحة الإدارة</h1><p class="lede">ملخص التشغيل الحالي ومهام المراجعة.</p>${demo}
<div style="margin-top:14px">${K.metrics([['العملاء', N(d.customers.length)], ['الأرقام', N(d.numbers.length)], ['المهام المفتوحة', N(open)]])}</div>
${K.section('يحتاج إلى إجراء')}
${K.card([
      K.row({ icon: 'receipt', tone: pending.length ? 'warn' : '', title: 'طلبات نقاط معلقة', sub: 'الاعتماد يضيف نقاطًا ولا ينشئ اشتراكًا', val: N(pending.length), to: 'requests/pending' }),
      K.row({ icon: 'tasks', tone: overdue.length ? 'bad' : '', title: 'مهام جاهزة للتنفيذ', sub: overdue.length ? `${N(overdue.length)} منها متأخرة` : 'مستحقة أو متاحة مبكرًا', val: N(avail.length), to: 'tasks/available' }),
      K.row({ icon: 'clock', title: 'اشتراكات تنتهي خلال 7 أيام', sub: 'مدة حماية الأرقام، مستقلة عن رصيد النقاط', val: N(soon.length), to: 'numbers/active' })])}
${K.section('وصول سريع')}
${K.card([
      K.row({ icon: 'ledger', title: 'السجل المالي', sub: 'إيرادات ومصروفات النظام بالريال', to: 'finance' }),
      K.row({ icon: 'phone', title: 'الأرقام والاشتراكات', sub: `${N(d.numbers.length)} رقم`, to: 'numbers/active' }),
      K.row({ icon: 'users', title: 'العملاء', sub: `${N(d.customers.length)} حساب`, to: 'customers/all' })])}` };
  }

  /* ------------------------------------------------------------------ */
  /* تحميل المزيد (56): القوائم الطويلة تُعرض على صفحات؛ المتبقي بزر */
  const PAGE = 30;
  const paged = (rows, ui, draw) => { const lim = ui.limit || PAGE; return draw(rows.slice(0, lim)) + (rows.length > lim ? `<div class="more-wrap">${K.btn(`تحميل المزيد (${N(rows.length - lim)} متبقٍ)`, 'load-more', 'small')}</div>` : ''); };
  /* حالة فارغة بنتيجة بحث: تعرض مسح البحث والتصفية (39) */
  const emptyQ = (filtered, qText, otherText, icon) => filtered ? K.empty(qText, icon, '', K.btn('مسح البحث والتصفية', 'clear-filter', 'small')) : K.empty(otherText, icon);
  function requests(d, a, ui) {
    const tab = ['pending', 'approved', 'rejected', 'all'].includes(a) ? a : 'pending';
    const cnt = k => d.purchaseRequests.filter(r => k === 'all' || r.status === k).length;
    const list = () => {
      const rows = d.purchaseRequests.filter(r => tab === 'all' || r.status === tab).filter(r => { const c = M.customer(d, r.customerId); return match(ui.q, c?.name, c?.email, r.id, r.paymentReference, r.packageSnapshot?.name, r.paymentMethodSnapshot?.name); }).sort((x, y) => new Date(y.createdAt) - new Date(x.createdAt));
      if (!rows.length) return emptyQ(!!ui.q, 'لا توجد طلبات تطابق البحث.', 'لا توجد طلبات في هذه القائمة.', 'receipt');
      return paged(rows, ui, rows => K.card(rows.map(r => { const c = M.customer(d, r.customerId); return K.row({ icon: 'receipt', tone: r.status === 'pending' ? 'warn' : r.status === 'approved' ? 'ok' : 'bad', title: c?.name || 'عميل غير موجود', sub: `${E(r.packageSnapshot?.name || 'باقة قديمة')} · ${N(r.packageSnapshot?.points)} نقطة`, sub2: `${E(r.paymentMethodSnapshot?.name || '—')} · ${E(DT(r.createdAt))}`, val: YER(r.packageSnapshot?.price), pill: K.pill(M.status(r.status), M.tone(r.status)), to: 'request/' + r.id }); })));
    };
    return { tab: 'requests', chrome: 'tabs', list, html: `<header class="lead"><div class="lead-end" style="margin-inline-start:auto">${K.tileAction('go', 'search', 'البحث الشامل', 'data-to="search"')}</div></header><h1 class="display">طلبات النقاط</h1><p class="lede">مراجعة طلبات شراء النقاط. الاعتماد يخص الطلب فقط.</p>
${K.tabs([['pending', 'المعلقة', cnt('pending')], ['approved', 'المعتمدة', cnt('approved')], ['rejected', 'المرفوضة', cnt('rejected')], ['all', 'الكل', cnt('all')]], tab, 'requests')}
${K.toolbar('ابحث باسم العميل أو مرجع الدفع', ui.q)}<div id="listbody">${list()}</div>` };
  }

  function request(d, id) {
    const r = d.purchaseRequests.find(x => x.id === id);
    if (!r) return missing('الطلب غير موجود.');
    const c = M.customer(d, r.customerId), pk = r.packageSnapshot || {}, pm = r.paymentMethodSnapshot || {}, pend = r.status === 'pending';
    const html = `<div class="hero"><div class="hero-top">${K.tile('receipt')}<div><h2>${E(c?.name || 'عميل غير موجود')}</h2><p>${E(c?.email || '—')}</p></div></div><small>${E(pk.name || 'باقة قديمة')}</small><div class="big">${N(pk.points)}<em>نقطة</em></div><small>القيمة المالية ${YER(pk.price)}</small><span class="pill ${r.status === 'approved' ? 'ok' : ''}">${M.status(r.status)}</span></div>
${pend ? `<div style="margin-top:12px">${K.callout('info', 'ما الذي يحدث عند الاعتماد؟', `<small style="display:block;line-height:1.9;margin-top:4px">• تُضاف ${N(pk.points)} نقطة إلى رصيد العميل في دفتر النقاط.<br>• يُسجَّل إيراد ${YER(pk.price)} في السجل المالي، وهو مستقل عن النقاط.<br>• لا يُنشأ اشتراك لأي رقم؛ تفعيل الحماية يتم من رصيد العميل لاحقًا.<br>• الرفض لا يضيف نقاطًا ولا إيرادًا.</small>`, true)}</div>` : ''}
${K.section('بيانات الطلب')}${K.kv([['العميل', c ? E(c.name) : '—'], ['الباقة المحفوظة', `${E(pk.name || '—')} · ${N(pk.points)} نقطة`], ['القيمة المالية', YER(pk.price)], ['الحالة', M.status(r.status), true], ['تاريخ الإنشاء', E(DT(r.createdAt))], ['تاريخ المراجعة', E(DT(r.reviewedAt))]])}
${K.section('بيانات الدفع (لقطة وقت الطلب)')}${K.kv([['وسيلة الدفع', E(pm.name || '—')], ['تعليمات الدفع', E(pm.instructions || '—')], ['مرجع الإثبات', ltr(r.paymentReference || '—') + (r.paymentReference ? K.copyBtn(r.paymentReference, 'المرجع') : '')], ['رقم الطلب', ltr(r.id) + K.copyBtn(r.id, 'رقم الطلب')]])}
${r.reviewNote ? K.section('ملاحظة المراجعة') + `<div class="card"><p class="note in-card" style="color:var(--ink)">${E(r.reviewNote)}</p></div>` : ''}
${c ? K.section('الحساب') + K.card([K.row({ icon: 'user', title: c.name, sub: `${D.isSubscriber(d, c.id) ? 'مشترك' : 'غير مشترك'} · رصيد ${N(D.balance(c.id, d))} نقطة`, to: 'customer/' + c.id })]) : ''}`;
    return { chrome: 'focus', title: 'طلب شراء نقاط', sub: DY(r.createdAt), html, bar: pend ? `<div class="actionbar two">${K.btn('اعتماد الطلب', 'review-open', 'primary', `data-id="${E(r.id)}" data-decision="approved"`)}${K.btn('رفض الطلب', 'review-open', '', `data-id="${E(r.id)}" data-decision="rejected"`)}</div>` : '' };
  }

  /* ------------------------------------------------------------------ */
  function tasks(d, a, ui) {
    const tab = a === 'all' ? 'all' : 'available';
    const opts = tab === 'all' ? [['all', 'كل الحالات'], ['early', 'متاحة مبكرًا'], ['due', 'مستحقة'], ['overdue', 'متأخرة'], ['planned', 'قادمة / مجدولة'], ['completed', 'مكتملة'], ['cancelled', 'ملغاة']] : [['all', 'كل الحالات'], ['early', 'متاحة مبكرًا'], ['due', 'مستحقة'], ['overdue', 'متأخرة']];
    const base = () => d.tasks.filter(t => tab === 'all' ? ['due', 'planned', 'executed', 'cancelled'].includes(t.status) : M.taskAvailableNow(t, d, D));
    const list = () => {
      const rows = base().filter(t => { const n = M.number(d, t.numberId), co = M.company(d, t.companyId), c = M.customer(d, t.customerId); return match(ui.q, n?.number, co?.name, c?.name, c?.email, t.id); }).filter(t => ui.filter === 'all' || M.taskClass(t, d, D) === ui.filter).sort((x, y) => new Date(y.executedAt || y.dueAt) - new Date(x.executedAt || x.dueAt));
      if (!rows.length) return emptyQ(!!ui.q || ui.filter !== 'all', 'لا توجد مهام تطابق البحث.', tab === 'all' ? 'لا توجد مهام.' : 'لا توجد مهام متاحة أو مستحقة الآن.', 'tasks');
      return paged(rows, ui, rows => K.card(rows.map(t => { const n = M.number(d, t.numberId), co = M.company(d, t.companyId), c = M.customer(d, t.customerId), cl = M.taskClass(t, d, D); return K.row({ icon: 'tasks', tone: cl === 'overdue' ? 'bad' : cl === 'due' ? 'warn' : cl === 'completed' ? 'ok' : '', title: n?.number || 'رقم غير معروف', ltr: true, sub: `${E(co?.name || '—')} · ${E(c?.name || '—')}`, sub2: `الاستحقاق ${E(DT(t.dueAt))}`, val: YER(t.expenseAmount), pill: K.pill(M.TASK_LABEL[cl], M.TASK_TONE[cl]), to: 'task/' + t.id }); })));
    };
    const nAvail = d.tasks.filter(t => M.taskAvailableNow(t, d, D)).length;
    return { tab: 'tasks', chrome: 'tabs', list, html: `<header class="lead"><div class="lead-end" style="margin-inline-start:auto">${K.tileAction('go', 'search', 'البحث الشامل', 'data-to="search"')}</div></header><h1 class="display">المهام</h1><p class="lede">تنفيذ مهام الأرقام المؤهلة وتسجيل مصروفها مرة واحدة.</p>
${K.tabs([['available', 'متاحة الآن', nAvail], ['all', 'كل المهام']], tab, 'tasks')}
${K.toolbar('ابحث بالرقم أو الشركة أو العميل', ui.q, opts, ui.filter)}<div id="listbody">${list()}</div>` };
  }

  function task(d, id) {
    const t = d.tasks.find(x => x.id === id);
    if (!t) return missing('المهمة غير موجودة.');
    const n = M.number(d, t.numberId), co = M.company(d, t.companyId), c = M.customer(d, t.customerId), cfg = co?.taskSchedule || {}, cl = M.taskClass(t, d, D);
    const exec = M.canExecute(d, t, D), early = new Date(t.dueAt) > Date.now(), canResched = cfg.allowReschedule === true && ['planned', 'due'].includes(t.status);
    const notYet = ['planned', 'due'].includes(t.status) && !exec && new Date(t.visibleAt || t.dueAt) > Date.now();
    const html = `<div class="hero"><div class="hero-top">${K.tile('tasks')}<div><h2 class="ltr">${E(n?.number || 'رقم غير معروف')}</h2><p>${E(co?.name || '—')}</p></div></div><small>مصروف المهمة</small><div class="big">${N(t.expenseAmount)}<em>ر.ي</em></div><span class="pill ${cl === 'completed' ? 'ok' : ''}">${M.TASK_LABEL[cl]}</span></div>
${exec ? `<div style="margin-top:12px">${K.callout('info', early ? 'تنفيذ مبكر داخل نافذة الظهور' : 'المهمة جاهزة للتنفيذ', '<small style="display:block;line-height:1.8;margin-top:4px">عند التنفيذ يُسجَّل مصروف المهمة مرة واحدة في السجل المالي، وتُنشأ المهمة التالية من وقت التنفيذ الفعلي. لا يتغير رصيد نقاط العميل.</small>', true)}</div>` : ''}
${notYet ? `<p class="note">لا يمكن تنفيذ المهمة قبل ${E(DT(t.visibleAt || t.dueAt))} (بداية نافذة الظهور).</p>` : ''}
${K.section('بيانات المهمة')}${K.kv([['الرقم', n ? ltr(n.number) : '—'], ['الشركة', E(co?.name || '—')], ['العميل', E(c?.name || '—')], ['الاستحقاق', E(DT(t.dueAt))], ['بداية الظهور للتنفيذ', E(DT(t.visibleAt || t.dueAt))], ['الحالة', M.TASK_LABEL[cl], true], ['تاريخ التنفيذ', E(DT(t.executedAt))]])}
${K.section('الربط المالي')}${K.kv([['قيد المصروف', t.financeEntryId ? E(t.financeEntryId) : '—'], ['معرّف الاشتراك', E(t.subscriptionId || '—')]])}
${!canResched ? `<p class="note">${cfg.allowReschedule === true ? 'لا يمكن إعادة جدولة هذه المهمة في حالتها الحالية.' : 'إعادة الجدولة معطلة في إعدادات الشركة.'}</p>` : '<p class="note">إعادة الجدولة متاحة؛ التعديل لا يعيد ضبط دورة المهام.</p>'}
${n ? K.section('الرقم') + K.card([K.row({ icon: 'phone', title: n.number, ltr: true, sub: E(co?.name || ''), to: 'number/' + n.id })]) : ''}
${t.financeEntryId && d.financeEntries.some(x => x.id === t.financeEntryId) ? K.card([K.row({ icon: 'ledger', title: 'قيد المصروف', sub: 'فتح تفاصيل القيد المالي', to: 'finance-entry/' + t.financeEntryId })]) : ''}`;
    const bar = (exec || canResched) ? `<div class="actionbar ${exec && canResched ? 'two' : ''}">${exec ? K.btn(early ? 'تنفيذ مبكرًا' : 'تنفيذ المهمة', 'task-execute-open', 'primary', `data-id="${E(t.id)}"`) : ''}${canResched ? K.btn('إعادة الجدولة', 'task-resched-open', exec ? '' : 'primary', `data-id="${E(t.id)}"`) : ''}</div>` : '';
    return { chrome: 'focus', title: 'تفاصيل المهمة', sub: n?.number || '', subLtr: true, html, bar };
  }

  /* ------------------------------------------------------------------ */
  function customers(d, a, ui) {
    const tab = ['all', 'subscribers', 'users'].includes(a) ? a : 'all';
    const sub = c => D.isSubscriber(d, c.id);
    const inTab = c => tab === 'all' || (tab === 'subscribers' ? sub(c) : !sub(c));
    const list = () => {
      const rows = d.customers.filter(inTab).filter(c => match(ui.q, c.name, c.email, c.accountId));
      if (!rows.length) return emptyQ(!!ui.q, 'لا توجد نتائج مطابقة.', 'لا توجد حسابات في هذه القائمة.', 'users');
      return paged(rows, ui, rows => K.card(rows.map(c => K.row({ icon: 'user', tone: sub(c) ? 'dark' : '', title: c.name, sub: E(c.email), sub2: `${N(D.balance(c.id, d))} نقطة · ${N(D.customerNumbers(c.id, d).length)} رقم`, pill: K.pill(sub(c) ? 'مشترك' : 'غير مشترك', sub(c) ? 'ok' : ''), to: 'customer/' + c.id }))));
    };
    return { tab: 'customers', chrome: 'tabs', list, html: `<header class="lead"><div class="lead-end" style="margin-inline-start:auto">${K.tileAction('go', 'search', 'البحث الشامل', 'data-to="search"')}</div></header><h1 class="display">العملاء</h1><p class="lede">حسابات العملاء ورصيد نقاطهم.</p>
${K.tabs([['all', 'الكل', d.customers.length], ['subscribers', 'المشتركون', d.customers.filter(sub).length], ['users', 'غير مشتركين', d.customers.filter(c => !sub(c)).length]], tab, 'customers')}
${K.toolbar('ابحث بالاسم أو البريد أو المعرّف', ui.q)}<div id="listbody">${list()}</div>` };
  }

  function customer(d, id, a) {
    const c = M.customer(d, id);
    if (!c) return missing('العميل غير موجود.');
    const tab = ['numbers', 'requests', 'subs', 'ops'].includes(a) ? a : 'numbers';
    const ns = D.customerNumbers(id, d), rs = d.purchaseRequests.filter(r => r.customerId === id).sort((x, y) => new Date(y.createdAt) - new Date(x.createdAt)), subs = d.subscriptions.filter(s => s.customerId === id).sort((x, y) => new Date(y.createdAt) - new Date(x.createdAt));
    const ops = d.operations.filter(o => o.actorId === id || o.entityId === id).slice().reverse().slice(0, 10), isSub = D.isSubscriber(d, id);
    let body;
    if (tab === 'numbers') body = ns.length ? K.card(ns.map(n => { const s = D.activeSubscription(d, n.id), co = M.company(d, n.companyId); return K.row({ icon: 'phone', title: n.number, ltr: true, sub: E(co?.name || '—'), sub2: s ? `ينتهي ${E(DY(s.endsAt))}` : 'لا يوجد اشتراك فعال', pill: K.pill(s ? M.status(s.status) : 'بلا اشتراك', s ? 'ok' : ''), to: 'number/' + n.id }); })) : K.empty('لا توجد أرقام مرتبطة بالحساب.', 'phone');
    else if (tab === 'requests') body = rs.length ? K.card(rs.map(r => K.row({ icon: 'receipt', tone: r.status === 'approved' ? 'ok' : r.status === 'pending' ? 'warn' : 'bad', title: r.packageSnapshot?.name || 'باقة قديمة', sub: `${N(r.packageSnapshot?.points)} نقطة · ${YER(r.packageSnapshot?.price)}`, sub2: `المرجع ${E(r.paymentReference || '—')} · ${E(DT(r.createdAt))}`, pill: K.pill(M.status(r.status), M.tone(r.status)), to: 'request/' + r.id }))) : K.empty('لا توجد طلبات نقاط.', 'receipt');
    else if (tab === 'subs') body = subs.length ? K.card(subs.map(s => { const n = M.number(d, s.numberId), co = M.company(d, s.companyId || n?.companyId); return K.row({ icon: 'shield', title: n?.number || '—', ltr: true, sub: `${E(co?.name || '—')} · ${E(DY(s.startsAt))} — ${E(DY(s.endsAt))}`, sub2: `${N(s.pointsCost)} نقطة · ${N(s.rateSnapshot)} نقطة/يوم`, pill: K.pill(M.status(s.status), M.tone(s.status)), to: n ? 'number/' + n.id : '' }); })) : K.empty('لا توجد سجلات اشتراك لهذا الحساب.', 'shield');
    else body = ops.length ? K.card(ops.map(o => K.row({ icon: 'audit', title: o.summary || o.type || 'عملية', sub: `${E(o.type || '—')} · ${E(DT(o.createdAt))}` }))) : K.empty('لا توجد عمليات مرتبطة مباشرة.', 'audit');
    const html = `<div class="hero"><div class="hero-top">${K.tile(isSub ? 'shield' : 'user')}<div><h2>${E(c.name)}</h2><p class="ltr">${E(c.email)}</p></div></div><small>رصيد نقاط أمان</small><div class="big">${N(D.balance(id, d))}<em>نقطة</em></div><span class="pill ${isSub ? 'ok' : ''}">${isSub ? 'مشترك' : 'حساب غير مشترك'}</span></div>
<p class="note">الرصيد مشتق من دفتر النقاط. صفة «مشترك» تثبت باعتماد أول طلب شراء نقاط ولا تعني اشتراك أي رقم؛ مدة اشتراك كل رقم في تبويب الأرقام، والمبالغ بالريال في السجل المالي العام.</p>
${K.section('بيانات الحساب')}${K.kv([['الاسم', E(c.name)], ['البريد الإلكتروني', ltr(c.email)], ['معرّف الحساب', ltr(c.accountId || c.id)], ['الصفة', isSub ? 'مشترك' : 'غير مشترك']])}
${K.tabs([['numbers', 'الأرقام', ns.length], ['requests', 'الطلبات', rs.length], ['subs', 'الاشتراكات', subs.length], ['ops', 'العمليات']], tab, 'customer')}${body}`;
    return { chrome: 'focus', title: 'تفاصيل العميل', sub: c.name, html, end: K.tileAction('add-number-open', 'plus', 'إضافة رقم للعميل', `data-customer="${E(c.id)}"`) };
  }

  /* ------------------------------------------------------------------ */
  function numbers(d, a, ui) {
    const tab = a === 'all' ? 'all' : 'active';
    const subOf = n => D.activeSubscription(d, n.id);
    const list = () => {
      if (tab === 'active') {
        const rows = d.subscriptions.filter(M.isLive).sort((x, y) => new Date(x.endsAt) - new Date(y.endsAt)).filter(s => { const n = M.number(d, s.numberId), c = M.customer(d, s.customerId || n?.customerId), co = M.company(d, s.companyId || n?.companyId); return match(ui.q, n?.number, c?.name, c?.email, co?.name); });
        if (!rows.length) return emptyQ(!!ui.q, 'لا توجد نتائج تطابق البحث.', 'لا توجد اشتراكات فعالة.', 'shield');
        return paged(rows, ui, rows => K.card(rows.map(s => { const n = M.number(d, s.numberId), c = M.customer(d, s.customerId), co = M.company(d, s.companyId || n?.companyId); return K.row({ icon: 'shield', tone: 'ok', title: n?.number || '—', ltr: true, sub: `${E(c?.name || '—')} · ${E(co?.name || '—')}`, sub2: `ينتهي ${E(DY(s.endsAt))} · ${N(s.rateSnapshot)} نقطة/يوم`, pill: K.pill('فعال', 'ok'), to: n ? 'number/' + n.id : '' }); })));
      }
      const rows = d.numbers.filter(n => { const s = subOf(n), c = M.customer(d, s?.customerId || n.customerId), co = M.company(d, n.companyId); return match(ui.q, n.number, c?.name, c?.email, co?.name); }).filter(n => ui.filter === 'all' || (ui.filter === 'active') === !!subOf(n));
      if (!rows.length) return emptyQ(!!ui.q || ui.filter !== 'all', 'لا توجد نتائج تطابق البحث.', 'لا توجد أرقام مضافة بعد.', 'phone');
      return paged(rows, ui, rows => K.card(rows.map(n => { const s = subOf(n), c = M.customer(d, s?.customerId || n.customerId), co = M.company(d, n.companyId); return K.row({ icon: 'phone', tone: s ? 'ok' : '', title: n.number, ltr: true, sub: `${E(c?.name || '—')} · ${E(co?.name || '—')}`, sub2: s ? `ينتهي ${E(DY(s.endsAt))}` : 'لا يوجد اشتراك فعال', pill: n.restricted ? K.pill('مقيّد', 'bad') : K.pill(s ? 'فعال' : 'بلا اشتراك', s ? 'ok' : ''), to: 'number/' + n.id }); })));
    };
    return { chrome: 'tabs', tab: 'more', list, html: `${K.bar('الأرقام والاشتراكات', 'حماية الأرقام ومدتها', K.tileAction('add-number-open', 'plus', 'إضافة رقم'))}
${K.tabs([['active', 'اشتراكات فعالة', d.subscriptions.filter(M.isLive).length], ['all', 'كل الأرقام', d.numbers.length]], tab, 'numbers')}
${K.toolbar('ابحث برقم الهاتف أو العميل أو الشركة', ui.q, tab === 'all' ? [['all', 'كل الحالات'], ['active', 'له اشتراك فعال'], ['inactive', 'بلا اشتراك فعال']] : null, ui.filter)}<div id="listbody">${list()}</div>` };
  }

  function numberDetail(d, id) {
    const n = M.number(d, id);
    if (!n) return missing('الرقم غير موجود.');
    const sub = D.activeSubscription(d, n.id) || d.subscriptions.filter(x => x.numberId === n.id).sort((x, y) => new Date(y.createdAt) - new Date(x.createdAt))[0];
    const c = M.customer(d, n.customerId), co = M.company(d, n.companyId);
    const plan = sub ? d.tasks.filter(t => t.subscriptionId === sub.id).sort((x, y) => new Date(x.dueAt) - new Date(y.dueAt)) : [];
    const live = M.isLive(sub);
    const html = `<div class="hero"><div class="hero-top">${K.tile('phone')}<div><h2 class="ltr">${E(n.number)}</h2><p>${E(co?.name || 'شركة غير معروفة')}</p></div></div><small>مدة الاشتراك</small><div class="big" style="font-size:24px">${sub ? `${E(DY(sub.startsAt))} — ${E(DY(sub.endsAt))}` : 'لا يوجد اشتراك'}</div><span class="pill ${live ? 'ok' : ''}">${sub ? M.status(sub.status) : 'بلا اشتراك'}</span></div>
<p class="note">الإدارة للاطلاع فقط؛ تفعيل الاشتراك وتمديده يتمان من واجهة العميل ومن رصيد نقاطه.</p>
${K.section('المالك والشركة')}${K.kv([['المالك', E(c?.name || '—')], ['البريد الإلكتروني', c ? ltr(c.email) : '—'], ['الشركة', E(co?.name || '—')], ['حالة التقييد', n.restricted ? `مقيّد: ${E(n.restrictionReason || '—')}` : 'غير مقيّد']])}
${K.section('الاشتراك')}${sub ? K.kv([['الحالة', E(M.status(sub.status)), true], ['بداية الاشتراك', E(DY(sub.startsAt))], ['المدة والانتهاء', `${N(sub.days)} يوم · ${E(DY(sub.endsAt))}`], ['التعرفة المحفوظة', `${N(sub.rateSnapshot)} نقطة/يوم`], ['تكلفة العملية', `${N(sub.pointsCost)} نقطة`]]) : K.empty('لا يوجد سجل اشتراك مرتبط بهذا الرقم.', 'shield')}
${sub ? K.section(`مخطط المهام (${plan.length})`) + (plan.length ? K.card(plan.map(t => { const cl = M.taskClass(t, d, D); return K.row({ icon: 'tasks', tone: cl === 'completed' ? 'ok' : cl === 'overdue' ? 'bad' : '', title: DT(t.dueAt), sub: `${YER(t.expenseAmount)} · ${t.executedAt ? 'نُفذت ' + E(DT(t.executedAt)) : 'غير منفذة'}`, pill: K.pill(M.TASK_LABEL[cl], M.TASK_TONE[cl]), to: 'task/' + t.id }); })) : K.empty('لا توجد مهام لهذا الاشتراك.', 'tasks')) : ''}
${c ? K.section('الحساب') + K.card([K.row({ icon: 'user', title: c.name, sub: `رصيد ${N(D.balance(c.id, d))} نقطة`, to: 'customer/' + c.id })]) : ''}`;
    return { chrome: 'focus', title: 'تفاصيل الرقم', sub: n.number, subLtr: true, html, bar: n.restricted ? `<div class="actionbar">${K.btn('رفع التقييد', 'unrestrict', 'primary', `data-id="${E(n.id)}"`)}</div>` : '' };
  }

  /* ------------------------------------------------------------------ */
  function financeScreen(d, a) {
    const tab = ['all', 'revenue', 'expense'].includes(a) ? a : 'all', f = M.finance(d);
    const reversedBy = x => d.financeEntries.find(y => y.sourceType === 'reversal' && (y.reversalOf || y.sourceId) === x.id);
    const rows = d.financeEntries.filter(x => tab === 'all' || x.kind === tab).slice().sort((x, y) => new Date(y.createdAt) - new Date(x.createdAt));
    const list = rows.length ? K.card(rows.map(x => { const rev = x.sourceType === 'reversal', done = !rev && reversedBy(x); return K.row({ icon: x.kind === 'revenue' ? 'up' : 'down', tone: x.kind === 'revenue' ? 'ok' : 'bad', title: x.description || '—', sub: `${E(SRC[x.sourceType] || x.sourceType || '—')} · ${E(DT(x.createdAt))}`, val: `${x.kind === 'revenue' ? '+' : '−'}${N(x.amount)}`, pill: rev ? K.pill('عكسي') : done ? K.pill('معكوس') : '', to: 'finance-entry/' + x.id }); })) : K.empty('لا توجد قيود مالية بعد.', 'ledger');
    const html = `<div class="hero"><small>صافي السجل المالي</small><div class="big">${N(f.net)}<em>ر.ي</em></div><small style="line-height:1.7;margin-top:4px">صافي الإيرادات ناقص المصروفات، وليس رصيد النقدية. لا يتأثر برصيد نقاط العملاء.</small></div>
<div style="margin-top:12px">${K.metrics([['الإيرادات', N(f.revenue)], ['المصروفات', N(f.expense)], ['عدد القيود', N(d.financeEntries.length)]])}</div>
${K.tabs([['all', 'الكل', d.financeEntries.length], ['revenue', 'إيرادات'], ['expense', 'مصروفات']], tab, 'finance')}${list}`;
    return { chrome: 'tabs', tab: 'more', html: K.bar('السجل المالي', 'إيرادات ومصروفات النظام', K.tileAction('finance-add-open', 'plus', 'إضافة قيد يدوي')) + html };
  }

  function financeEntry(d, id) {
    const x = d.financeEntries.find(e => e.id === id);
    if (!x) return missing('القيد المالي غير موجود.');
    const rev = x.sourceType === 'reversal', by = d.financeEntries.find(y => y.sourceType === 'reversal' && (y.reversalOf || y.sourceId) === x.id);
    const link = eid => d.financeEntries.some(e => e.id === eid) ? K.card([K.row({ icon: 'ledger', title: 'فتح القيد المرتبط', sub: E(eid), to: 'finance-entry/' + eid })]) : '';
    const html = `<div class="hero"><div class="hero-top">${K.tile(x.kind === 'revenue' ? 'up' : 'down')}<div><h2>${x.kind === 'revenue' ? 'إيراد' : 'مصروف'}</h2><p>${E(SRC[x.sourceType] || x.sourceType || '—')}</p></div></div><small>المبلغ</small><div class="big">${N(x.amount)}<em>ر.ي</em></div>${rev ? '<span class="pill">قيد عكسي</span>' : by ? '<span class="pill">تم عكسه</span>' : ''}</div>
${K.section('تفاصيل القيد')}${K.kv([['البيان', E(x.description || '—')], ['النوع', x.kind === 'revenue' ? 'إيراد' : 'مصروف'], ['المصدر', E(SRC[x.sourceType] || x.sourceType || '—')], ['معرّف المصدر', E(x.sourceId || '—')], ['تاريخ الإنشاء', E(DT(x.createdAt))]])}
${rev ? K.section('عكس قيد') + `<div class="card"><p class="note in-card">هذا قيد عكسي للقيد ${E(x.reversalOf || x.sourceId || '—')}. لا يمكن عكس القيد العكسي.</p></div>` + link(x.reversalOf || x.sourceId) : by ? K.section('حالة العكس') + `<div class="card"><p class="note in-card">عُكس هذا القيد بقيد معاكس مع إبقاء القيد الأصلي. لا يمكن عكسه مرة ثانية.</p></div>` + link(by.id) : `<p class="note">تصحيح القيد يتم بقيد عكسي بالمبلغ نفسه مع بقاء القيد الأصلي. السبب إلزامي.</p>`}`;
    return { chrome: 'focus', title: 'تفاصيل القيد', sub: DY(x.createdAt), html, bar: !rev && !by ? `<div class="actionbar">${K.btn('عكس القيد', 'finance-reverse-open', 'primary', `data-id="${E(x.id)}"`)}</div>` : '' };
  }

  /* ------------------------------------------------------------------ */
  function more(d) {
    const pend = d.purchaseRequests.filter(r => r.status === 'pending').length;
    const g = (t, rows) => K.section(t) + K.card(rows.map(K.row));
    return { chrome: 'tabs', tab: 'more', html: `<header class="lead"><div class="lead-end" style="margin-inline-start:auto">${K.tileAction('go', 'search', 'البحث الشامل', 'data-to="search"')}</div></header><h1 class="display">المزيد</h1><p class="lede">المالية والإعداد والنظام.</p>
${g('المالية والتشغيل', [
      { icon: 'ledger', title: 'السجل المالي', sub: 'إيرادات ومصروفات وقيود يدوية وعكسية', to: 'finance' },
      { icon: 'phone', title: 'الأرقام والاشتراكات', sub: `${N(d.numbers.length)} رقم`, to: 'numbers/active' }])}
${g('الإعداد', [
      { icon: 'building', title: 'الشركات', sub: `${N(d.companies.length)} شركة · بادئات وأطوال أرقام`, to: 'companies' },
      { icon: 'sliders', title: 'إعدادات المهام الدورية', sub: 'ثمانية خيارات لكل شركة', to: 'task-settings' },
      { icon: 'box', title: 'باقات النقاط', sub: `${N(d.packages.length)} باقة · سعر بالريال`, to: 'packages' },
      { icon: 'shield', title: 'باقات الحماية', sub: `${N((d.protectionPackages || []).length)} باقة · مدة وتكلفة بالنقاط`, to: 'protection' },
      { icon: 'card', title: 'وسائل الدفع', sub: `${N(d.paymentMethods.length)} وسيلة`, to: 'payments' }])}
${g('التواصل', [
      { icon: 'bell', title: 'الإشعارات', sub: 'أنواع الإشعارات وإشعارات الإدارة', to: 'notices' },
      { icon: 'text', title: 'المحتوى', sub: 'الشروط والخصوصية وبيانات التواصل', to: 'content' }])}
${g('النظام', [
      { icon: 'audit', title: 'سجل التدقيق', sub: `${N(d.operations.length)} حدث محلي`, to: 'audit' },
      { icon: 'user', title: 'الحساب الإداري', sub: 'الوضع الداكن، نسخة احتياطية، الخروج', to: 'account' }])}`, badge: pend };
  }

  /* ----- قوائم الكيانات: الشركات والباقات ووسائل الدفع ----- */
  const statusOpts = [['all', 'كل الحالات'], ['active', 'فعالة'], ['inactive', 'متوقفة']];
  function entityList(d, ui, o) {
    const list = () => {
      const rows = o.items.filter(x => match(ui.q, o.text(x))).filter(x => ui.filter === 'all' || (ui.filter === 'active') === (x.active !== false));
      if (!o.items.length) return K.empty(o.empty, o.icon);
      if (!rows.length) return K.empty('لا توجد نتائج تطابق البحث.', o.icon, '', K.btn('مسح البحث والتصفية', 'clear-filter', 'small'));
      return paged(rows, ui, rows => K.card(rows.map(x => K.row({ icon: o.icon, title: x.name, sub: o.sub(x), sub2: o.sub2(x), pill: K.pill(x.active === false ? 'متوقفة' : o.on, x.active === false ? 'bad' : 'ok'), to: o.base + '/' + x.id }))));
    };
    return { chrome: 'tabs', tab: 'more', list, html: `${K.bar(o.title, o.sub0, K.tileAction('go', 'plus', o.add, `data-to="${o.base}/new"`))}${K.toolbar(o.placeholder, ui.q, statusOpts, ui.filter)}<div id="listbody">${list()}</div>` };
  }
  const companies = (d, ui) => entityList(d, ui, { items: d.companies, title: 'الشركات', sub0: 'بادئات وأطوال الأرقام', add: 'إضافة شركة', base: 'company', icon: 'building', on: 'فعالة', placeholder: 'ابحث باسم الشركة أو البادئة', empty: 'لا توجد شركات مضافة بعد.', text: c => `${c.name} ${(c.prefixes || []).join(' ')}`, sub: c => `البادئات: ${E((c.prefixes || []).join('، '))}`, sub2: c => `${N((d.protectionPackages || []).filter(p => p.companyId === c.id).length)} باقة حماية · فاصل المهام ${taskDays(c.taskSchedule?.intervalDays)}` });
  const packages = (d, ui) => entityList(d, ui, { items: d.packages, title: 'باقات النقاط', sub0: 'ما يشتريه العميل بالريال', add: 'إضافة باقة', base: 'package', icon: 'box', on: 'متاحة', placeholder: 'ابحث باسم الباقة', empty: 'لا توجد باقات مضافة بعد.', text: p => p.name, sub: p => `${N(p.points)} نقطة`, sub2: p => `السعر ${YER(p.price)}` });
  const protection = (d, ui) => entityList(d, ui, { items: d.protectionPackages || [], title: 'باقات الحماية', sub0: 'مستقلة عن باقات النقاط', add: 'إضافة باقة حماية', base: 'protection', icon: 'shield', on: 'متاحة', placeholder: 'ابحث باسم الباقة أو الشركة', empty: 'لا توجد باقات حماية. أضف شركة أولًا ثم أنشئ باقة حماية لها.', text: p => `${p.name} ${M.company(d, p.companyId)?.name || ''}`, sub: p => E(M.company(d, p.companyId)?.name || 'شركة غير محددة'), sub2: p => `${taskDays(p.days)} · ${N(p.pointsCost)} نقطة` });
  const payments = (d, ui) => entityList(d, ui, { items: d.paymentMethods, title: 'وسائل الدفع', sub0: 'تعليمات الدفع الظاهرة للعميل', add: 'إضافة وسيلة دفع', base: 'payment', icon: 'card', on: 'متاحة', placeholder: 'ابحث باسم وسيلة الدفع', empty: 'لا توجد وسائل دفع مضافة بعد.', text: m => m.name, sub: m => E(m.summary || 'وسيلة دفع'), sub2: m => E((m.instructions || 'لا توجد تعليمات مضافة').slice(0, 60)) });

  const editEnd = (to) => K.tileAction('go', 'edit', 'تعديل', `data-to="${to}"`);
  function entityHero(icon, name, sub, on, onText, offText) { return `<div class="hero"><div class="hero-top">${K.tile(icon)}<div><h2>${E(name)}</h2><p>${E(sub)}</p></div></div><span class="pill ${on ? 'ok' : ''}">${on ? onText : offText}</span></div>`; }

  function company(d, id) {
    const c = M.company(d, id);
    if (!c) return missing('الشركة غير موجودة.');
    const sc = c.taskSchedule || {}, plans = (d.protectionPackages || []).filter(x => x.companyId === c.id), on = c.active !== false;
    const yn = v => v ? 'نعم' : 'لا';
    const html = `${entityHero('building', c.name, 'شركة ضمن إعدادات أمان الحالية', on, 'فعالة', 'متوقفة')}
<div style="margin-top:12px">${K.metrics([['البادئات', N((c.prefixes || []).length)], ['أطوال الأرقام', N((c.lengths || []).length)], ['باقات الحماية', N(plans.length)]])}</div>
${K.section('المعلومات الأساسية')}${K.kv([['اسم الشركة', E(c.name)], ['بادئات الأرقام', E((c.prefixes || []).join('، ') || '—')], ['أطوال الأرقام', E((c.lengths || []).map(N).join('، ') || '—')], ['الحالة', on ? 'فعالة' : 'متوقفة']])}
${K.section('باقات الحماية')}${plans.length ? K.card(plans.map(p => K.row({ icon: 'shield', title: p.name, sub: `${taskDays(p.days)} · ${N(p.pointsCost)} نقطة`, pill: K.pill(p.active ? 'متاحة' : 'متوقفة', p.active ? 'ok' : 'bad'), to: 'protection/' + p.id }))) : K.empty('لا توجد باقات حماية مرتبطة بهذه الشركة.', 'shield')}
${K.section('إعدادات المهام')}${K.kv([['الفاصل بين المهام', taskDays(sc.intervalDays)], ['مصروف المهمة', YER(sc.expenseAmount)], ['إنشاء أول مهمة عند التفعيل', yn(sc.createFirstOnActivation !== false)], ['الظهور قبل الاستحقاق', taskDays(sc.visibleBeforeDays ?? 1)], ['السماح بإعادة الجدولة', yn(sc.allowReschedule !== false)], ['إنشاء مهام بعد انتهاء الحماية', yn(!!sc.createAfterExpiry)], ['السماح بالتنفيذ خلال فترة السماح', yn(!!sc.allowDuringGrace)], ['مدة فترة السماح', taskDays(sc.graceDays || 0)]])}
<div style="margin-top:12px">${K.card([K.row({ icon: 'sliders', title: 'تعديل إعدادات المهام', sub: 'الخيارات الثمانية لهذه الشركة', to: `company/${c.id}/tasks` })])}</div>`;
    return { chrome: 'focus', title: 'تفاصيل الشركة', sub: c.name, html, end: editEnd(`company/${c.id}/edit`) };
  }
  function pkg(d, id) {
    const p = d.packages.find(x => x.id === id);
    if (!p) return missing('الباقة غير موجودة.');
    return { chrome: 'focus', title: 'تفاصيل الباقة', sub: p.name, end: editEnd(`package/${p.id}/edit`), html: `${entityHero('box', p.name, 'باقة نقاط', p.active, 'متاحة للشراء', 'متوقفة')}${K.section('بيانات الباقة')}${K.kv([['اسم الباقة', E(p.name)], ['عدد النقاط', N(p.points)], ['السعر المالي', YER(p.price)], ['الحالة', p.active ? 'متاحة للشراء' : 'متوقفة']])}<p class="note">الطلبات السابقة تحتفظ بلقطة قديمة من الباقة، فلا يغيّر التعديل نقاطها ولا أسعارها.</p>` };
  }
  function prot(d, id) {
    const p = (d.protectionPackages || []).find(x => x.id === id);
    if (!p) return missing('باقة الحماية غير موجودة.');
    const co = M.company(d, p.companyId);
    return { chrome: 'focus', title: 'تفاصيل باقة الحماية', sub: p.name, end: editEnd(`protection/${p.id}/edit`), html: `${entityHero('shield', p.name, co?.name || 'شركة غير محددة', p.active, 'متاحة', 'متوقفة')}${K.section('بيانات الباقة')}${K.kv([['الباقة', E(p.name)], ['الشركة', E(co?.name || '—')], ['المدة', taskDays(p.days)], ['التكلفة', `${N(p.pointsCost)} نقطة`], ['الحالة', p.active ? 'متاحة' : 'متوقفة']])}<p class="note">باقة الحماية مستقلة عن باقة النقاط: تحدد المدة والتكلفة بالنقاط، وتحفظ كل عملية لقطة تاريخية مستقلة.</p>` };
  }
  function pay(d, id) {
    const m = d.paymentMethods.find(x => x.id === id);
    if (!m) return missing('وسيلة الدفع غير موجودة.');
    return { chrome: 'focus', title: 'تفاصيل وسيلة الدفع', sub: m.name, end: editEnd(`payment/${m.id}/edit`), html: `${entityHero('card', m.name, 'تظهر للعميل عند شراء النقاط', m.active, 'متاحة', 'متوقفة')}${K.section('بيانات الدفع')}${K.kv([['اسم الوسيلة', E(m.name)], ['البيان المختصر', E(m.summary || '—')], ['تعليمات الدفع', E(m.instructions || '—')], ['الحالة', m.active ? 'متاحة' : 'متوقفة']])}<p class="note">الطلبات السابقة تحتفظ بلقطة من التعليمات وقت إنشائها.</p>` };
  }

  /* ----- النماذج ----- */
  const formView = (title, sub, formId, inner, label = 'حفظ', extra = '') => ({ chrome: 'form', title, sub, html: `<form id="${formId}" data-form="${formId}">${inner}<div id="form-error" class="form-error hidden" role="alert"></div></form>${extra}`, bar: `<div class="actionbar">${K.submitBtn(label, formId)}</div>` });

  function companyForm(d, id) {
    const c = id ? M.company(d, id) : {};
    if (id && !c) return missing('الشركة غير موجودة.');
    return formView(id ? 'تعديل شركة' : 'إضافة شركة', c.name || '', 'company-form', `<input type="hidden" name="id" value="${E(c.id || '')}">${K.fields(
      K.field({ name: 'name', label: 'اسم الشركة', value: c.name, required: true, autocomplete: 'organization' }) +
      K.field({ name: 'prefixes', label: 'بادئات الأرقام', value: (c.prefixes || []).join('، '), required: true, inputmode: 'numeric', placeholder: 'مثال: 77، 78', help: 'يمكن الفصل بفاصلة عربية أو إنجليزية أو سطر جديد.' }) +
      K.field({ name: 'lengths', label: 'أطوال الأرقام', value: (c.lengths || [9]).join('، '), required: true, inputmode: 'numeric', placeholder: 'مثال: 9' }) +
      K.toggle('active', 'الشركة فعالة', c.active !== false))}<p class="note">تُدار مدة الحماية وتكلفتها بالنقاط في «باقات الحماية»، وتُدار جدولة المهام في «إعدادات المهام» بصورة مستقلة عن بيانات الشركة.</p>`);
  }
  function packageForm(d, id) {
    const p = id ? d.packages.find(x => x.id === id) : {};
    if (id && !p) return missing('الباقة غير موجودة.');
    return formView(id ? 'تعديل باقة' : 'إضافة باقة', p.name || 'باقة نقاط', 'package-form', `<input type="hidden" name="id" value="${E(p.id || '')}">${K.fields(
      K.field({ name: 'name', label: 'اسم الباقة', value: p.name, required: true }) +
      K.field({ name: 'points', label: 'عدد النقاط', type: 'number', min: 1, step: 1, value: p.points, required: true, inputmode: 'numeric' }) +
      K.field({ name: 'price', label: 'السعر المالي (ريال يمني)', type: 'number', min: 1, step: 'any', value: p.price, required: true, inputmode: 'decimal' }) +
      K.toggle('active', 'متاحة للشراء', p.active !== false))}`);
  }
  function protectionForm(d, id) {
    const p = id ? (d.protectionPackages || []).find(x => x.id === id) : {};
    if (id && !p) return missing('باقة الحماية غير موجودة.');
    if (!d.companies.length) return { chrome: 'form', title: 'إضافة باقة حماية', html: K.empty('أضف شركة أولًا قبل إنشاء باقة حماية.', 'building', 'لا توجد شركات'), bar: `<div class="actionbar">${K.btn('إضافة شركة', 'go', 'primary', 'data-to="company/new"')}</div>` };
    return formView(id ? 'تعديل باقة حماية' : 'إضافة باقة حماية', p.name || '', 'protection-form', `<input type="hidden" name="id" value="${E(p.id || '')}">${K.fields(
      K.field({ name: 'companyId', label: 'الشركة', type: 'select', value: p.companyId, required: true, options: d.companies.map(c => [c.id, c.name]) }) +
      K.field({ name: 'name', label: 'اسم باقة الحماية', value: p.name, required: true }) +
      K.field({ name: 'days', label: 'مدة الحماية بالأيام', type: 'number', min: 1, step: 1, value: p.days, required: true, inputmode: 'numeric' }) +
      K.field({ name: 'pointsCost', label: 'تكلفة الاشتراك بالنقاط', type: 'number', min: 1, step: 1, value: p.pointsCost, required: true, inputmode: 'numeric' }) +
      K.toggle('active', 'متاحة للاشتراك', p.active !== false))}`);
  }
  function paymentForm(d, id) {
    const m = id ? d.paymentMethods.find(x => x.id === id) : {};
    if (id && !m) return missing('وسيلة الدفع غير موجودة.');
    return formView(id ? 'تعديل وسيلة دفع' : 'إضافة وسيلة دفع', m.name || '', 'payment-form', `<input type="hidden" name="id" value="${E(m.id || '')}">${K.fields(
      K.field({ name: 'name', label: 'الاسم', value: m.name, required: true }) +
      K.field({ name: 'summary', label: 'معلومات مختصرة', value: m.summary }) +
      K.field({ name: 'instructions', label: 'تعليمات الدفع', type: 'textarea', value: m.instructions, required: true, rows: 5 }) +
      K.toggle('active', 'متاحة', m.active !== false))}`);
  }

  function taskSettings(d) {
    return { chrome: 'tabs', tab: 'more', html: `${K.bar('إعدادات المهام الدورية', 'اختر شركة لتعديل خياراتها')}${d.companies.length ? K.card(d.companies.map(c => { const s = c.taskSchedule || {}; return K.row({ icon: 'sliders', title: c.name, sub: `الفاصل ${taskDays(s.intervalDays)} · المصروف ${YER(s.expenseAmount)}`, sub2: `الظهور قبل الاستحقاق ${taskDays(s.visibleBeforeDays ?? 1)}`, pill: K.pill(c.active === false ? 'متوقفة' : 'فعالة', c.active === false ? 'bad' : 'ok'), to: `company/${c.id}/tasks` }); })) : K.empty('أضف شركة أولًا.', 'building')}` };
  }
  function companyTasks(d, id) {
    const c = M.company(d, id);
    if (!c) return missing('الشركة غير موجودة.');
    const g = c.taskSchedule || {};
    return formView('إعدادات المهام', c.name, 'task-settings-form', `<input type="hidden" name="companyId" value="${E(c.id)}">${K.fields(
      K.field({ name: 'intervalDays', label: 'الفاصل الزمني بين المهام (أيام)', type: 'number', min: 1, step: 1, value: g.intervalDays, required: true, inputmode: 'numeric' }) +
      K.field({ name: 'visibleBeforeDays', label: 'مدة ظهور المهمة قبل موعدها (أيام)', type: 'number', min: 0, step: 1, value: g.visibleBeforeDays, required: true, inputmode: 'numeric' }) +
      K.field({ name: 'expenseAmount', label: 'مصروف المهمة (ريال يمني)', type: 'number', min: 0.01, step: 0.01, value: g.expenseAmount, required: true, inputmode: 'decimal' }) +
      K.field({ name: 'graceDays', label: 'فترة السماح بعد انتهاء الحماية (أيام)', type: 'number', min: 0, step: 1, value: g.graceDays, required: true, inputmode: 'numeric' }))}
<div style="height:12px"></div>${K.fields(
      K.toggle('createFirstOnActivation', 'إنشاء المهمة الأولى عند التفعيل', g.createFirstOnActivation === true) +
      K.toggle('allowReschedule', 'السماح بإعادة الجدولة', g.allowReschedule === true) +
      K.toggle('createAfterExpiry', 'إنشاء مهام بعد انتهاء الحماية', !!g.createAfterExpiry) +
      K.toggle('allowDuringGrace', 'السماح بالتنفيذ أثناء فترة السماح', !!g.allowDuringGrace))}
<p class="note">يعيد الحفظ حساب المهام المفتوحة للاشتراكات الفعالة؛ المهام المنفذة لا تتغير.</p>`, 'حفظ إعدادات هذه الشركة');
  }

  /* ------------------------------------------------------------------ */
  function notices(d) {
    const x = d.notificationSettings || {}, log = d.notifications.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return { chrome: 'tabs', tab: 'more', html: `${K.bar('الإشعارات', 'محلية داخل هذه المعاينة', K.tileAction('notice-open', 'plus', 'إنشاء إشعار إداري'))}
${K.section('أنواع إشعارات النظام')}${K.fields(
      K.toggle('purchaseStatus', 'حالة طلب شراء النقاط', x.purchaseStatus, 'يُرسل للعميل عند اعتماد الطلب أو رفضه', 'data-setting="purchaseStatus"') +
      K.toggle('taskUpdates', 'تحديثات المهام', x.taskUpdates, 'عند تنفيذ مهمة على رقم للعميل', 'data-setting="taskUpdates"') +
      K.toggle('subscriptionExpiring', 'قرب انتهاء الاشتراك', x.subscriptionExpiring, 'إعداد فقط؛ لا ينشئ مجدولًا خلفيًا في هذه المعاينة', 'data-setting="subscriptionExpiring"'))}
${K.section('سجل الإشعارات', N(log.length))}${log.length ? K.card(log.slice(0, 100).map(n => K.row({ icon: 'bell', tone: n.readAt ? '' : 'dark', title: n.title, sub: E(n.body), sub2: `إلى ${E(M.customer(d, n.customerId)?.name || '—')} · ${n.readAt ? 'مقروء' : 'غير مقروء'}` }))) : K.empty('لا توجد إشعارات محلية بعد.', 'bell')}${log.length > 100 ? K.note('يعرض أحدث 100 إشعار.') : ''}` };
  }

  const CONTENT = [['terms', 'الشروط والأحكام'], ['privacy', 'سياسة الخصوصية'], ['contact', 'بيانات التواصل']];
  function content(d) {
    return { chrome: 'tabs', tab: 'more', html: `${K.bar('المحتوى', 'نصوص تظهر في تطبيق العميل')}${K.card(CONTENT.map(([k, l]) => K.row({ icon: 'text', title: l, sub: E((d.content?.[k] || '').trim().slice(0, 70) || 'لم يُضف نص بعد'), to: 'content/' + k })))}` };
  }
  function contentEdit(d, key) {
    const it = CONTENT.find(x => x[0] === key);
    if (!it) return missing('نوع المحتوى غير معروف.');
    return formView(it[1], 'تعديل النص محليًا', 'content-form', `<input type="hidden" name="kind" value="${E(key)}">${K.fields(K.field({ name: 'value', label: it[1], type: 'textarea', value: d.content?.[key] || '', rows: 12 }))}`, 'حفظ النص');
  }

  function audit(d, ui) {
    const all = d.operations.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const list = () => {
      const rows = all.filter(o => match(ui.q, o.summary, o.type, o.entityType, o.entityId, o.actorId));
      if (!rows.length) return emptyQ(!!ui.q, 'لا توجد أحداث تطابق البحث.', 'لا توجد أحداث مسجلة بعد.', 'audit');
      return K.card(rows.slice(0, 300).map(o => K.row({ icon: 'audit', title: o.summary || o.type || 'عملية', sub: `${E(o.type || '—')} · ${E(o.entityType || '—')}`, sub2: `${E(DT(o.createdAt))} · المنفذ ${E(o.actorId || 'system')}`, pill: K.pill(o.result || 'success', (o.result || 'success') === 'success' ? 'ok' : 'bad') }))) + (rows.length > 300 ? K.note('يعرض أحدث 300 حدث من أصل ' + N(rows.length) + '.') : '');
    };
    return { chrome: 'tabs', tab: 'more', list, html: `${K.bar('سجل التدقيق', 'أحداث المخزن المحلي')}<p class="note" style="margin-top:-6px">سجل محلي للأحداث المسجلة داخل هذه المعاينة؛ لا يمثل سجلًا آمنًا ضد تعديل بيانات المتصفح.</p>${K.toolbar('ابحث في الأحداث', ui.q)}<div id="listbody">${list()}</div>` };
  }

  function search(d, ui) {
    const results = () => {
      const q = ui.q.trim().toLowerCase();
      if (!q) return K.empty('اكتب اسم عميل أو رقمًا أو مرجع طلب أو اسم شركة.', 'search');
      const g = [];
      const cs = d.customers.filter(c => `${c.name} ${c.email} ${c.accountId}`.toLowerCase().includes(q));
      const ns = d.numbers.filter(n => String(n.number).includes(q));
      const rs = d.purchaseRequests.filter(r => `${r.id} ${r.paymentReference}`.toLowerCase().includes(q));
      const co = d.companies.filter(c => String(c.name).toLowerCase().includes(q));
      if (cs.length) g.push(K.section('العملاء', N(cs.length)) + K.card(cs.map(c => K.row({ icon: 'user', title: c.name, sub: E(c.email), to: 'customer/' + c.id }))));
      if (ns.length) g.push(K.section('الأرقام', N(ns.length)) + K.card(ns.map(n => K.row({ icon: 'phone', title: n.number, ltr: true, sub: E(M.company(d, n.companyId)?.name || ''), to: 'number/' + n.id }))));
      if (rs.length) g.push(K.section('طلبات النقاط', N(rs.length)) + K.card(rs.map(r => K.row({ icon: 'receipt', title: M.customer(d, r.customerId)?.name || r.id, sub: `المرجع ${E(r.paymentReference || '—')}`, pill: K.pill(M.status(r.status), M.tone(r.status)), to: 'request/' + r.id }))));
      if (co.length) g.push(K.section('الشركات', N(co.length)) + K.card(co.map(c => K.row({ icon: 'building', title: c.name, sub: E((c.prefixes || []).join('، ')), to: 'company/' + c.id }))));
      return g.length ? g.join('') : K.empty('لا توجد نتائج.', 'search');
    };
    return { chrome: 'focus', title: 'البحث الشامل', sub: 'العملاء والأرقام والطلبات والشركات', results, autofocus: true, html: `${K.toolbar('اكتب كلمة البحث', ui.q)}<div id="listbody">${results()}</div>` };
  }

  function account(d) {
    const dark = localStorage.getItem('aman.customer.theme') === 'dark';
    return { chrome: 'tabs', tab: 'more', html: `${K.bar('الحساب الإداري', d.admin.email)}
<div class="hero"><div class="hero-top">${K.tile('user')}<div><h2>${E(d.admin.name)}</h2><p class="ltr">${E(d.admin.email)}</p></div></div><small>معرّف الإدارة</small><div class="ltr" style="font-size:16px;font-weight:700">${E(d.admin.id)}</div></div>
<p class="note">هذه جلسة إدارة تجريبية محلية، وليست مصادقة إنتاجية.</p>
${K.section('المظهر')}${K.fields(K.toggle('adminDark', 'الوضع الداكن', dark, 'يُشارك مع تفضيل مظهر تطبيق العميل على هذا المتصفح', 'id="adminDark"'))}
${K.section('البيانات')}${K.card([K.row({ icon: 'download', title: 'تنزيل نسخة احتياطية للبيانات', sub: 'ملف JSON محلي قد يتضمن بيانات شخصية؛ احفظه في مكان خاص', act: 'export-data' })])}
<div style="margin-top:20px">${K.btn('تسجيل الخروج', 'logout-open', '', '', 'logout')}</div>` };
  }

  function missing(msg) { return { chrome: 'focus', title: 'غير موجود', html: K.empty(msg, 'info', 'تعذر العثور على السجل'), bar: '' }; }
  function notFound() { return missing('هذه الصفحة غير موجودة.'); }

  /* ------------------------------------------------------------------ */
  function build(route, d, ui) {
    const [name = 'home', a, b] = String(route || 'home').split('/');
    switch (name) {
      case 'home': return home(d, ui);
      case 'requests': return requests(d, a, ui);
      case 'request': return request(d, a);
      case 'tasks': return tasks(d, a, ui);
      case 'task': return task(d, a);
      case 'customers': return customers(d, a, ui);
      case 'customer': return customer(d, a, b);
      case 'numbers': return numbers(d, a, ui);
      case 'number': return numberDetail(d, a);
      case 'finance': return financeScreen(d, a);
      case 'finance-entry': return financeEntry(d, a);
      case 'more': return more(d);
      case 'companies': return companies(d, ui);
      case 'company': return a === 'new' ? companyForm(d) : b === 'edit' ? companyForm(d, a) : b === 'tasks' ? companyTasks(d, a) : company(d, a);
      case 'task-settings': return taskSettings(d);
      case 'packages': return packages(d, ui);
      case 'package': return a === 'new' ? packageForm(d) : b === 'edit' ? packageForm(d, a) : pkg(d, a);
      case 'protection': return a === 'new' ? protectionForm(d) : b === 'edit' ? protectionForm(d, a) : a ? prot(d, a) : protection(d, ui);
      case 'payments': return payments(d, ui);
      case 'payment': return a === 'new' ? paymentForm(d) : b === 'edit' ? paymentForm(d, a) : pay(d, a);
      case 'notices': return notices(d);
      case 'content': return a ? contentEdit(d, a) : content(d);
      case 'audit': return audit(d, ui);
      case 'search': return search(d, ui);
      case 'account': return account(d);
      default: return notFound();
    }
  }
  root.AmanAdminScreens = { build, login };
})(window);
