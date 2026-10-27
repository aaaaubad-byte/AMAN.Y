/* AMAN Admin — غلاف التطبيق: التوجيه، النوافذ السفلية، النماذج والعمليات.
   كل الكتابة تمر عبر AmanData (المخزن المحلي AMAN_SHARED_REGISTRY_V2)؛ لا منطق أعمال هنا. */
(function () {
  'use strict';
  const D = AmanData, U = AmanUI, K = AmanAdminKit, M = AmanAdminModel, S = AmanAdminScreens, X = AmanExpiry, EX = AmanAdminExpiry;
  const E = K.esc, N = U.fmt, $ = s => document.querySelector(s);
  const ADMIN = 'admin-demo';
  const TABS = [['home', 'الرئيسية', 'home'], ['requests', 'الطلبات', 'receipt'], ['tasks', 'المهام', 'tasks'], ['customers', 'العملاء', 'users'], ['more', 'المزيد', 'grid']];
  const TAB_OF = { home: 'home', requests: 'requests', request: 'requests', tasks: 'tasks', task: 'tasks', customers: 'customers', customer: 'customers' };

  const ui = {
    logged: sessionStorage.getItem('aman.admin') === '1', route: 'home', q: '', filter: 'all', view: null, sheet: false, busy: false, scroll: {}, selecting: false, sel: [],
    demo: new URLSearchParams(location.search).get('demo') === '1'
  };

  /* ===================== الدخول وتذكر البريد (البريد فقط) ===================== */
  function rememberedCredentials(kind) {
    try {
      const key = `aman.${kind}.remember`, v = JSON.parse(localStorage.getItem(key) || 'null'), result = { email: String(v?.email || ''), enabled: !!v?.enabled };
      if (v && Object.prototype.hasOwnProperty.call(v, 'password')) { if (result.enabled) localStorage.setItem(key, JSON.stringify(result)); else localStorage.removeItem(key); }
      return result;
    } catch { return { email: '', enabled: false }; }
  }
  function saveRememberedCredentials(kind, email, enabled) {
    if (enabled) localStorage.setItem(`aman.${kind}.remember`, JSON.stringify({ email, enabled: true }));
    else localStorage.removeItem(`aman.${kind}.remember`);
  }

  /* ===================== المظهر ===================== */
  function applyTheme() {
    const t = localStorage.getItem('aman.customer.theme') || 'light';
    document.body.classList.toggle('dark', t === 'dark' || (t === 'device' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches));
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', document.body.classList.contains('dark') ? '#0c0d0d' : '#f1f3f2');
  }

  /* ===================== التوجيه وسجل الرجوع ===================== */
  // رابط فيه % مشوّه لا يجوز أن يكسر التطبيق: يُعامَل كمسار غير معروف فيعود إلى الرئيسية
  const hashRoute = () => { try { return decodeURIComponent(location.hash.replace(/^#\/?/, '')) || 'home'; } catch { return 'home'; } };
  const histState = () => (history.state && history.state.amanAdmin ? history.state : null);
  const isForm = r => /^(company\/(new|[^/]+\/(edit|tasks))|package\/(new|[^/]+\/edit)|protection\/(new|[^/]+\/edit)|payment\/(new|[^/]+\/edit)|content\/[^/]+|customer-classes|expiry\/[^/]+\/class\/[^/]+)$/.test(r);
  function parentOf(r) {
    const [n, a, b] = r.split('/');
    if (n === 'request') return 'requests/pending';
    if (n === 'task') return 'tasks/available';
    if (n === 'customer') return 'customers/all';
    if (n === 'number') return 'numbers/active';
    if (n === 'finance-entry') return 'finance';
    if (n === 'company') return b === 'tasks' ? 'task-settings' : (b === 'edit' ? `company/${a}` : 'companies');
    if (n === 'package') return b === 'edit' ? `package/${a}` : 'packages';
    if (n === 'protection' && a) return b === 'edit' ? `protection/${a}` : 'protection';
    if (n === 'payment') return b === 'edit' ? `payment/${a}` : 'payments';
    if (n === 'content' && a) return 'content';
    if (n === 'expiry') return b === 'class' ? `expiry/${a}` : a ? 'expiry' : 'more';
    if (['companies', 'task-settings', 'packages', 'protection', 'payments', 'notices', 'content', 'audit', 'account', 'numbers', 'finance', 'unrecorded', 'templates', 'customer-classes', 'expiry-alerts'].includes(n)) return 'more';
    return 'home';
  }
  function saveScroll() { const s = $('#screen'); if (s) ui.scroll[ui.route] = s.scrollTop; }
  function go(route, { replace = false, keepQuery = false } = {}) {
    if (!route) return;
    closeSheet();
    saveScroll();
    const d = histState()?.d || 0, st = { amanAdmin: true, route, d: replace ? d : d + 1 };
    (replace ? history.replaceState : history.pushState).call(history, st, '', '#/' + route);
    if (ui.route.split('/')[0] !== route.split('/')[0]) { if (!keepQuery) ui.q = ''; }
    ui.filter = 'all'; ui.limit = 0;
    if (route.split('/')[0] !== 'customers') { ui.selecting = false; ui.sel = []; }
    ui.route = route;
    render({ top: true });
  }
  function back(fallback) {
    closeSheet();
    if ((histState()?.d || 0) > 0) history.back();
    else go(fallback || parentOf(ui.route), { replace: true });
  }
  window.addEventListener('popstate', e => {
    if (!ui.logged) return;
    if (ui.sheet) { // زر الرجوع في الهاتف يغلق النافذة السفلية أولًا ولا يغادر الصفحة
      closeSheet();
      history.pushState({ amanAdmin: true, route: ui.route, d: (e.state?.d || 0) + 1 }, '', '#/' + ui.route);
      return;
    }
    const r = e.state?.amanAdmin ? e.state.route : hashRoute();
    if (r !== ui.route) { ui.q = ''; ui.filter = 'all'; ui.limit = 0; if (r.split('/')[0] !== 'customers') { ui.selecting = false; ui.sel = []; } }
    ui.route = r;
    render({ restore: true });
  });

  /* ===================== العرض ===================== */
  function fatal(e) {
    $('#screen').className = 'screen'; $('#bar').innerHTML = ''; $('#tabbar').hidden = true;
    $('#screen').innerHTML = `<div class="card empty" style="margin-top:40px">${K.tile('info', 'bad')}<b>تعذر تحميل البيانات</b><p>${E(e.message)}</p><p>لم تُستبدل البيانات المحفوظة. صدّر نسخة احتياطية قبل أي تغيير في إعدادات المتصفح.</p><div class="empty-action">${K.btn('إعادة المحاولة', 'retry', 'primary')}</div></div>`;
  }
  // إعادة المحاولة (37): هيكل تحميل لحظة ثم إعادة العرض؛ لا تُكتب أي بيانات
  function retryLoad() { const s = $('#screen'); s.className = 'screen'; s.innerHTML = K.skeleton(4); setTimeout(() => render({ top: true }), 350); }
  function render(opt = {}) {
    let d;
    try { d = D.read(); } catch (e) { fatal(e); return; }
    applyTheme();
    const screen = $('#screen'), tabbar = $('#tabbar'), barEl = $('#bar'), keepTop = screen.scrollTop;
    if (!ui.logged) {
      const v = S.login(rememberedCredentials('admin'), ui.demo);
      ui.view = v; screen.className = 'screen auth dark-auth'; screen.innerHTML = v.html; barEl.innerHTML = ''; tabbar.hidden = true;
      { const els = [...screen.querySelectorAll('input:not([type=checkbox]):not([type=hidden])')]; (els.find(i => !i.value) || els[0])?.focus({ preventScroll: true }); }
      return;
    }
    const v = EX.build(ui.route, d, ui) || S.build(ui.route, d, ui); ui.view = v;
    let html = v.html;
    if (v.title) html = K.bar(v.title, v.sub || '', v.end || '') + html;
    screen.className = 'screen' + (v.bar ? ' with-bar' : '');
    screen.innerHTML = html;
    barEl.innerHTML = v.bar || '';
    const active = v.tab || TAB_OF[ui.route.split('/')[0]] || 'more';
    const pend = d.purchaseRequests.filter(r => r.status === 'pending').length;
    tabbar.hidden = v.chrome !== 'tabs' || !!v.hideTabs;
    tabbar.innerHTML = TABS.map(([k, label, icon]) => `<button type="button" class="tab" data-act="go" data-to="${k === 'requests' ? 'requests/pending' : k === 'tasks' ? 'tasks/available' : k === 'customers' ? 'customers/all' : k}" ${k === active ? 'aria-current="page"' : ''}>${K.ico(icon)}<span>${label}</span>${k === 'requests' && pend ? `<i class="badge" aria-label="${pend} طلب معلق">${N(pend)}</i>` : ''}</button>`).join('');
    document.title = (v.title ? v.title + ' | ' : '') + 'أمان | الإدارة';
    if (opt.top) screen.scrollTop = 0; else if (opt.restore) screen.scrollTop = ui.scroll[ui.route] || 0; else screen.scrollTop = keepTop;
    if (v.autofocus && !opt.restore) $('#q')?.focus();
    else if (v.chrome === 'form' && !opt.restore) [...screen.querySelectorAll('input:not([type=hidden]):not([type=checkbox]),textarea,select')].find(i => !i.value)?.focus({ preventScroll: true });
  }
  function refreshList() { const b = $('#listbody'); if (b && ui.view) b.innerHTML = ui.view.list ? ui.view.list() : ui.view.results ? ui.view.results() : b.innerHTML; }

  /* ===================== التنبيه والنوافذ ===================== */
  /* إشعار قصير (58). undo = { fn, label? } للإجراءات الإدارية غير المالية القابلة للعكس بأمان فقط (24)؛ لا تراجع للاعتماد/الرفض/التنفيذ/القيود. */
  function toast(text, bad = false, undo = null) {
    const e = $('#toast'); clearTimeout(toast.t); ui.undo = undo;
    e.replaceChildren(Object.assign(document.createElement('span'), { textContent: text }));
    if (undo) { const b = Object.assign(document.createElement('button'), { type: 'button', className: 'toast-undo', textContent: undo.label || 'تراجع' }); b.dataset.act = 'toast-undo'; e.append(b); }
    e.classList.remove('hidden', 'error'); e.classList.toggle('error', bad); e.classList.toggle('has-undo', !!undo); e.classList.toggle('up', !!$('#bar .actionbar'));
    toast.t = setTimeout(() => { e.classList.add('hidden'); ui.undo = null; }, undo ? 6500 : 3800);
  }
  function openSheet(title, body, foot) {
    ui.sheet = true; $('#sheetRoot').innerHTML = K.sheet(title, body, foot);
    setTimeout(() => $('#sheetRoot input:not([type=hidden]),#sheetRoot textarea,#sheetRoot select')?.focus(), 30);
  }
  function closeSheet() { if (!ui.sheet) return; ui.sheet = false; $('#sheetRoot').innerHTML = ''; }
  function showError(msg) {
    const el = document.querySelector('#sheetRoot #form-error') || $('#form-error');
    if (el) { el.textContent = msg; el.classList.remove('hidden'); el.scrollIntoView?.({ block: 'nearest' }); return true; }
    toast(msg, true); return false;
  }
  function clearError() { document.querySelectorAll('#form-error').forEach(e => e.classList.add('hidden')); }
  const lockables = () => document.querySelectorAll('[data-submit],.btn[data-confirm]');
  // تعطيل الأزرار مع مؤشر تقدم (26)؛ لا يُعاد تمكين زر كان معطّلًا أصلًا
  async function run(fn) {
    if (ui.busy) return false;
    ui.busy = true; clearError(); clearFieldErrors();
    const locked = [...lockables()].filter(b => !b.disabled);
    locked.forEach(b => { b.disabled = true; b.classList.add('busy'); b.setAttribute('aria-busy', 'true'); });
    try { await fn(); return true; }
    catch (err) { showError(err?.message || 'تعذرت العملية ولم تُحفظ.'); return false; }
    finally { ui.busy = false; locked.forEach(b => { b.disabled = false; b.classList.remove('busy'); b.removeAttribute('aria-busy'); }); }
  }
  /* أخطاء بجانب الحقول (13) */
  const fieldBox = id => document.getElementById(id)?.closest('.field,.afield');
  function setFieldError(id, msg) {
    const input = document.getElementById(id), box = document.getElementById(id + '-err');
    if (!input || !box) return false;
    box.textContent = msg; box.classList.remove('hidden'); input.setAttribute('aria-invalid', 'true'); fieldBox(id)?.classList.add('invalid'); return true;
  }
  function clearFieldError(id) {
    const input = document.getElementById(id), box = document.getElementById(id + '-err');
    if (box) { box.textContent = ''; box.classList.add('hidden'); }
    input?.removeAttribute('aria-invalid'); fieldBox(id)?.classList.remove('invalid');
  }
  const clearFieldErrors = () => document.querySelectorAll('.ferr').forEach(b => b.id && clearFieldError(b.id.replace(/-err$/, '')));
  // التحقق الأصلي للمتصفح (required/minlength) يُعرض بجانب الحقل بدل فقاعة المتصفح
  document.addEventListener('invalid', e => {
    e.preventDefault(); const t = e.target; if (!t.id) return;
    const msg = t.validity.valueMissing ? 'هذا الحقل مطلوب.' : t.validity.tooShort ? 'القيمة أقصر من الحد الأدنى.' : t.validity.typeMismatch ? 'الصيغة غير صحيحة.' : (t.validationMessage || 'القيمة غير صالحة.');
    if (!t.form?.querySelector('[aria-invalid=true]')) t.focus?.();
    setFieldError(t.id, msg);
  }, true);
  // نسخ مع إشعار بالنتيجة (16)
  async function copyText(value, what) {
    value = String(value ?? '');
    if (!value) { toast(`لا يوجد ${what} للنسخ.`, true); return; }
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(value);
      else { const t = document.createElement('textarea'); t.value = value; t.setAttribute('readonly', ''); t.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(t); t.select(); const ok = document.execCommand('copy'); t.remove(); if (!ok) throw new Error('copy'); }
      toast(`تم نسخ ${what}.`);
    } catch { toast(`تعذر النسخ. انسخه يدويًا: ${value}`, true); }
  }
  const formFoot = label => K.submitBtn(label, 'sheet-form') + K.btn('إلغاء', 'sheet-close');
  const errBox = '<div id="form-error" class="form-error hidden" role="alert"></div>';

  /* ===================== نوافذ العمليات ===================== */
  const strong = t => `<b style="color:var(--ink)">${t}</b>`;
  // ترتيب قائمة الطلبات المعلقة كما تُعرض (الأحدث أولًا): «التالي» هو الطلب المعلق الذي يلي الحالي (بند 22/93)
  const pendingIds = d => d.purchaseRequests.filter(r => r.status === 'pending').sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).map(r => r.id);
  const nextPendingAfter = (d, id) => { const ids = pendingIds(d), i = ids.indexOf(id); return ids.filter(x => x !== id)[Math.max(0, i)] || ''; };
  function reviewSheet(id, decision) {
    const d = D.read(), r = d.purchaseRequests.find(x => x.id === id);
    if (!r) return toast('الطلب غير موجود.', true);
    const ok = decision === 'approved', pk = r.packageSnapshot || {}, c = M.customer(d, r.customerId), dup = D.duplicateReferences(d, r), next = nextPendingAfter(d, id);
    const tpls = (d.messageTemplates || []).filter(t => t.kind === (ok ? 'reply' : 'reject'));
    const chips = tpls.length ? `<div class="tpl-chips" role="group" aria-label="قوالب جاهزة">${tpls.map(t => `<button type="button" class="tpl-chip" data-act="tpl-apply" data-text="${E(t.body)}">${E(t.title)}</button>`).join('')}</div>` : '';
    const dupWarn = dup.same.length ? K.callout('info', 'مرجع مكرر', `<small style="display:block;line-height:1.9;margin-top:4px">استُخدم المرجع نفسه بوسيلة الدفع نفسها في ${N(dup.same.length)} طلب آخر. ${ok ? 'تحقق قبل الاعتماد.' : ''}</small>`, false, 'id="dupSheetAlert"') : '';
    openSheet(ok ? 'اعتماد طلب النقاط' : 'رفض طلب النقاط',
      `<p class="sheet-text">${ok ? `سيُضاف ${strong(N(pk.points) + ' نقطة')} إلى رصيد ${E(c?.name || 'العميل')}، ويُسجَّل إيراد ${strong(N(pk.price) + ' ر.ي')} في السجل المالي مرة واحدة. الاعتماد يخص طلب الشراء فقط ولا ينشئ اشتراكًا لأي رقم.` : 'سيُرفض الطلب دون إضافة نقاط أو تسجيل إيراد، ولا يمكن مراجعته مرة ثانية. يرى العميل السبب في تفاصيل الطلب وفي إشعاره.'}</p>${dupWarn}
<div class="fields"><div class="field"><label for="reviewNote">${ok ? 'ملاحظة المراجعة (تظهر للعميل، اختياري)' : 'سبب الرفض (يظهر للعميل)'}</label>${chips}<textarea id="reviewNote" name="note" rows="3" maxlength="300" placeholder="${ok ? 'يمكنك اختيار قالب أو كتابة نص' : 'اختر قالبًا وعدّل نصه أو اكتب السبب'}"></textarea></div></div>${errBox}`,
      K.btn(ok ? 'تأكيد الاعتماد' : 'تأكيد الرفض', 'review-confirm', 'primary', `data-confirm data-id="${E(id)}" data-decision="${decision}"`) + (next ? K.btn(ok ? 'اعتماد وفتح التالي' : 'رفض وفتح التالي', 'review-confirm', '', `data-confirm data-next="${E(next)}" data-id="${E(id)}" data-decision="${decision}"`) : '') + K.btn('إلغاء', 'sheet-close'));
  }
  // تنفيذ كل مهمة على حدة (بنود 23 و92): لا تنفيذ جماعي؛ يؤكد المدير أنه سدّد فعليًا خارج النظام ثم يسجّل التنفيذ.
  function executeSheet(id) {
    const d = D.read(), t = d.tasks.find(x => x.id === id);
    if (!t) return toast('المهمة غير موجودة.', true);
    const next = M.nextAvailableAfter(d, D, id), n = M.number(d, t.numberId);
    openSheet(new Date(t.dueAt) > Date.now() ? 'تسجيل تنفيذ المهمة مبكرًا' : 'تسجيل تنفيذ المهمة',
      `<p class="sheet-text">الرقم ${n ? `<span class="ltr">${E(n.number)}</span>` : ''}. سيُسجَّل مصروف المهمة ${strong(N(t.expenseAmount) + ' ر.ي')} في السجل المالي مرة واحدة، وتُنشأ المهمة التالية من وقت التنفيذ الفعلي وفق إعدادات الشركة. لا يتغير رصيد نقاط العميل. لا يمكن تسجيل أكثر من مهمة في العملية الواحدة.</p>
<div class="fields"><label class="toggle"><span>نفّذت السداد فعليًا عبر وسيلة الدفع الخارجية<small>التسجيل يوثّق ما تم؛ لا يُنفَّذ السداد من هنا.</small></span><input class="switch" type="checkbox" role="switch" id="paidConfirm"></label></div>${errBox}`,
      K.btn('تسجيل التنفيذ', 'execute-confirm', 'primary', `data-confirm data-id="${E(id)}"`) + (next ? K.btn('تسجيل التنفيذ وفتح التالية', 'execute-confirm', '', `data-confirm data-next="${E(next.id)}" data-id="${E(id)}"`) : '') + K.btn('إلغاء', 'sheet-close'));
  }
  function reschedSheet(id) {
    const t = D.read().tasks.find(x => x.id === id);
    if (!t) return toast('المهمة غير موجودة.', true);
    const local = new Date(new Date(t.dueAt).getTime() + 10800000).toISOString().slice(0, 16);
    openSheet('إعادة جدولة المهمة', `<form id="sheet-form" data-form="resched"><input type="hidden" name="taskId" value="${E(t.id)}">${K.fields(K.field({ name: 'dueAt', label: 'الموعد الجديد', type: 'datetime-local', value: local, required: true }))}<p class="note">يُحدَّث الموعد والمواعيد اللاحقة في الخطة دون إعادة ضبط دورة المهام (بتوقيت صنعاء).</p>${errBox}</form>`, formFoot('حفظ الموعد الجديد'));
  }
  function financeAddSheet() {
    openSheet('إضافة قيد مالي يدوي', `<form id="sheet-form" data-form="finance-add">${K.fields(K.field({ name: 'kind', label: 'نوع القيد', type: 'select', value: 'revenue', options: [['revenue', 'إيراد'], ['expense', 'مصروف']] }) + K.field({ name: 'amount', label: 'القيمة بالريال اليمني', type: 'number', min: 0.01, step: 0.01, required: true, inputmode: 'decimal' }) + K.field({ name: 'description', label: 'البيان', required: true }))}<p class="note">القيد اليدوي لا يغير رصيد نقاط أي عميل.</p>${errBox}</form>`, formFoot('حفظ القيد'));
  }
  function reverseSheet(id) {
    const x = D.read().financeEntries.find(e => e.id === id);
    if (!x) return toast('القيد المالي غير موجود.', true);
    openSheet('عكس قيد مالي', `<p class="sheet-text">سيُنشأ قيد معاكس بالمبلغ نفسه (${N(x.amount)} ر.ي) مع الاحتفاظ بالقيد الأصلي. لا يمكن عكس القيد نفسه مرتين.</p><form id="sheet-form" data-form="finance-reverse"><input type="hidden" name="entryId" value="${E(id)}">${K.fields(K.field({ name: 'reason', label: 'سبب العكس', type: 'textarea', required: true, minlength: 3, rows: 3, placeholder: 'اكتب سبب التصحيح' }))}${errBox}</form>`, formFoot('تأكيد عكس القيد'));
  }
  function addNumberSheet(customerId = '') {
    const d = D.read();
    if (!d.customers.length) return toast('أنشئ حساب العميل أولًا من تطبيق العميل.', true);
    openSheet('إضافة رقم لعميل', `<form id="sheet-form" data-form="admin-number">${K.fields(K.field({ name: 'customerId', label: 'العميل', type: 'select', value: customerId, required: true, options: d.customers.map(c => [c.id, `${c.name} — ${c.email}`]) }) + K.field({ name: 'number', label: 'رقم الهاتف', required: true, inputmode: 'numeric', dir: 'ltr' }))}<p class="note">إضافة الرقم لا تخصم نقاطًا ولا تنشئ اشتراكًا؛ تُكتشف الشركة من بادئة الرقم.</p>${errBox}</form>`, formFoot('إضافة الرقم'));
  }
  function noticeSheet() {
    const d = D.read();
    openSheet('إنشاء إشعار إداري', `<form id="sheet-form" data-form="notice">${K.fields(K.field({ name: 'title', label: 'العنوان', required: true }) + K.field({ name: 'body', label: 'النص', type: 'textarea', required: true, rows: 3 }) + K.field({ name: 'audience', label: 'الجمهور', type: 'select', value: 'all', options: [['all', 'كل العملاء'], ['subscribers', 'المشتركون'], ['customer', 'عميل محدد']] }) + `<div id="notice-customer" class="hidden">${K.field({ name: 'customerId', label: 'العميل', type: 'select', options: d.customers.map(c => [c.id, c.name]) })}</div>`)}<p class="note">إشعار محلي داخل هذه المعاينة؛ لا يُرسل خارج المتصفح.</p>${errBox}</form>`, formFoot('إنشاء محليًا'));
  }
  function logoutSheet() {
    openSheet('تسجيل الخروج', '<p class="sheet-text">ستنتهي جلسة الإدارة التجريبية على هذا المتصفح. لا تُحذف أي بيانات محفوظة.</p>', K.btn('تسجيل الخروج', 'logout-confirm', 'primary') + K.btn('إلغاء', 'sheet-close'));
  }
  // حذف تصنيف قرب انتهاء (U11): تأكيد بالأثر؛ لا يمس أي اشتراك أو إشعار سبق إنشاؤه
  function expiryDeleteSheet(coId, classId) {
    const d = D.read(), co = M.company(d, coId), k = X.forCompany(d, coId).classes.find(c => c.id === classId);
    if (!co || !k) return toast('التصنيف غير موجود.', true);
    openSheet('حذف تصنيف', `<p class="sheet-text">سيُحذف التصنيف ${strong(E(k.name))} من شركة ${strong(E(co.name))}؛ لن تظهر شارته ولا فلتره بعد الآن، ولن يُنشأ إشعار جديد له. لا يتأثر أي اشتراك ولا إشعار سبق إنشاؤه. لا يمكن التراجع عن الحذف، ويمكنك إعادة إضافة التصنيف يدويًا.</p>${errBox}`, K.btn('تأكيد الحذف', 'exp-class-delete-confirm', 'primary', `data-confirm data-co="${E(coId)}" data-id="${E(classId)}"`) + K.btn('إلغاء', 'sheet-close'));
  }

  /* ===================== معالجة النقر ===================== */

  /* ===================== العملاء: الحالة والوسوم (U10) ===================== */
  const STATUS_IMPACT = {
    active: 'يعود الحساب فعالًا بلا أي قيود، ويبقى التغيير في السجل الزمني.',
    suspended: 'يُطبَّق الأثر المحدد فقط؛ ما لم تحدده يبقى متاحًا للعميل.',
    blocked: 'يمنع الدخول وشراء النقاط وخدمات الحماية معًا. لا يُحذف شيء: الرصيد والسجلات والاشتراكات السارية ومهامها تبقى كما هي.'
  };
  function syncStatusForm() {
    const f = $('#sheet-form'); if (!f || f.dataset.form !== 'customer-status') return;
    const st = f.elements.status.value;
    $('#restr-box')?.classList.toggle('hidden', st !== 'suspended');
    f.elements.reason.required = st !== 'active';
    const impact = $('#status-impact'); if (impact) impact.textContent = STATUS_IMPACT[st] || '';
  }
  function statusSheet(id) {
    const d = D.read(), c = M.customer(d, id);
    if (!c || c.status === 'deleted') return toast('الحساب غير موجود أو محذوف.', true);
    const cur = c.status || 'active', r = D.restrictionsOf(c);
    const toggles = [['login', 'منع تسجيل الدخول'], ['purchase', 'منع شراء النقاط'], ['protection', 'منع خدمات الحماية (الاشتراك والتمديد والتجديد)']].map(([k, l]) => K.toggle('r_' + k, l, cur === 'suspended' && r[k])).join('');
    openSheet('حالة الحساب',
      `<p class="sheet-text">${E(c.name)} — الحالة الحالية: ${strong(E(M.CUSTOMER_STATUS[cur] || cur))}. لا يُرسَل إشعار للعميل؛ تظهر له رسالة عامة عند الدخول أو العملية الممنوعة ولا يرى السبب.</p>
<form id="sheet-form" data-form="customer-status"><input type="hidden" name="id" value="${E(id)}">${K.fields(
        K.field({ name: 'status', label: 'الحالة الجديدة', type: 'select', value: cur, options: [['active', 'فعال'], ['suspended', 'موقوف'], ['blocked', 'محظور']] }) +
        `<div id="restr-box" class="hidden"><div class="field"><label>الأثر (اختر واحدًا على الأقل)</label>${toggles}</div></div>` +
        K.field({ name: 'reason', label: 'السبب (داخلي، إلزامي عند الإيقاف أو الحظر)', type: 'textarea', rows: 3, value: c.statusReason || '' }))}<p class="note" id="status-impact"></p>${errBox}</form>`,
      formFoot('حفظ الحالة'));
    syncStatusForm();
  }
  const tagSnapshot = ids => { const d = D.read(); return ids.map(id => [id, [...(M.customer(d, id)?.tags || [])]]); };
  const restoreTags = prev => D.transact(ADMIN, 'customer_tags_restored', d => { for (const [id, tags] of prev) { const c = d.customers.find(x => x.id === id); if (c) c.tags = tags; } return { entityType: 'customer_tags', entityId: null, summary: `استعادة وسوم ${prev.length} عميلًا`, details: { customerIds: prev.map(x => x[0]) } }; });
  function tagSheet(mode, ids) {
    const d = D.read(), list = [...new Set(ids)].filter(x => M.customer(d, x) && M.customer(d, x).status !== 'deleted'), add = mode === 'add';
    if (!list.length) return toast('حدد عميلًا واحدًا على الأقل.', true);
    const have = [...new Set(list.flatMap(id => M.customer(d, id).tags || []))].sort((x, y) => x.localeCompare(y, 'ar'));
    const known = [...new Set(d.customers.flatMap(c => c.tags || []))].sort((x, y) => x.localeCompare(y, 'ar'));
    if (!add && !have.length) return toast('لا توجد وسوم على العملاء المحددين.', true);
    const chips = add && known.length ? `<div class="tpl-chips" role="group" aria-label="وسوم موجودة">${known.map(t => `<button type="button" class="tpl-chip" data-act="tag-pick" data-text="${E(t)}">${E(t)}</button>`).join('')}</div>` : '';
    openSheet(add ? 'إضافة وسم' : 'إزالة وسم',
      `<p class="sheet-text">سيُطبَّق على ${strong(N(list.length) + ' عميلًا')}. العملية ذرّية: إن فشلت لا يُحفظ أي تغيير، ويمكنك التراجع بعدها.</p>
<form id="sheet-form" data-form="bulk-tag"><input type="hidden" name="mode" value="${add ? 'add' : 'remove'}"><input type="hidden" name="ids" value="${E(list.join(','))}">${K.fields(add
        ? K.field({ name: 'tag', label: 'اسم الوسم', required: true, help: 'حتى 24 حرفًا. الوسم «مميز» يمنح شارة «مميز».' }) + chips
        : K.field({ name: 'tag', label: 'الوسم المراد إزالته', type: 'select', value: have[0], options: have.map(t => [t, t]) }))}${errBox}</form>`,
      formFoot(add ? 'إضافة الوسم' : 'إزالة الوسم'));
  }
  const withTab = (route, tab) => { const p = route.split('/'); return p[0] === 'customer' ? `customer/${p[1]}/${tab}` : `${p[0]}/${tab}`; };
  document.addEventListener('click', async e => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const a = b.dataset.act, id = b.dataset.id;
    if (a === 'sheet-scrim') { if (e.target === b) closeSheet(); return; }
    try {
      switch (a) {
        case 'go': go(b.dataset.to); return;
        case 'back': back(); return;
        case 'retry': retryLoad(); return;
        case 'clear-filter': ui.q = ''; ui.filter = 'all'; ui.limit = 0; render(); return;
        case 'load-more': ui.limit = (ui.limit || 30) + 30; refreshList(); return;
        case 'toast-undo': { const u = ui.undo; ui.undo = null; $('#toast').classList.add('hidden'); if (u) await run(async () => { await u.fn(); render(); toast('تم التراجع.'); }); return; }
        case 'copy': await copyText(b.dataset.copy, b.dataset.label || 'القيمة'); return;
        case 'tab': go(withTab(ui.route, b.dataset.tab), { replace: true, keepQuery: true }); return;
        case 'sheet-close': closeSheet(); return;
        case 'review-open': reviewSheet(id, b.dataset.decision); return;
        case 'task-execute-open': executeSheet(id); return;
        case 'task-resched-open': reschedSheet(id); return;
        case 'finance-add-open': financeAddSheet(); return;
        case 'finance-reverse-open': reverseSheet(id); return;
        case 'add-number-open': addNumberSheet(b.dataset.customer || ''); return;
        case 'notice-open': noticeSheet(); return;
        case 'logout-open': logoutSheet(); return;
        case 'logout-confirm': sessionStorage.removeItem('aman.admin'); ui.logged = false; closeSheet(); history.replaceState({ amanAdmin: true, route: 'home', d: 0 }, '', '#/home'); ui.route = 'home'; render({ top: true }); return;
        case 'review-confirm': {
          const note = ($('#reviewNote')?.value || '').trim(), decision = b.dataset.decision, next = b.dataset.next || '';
          await run(async () => {
            await D.reviewPurchase(ADMIN, id, decision, note); closeSheet();
            toast((decision === 'approved' ? 'اعتُمد الطلب: أُضيفت النقاط وسُجل الإيراد مرة واحدة، ولم يُنشأ اشتراك.' : 'رُفض الطلب دون نقاط أو إيراد.') + (next ? ' فُتح الطلب التالي للمراجعة، ولم يُعتمد تلقائيًا.' : ''));
            if (next) go('request/' + next, { replace: true }); else render();
          }); return;
        }
        case 'tpl-apply': { const t = $('#reviewNote'); if (t) { t.value = b.dataset.text || ''; t.focus(); } return; }
        case 'cust-select-toggle': ui.selecting = !ui.selecting; ui.sel = []; render({}); return;
        case 'cust-toggle': { const i = ui.sel.indexOf(id); if (i < 0) ui.sel.push(id); else ui.sel.splice(i, 1); render({}); return; }
        case 'cust-select-all': ui.sel = [...new Set([...ui.sel, ...(ui.view?.ids?.() || [])])]; render({}); return;
        case 'cust-copy-selected': {
          if (!ui.sel.length) { toast('حدد عميلًا واحدًا على الأقل.', true); return; }
          const d = D.read(), text = ui.sel.map(x => M.customer(d, x)).filter(Boolean).map(c => M.customerCopyText(d, c, D)).join('\n\n---\n\n');
          await copyText(text, `بيانات ${N(ui.sel.length)} عميلًا`); return;
        }
        case 'cust-status-open': statusSheet(id); return;
        case 'cust-tag-open': tagSheet(b.dataset.mode, b.dataset.ids ? b.dataset.ids.split(',') : ui.sel); return;
        case 'tag-pick': { const t = $('#f_tag'); if (t) { t.value = b.dataset.text || ''; t.focus(); } return; }
        case 'cust-tag-remove': await run(async () => {
          const tag = b.dataset.tag, prev = tagSnapshot([id]); await D.removeCustomerTag(ADMIN, [id], tag); render();
          toast(`أُزيل الوسم «${tag}».`, false, { fn: () => restoreTags(prev) });
        }); return;
        case 'note-add':
          openSheet('ملاحظة داخلية', `<p class="sheet-text">لا تظهر للعميل أبدًا.</p><div class="fields"><div class="field"><label for="noteText">نص الملاحظة</label><textarea id="noteText" rows="4" maxlength="500"></textarea><small class="ferr hidden" id="noteText-err" role="alert"></small></div></div>${errBox}`, K.btn('حفظ الملاحظة', 'note-save', 'primary', `data-type="${E(b.dataset.type)}" data-id="${E(id)}"`) + K.btn('إلغاء', 'sheet-close')); setTimeout(() => $('#noteText')?.focus(), 50); return;
        case 'note-save': await run(async () => { await D.addInternalNote(ADMIN, b.dataset.type, id, $('#noteText')?.value || ''); closeSheet(); render(); toast('حُفظت الملاحظة الداخلية.'); }, 'note'); return;
        case 'note-delete': await run(async () => {
          const prev = (D.read().internalNotes || []).find(x => x.id === id); await D.deleteInternalNote(ADMIN, id); render();
          toast('حُذفت الملاحظة.', false, { fn: () => D.transact(ADMIN, 'internal_note_restored', d => { if (prev && !d.internalNotes.some(x => x.id === prev.id)) d.internalNotes.push(prev); return { entityType: 'internal_note', entityId: id, summary: 'استعادة ملاحظة داخلية' }; }) });
        }); return;
        case 'template-delete': await run(async () => {
          const prev = (D.read().messageTemplates || []).find(x => x.id === id); await D.deleteTemplate(ADMIN, id); back(); 
          toast('حُذف القالب.', false, { fn: () => D.transact(ADMIN, 'template_restored', d => { if (prev && !d.messageTemplates.some(x => x.id === prev.id)) d.messageTemplates.push(prev); return { entityType: 'template', entityId: id, summary: 'استعادة قالب' }; }) });
        }); return;
        case 'execute-confirm': {
          if (!$('#paidConfirm')?.checked) { showError('أكّد أولًا أنك نفّذت السداد فعليًا عبر وسيلة الدفع الخارجية.'); return; }
          const next = b.dataset.next || '';
          await run(async () => {
            await D.executeTask(ADMIN, id); closeSheet();
            toast('سُجّل تنفيذ المهمة ومصروفها مرة واحدة وأُنشئت مهمتها التالية وفق الخطة.' + (next ? ' فُتحت المهمة التالية؛ لم تُنفَّذ تلقائيًا.' : ''));
            if (next) go('task/' + next, { replace: true }); else render();
          }); return;
        }
        case 'unrestrict': await run(async () => { const prev = (({ restricted, restrictionReason, restrictedAt }) => ({ restricted, restrictionReason, restrictedAt }))(D.read().numbers.find(x => x.id === id) || {});
          await D.transact(ADMIN, 'number_restriction_cleared', d => { const n = d.numbers.find(x => x.id === id); if (!n) throw new Error('الرقم غير موجود.'); delete n.restricted; delete n.restrictionReason; delete n.restrictedAt; return { entityType: 'number', entityId: n.id, summary: `رفع تقييد الرقم ${n.number}` }; });
          render(); toast('رُفع التقييد عن الرقم.', false, { fn: () => D.transact(ADMIN, 'number_restriction_restored', d => { const n = d.numbers.find(x => x.id === id); if (!n) throw new Error('الرقم غير موجود.'); Object.entries(prev).forEach(([k, v]) => { if (v !== undefined) n[k] = v; }); return { entityType: 'number', entityId: n.id, summary: `استعادة تقييد الرقم ${n.number}` }; }) }); }); return;
        case 'export-data': {
          const payload = D.exportJSON(), blob = new Blob([payload], { type: 'application/json' }), url = URL.createObjectURL(blob), link = document.createElement('a'), stamp = new Date().toISOString().replace(/[:.]/g, '-');
          link.href = url; link.download = `aman-local-backup-${stamp}.json`; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
          toast('تم تنزيل نسخة البيانات المحلية. احتفظ بها في مكان خاص وآمن.'); return;
        }
        case 'demo-seed': await run(seedDemo); return;
        /* ----- تصنيفات قرب الانتهاء (U11، ق-1) ----- */
        case 'exp-class-delete-open': expiryDeleteSheet(b.dataset.co, id); return;
        case 'exp-class-delete-confirm': await run(async () => { await X.deleteClass(D, ADMIN, b.dataset.co, id); closeSheet(); toast('حُذف التصنيف وسُجل الحدث.'); back(); }); return;
        case 'exp-evaluate': await run(async () => {
          const r = await EX.evaluate(ADMIN); render();
          toast(r.created ? `أُنشئ ${N(r.created)} إشعار قرب انتهاء للعملاء.` : 'لا توجد إشعارات مستحقة؛ لا تُكرَّر إشعارات سبق إنشاؤها.');
        }); return;
      }
    } catch (x) { toast(x.message || 'تعذرت العملية ولم تُحفظ.', true); }
  });

  async function seedDemo() {
    if (new URLSearchParams(location.search).get('demo') !== '1') throw new Error('فعّل وضع المعاينة بإضافة ?demo=1 إلى الرابط.');
    await import('../tests/fixture-data.js');
    const fixture = window.AmanTestFixture;
    if (!fixture?.seedData) throw new Error('تعذر تحميل بيانات المعاينة.');
    const sample = fixture.seedData(), now = Date.now(), earlyTask = sample.tasks.find(t => t.id === 'task-future-demo');
    if (earlyTask) {
      earlyTask.dueAt = new Date(now + 86400000).toISOString(); earlyTask.visibleAt = new Date(now - 3600000).toISOString();
      sample.tasks.push({ ...earlyTask, id: 'task-upcoming-demo', dueAt: new Date(now + 8 * 86400000).toISOString(), visibleAt: new Date(now + 7 * 86400000).toISOString() }, { ...earlyTask, id: 'task-cancelled-demo', status: 'cancelled', dueAt: new Date(now + 15 * 86400000).toISOString(), visibleAt: new Date(now + 14 * 86400000).toISOString() });
    }
    const bytes = new TextEncoder().encode('aman1234'), hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), x => x.toString(16).padStart(2, '0')).join('');
    for (const c of sample.customers) c.authHash = hash;
    const keys = ['customers', 'companies', 'packages', 'paymentMethods', 'purchaseRequests', 'numbers', 'subscriptions', 'pointTransactions', 'tasks', 'operations', 'financeEntries', 'notifications', 'idempotencyKeys', 'protectionPackages', 'protectionOperations', 'numberLinks'];
    await D.transact(ADMIN, 'demo_fixture_loaded', d => {
      if (keys.some(k => (d[k] || []).length)) throw new Error('المخزن يحتوي بيانات بالفعل؛ لم يتم تحميل أو استبدال أي سجل.');
      for (const k of keys) d[k] = Array.isArray(sample[k]) ? sample[k] : [];
      return { entityType: 'demo_fixture', entityId: 'demo-fixture', summary: 'تحميل بيانات معاينة اصطناعية إلى مخزن فارغ' };
    });
    toast('حُمّلت بيانات الاختبار محليًا.'); render();
  }

  /* ===================== معالجة النماذج ===================== */
  const splitValues = v => String(v ?? '').split(/[,،;；\n\r\t ]+/).map(x => x.trim()).filter(Boolean);
  document.addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target, kind = f.dataset.form, fd = new FormData(f);
    if (kind === 'login') {
      const email = String(fd.get('email')).trim().toLowerCase(), password = String(fd.get('password')), remember = fd.get('remember') === 'on';
      if (email !== 'admin@aman.test' || password !== 'admin1234') { clearFieldErrors(); setFieldError('l_pass', 'بيانات الإدارة التجريبية غير صحيحة.'); document.getElementById('l_pass')?.focus(); return; }
      saveRememberedCredentials('admin', email, remember);
      sessionStorage.setItem('aman.admin', '1'); ui.logged = true;
      history.replaceState({ amanAdmin: true, route: 'home', d: 0 }, '', '#/home'); ui.route = 'home'; render({ top: true }); evaluateExpiry(); return;
    }
    await run(async () => {
      switch (kind) {
        case 'company-form': await D.saveCompany(ADMIN, { id: fd.get('id') || undefined, name: fd.get('name'), prefixes: splitValues(fd.get('prefixes')), lengths: splitValues(fd.get('lengths')), active: fd.has('active') }); toast('حُفظت بيانات الشركة وسُجل الحدث.'); back(); return;
        case 'template-form': await D.saveTemplate(ADMIN, { id: fd.get('id') || undefined, kind: fd.get('kind'), title: fd.get('title'), body: fd.get('body') }); toast('حُفظ القالب.'); back(); return;
        case 'package-form': await D.savePackage(ADMIN, { id: fd.get('id') || undefined, name: fd.get('name'), points: fd.get('points'), price: fd.get('price'), active: fd.has('active') }); toast('حُفظت الباقة وسُجل الحدث.'); back(); return;
        case 'protection-form': await D.saveProtectionPackage(ADMIN, { id: fd.get('id') || undefined, companyId: fd.get('companyId'), name: fd.get('name'), days: fd.get('days'), pointsCost: fd.get('pointsCost'), active: fd.has('active') }); toast('حُفظت باقة الحماية وسُجل الحدث.'); back(); return;
        case 'payment-form': await D.savePaymentMethod(ADMIN, { id: fd.get('id') || undefined, name: fd.get('name'), summary: fd.get('summary'), instructions: fd.get('instructions'), active: fd.has('active') }); toast('حُفظت وسيلة الدفع وسُجل الحدث.'); back(); return;
        case 'task-settings-form': await D.saveTaskSettings(ADMIN, fd.get('companyId'), { intervalDays: fd.get('intervalDays'), visibleBeforeDays: fd.get('visibleBeforeDays'), expenseAmount: fd.get('expenseAmount'), graceDays: fd.get('graceDays'), createFirstOnActivation: fd.has('createFirstOnActivation'), allowReschedule: fd.has('allowReschedule'), createAfterExpiry: fd.has('createAfterExpiry'), allowDuringGrace: fd.has('allowDuringGrace') }); toast('حُفظت إعدادات الشركة وأعيد حساب المهام المفتوحة.'); back(); return;
        case 'content-form': await D.updateContent(ADMIN, fd.get('kind'), fd.get('value')); toast('تم حفظ المحتوى محليًا.'); back(); return;
        case 'resched': await D.rescheduleTask(ADMIN, fd.get('taskId'), new Date(`${fd.get('dueAt')}:00+03:00`).toISOString()); closeSheet(); toast('أعيدت جدولة المهمة دون تغيير دورة المهام.'); render(); return;
        case 'finance-add': await D.addFinancialEntry(ADMIN, fd.get('kind'), fd.get('amount'), fd.get('description')); closeSheet(); toast('حُفظ القيد وسُجل الحدث.'); render(); return;
        case 'finance-reverse': await D.reverseFinancialEntry(ADMIN, fd.get('entryId'), fd.get('reason')); closeSheet(); toast('أُنشئ القيد العكسي مع بقاء القيد الأصلي.'); render(); return;
        case 'admin-number': await D.addNumber(fd.get('customerId'), fd.get('number')); closeSheet(); toast('أُضيف الرقم إلى حساب العميل دون تفعيل اشتراك أو خصم نقاط.'); render(); return;
        case 'notice': await D.sendLocalNotice(ADMIN, fd.get('title'), fd.get('body'), fd.get('audience'), fd.get('customerId')); closeSheet(); toast('أُنشئ الإشعار محليًا.'); render(); return;
        case 'customer-status': {
          const st = fd.get('status');
          await D.setCustomerStatus(ADMIN, fd.get('id'), { status: st, reason: fd.get('reason'), restrictions: { login: fd.has('r_login'), purchase: fd.has('r_purchase'), protection: fd.has('r_protection') } });
          closeSheet(); render();
          toast(st === 'active' ? 'عاد الحساب فعالًا بلا قيود.' : st === 'blocked' ? 'حُظر الحساب: الدخول والشراء والحماية.' : 'أُوقف الحساب بالأثر المحدد.'); return;
        }
        case 'bulk-tag': {
          const ids = String(fd.get('ids')).split(',').filter(Boolean), tag = String(fd.get('tag') || '').trim(), add = fd.get('mode') === 'add', prev = tagSnapshot(ids);
          if (add) await D.addCustomerTags(ADMIN, ids, tag); else await D.removeCustomerTag(ADMIN, ids, tag);
          closeSheet(); render();
          toast(`${add ? 'أُضيف' : 'أُزيل'} الوسم «${tag}» (${N(ids.length)} عميلًا).`, false, { fn: () => restoreTags(prev) }); return;
        }
        case 'customer-classes-form': await D.saveCustomerClasses(ADMIN, { newWithinDays: fd.get('newWithinDays'), premiumMinApprovedOrders: fd.get('premiumMinApprovedOrders') }); toast('حُفظت قواعد التصنيف وسُجلت بالقيم قبل وبعد.'); back(); return;
        case 'expiry-class-form': await X.saveClass(D, ADMIN, fd.get('companyId'), { id: fd.get('id') || undefined, name: fd.get('name'), upToDays: fd.get('upToDays'), notify: fd.has('notify'), noticeText: fd.get('noticeText') }); toast('حُفظ التصنيف وسُجل الحدث.'); back(); return;
        default: throw new Error('تعذر العثور على النموذج.');
      }
    });
  });

  /* ===================== البحث والفلترة والإعدادات ===================== */
  document.addEventListener('input', e => { if (e.target.id === 'q') { ui.q = e.target.value; ui.limit = 0; refreshList(); } });
  document.addEventListener('change', async e => {
    const t = e.target;
    // ربط التجديد التلقائي بتصنيف (U11): إعداد محفوظ لكل شركة، يُحفظ فور الاختيار، ولا يُنفَّذ به أي تجديد
    if (t.dataset?.expiryAutorenew !== undefined) {
      const ok = await run(async () => { await X.setAutoRenewClass(D, ADMIN, t.dataset.company, t.value); render(); toast(t.value ? 'رُبط التجديد التلقائي بالتصنيف المختار (إعداد فقط، لا يُنفَّذ تجديد).' : 'عُطّل ربط التجديد التلقائي لهذه الشركة.'); });
      if (!ok) render();
      return;
    }
    if (t.id === 'flt') { ui.filter = t.value; ui.limit = 0; refreshList(); return; }
    if (t.name === 'status' && t.closest('#sheet-form')) { syncStatusForm(); return; }
    if (t.name === 'audience' && t.closest('#sheet-form')) { $('#notice-customer')?.classList.toggle('hidden', t.value !== 'customer'); return; }
    if (t.id === 'adminDark' || t.dataset.setting) {
      await run(async () => {
        await D.transact(ADMIN, 'admin_setting_changed', d => {
          if (t.id === 'adminDark') { d.admin.darkMode = t.checked; localStorage.setItem('aman.customer.theme', t.checked ? 'dark' : 'light'); localStorage.setItem('aman.customer.dark', t.checked ? '1' : '0'); }
          else d.notificationSettings[t.dataset.setting] = t.checked;
          return { entityType: 'admin_setting', entityId: t.id || t.dataset.setting, summary: 'تحديث إعداد إداري' };
        });
        render();
        const was = !t.checked;
        toast('حُفظ الإعداد.', false, { fn: () => D.transact(ADMIN, 'admin_setting_changed', d => {
          if (t.id === 'adminDark') { d.admin.darkMode = was; localStorage.setItem('aman.customer.theme', was ? 'dark' : 'light'); localStorage.setItem('aman.customer.dark', was ? '1' : '0'); }
          else d.notificationSettings[t.dataset.setting] = was;
          return { entityType: 'admin_setting', entityId: t.id || t.dataset.setting, summary: 'تراجع عن تحديث إعداد إداري' };
        }) });
      });
    }
  });
  /* اختصارات (15): Esc يغلق النافذة؛ Enter لا يرسل والحقول المطلوبة ناقصة (ينتقل لأول ناقص) ولا أثناء عملية جارية */
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && ui.sheet) { e.preventDefault(); closeSheet(); return; }
    if (e.key !== 'Enter' || e.isComposing) return;
    const t = e.target;
    if (!(t instanceof HTMLInputElement) || ['checkbox', 'radio', 'button', 'submit'].includes(t.type)) return;
    const form = t.closest('form[data-form]'); if (!form) return;
    if (ui.busy) { e.preventDefault(); return; }
    const missing = [...form.querySelectorAll('input[required]:not([type=hidden]),select[required],textarea[required]')].find(c => !String(c.value).trim());
    if (missing && missing !== t) { e.preventDefault(); missing.focus(); }
  });
  document.addEventListener('input', e => { const t = e.target; if (t.id && t.closest?.('.field,.afield')) clearFieldError(t.id); });
  document.addEventListener('change', e => { const t = e.target; if (t.id && t.closest?.('.field,.afield')) clearFieldError(t.id); });

  /* السحب لتحديث البيانات (55): من أعلى الشاشة؛ يعيد قراءة المخزن المحلي فقط ولا يعمل داخل نافذة أو نموذج */
  (function pullToRefresh() {
    let y0 = null, pulled = 0; const LIMIT = 70;
    const ind = Object.assign(document.createElement('div'), { id: 'ptr', className: 'ptr hidden', role: 'status' });
    document.querySelector('.phone')?.appendChild(ind);
    const reset = () => { y0 = null; pulled = 0; ind.classList.add('hidden'); };
    document.addEventListener('touchstart', e => {
      const s = $('#screen');
      if (!ui.logged || ui.sheet || ui.busy || !s || !s.contains(e.target) || s.scrollTop > 0 || e.target.closest?.('input,textarea,select')) { y0 = null; return; }
      y0 = e.touches[0].clientY; pulled = 0;
    }, { passive: true });
    document.addEventListener('touchmove', e => {
      if (y0 == null) return; pulled = Math.max(0, e.touches[0].clientY - y0);
      if (pulled > 12) { ind.textContent = pulled > LIMIT ? 'أفلت للتحديث' : 'اسحب للتحديث'; ind.classList.remove('hidden'); } else ind.classList.add('hidden');
    }, { passive: true });
    document.addEventListener('touchend', () => { const go = y0 != null && pulled > LIMIT; reset(); if (go) { render({}); toast('حُدّثت البيانات.'); } }, { passive: true });
    document.addEventListener('touchcancel', reset, { passive: true });
  })();

  /* حالة الاتصال (38): تعمل الإدارة على بيانات هذا الجهاز؛ الشريط يوضّح الحالة ولا يمنع عملية محلية */
  function netState(announce) {
    const online = navigator.onLine !== false, bar = $('#netbar');
    if (bar) { bar.classList.toggle('hidden', online); bar.textContent = online ? '' : 'لا يوجد اتصال بالإنترنت. بياناتك المحفوظة على هذا الجهاز ما زالت متاحة.'; }
    if (announce && online) toast('عاد الاتصال بالإنترنت.');
  }
  window.addEventListener('online', () => netState(true));
  window.addEventListener('offline', () => netState(false));
  netState(false);
  window.addEventListener('storage', e => { if (e.key === D.KEY && ui.logged && !ui.sheet && !isForm(ui.route)) render(); });
  window.addEventListener('pageshow', () => { if (!ui.sheet && !isForm(ui.route)) render(); });

  /* تقييم إشعارات قرب الانتهاء (U11، ق-1): لا مجدول خلفي، فيجري عند فتح الإدارة وبعد الدخول وبزر «إعادة التقييم الآن».
     يكتب فقط إن وُجد مستحق، ولا يكرر إشعارًا أُنشئ سابقًا؛ الفشل صامت (لا يمنع العمل) ويُعاد المحاولة في الفتح التالي. */
  function evaluateExpiry() {
    if (!ui.logged) return;
    EX.evaluate('system').then(r => { if (r.created && ui.logged && !ui.sheet && !isForm(ui.route)) render(); }).catch(() => {});
  }

  /* ===================== الإقلاع ===================== */
  ui.route = ui.logged ? hashRoute() : 'home';
  if (!histState()) history.replaceState({ amanAdmin: true, route: ui.route, d: 0 }, '', '#/' + ui.route);
  render({ top: true });
  evaluateExpiry();
})();
