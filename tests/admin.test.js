'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const apps = path.join(__dirname, '..', 'apps');

// بيئة عرض بلا DOM: كافية لتشغيل دوال بناء الشاشات (نصوص HTML فقط).
global.window = globalThis;
global.document = { addEventListener() {}, getElementById() { return null; } };
global.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const D = require('../shared/data.js');
require('../shared/ui.js');
require(path.join(apps, 'admin-model.js'));
require(path.join(apps, 'admin-kit.js'));
require(path.join(apps, 'admin-screens.js'));
const Fixture = require('./fixture-data.js');
const M = AmanAdminModel, S = AmanAdminScreens;

function store(initial) { const map = new Map([[D.KEY, initial]]); return { getItem: k => map.has(k) ? map.get(k) : null, setItem: (k, v) => map.set(k, v), raw: () => map.get(D.KEY) }; }
const seed = () => { D.setStorageForTests(store(JSON.stringify(Fixture.seedData()))); return D.read(); };
const ui = (o = {}) => ({ q: '', filter: 'all', demo: false, ...o });

test('تصنيف المهمة: مكتملة وملغاة ومتاحة مبكرًا ومستحقة وقادمة (بلا حالة «متأخرة» بقرار المالك)', () => {
  const d = seed(), now = Date.now(), H = 3600000;
  const base = d.tasks.find(t => t.id === 'task-due-demo');
  const sub = d.subscriptions.find(s => s.id === base.subscriptionId);
  sub.startsAt = new Date(now - 30 * 86400000).toISOString(); sub.endsAt = new Date(now + 30 * 86400000).toISOString();
  const mk = (id, patch) => ({ ...base, id, subscriptionId: 'iso-' + id, status: 'due', ...patch });
  const put = t => { d.tasks.push(t); d.subscriptions.push({ ...sub, id: t.subscriptionId }); return t; };
  const pastDue = put(mk('t-over', { dueAt: new Date(now - 5 * H).toISOString(), visibleAt: new Date(now - 9 * H).toISOString() }));
  const early = put(mk('t-early', { status: 'planned', dueAt: new Date(now + 20 * H).toISOString(), visibleAt: new Date(now - H).toISOString() }));
  const planned = put(mk('t-plan', { status: 'planned', dueAt: new Date(now + 9 * 86400000).toISOString(), visibleAt: new Date(now + 8 * 86400000).toISOString() }));
  const done = put(mk('t-done', { status: 'executed' })), canc = put(mk('t-canc', { status: 'cancelled' }));
  assert.equal(M.taskClass(pastDue, d, D), 'due', 'مرور ساعات على الموعد لا يُنشئ حالة جديدة');
  assert.equal(M.TASK_LABEL.overdue, undefined);assert.equal(M.isOverdue, undefined);
  assert.equal(M.taskClass(early, d, D), 'early');
  assert.equal(M.taskClass(planned, d, D), 'planned');
  assert.equal(M.taskClass(done, d, D), 'completed');
  assert.equal(M.taskClass(canc, d, D), 'cancelled');
  assert.equal(M.taskLabel(early, d, D), 'متاحة للتنفيذ المبكر');
  assert.equal(M.canExecute(d, planned, D), false, 'لا تنفيذ قبل visibleAt');
  assert.equal(M.canExecute(d, done, D), false);
  assert.equal(M.taskAvailableNow(early, d, D), true);
  assert.equal(M.taskAvailableNow(planned, d, D), false);
});

test('التنفيذ بعد انتهاء الاشتراك مرهون بفترة السماح وخيارها', () => {
  const d = seed(), t = d.tasks.find(x => x.id === 'task-due-demo'), sub = d.subscriptions.find(s => s.id === t.subscriptionId), co = d.companies.find(c => c.id === t.companyId);
  sub.endsAt = new Date(Date.now() - 86400000).toISOString(); t.status = 'due'; t.dueAt = new Date(Date.now() - 2 * 86400000).toISOString(); t.visibleAt = t.dueAt;
  Object.assign(co.taskSchedule, { allowDuringGrace: false, graceDays: 10 });
  assert.equal(M.canExecute(d, t, D), false);
  Object.assign(co.taskSchedule, { allowDuringGrace: true, graceDays: 10 });
  assert.equal(M.canExecute(d, t, D), true);
});

