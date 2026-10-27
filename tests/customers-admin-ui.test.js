'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const apps = path.join(__dirname, '..', 'apps');

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
const adminJs = fs.readFileSync(path.join(apps, 'admin.js'), 'utf8');

function store(initial) { const map = new Map([[D.KEY, initial]]); return { getItem: k => map.has(k) ? map.get(k) : null, setItem: (k, v) => map.set(k, v) }; }
const seed = () => { D.setStorageForTests(store(JSON.stringify(Fixture.seedData()))); return D.read(); };
const ui = (o = {}) => ({ q: '', filter: 'all', demo: false, ...o });
const A = 'admin-demo';

test('U10 واجهة: قائمة العملاء تعرض الشارات والوسوم بتسمية «مستخدم» وتصفية الحالة والوسم', async () => {
  seed();
  await D.setCustomerStatus(A, 'cus-demo-low', { status: 'blocked', reason: 'س' });
  await D.addCustomerTags(A, ['cus-demo-subscriber'], 'عميل-كبير');
  const d = D.read(), v = S.build('customers/all', d, ui());
  assert.match(v.html, /المستخدمون/);
  assert.doesNotMatch(v.html, /غير مشتركين/);
  const list = v.list();
  assert.match(list, /<span class="pill bad">محظور<\/span>/);
  assert.match(list, /class="tagchip">عميل-كبير</);
  const blocked = S.build('customers/all', d, ui({ filter: 'st:blocked' })).list();
  assert.match(blocked, /عميل تجريبي/);
  assert.equal((blocked.match(/class="row /g) || []).length, 1);
  assert.equal((S.build('customers/all', d, ui({ filter: 'tag:عميل-كبير' })).list().match(/class="row /g) || []).length, 1);
  assert.match(S.build('customers/all', d, ui({ filter: 'tag:غير-موجود' })).list(), /مسح البحث والتصفية/);
  assert.match(S.build('customers/all', d, ui({ q: 'عميل-كبير' })).list(), /class="tagchip">عميل-كبير</);
});

test('U10 واجهة: وضع التحديد يعرض شريطًا جماعيًا آمنًا فقط ويخفي شريط التبويبات', () => {
  const d = seed();
  const none = S.build('customers/all', d, ui({ selecting: true, sel: [] }));
  assert.equal(none.hideTabs, true);
  assert.match(none.bar, /0 محدد/);
  assert.match(none.bar, /data-act="cust-tag-open" data-mode="add" disabled/);
  assert.match(none.bar, /data-act="cust-copy-selected"/);
  for (const forbidden of ['حظر', 'إيقاف', 'اعتماد', 'رفض', 'قيد', 'خصم']) assert.equal(none.bar.includes(forbidden), false, `إجراء غير آمن في الشريط الجماعي: ${forbidden}`);
  const some = S.build('customers/all', d, ui({ selecting: true, sel: ['cus-demo-low'] }));
  assert.match(some.bar, /1 محدد/);
  assert.doesNotMatch(some.bar, /data-mode="add" disabled/);
  assert.match(some.list(), /class="row  sel"|class="row  sel /);
  assert.match(some.list(), /data-act="cust-toggle"/);
  assert.equal(S.build('customers/all', d, ui()).hideTabs, false);
  assert.equal(S.build('customers/all', d, ui()).bar, '');
  assert.deepEqual(some.ids().sort(), d.customers.map(c => c.id).sort());
});

test('U10 واجهة: تفاصيل العميل — السجل الزمني بدل العمليات، وبيان الحظر، ونسخ بلا تجزئة', async () => {
  seed();
  await D.setCustomerStatus(A, 'cus-demo-low', { status: 'suspended', reason: 'سبب-ظاهر-للإدارة', restrictions: { purchase: true } });
  const d = D.read(), c = d.customers.find(x => x.id === 'cus-demo-low');
  c.authHash = 'pbkdf2$SECRET';
  const v = S.build('customer/cus-demo-low/timeline', d, ui());
  assert.match(v.html, />السجل الزمني</);
  assert.doesNotMatch(v.html, />العمليات</);
  assert.match(v.html, /تغيّر الحالة: فعال ← موقوف/);
  assert.match(v.html, /الحساب موقوف/);
  assert.match(v.html, /سبب-ظاهر-للإدارة/);
  assert.match(v.html, /الأثر: شراء النقاط/);
  assert.match(v.html, /data-act="cust-status-open"/);
  assert.match(v.html, /data-act="copy" data-copy="/);
  assert.equal(/SECRET|pbkdf2/.test(v.html), false);
  assert.match(S.build('customer/cus-demo-low/ops', d, ui()).html, /تغيّر الحالة/, 'الرابط القديم ops يفتح السجل الزمني');
});

test('U10 واجهة: شاشة تصنيفات العملاء حقول فارغة افتراضيًا وتظهر في «المزيد»', () => {
  const d = seed();
  const v = S.build('customer-classes', d, ui());
  assert.match(v.html, /data-form="customer-classes-form"/);
  assert.match(v.html, /name="newWithinDays"[^>]*value=""/);
  assert.match(v.html, /name="premiumMinApprovedOrders"[^>]*value=""/);
  assert.match(v.html, /اترك أي حقل فارغًا لتعطيل شرطه/);
  assert.match(S.build('more', d, ui()).html, /data-to="customer-classes"/);
});

test('U10 واجهة: ربط admin.js — إجراءات فردية للحظر وجماعية للوسوم والنسخ فقط، والنماذج والمسارات مسجّلة', () => {
  for (const k of ["'cust-toggle'", "'cust-select-all'", "'cust-copy-selected'", "'cust-status-open'", "'cust-tag-open'", "'cust-tag-remove'", "case 'customer-status'", "case 'bulk-tag'", "case 'customer-classes-form'", 'syncStatusForm', 'customer_tags_restored'])
    assert.ok(adminJs.includes(k), `ينقص: ${k}`);
  assert.match(adminJs, /customer-classes\)\$\/\.test\(r\)/, 'شاشة التصنيفات نموذج: لا إعادة رسم عند تغيّر التخزين');
  assert.equal((adminJs.match(/D\.setCustomerStatus\(/g) || []).length, 1, 'تغيير الحالة لعميل واحد فقط (لا حظر جماعي)');
  assert.match(adminJs, /D\.setCustomerStatus\(ADMIN, fd\.get\('id'\)/);
  // الأثر الجماعي محصور بالوسوم: لا استدعاء مالي أو حالة داخل حالات التحديد
  const sel = adminJs.split("case 'cust-select-toggle'")[1].split("case 'note-add'")[0];
  for (const bad of ['setCustomerStatus', 'reviewPurchase', 'executeTask', 'addFinancialEntry', 'deleteAccount']) assert.equal(sel.includes(bad), false, bad);
});
