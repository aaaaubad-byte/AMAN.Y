'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const apps = path.join(__dirname, '..', 'apps');
const read = f => fs.readFileSync(path.join(apps, f), 'utf8');

// بيئة عرض بلا DOM: كافية لتشغيل دوال بناء الشاشات (نصوص HTML فقط).
global.window = globalThis;
global.document = { addEventListener() {}, getElementById() { return null; } };
global.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const D = require('../shared/data.js');
require('../shared/ui.js');
require(path.join(apps, 'customer-kit.js'));
require(path.join(apps, 'customer-screens.js'));
const Fixture = require('./fixture-data.js');
const S = AmanCustomerScreens;

function store(initial) { const map = new Map([[D.KEY, initial]]); return { getItem: k => map.has(k) ? map.get(k) : null, setItem: (k, v) => map.set(k, v), raw: () => map.get(D.KEY) }; }
const seed = () => { D.setStorageForTests(store(JSON.stringify(Fixture.seedData()))); return D.read(); };
const x = (o = {}) => ({ q: '', co: '', lookup: null, theme: 'light', noticeDot: true, id: '', ...o });
const ROUTES = ['home', 'radar', 'numbers', 'buy', 'operations', 'points', 'orders', 'notifications', 'account', 'settings', 'security', 'no-such-route'];

test('كل مسارات العميل تبني عرضًا سليمًا لكل حسابات العينة (مشترك ومنخفض الرصيد وجديد)', () => {
  seed();
  for (const id of ['cus-demo-subscriber', 'cus-demo-low', 'cus-demo-new']) {
    const d = D.readForCustomer(id), c = d.customers[0];
    for (const r of ROUTES) {
      let v;
      assert.doesNotThrow(() => { v = S.build(r, d, c, x({ id })); }, `${id}:${r}`);
      assert.equal(typeof v.html, 'string', r);
      assert.equal(v.chrome, 'tabs', r);
      assert.doesNotMatch(v.html + (v.bar || ''), /undefined|\[object Object\]|NaN/, `${id}:${r} يحوي قيمة غير معالجة`);
    }
  }
});

test('شاشة الدخول والتسجيل تُبنيان على مخزن فارغ، وحساب جديد بلا أرقام يرى حالات فراغ لا أخطاء', () => {
  D.setStorageForTests(store(JSON.stringify(D.seedData())));
  for (const html of [S.login({ email: '', enabled: false }), S.signup()]) assert.doesNotMatch(html, /undefined|\[object Object\]|NaN/);
  assert.match(S.login({ email: '', enabled: false }), /minlength="4"/);
  const base = D.seedData(); base.customers.push({ id: 'c1', accountId: 'A1', name: 'جديد', email: 'n@aman.test', status: 'active', isSubscriber: false, createdAt: new Date().toISOString() });
  D.setStorageForTests(store(JSON.stringify(base)));
  const d = D.readForCustomer('c1'), c = d.customers[0];
  for (const r of ROUTES) assert.doesNotThrow(() => S.build(r, d, c, x({ id: 'c1' })), r);
  assert.match(S.build('numbers', d, c, x()).html, /لا توجد أرقام مضافة بعد/);
  assert.match(S.build('account', d, c, x()).html, /حساب عميل غير مشترك/);
});

test('المخرجات تهرّب بيانات المستخدم ولا تسمح بحقن HTML', () => {
  const evil = '<img src=x onerror=alert(1)>', all = seed();
  all.customers[0].name = evil; all.companies[0].name = evil; all.packages[0].name = evil; all.paymentMethods[0].instructions = evil; all.notifications[0].title = evil;
  D.setStorageForTests(store(JSON.stringify(all)));
  const id = all.customers[0].id, d = D.readForCustomer(id), c = d.customers[0];
  for (const r of ['home', 'numbers', 'buy', 'account', 'notifications', 'operations']) assert.doesNotMatch(S.build(r, d, c, x({ id })).html, /<img src=x/, r);
  assert.match(S.build('home', d, c, x({ id })).html, /&lt;img src=x/);
});

test('نتيجة البحث تعرض حالات الرقم الأربع وإجراءاتها دون تسريب بيانات مشترك آخر', () => {
  seed();
  const own = S.resultView(D.searchNumberStatus('cus-demo-subscriber', '771234567'));
  assert.match(own, /حماية رقمك سارية/);assert.match(own, /data-operation="extend"/);
  const other = S.resultView(D.searchNumberStatus('cus-demo-new', '771234567'));
  assert.match(other, /الرقم محمي في أمان/);assert.doesNotMatch(other, /تاريخ الانتهاء|بداية الاشتراك/);
  assert.match(S.resultView(D.searchNumberStatus('cus-demo-subscriber', '711234569')), /data-operation="renew"/);
  const none = S.resultView(D.searchNumberStatus('cus-demo-subscriber', '771999000'));
  assert.match(none, /الحماية غير مفعّلة/);assert.match(none, /data-operation="subscribe"/);assert.match(none, /data-act="add-search-number"/);
});

test('عرض العميل يقتصر على سجلاته ولا يكشف السجل المالي أو بيانات الإدارة', () => {
  seed();
  const d = D.readForCustomer('cus-demo-new'), c = d.customers[0];
  assert.equal(d.financeEntries.length, 0);assert.equal(d.admin, null);
  for (const r of ['operations', 'points', 'orders', 'notifications', 'account']) {
    const html = S.build(r, d, c, x()).html;
    assert.doesNotMatch(html, /fin-purchase-demo|fin-task-demo|AMAN-1001|subscriber@aman\.test/, r);
  }
});

test('شراء النقاط يعرض الرصيد الحقيقي ويوضح أن النقاط تُضاف بعد الاعتماد فقط', () => {
  seed();
  const d = D.readForCustomer('cus-demo-subscriber'), c = d.customers[0], v = S.build('buy', d, c, x());
  assert.match(v.html, new RegExp(D.balance(c.id, d).toLocaleString('en-US')));
  assert.match(v.html, /تُضاف النقاط بعد مراجعة الطلب واعتماده/);
  assert.match(v.bar, /data-submit/);
});

test('عزل العميل: لا يحمّل ملفات الإدارة ولا يعدّل الملفات المشتركة ولا يصل للمخزن مباشرة', () => {
  const html = read('customer.html');
  assert.doesNotMatch(html, /admin\.css|admin-kit|admin-screens|admin-model|admin\.js|reference\.css|customer-base\.css/);
  assert.match(html, /customer\.css/);assert.match(html, /id="bar"/);assert.match(html, /id="tabbar"/);
  assert.doesNotMatch(read('admin.html'), /customer\.css|customer-kit|customer-screens|customer\.js/);
  const css = read('customer.css');
  assert.match(css, /AMAN-Arabic-Regular\.ttf/);assert.match(css, /AMAN-Arabic-Bold\.ttf/);assert.doesNotMatch(css, /https?:\/\//);
  for (const f of ['customer.js', 'customer-kit.js', 'customer-screens.js']) {
    const src = read(f);
    assert.doesNotMatch(src, /localStorage\.(setItem|getItem)\(\s*['"]AMAN_SHARED_REGISTRY/, f + ' يجب ألا يصل للمخزن مباشرة');
    assert.doesNotMatch(src, /\b(reviewPurchase|executeTask|addFinancialEntry|saveCompany|savePackage|savePaymentMethod|sendLocalNotice|updateContent|reverseFinancialEntry|saveTaskSettings|rescheduleTask)\b/, f + ' يستدعي عملية إدارية');
  }
});