test('صافي السجل المالي = الإيرادات - المصروفات وليس رصيد النقاط', () => {
  const d = seed(), f = M.finance(d);
  assert.equal(f.net, f.revenue - f.expense);
  assert.equal(f.net, d.financeEntries.reduce((s, x) => s + (x.kind === 'revenue' ? 1 : -1) * x.amount, 0));
});

test('كل مسارات الإدارة تبني عرضًا دون أخطاء على بيانات العينة وعلى مخزن فارغ', () => {
  const full = seed(), ids = { req: full.purchaseRequests[0].id, task: full.tasks[0].id, cus: full.customers[0].id, num: full.numbers[0].id, co: full.companies[0].id, pk: full.packages[0].id, pay: full.paymentMethods[0].id, fin: full.financeEntries[0].id };
  const routes = ['home', 'requests/pending', 'requests/approved', 'requests/rejected', 'requests/all', `request/${ids.req}`, 'tasks/available', 'tasks/all', `task/${ids.task}`, 'customers/all', 'customers/subscribers', 'customers/users', `customer/${ids.cus}`, ...['numbers', 'requests', 'subs', 'ops'].map(t => `customer/${ids.cus}/${t}`), 'numbers/active', 'numbers/all', `number/${ids.num}`, 'finance', 'finance/revenue', 'finance/expense', `finance-entry/${ids.fin}`, 'more', 'companies', 'company/new', `company/${ids.co}`, `company/${ids.co}/edit`, `company/${ids.co}/tasks`, 'task-settings', 'packages', 'package/new', `package/${ids.pk}`, `package/${ids.pk}/edit`, 'protection', 'protection/new', 'payments', 'payment/new', `payment/${ids.pay}`, `payment/${ids.pay}/edit`, 'notices', 'content', 'content/terms', 'content/privacy', 'content/contact', 'audit', 'search', 'account', 'templates', 'template/new', `template/${full.messageTemplates[0].id}/edit`, 'content/faq', 'no/such/route'];
  for (const d of [full, (D.setStorageForTests(store(JSON.stringify(D.seedData()))), D.read())]) {
    for (const r of routes) {
      let v;
      assert.doesNotThrow(() => { v = S.build(r, d, ui({ q: r === 'search' ? '77' : '' })); }, r);
      assert.equal(typeof v.html, 'string', r);
      assert.ok(['tabs', 'focus', 'form'].includes(v.chrome), `${r}: chrome=${v.chrome}`);
      assert.doesNotMatch(v.html, /undefined|\[object Object\]|NaN/, `${r} يحوي قيمة غير معالجة`);
    }
  }
});

test('المخرجات تهرّب بيانات المستخدم ولا تسمح بحقن HTML', () => {
  const d = seed(), evil = '<img src=x onerror=alert(1)>';
  d.customers[0].name = evil; d.companies[0].name = evil; d.packages[0].name = evil; d.paymentMethods[0].instructions = evil;
  for (const r of ['customers/all', `customer/${d.customers[0].id}`, 'companies', `company/${d.companies[0].id}`, 'packages', `payment/${d.paymentMethods[0].id}`, 'requests/all', `request/${d.purchaseRequests[0].id}`, 'search']) {
    const html = S.build(r, d, ui({ q: r === 'search' ? 'x' : '' })).html;
    assert.doesNotMatch(html, /<img src=x/, r);
  }
  assert.match(S.build('customers/all', d, ui()).html, /&lt;img src=x/);
});

test('اعتماد الطلب في الواجهة يوضح أنه لا ينشئ اشتراكًا ويفصل النقاط عن الإيراد', () => {
  const d = seed(), v = S.build('request/req-pending-demo', d, ui());
  assert.match(v.html, /لا يُنشأ اشتراك لأي رقم/);
  assert.match(v.html, /رصيد العميل في دفتر النقاط/);
  assert.match(v.html, /السجل المالي/);
  assert.match(v.bar, /data-decision="approved"/);assert.match(v.bar, /data-decision="rejected"/);
  const done = S.build('request/req-approved-demo', d, ui());
  assert.equal(done.bar, '', 'لا إجراءات على طلب غير معلق');
});

