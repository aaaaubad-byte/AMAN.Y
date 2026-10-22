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

test('تصنيف المهمة: مكتملة وملغاة ومتاحة مبكرًا ومتأخرة ومستحقة وقادمة', () => {
  const d = seed(), now = Date.now(), H = 3600000;
  const base = d.tasks.find(t => t.id === 'task-due-demo');
  const sub = d.subscriptions.find(s => s.id === base.subscriptionId);
  sub.startsAt = new Date(now - 30 * 86400000).toISOString(); sub.endsAt = new Date(now + 30 * 86400000).toISOString();
  const mk = (id, patch) => ({ ...base, id, subscriptionId: 'iso-' + id, status: 'due', ...patch });
  const put = t => { d.tasks.push(t); d.subscriptions.push({ ...sub, id: t.subscriptionId }); return t; };
  const overdue = put(mk('t-over', { dueAt: new Date(now - 5 * H).toISOString(), visibleAt: new Date(now - 9 * H).toISOString() }));
  const early = put(mk('t-early', { status: 'planned', dueAt: new Date(now + 20 * H).toISOString(), visibleAt: new Date(now - H).toISOString() }));
  const planned = put(mk('t-plan', { status: 'planned', dueAt: new Date(now + 9 * 86400000).toISOString(), visibleAt: new Date(now + 8 * 86400000).toISOString() }));
  const done = put(mk('t-done', { status: 'executed' })), canc = put(mk('t-canc', { status: 'cancelled' }));
  assert.equal(M.taskClass(overdue, d, D), 'overdue');
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
  const routes = ['home', 'requests/pending', 'requests/approved', 'requests/rejected', 'requests/all', `request/${ids.req}`, 'tasks/available', 'tasks/all', `task/${ids.task}`, 'customers/all', 'customers/subscribers', 'customers/users', `customer/${ids.cus}`, ...['numbers', 'requests', 'subs', 'ops'].map(t => `customer/${ids.cus}/${t}`), 'numbers/active', 'numbers/all', `number/${ids.num}`, 'finance', 'finance/revenue', 'finance/expense', `finance-entry/${ids.fin}`, 'more', 'companies', 'company/new', `company/${ids.co}`, `company/${ids.co}/edit`, `company/${ids.co}/tasks`, 'task-settings', 'packages', 'package/new', `package/${ids.pk}`, `package/${ids.pk}/edit`, 'protection', 'protection/new', 'payments', 'payment/new', `payment/${ids.pay}`, `payment/${ids.pay}/edit`, 'notices', 'content', 'content/terms', 'content/privacy', 'content/contact', 'audit', 'search', 'account', 'no/such/route'];
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
