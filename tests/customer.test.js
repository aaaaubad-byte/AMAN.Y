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
require(path.join(apps, 'admin-model.js'));
require(path.join(apps, 'admin-kit.js'));
require(path.join(apps, 'admin-screens.js'));
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

test('أمان: الرابط المشوّه لا يكسر التطبيقين، وبيانات الدخول لا تُعبّأ مسبقًا خارج وضع المعاينة', () => {
  // decodeURIComponent على hash فيه % مشوّه كان يرمي URIError ويوقف التطبيق
  for (const f of ['customer.js', 'admin.js']) assert.match(read(f), /const hashRoute = \(\) => \{[^\n]*try \{[^\n]*decodeURIComponent[^\n]*catch/, f);
  const saved = { email: '', enabled: false };
  assert.doesNotMatch(S.login(saved), /aman1234|demo@aman\.test/);
  assert.match(S.login(saved, true), /aman1234/);
  assert.doesNotMatch(AmanAdminScreens.login(saved).html, /admin1234|admin@aman\.test/);
  assert.match(AmanAdminScreens.login(saved, true).html, /admin1234/);
  // حساب العميل التجريبي لا يُنشأ إلا في وضع ?demo=1
  assert.match(read('customer.js'), /DEMO && !c && email === 'demo@aman\.test'/);
});

test('أمان: كل صفحة HTML تعلن سياسة CSP تمنع السكربت المضمّن والمصادر الخارجية', () => {
  for (const f of ['customer.html', 'admin.html', '../index.html']) {
    const html = read(f), m = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/);
    assert.ok(m, f + ' بلا CSP');
    const script = m[1].split(';').map(x => x.trim()).find(x => x.startsWith('script-src'));
    assert.equal(script, "script-src 'self'", f);
    assert.match(m[1], /default-src 'self'/);assert.match(m[1], /object-src 'none'/);assert.match(m[1], /base-uri 'none'/);
    assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/i, f + ' يحوي سكربتًا مضمّنًا');
    assert.doesNotMatch(html, /\son[a-z]+=/i, f + ' يحوي معالج حدث مضمّنًا');
  }
});

test('أمان وخصوصية: الرادار تفضيل لكل عميل ولا ينتقل بين عملاء يشتركون في الرقم نفسه', async () => {
  seed();
  const num = D.read().numbers.find(n => n.id === 'num-1001');
  await D.addNumber('cus-demo-low', num.number); // عميل ثانٍ يربط الرقم نفسه
  await D.setRadar('cus-demo-subscriber', 'num-1001', true);
  const a = D.readForCustomer('cus-demo-subscriber').numbers.find(n => n.id === 'num-1001');
  const b = D.readForCustomer('cus-demo-low').numbers.find(n => n.id === 'num-1001');
  assert.equal(a.radar, true);assert.equal(b.radar, false, 'تفضيل عميل لا يظهر لعميل آخر');
  assert.equal(D.read().numbers.find(n => n.id === 'num-1001').radar, undefined, 'لا يُكتب على سجل الرقم المشترك');
  await assert.rejects(() => D.setRadar('cus-demo-new', 'num-1001', true), /غير موجود ضمن أرقام حسابك/);
  await assert.rejects(() => D.setRadar('cus-demo-subscriber', 'num-1003', true), /قبل تفعيل الاشتراك/);
  await D.setRadar('cus-demo-subscriber', 'num-1001', false);
  assert.equal(D.readForCustomer('cus-demo-subscriber').numbers.find(n => n.id === 'num-1001').radar, false);
  D.read(); // المخزن يبقى صالحًا بعد إنشاء علاقة الربط
});