test('صفة المشترك للحساب مشتقة من اعتماد شراء ومفصولة عن اشتراك الأرقام في شاشة العميل', () => {
  const d = seed(), html = S.build('customer/cus-demo-new', d, ui()).html;
  assert.match(html, /حساب غير مشترك/);
  assert.match(html, /لا تعني اشتراك أي رقم/);
  assert.match(S.build('customer/cus-demo-subscriber', d, ui()).html, /<span class="pill ok">مشترك<\/span>/);
});

test('عزل الإدارة: لا تحمّل ملفات تصميم العميل ولا تعدّل الملفات المشتركة', () => {
  const html = fs.readFileSync(path.join(apps, 'admin.html'), 'utf8');
  assert.doesNotMatch(html, /customer-base\.css|reference\.css|customer\.js/);
  assert.match(html, /admin\.css/);
  const css = fs.readFileSync(path.join(apps, 'admin.css'), 'utf8');
  assert.match(css, /AMAN-Arabic-Regular\.ttf/);assert.match(css, /AMAN-Arabic-Bold\.ttf/);
  assert.doesNotMatch(css, /https?:\/\//);
  for (const f of ['admin-model.js', 'admin-kit.js', 'admin-screens.js', 'admin.js']) {
    const src = fs.readFileSync(path.join(apps, f), 'utf8');
    assert.doesNotMatch(src, /localStorage\.(setItem|getItem)\(\s*['"]AMAN_SHARED_REGISTRY/, f + ' يجب ألا يصل للمخزن مباشرة');
  }
});

/* ===== U2-أ: أساسيات الإدارة (16 و26 و36 و37 و38 و39) — نسخة مستقلة عن العميل ===== */
test('U2-أ: مكوّنات الإدارة مستقلة وتشمل النسخ والهيكل والفراغ بإجراء وزر إعادة المحاولة وشريط الاتصال', () => {
  const rd = f => require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'apps', f), 'utf8');
  const kit = AmanAdminKit, js = rd('admin.js'), html = rd('admin.html'), css = rd('admin.css');
  assert.match(kit.copyBtn('R"1<', 'المرجع'), /data-copy="R&quot;1&lt;" data-label="المرجع"[^>]*aria-label="نسخ المرجع"/);
  assert.match(kit.skeleton(2), /role="status" aria-busy="true" aria-label="جارٍ التحميل"/);
  assert.match(kit.empty('س', 'inbox', 'ع', '<i>x</i>'), /<div class="empty-action"><i>x<\/i><\/div>/);
  assert.doesNotMatch(kit.empty('س'), /empty-action/);
  assert.match(js, /K\.btn\('إعادة المحاولة', 'retry', 'primary'\)/);assert.match(js, /case 'retry': retryLoad\(\)/);
  assert.match(js, /const locked = \[\.\.\.lockables\(\)\]\.filter\(b => !b\.disabled\)/, '26: لا يُعاد تمكين زر معطّل أصلًا');
  assert.match(js, /aria-busy/);assert.match(css, /\.btn\.busy::after/);
  assert.match(js, /addEventListener\('offline'/);assert.match(html, /id="netbar"[^>]*role="status"/);
  assert.match(html, /<main id="screen"[^>]*><div class="skeleton"/);
  assert.doesNotMatch(js + rd('admin-kit.js') + rd('admin-screens.js'), /AmanCustomer/, 'لا استيراد من ملفات العميل');
  const d = D.seedData(); d.customers.push({ id: 'cc', accountId: 'A', name: 'ع', email: 'e@e.co', status: 'active', isSubscriber: false, createdAt: new Date().toISOString() });
  D.setStorageForTests(store(JSON.stringify(d)));
  assert.match(rd('admin-screens.js'), /K\.copyBtn\(r\.paymentReference, 'المرجع'\)[^]*K\.copyBtn\(r\.id, 'رقم الطلب'\)/, '16: نسخ المرجع ورقم الطلب في تفاصيل الطلب');
});

test('U2-ب: أخطاء الحقول بجانبها وEnter والتركيز التلقائي في الإدارة (13 و14 و15)', () => {
  const rd = f => require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'apps', f), 'utf8');
  const html = AmanAdminKit.field({ name: 'name', label: 'الاسم', required: true });
  assert.match(html, /aria-describedby="f_name-err"/);assert.match(html, /id="f_name-err" role="alert"/);
  assert.match(AmanAdminKit.field({ name: 'k', label: 'ك', type: 'select', options: [['a', 'أ']] }), /f_k-err/);
  const js = rd('admin.js'), login = rd('admin-screens.js');
  assert.match(js, /addEventListener\('invalid'/);assert.match(js, /setFieldError\('l_pass'/);
  assert.match(js, /if \(missing && missing !== t\) \{ e\.preventDefault\(\); missing\.focus\(\); \}/);
  assert.match(js, /if \(ui\.busy\) \{ e\.preventDefault\(\); return; \}/);
  assert.match(js, /v\.chrome === 'form' && !opt\.restore/);
  for (const id of ['l_email', 'l_pass']) assert.match(login, new RegExp(`id="${id}-err"`));
});

test('U2-ج: تحميل المزيد والسحب للتحديث والتراجع غير المالي ومسح التصفية في الإدارة (24 و39 و55 و56 و58)', () => {
  const rd = f => require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'apps', f), 'utf8');
  const js = rd('admin.js'), sc = rd('admin-screens.js');
  assert.equal((sc.match(/return paged\(rows, ui, rows => K\.card\(rows\.map\(/g) || []).length, 5, 'القوائم الطويلة كلها مقسمة (المهام مقسمة داخل مجموعات الشركات)');
  assert.match(sc.split('function tasks(')[1].split('function task(')[0], /lim = ui\.limit \|\| PAGE[\s\S]*load-more/, 'قائمة المهام مقسمة داخل التجميع');
  assert.match(sc, /const PAGE = 30/);assert.match(js, /case 'load-more': ui\.limit = \(ui\.limit \|\| 30\) \+ 30/);
  assert.match(js, /if \(e\.target\.id === 'q'\) \{ ui\.q = e\.target\.value; ui\.limit = 0/, 'البحث يعيد الصفحة الأولى');
  assert.match(sc, /emptyQ = \(filtered, qText, otherText, icon\)/);assert.match(js, /case 'clear-filter'/);
  assert.match(js, /pullToRefresh/);assert.match(js, /s\.scrollTop > 0 \|\| e\.target\.closest\?\.\('input,textarea,select'\)/, 'لا سحب داخل حقل أو بعد التمرير');
  assert.match(js, /function toast\(text, bad = false, undo = null\)/);assert.match(js, /case 'toast-undo'/);
  assert.match(js, /number_restriction_restored/);assert.match(js, /تراجع عن تحديث إعداد إداري/);
  const fin = js.split("case 'review-confirm'")[1].split("case 'tpl-apply'")[0]; // قبل حالات القوالب والملاحظات (غير مالية ولها تراجع)
  const rest = js.split("case 'tpl-apply'")[1].split("case 'unrestrict'")[0];
  assert.match(rest, /internal_note_restored/);assert.match(rest, /template_restored/);
  assert.doesNotMatch(fin, /fn:/, 'اعتماد/رفض/تنفيذ المهام بلا تراجع (مالية)');
  assert.doesNotMatch(js.split("case 'finance-add'")[1]?.split('\n')[0] || '', /fn:/);
});

test('U8: مرجع مكرر (نفس الوسيلة/وسيلة مختلفة) ورقم مشترك بين عملاء وقوالب وملاحظات داخلية لا تصل العميل', async () => {
  const base = Fixture.seedData(); D.setStorageForTests(store(JSON.stringify(base)));
  const cp = id => D.read().purchaseRequests.find(r => r.id === id);
  await D.createPurchase('cus-demo-subscriber', 'pkg-100', 'pay-wallet', 'ZX-1');
  await D.createPurchase('cus-demo-low', 'pkg-100', 'pay-wallet', ' zx-1 ');
  await D.createPurchase('cus-demo-new', 'pkg-100', 'pay-bank', 'ZX-1');
  const d = D.read(), rs = d.purchaseRequests.filter(r => String(r.paymentReference).trim().toLowerCase() === 'zx-1');
  const a = rs.find(r => r.customerId === 'cus-demo-subscriber'), dup = D.duplicateReferences(d, a);
  assert.equal(dup.same.length, 1); assert.equal(dup.same[0].customerId, 'cus-demo-low'); assert.equal(dup.other.length, 1);
  assert.deepEqual(D.duplicateReferences(d, d.purchaseRequests.find(r => r.id === 'req-approved-demo')), { same: [], other: [] });
  const html = S.build('requests/pending', d, ui()).html; assert.match(html, /مرجع مكرر/);
  const det = S.build('request/' + a.id, d, ui()).html; assert.match(det, /id="dupAlert"/); assert.match(det, /ملاحظات داخلية/); assert.match(det, /data-act="note-add"/);
  // رقم مشترك
  await D.addNumber('cus-demo-low', '771234567');
  const d2 = D.read(), n = d2.numbers.find(x => x.id === 'num-1001'); assert.equal(D.numberHolders(d2, n).length, 2);
  assert.match(S.build('number/num-1001', d2, ui()).html, /id="holdersAlert"/); assert.doesNotMatch(S.build('number/num-2001', d2, ui()).html, /holdersAlert/);
  // ملاحظات
  await D.addInternalNote('admin', 'customer', 'cus-demo-low', 'عميل يحتاج متابعة');
  await assert.rejects(() => D.addInternalNote('admin', 'customer', 'nope', 'x'), /غير موجود/); await assert.rejects(() => D.addInternalNote('admin', 'bad', 'x', 'x'), /غير صالح/); await assert.rejects(() => D.addInternalNote('admin', 'customer', 'cus-demo-low', '  '), /اكتب/);
  assert.match(S.build('customer/cus-demo-low', D.read(), ui()).html, /عميل يحتاج متابعة/);
  const cust = D.readForCustomer('cus-demo-low'); assert.deepEqual(cust.internalNotes, []); assert.deepEqual(cust.messageTemplates, []);
  assert.doesNotMatch(JSON.stringify(cust), /عميل يحتاج متابعة/);
  const note = D.read().internalNotes[0]; await D.deleteInternalNote('admin', note.id); assert.equal(D.read().internalNotes.length, 0);
  // قوالب
  assert.equal(D.read().messageTemplates.filter(t => t.kind === 'reject').length, 3);
  await D.saveTemplate('admin', { kind: 'reject', title: 'قالب جديد', body: 'نص' }); const t = D.read().messageTemplates.at(-1);
  await D.saveTemplate('admin', { id: t.id, kind: 'reply', title: 'معدّل', body: 'نص2' }); assert.equal(D.read().messageTemplates.find(x => x.id === t.id).kind, 'reply');
  await assert.rejects(() => D.saveTemplate('admin', { kind: 'x', title: 'a', body: 'b' }), /مطلوبة/); await assert.rejects(() => D.saveTemplate('admin', { kind: 'reject', title: 'a', body: 'ب'.repeat(501) }), /500/);
  await D.deleteTemplate('admin', t.id); await assert.rejects(() => D.deleteTemplate('admin', t.id), /غير موجود/);
  for (const x of D.read().messageTemplates.slice()) await D.deleteTemplate('admin', x.id);
  assert.deepEqual(D.read().messageTemplates, [], 'حذف الكل يُحترم ولا تُعاد القوالب الافتراضية');
  assert.doesNotMatch(S.build('templates', D.read(), ui()).html, /undefined|\[object/);
});

test('U9: تجميع المهام بالشركة والانتقال للتالية وتقرير غير المسجلة وبلا «متأخرة» أو تنفيذ جماعي (23 و35 و52 و92 و99)', () => {
  const d = seed(), now = Date.now(), H = 3600000;
  const due = d.tasks.find(t => t.id === 'task-due-demo'), fut = d.tasks.find(t => t.id === 'task-future-demo');
  due.dueAt = new Date(now - 30 * H).toISOString(); due.visibleAt = new Date(now - 40 * H).toISOString();
  fut.dueAt = new Date(now + 20 * H).toISOString(); fut.visibleAt = new Date(now - H).toISOString();
  // مهمة ثانية للشركة الأولى نفسها (اشتراك مستقل) ليظهر التجميع
  const sub2 = { ...d.subscriptions.find(s => s.id === due.subscriptionId), id: 'sub-extra' };
  d.subscriptions.push(sub2); d.tasks.push({ ...due, id: 'task-extra', subscriptionId: 'sub-extra', dueAt: new Date(now - 2 * H).toISOString() });
  const html = S.build('tasks/available', d, ui()).html;
  assert.doesNotMatch(html, /متأخر|overdue/, 'لا ذكر للتأخر في المهام');
  const co77 = d.companies.find(c => c.id === 'co-net77').name, co73 = d.companies.find(c => c.id === 'co-net73').name;
  assert.equal((html.match(new RegExp(`<span>${co77}</span>`, 'g')) || []).length, 1, 'رأس واحد لكل شركة');
  assert.ok(html.indexOf(co73) > -1 && html.indexOf(co77) > -1);
  assert.ok(html.indexOf('task/task-due-demo') < html.indexOf('task/task-extra'), 'الأقدم استحقاقًا أولًا داخل الشركة');
  // المدة محايدة نصًا فقط
  assert.match(html, /منذ 1 يومًا|منذ 30 ساعة|منذ \d+ (ساعة|يومًا)/);
  assert.equal(M.sinceDue(fut), '');
  assert.equal(M.elapsedText(30 * 60000), 'منذ أقل من ساعة');
  // التالية: بترتيب العرض نفسه، ولا تتضمن الحالية
  const order = M.availableOrder(d, D).map(t => t.id);
  assert.ok(order.length >= 2);
  const next = M.nextAvailableAfter(d, D, order[0]); assert.equal(next.id, order[1]);
  assert.notEqual(M.nextAvailableAfter(d, D, order.at(-1))?.id, order.at(-1));
  assert.equal(M.nextAvailableAfter({ ...d, tasks: [due] }, D, due.id), null, 'لا تالية إن لم توجد غيرها');
  // تقرير غير المسجلة: المستحقة فقط، بتنبيه أن غياب التسجيل لا يعني عدم السداد
  const un = M.unrecordedTasks(d, D).map(t => t.id); assert.ok(un.includes('task-due-demo') && !un.includes('task-future-demo'));
  const rep = S.build('unrecorded', d, ui()).html;
  assert.match(rep, /لا يعني بالضرورة أن السداد لم يحدث/); assert.doesNotMatch(rep, /متأخر/); assert.match(rep, /data-to="task\/task-due-demo"/);
  assert.match(S.build('more', d, ui()).html, /data-to="unrecorded"/);
  assert.match(S.build('unrecorded', { ...d, tasks: [] }, ui()).html, /لا توجد مهام مرّ موعدها/);
  // تفاصيل المهمة: نسخ الرقم وخطوات السداد الخارجي
  const det = S.build('task/task-due-demo', d, ui()).html; assert.match(det, /data-act="copy"/); assert.match(det, /انسخ رقم الهاتف/); assert.match(det, /وسيلة السداد الخارجية/);
  // لا تنفيذ جماعي ولا تنفيذ بلا تأكيد سداد
  const js = fs.readFileSync(path.join(apps, 'admin.js'), 'utf8'), sc = fs.readFileSync(path.join(apps, 'admin-screens.js'), 'utf8');
  assert.doesNotMatch(js + sc, /execute-all|executeAll|batch-execute|تنفيذ الكل|تنفيذ المحدد/);
  assert.match(js, /id="paidConfirm"/); assert.match(js, /if \(!\$\('#paidConfirm'\)\?\.checked\)/);
  assert.match(js, /data-next="\$\{E\(next\.id\)\}"/, 'فتح التالية لا يُنفِّذها تلقائيًا');
  assert.equal((js.match(/D\.executeTask\(/g) || []).length, 1, 'مسار تنفيذ واحد لمهمة واحدة');
});