test('أمان: كلمات المرور PBKDF2 بملح وتُرقّى التجزئة القديمة، وحالة غير معروفة لا تُحقن في HTML', () => {
  const js = read('customer.js');
  assert.match(js, /name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter/);
  assert.match(js, /crypto\.getRandomValues\(new Uint8Array\(16\)\)/);
  assert.match(js, /await hashPassword\(password\)/);
  assert.match(js, /password_hash_upgraded/);
  assert.doesNotMatch(js, /authHash: hash.*digest/);
  const evil = '<img src=x onerror=alert(1)>';
  const all = seed();all.purchaseRequests[0].status = evil;
  D.setStorageForTests(store(JSON.stringify(all)));
  const id = all.purchaseRequests[0].customerId, d = D.readForCustomer(id);
  const html = S.operationDetail(d, 'request', all.purchaseRequests[0].id, d.customers[0]).body + S.build('orders', d, d.customers[0], x({ id })).html;
  assert.doesNotMatch(html, /<img src=x/);
});

/* ===== U1-أ: أساسيات النماذج (البنود 1 و2 و13 و14 و15 و16 و26) ===== */
const K = AmanCustomerKit;

test('U1 (2): مؤشر قوة كلمة المرور استرشادي ولا يغيّر الحد الأدنى (4 خانات)', () => {
  assert.equal(K.passwordStrength('').key, 'none');
  assert.equal(K.passwordStrength('abc').key, 'short');
  assert.equal(K.passwordStrength('1234').key, 'weak');
  assert.equal(K.passwordStrength('aman1234').key, 'fair');
  assert.equal(K.passwordStrength('Aman@1234x').key, 'good');
  assert.equal(K.passwordStrength('كلمةسر9').key, 'fair', 'الحروف العربية تُحتسب حروفًا');
  assert.equal(K.passwordStrength('كلمة-سر9').key, 'good', 'ثلاث فئات وثماني خانات');
  assert.match(S.login({ email: '', enabled: false }), /minlength="4"/);
  assert.match(S.signup(), /minlength="4"/);
  assert.match(S.signup(), /id="pass-strength"/);
  assert.match(S.signup(), /الحد الأدنى 4 خانات ولا تُفرض شروط أخرى/);
});

test('U1 (1): حقول كلمة المرور في الدخول والتسجيل بزر إظهار/إخفاء متاح ومُعنوَن', () => {
  for (const html of [S.login({ email: '', enabled: false }), S.signup()]) {
    assert.match(html, /data-act="toggle-pass" data-target="(l_pass|s_pass)"/);
    assert.match(html, /aria-label="إظهار كلمة المرور" aria-pressed="false"/);
    assert.match(html, /type="password"/);
  }
});

test('U1 (13): التحقق يعيد خطأً واحدًا لكل حقل ويُربط بحقله، وأخطاء طبقة البيانات تُوجَّه للحقل المعني', () => {
  assert.deepEqual(K.validate('login', { email: 'a@b.co', password: 'abcd' }), []);
  assert.deepEqual(K.validate('login', { email: '', password: '' }).map(e => e.id), ['l_email', 'l_pass']);
  assert.equal(K.validate('login', { email: 'x', password: 'abcd' })[0].msg, 'صيغة البريد الإلكتروني غير صحيحة.');
  assert.equal(K.validate('login', { email: 'a@b.co', password: 'abc' })[0].msg, 'كلمة المرور يجب ألا تقل عن 4 خانات.');
  assert.deepEqual(K.validate('signup', { name: '', email: 'a@b.co', password: 'abcd', agree: false }).map(e => e.id), ['s_name', 'agree']);
  assert.deepEqual(K.validate('purchase', { packageId: 'p', paymentId: 'm', reference: '  ' }).map(e => e.id), ['reference']);
  assert.deepEqual(K.validate('add-number', { number: '' }).map(e => e.id), ['newNumber']);
  assert.deepEqual(K.validate('number-search', { number: '' }).map(e => e.id), ['search-number-input']);
  assert.equal(K.fieldForError('purchase', 'مرجع الدفع استُخدم في طلب سابق بالفعل.'), 'reference');
  assert.equal(K.fieldForError('login', 'البريد الإلكتروني غير مسجل.'), 'l_email');
  assert.equal(K.fieldForError('login', 'بيانات الدخول غير صحيحة.'), 'l_pass');
  assert.equal(K.fieldForError('signup', 'البريد مسجل بالفعل.'), 's_email');
  assert.equal(K.fieldForError('number-search', 'تعذر تحديد شركة أو طول صالح لهذا الرقم.'), 'search-number-input');
  assert.equal(K.fieldForError('purchase', 'خطأ عام غير معروف'), '', 'ما لا يُعرف حقله يبقى في الصندوق العام');
  assert.equal(K.fieldForError('login', 'فشل حفظ البيانات: المساحة غير كافية'), '', 'خطأ نظام لا يُنسب لحقل');
});

test('U1 (13): كل نموذج يحمل novalidate ومكان خطأ لكل حقل، وحقل الباقة والمرجع مرتبطان بوصف الخطأ', () => {
  seed();
  const d = D.readForCustomer('cus-demo-subscriber'), c = d.customers[0];
  const buy = S.build('buy', d, c, x({ id: c.id })).html;
  assert.match(buy, /<form id="purchase" data-form="purchase" novalidate>/);
  for (const id of ['packageId', 'paymentId', 'reference']) assert.match(buy, new RegExp(`id="${id}-err" role="alert"`));
  assert.match(buy, /aria-describedby="reference-err"/);
  const login = S.login({ email: '', enabled: false }), signup = S.signup();
  assert.match(login, /<form id="login" data-form="login" novalidate>/);
  assert.match(signup, /<form id="signup" data-form="signup" novalidate>/);
  for (const id of ['l_email', 'l_pass']) assert.match(login, new RegExp(`id="${id}-err"`));
  for (const id of ['s_name', 's_email', 's_pass', 'agree']) assert.match(signup, new RegExp(`id="${id}-err"`));
  assert.match(S.build('home', d, c, x({ id: c.id })).html, /data-form="number-search" novalidate/);
});

test('U1 (16): نسخ رقم الطلب والمرجع في تفاصيل الطلب بنصٍّ مهرَّب', () => {
  const all = seed(), r = all.purchaseRequests[0];
  r.paymentReference = '<b>REF"1</b>';
  D.setStorageForTests(store(JSON.stringify(all)));
  const d = D.readForCustomer(r.customerId), body = S.operationDetail(d, 'request', r.id, d.customers[0]).body;
  assert.match(body, new RegExp(`data-copy="${r.id}" data-label="رقم الطلب"`));
  assert.match(body, /data-act="copy" data-copy="&lt;b&gt;REF&quot;1&lt;\/b&gt;" data-label="المرجع"/);
  assert.doesNotMatch(body, /<b>REF/);
  assert.match(body, /aria-label="نسخ المرجع"/);
});

test('U1 (14 و15 و26): ربط الغلاف: تركيز تلقائي، حماية Enter، تعطيل الأزرار بمؤشر دون إعادة تمكين زر معطّل أصلًا', () => {
  const js = read('customer.js'), css = read('customer.css');
  assert.match(js, /\(els\.find\(i => !i\.value\) \|\| els\[0\]\)\?\.focus/, 'تركيز أول حقل فارغ في شاشات الدخول');
  assert.match(js, /e\.key !== 'Enter'/);assert.match(js, /if \(missing && missing !== t\) \{ e\.preventDefault\(\); missing\.focus\(\); \}/);
  assert.match(js, /if \(ui\.busy\) \{ e\.preventDefault\(\); return; \}/, 'لا إرسال أثناء عملية جارية');
  assert.match(js, /const locked = \[\.\.\.lockables\(\)\]\.filter\(b => !b\.disabled\)/);
  assert.match(js, /classList\.add\('busy'\)/);assert.match(js, /setAttribute\('aria-busy', 'true'\)/);
  assert.match(css, /\.btn\.busy::after/);assert.match(css, /prefers-reduced-motion:reduce\)\{\.btn\.busy::after/);
  for (const html of [S.login({ email: '', enabled: false }), S.signup()]) assert.match(html, /type="submit" data-submit/);
});
