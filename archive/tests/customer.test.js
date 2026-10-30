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
  assert.match(v.bar, /data-act="buy-next"/, 'الخطوة الأولى تنتقل ولا ترسل');
  const last = S.build('buy', d, c, x({ buy: { step: 4, packageId: d.packages[0].id, paymentId: d.paymentMethods[0].id, reference: 'R-1' } }));
  assert.match(last.bar, /data-submit/); assert.match(last.html, /تُضاف النقاط بعد مراجعة الطلب واعتماده/);
});

test('U3: صيغ الأرقام اليمنية تُوحَّد إلى 9 خانات دون رفض الصيغ الصحيحة', () => {
  for (const v of ['771234567', '0771234567', '967771234567', '00967771234567', '+967 77-123-4567', '٠٠٩٦٧٧٧١٢٣٤٥٦٧', ' 77 123 4567 ']) assert.equal(D.normalizePhone(v), '771234567', v);
  assert.equal(D.normalizePhone('12345'), '12345');
  assert.equal(D.normalizePhone('0'), '0');
});

test('U3: الشراء أربع خطوات، والمبلغ مقفل من الباقة، والمرجع بلا طول ثابت، و«الأفضل» بمعيار واضح', () => {
  seed();
  const d = D.readForCustomer('cus-demo-subscriber'), c = d.customers[0], pk = d.packages.filter(p => p.active !== false);
  const base = { packageId: pk[0].id, paymentId: d.paymentMethods[0].id };
  const html = n => S.build('buy', d, c, x({ buy: { step: n, ...base, reference: 'AB-9' }, fav: {} })).html;
  assert.match(html(1), /data-step="1" >/); assert.match(html(1), /data-step="2" hidden/);
  assert.match(html(3), /id="buyAmount"/); assert.match(html(3), new RegExp(Number(pk[0].price).toLocaleString('en-US')));
  assert.doesNotMatch(html(3), /id="buyAmount"[^>]*>[\s\S]{0,200}<input/, 'المبلغ عرض فقط');
  assert.doesNotMatch(html(3), /maxlength|pattern=/, 'لا طول ولا صيغة ثابتة للمرجع');
  assert.match(html(4), /AB-9/);
  // «الأفضل»: أعلى نقاط لكل ريال وبتفرد فقط
  const withPacks = packs => { const dd = { ...d, packages: packs }; return S.build('buy', dd, c, x()).html; };
  const mk = (id, points, price) => ({ id, name: id, points, price, active: true });
  assert.match(withPacks([mk('a', 100, 1000), mk('b', 300, 2000)]), /الأفضل قيمة/);
  assert.doesNotMatch(withPacks([mk('a', 100, 1000), mk('b', 200, 2000)]), /الأفضل قيمة/, 'تعادل: لا تمييز');
  assert.doesNotMatch(withPacks([mk('a', 100, 1000)]), /الأفضل قيمة/, 'باقة واحدة: لا تمييز');
});

test('U3: المفضلة تملأ الباقة والوسيلة فقط ولا تملأ المرجع، وتفاصيل الطلب تعرض مراحله', () => {
  seed();
  const d = D.readForCustomer('cus-demo-subscriber'), c = d.customers[0], p = d.packages[1] || d.packages[0], m = d.paymentMethods[0];
  const v = S.build('buy', d, c, x({ buy: { step: 1 }, fav: { packageId: p.id, paymentId: m.id } })).html;
  assert.match(v, new RegExp(`name="packageId" value="${p.id}" checked`)); assert.match(v, /fav-clear/);
  assert.doesNotMatch(v, /id="reference"[^>]*value="[^"]+"/);
  const req = d.purchaseRequests.find(r => r.customerId === c.id) || null;
  if (req) { const det = S.operationDetail(d, 'request', req.id, c); assert.match(det.body, /class="stages"/); assert.match(det.body, /قيد المراجعة/); }
});

test('U4: العميل يلغي طلبه المعلق فقط وبلا أثر على النقاط أو المالية', async () => {
  seed();
  const before = D.read(), pend = before.purchaseRequests.find(r => r.status === 'pending'), other = before.customers.find(c => c.id !== pend.customerId);
  const bal = D.balance(pend.customerId, before), fin = before.financeEntries.length, pts = before.pointTransactions.length;
  await assert.rejects(() => D.cancelPurchase(other.id, pend.id), /غير موجود ضمن طلباتك/);
  await D.cancelPurchase(pend.customerId, pend.id);
  const after = D.read(), r = after.purchaseRequests.find(x => x.id === pend.id);
  assert.equal(r.status, 'cancelled'); assert.equal(r.cancelledBy, 'customer');
  assert.equal(D.balance(pend.customerId, after), bal); assert.equal(after.financeEntries.length, fin); assert.equal(after.pointTransactions.length, pts);
  await assert.rejects(() => D.cancelPurchase(pend.customerId, pend.id), /لم يعد معلقًا/);
  const appr = after.purchaseRequests.find(x => x.status === 'approved');
  await assert.rejects(() => D.cancelPurchase(appr.customerId, appr.id), /لم يعد معلقًا/);
});

test('U4: تفاصيل الطلب: المعلق يُلغى، والمرفوض يعرض السبب ويُعاد تقديمه، والمقبول بلا إجراء', async () => {
  seed();
  const d0 = D.read(), rej = d0.purchaseRequests.find(r => r.status === 'rejected'), pend = d0.purchaseRequests.find(r => r.status === 'pending'), app = d0.purchaseRequests.find(r => r.status === 'approved');
  const view = r => { const d = D.readForCustomer(r.customerId); return S.operationDetail(d, 'request', r.id, d.customers[0]); };
  if (rej) { const v = view(rej); assert.match(v.body, /سبب الرفض/); assert.match(v.foot, /order-resubmit/); assert.doesNotMatch(v.foot, /order-cancel/); }
  const vp = view(pend); assert.match(vp.foot, /order-cancel/); assert.doesNotMatch(vp.body, /سبب الرفض/);
  assert.equal(view(app).foot, '');
  await D.cancelPurchase(pend.customerId, pend.id);
  const vc = view(pend); assert.equal(vc.foot, ''); assert.match(vc.body, /ملغى/);
});

test('U4: شارة الإشعارات تعرض عدد غير المقروء وتختفي عند الصفر', () => {
  seed();
  const d = D.readForCustomer('cus-demo-subscriber'), c = d.customers[0];
  const n = d.notifications.filter(v => v.customerId === c.id && !v.readAt).length;
  const h = S.build('home', d, c, x({ noticeDot: true })).html;
  if (n) assert.match(h, new RegExp(`id="unreadDot" class="dot ">${n}<`)); else assert.match(h, /id="unreadDot" class="dot hidden"><\/i>/);
  assert.match(S.build('home', d, c, x({ noticeDot: false })).html, /id="unreadDot" class="dot hidden"><\/i>/);
});

test('U5: «الأرقام» لغير المشترك لها و«الاشتراكات» للأرقام ذات الاشتراك (سارٍ أو منتهٍ)، مع شارة قرب الانتهاء وشريط التقدم', () => {
  seed();
  const d = D.readForCustomer('cus-demo-subscriber'), c = d.customers[0], H = 86400000;
  const sub = id => d.subscriptions.find(v => v.numberId === id);
  Object.assign(sub('num-1001'), { startsAt: new Date(Date.now() - 20 * H).toISOString(), endsAt: new Date(Date.now() + 20 * H).toISOString() });
  Object.assign(sub('num-1002'), { startsAt: new Date(Date.now() - 27 * H).toISOString(), endsAt: new Date(Date.now() + 3 * H).toISOString() });
  d.numbers.push({ id: 'num-free', customerId: c.id, number: '781000111', companyId: d.numbers[0].companyId, addedAt: new Date().toISOString(), status: 'active', radar: false, liveSub: null, protectionStatus: 'none' });
  const subs = S.build('subscriptions', d, c, x({ id: c.id })), nums = S.build('numbers', d, c, x({ id: c.id }));
  assert.match(subs.list(), /771234567/); assert.match(subs.list(), /711234569/, 'المنتهي يبقى في الاشتراكات لتجديده'); assert.doesNotMatch(subs.list(), /781000111/);
  assert.match(nums.list(), /781000111/); assert.doesNotMatch(nums.list(), /771234567|731234568|711234569/);
  assert.match(subs.list(), /ينتهي قريبًا · /, 'رقم ينتهي خلال 3 أيام'); assert.match(subs.list(), /role="progressbar"[^>]*aria-valuenow="50"/);
  assert.ok(subs.list().indexOf('731234568') < subs.list().indexOf('771234567'), 'الأقرب انتهاءً أولًا');
  assert.equal(S.build('radar', d, c, x({ id: c.id })).tab, 'subscriptions', 'مسار الرادار القديم يعرض الاشتراكات');
});

test('U5: متابعة اشتراك رقم يملكه عميل آخر: التواريخ والتنبيهات فقط، بلا ملكية ولا تجديد، ودون كشف المالك', async () => {
  seed();
  await D.addNumber('cus-demo-low', '771234567'); // رقم مشترك لعميل آخر
  const d = D.readForCustomer('cus-demo-low'), c = d.customers[0], n = d.numbers.find(v => v.number === '771234567');
  assert.ok(n.liveSub && n.liveSub.own === false); assert.equal(d.subscriptions.some(v => v.numberId === n.id), false, 'لا يملك سجل الاشتراك');
  assert.doesNotMatch(JSON.stringify(d), /cus-demo-subscriber/, 'لا تسريب لهوية المالك');
  assert.match(S.build('subscriptions', d, c, x({ id: c.id })).list(), /متابعة فقط/);
  const v = S.numberDetail(d, n, c.id);
  assert.match(v.body, /تتابع هذا الاشتراك ولا تملكه/); assert.doesNotMatch(v.foot, /protection-path|radar-toggle/); assert.match(v.body, /radar-toggle/);
  assert.doesNotMatch(S.build('numbers', d, c, x({ id: c.id })).list(), /771234567/);
  const own = D.readForCustomer('cus-demo-subscriber'); own.protectionPackages = [{ id: 'pp-1', name: 'باقة', companyId: 'co-net77', days: 30, pointsCost: 10, active: true }]; const ov = S.numberDetail(own, own.numbers.find(v2 => v2.id === 'num-1001'), 'cus-demo-subscriber');
  assert.match(ov.foot, /protection-path/); assert.match(ov.body, /المدة المتبقية/);
});

test('U5 (87): تمديد صاحب الاشتراك يُخطر المتابع الذي فعّل التنبيهات فقط، دون هوية المالك أو المهام', async () => {
  const base = Fixture.seedData(); base.protectionPackages = [{ id: 'pp-1', name: 'باقة 30', companyId: 'co-net77', days: 30, pointsCost: 10, active: true }];
  D.setStorageForTests(store(JSON.stringify(base)));
  await D.addNumber('cus-demo-low', '771234567'); await D.addNumber('cus-demo-new', '771234567');
  await D.setRadar('cus-demo-low', 'num-1001', true); // cus-demo-new يتابع بلا تنبيهات
  await D.performProtectionOperation('cus-demo-subscriber', 'num-1001', 'pp-1', 'extend', 'k-87');
  const low = D.readForCustomer('cus-demo-low').notifications, nw = D.readForCustomer('cus-demo-new').notifications, owner = D.readForCustomer('cus-demo-subscriber').notifications;
  const got = low.filter(n => n.title === 'تغيّر حالة اشتراك رقم تتابعه');
  assert.equal(got.length, 1); assert.match(got[0].body, /مُدّد اشتراك الرقم 771234567/);
  assert.doesNotMatch(JSON.stringify(got), /cus-demo-subscriber|مهمة|task/);
  assert.equal(nw.filter(n => n.title === 'تغيّر حالة اشتراك رقم تتابعه').length, 0, 'من لم يفعّل التنبيهات لا يُخطَر');
  assert.equal(owner.filter(n => n.title === 'تغيّر حالة اشتراك رقم تتابعه').length, 0, 'المالك لا يُخطر بعمليته');
});

test('U6: كشف الحساب يحسب الرصيد بعد كل حركة ويطابق الرصيد الحالي، ويبحث ويصفّي', () => {
  seed();
  const d = D.readForCustomer('cus-demo-subscriber'), c = d.customers[0], v = x({ id: c.id });
  const html = S.build('points', d, c, v);
  const bal = D.balance(c.id, d);
  assert.ok(html.html.includes(`الرصيد بعدها ${bal.toLocaleString('en-US')} نقطة`) || html.list().includes('الرصيد بعدها'), 'أحدث حركة تعرض الرصيد الحالي');
  assert.match(html.html, /<details class="bal">/); assert.match(html.html, /إجمالي الإضافات/);
  const only = t => S.build('points', d, c, x({ id: c.id, co: t })).list();
  assert.match(only('credit'), /إضافة/); assert.doesNotMatch(only('credit'), /· خصم/); assert.doesNotMatch(only('debit'), /· إضافة/);
  assert.match(S.build('points', d, c, x({ id: c.id, q: 'لا-يوجد-كهذا' })).list(), /clear-filter/);
  const first = d.pointTransactions.filter(t => t.customerId === c.id).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
  assert.match(html.list(), new RegExp(`${first.points}`));
});

test('U6: زر التجديد/التمديد داخل بطاقة الاشتراك للمالك فقط وبوجود باقة حماية، وزر التجديد الجماعي عند رقمين فأكثر', () => {
  seed();
  const d = D.readForCustomer('cus-demo-subscriber'), c = d.customers[0], H = 86400000;
  d.protectionPackages = [{ id: 'pp', name: 'باقة', companyId: 'co-net77', days: 30, pointsCost: 10, active: true }, { id: 'pp3', name: 'باقة', companyId: 'co-net73', days: 30, pointsCost: 10, active: true }, { id: 'pp1', name: 'باقة', companyId: 'co-net71', days: 30, pointsCost: 10, active: true }];
  const sub = id => d.subscriptions.find(v => v.numberId === id);
  Object.assign(sub('num-1001'), { startsAt: new Date(Date.now() - 20 * H).toISOString(), endsAt: new Date(Date.now() + 20 * H).toISOString() }); // سارٍ بعيد: لا زر
  Object.assign(sub('num-1002'), { startsAt: new Date(Date.now() - 27 * H).toISOString(), endsAt: new Date(Date.now() + 3 * H).toISOString() }); // قريب: تمديد
  const html = S.build('subscriptions', d, c, x({ id: c.id })).list();
  assert.match(html, /data-number="731234568"[^>]*data-operation="extend"/); assert.match(html, /data-number="711234569"[^>]*data-operation="renew"/);
  assert.doesNotMatch(html, /data-number="771234567"/);
  assert.match(S.build('subscriptions', d, c, x({ id: c.id })).html, /data-act="batch-open"/);
  d.protectionPackages = []; assert.doesNotMatch(S.build('subscriptions', d, c, x({ id: c.id })).list(), /data-act="protection-path"/, 'لا باقات: لا أزرار');
});

test('U7: تغيير كلمة المرور يخزّن التجزئة فقط ويُسجَّل في التدقيق، ويرفض الحساب المحذوف', async () => {
  seed();
  await D.setPasswordHash('cus-demo-subscriber', 'pbkdf2$1$aa$bb');
  const d = D.read(), c = d.customers.find(v => v.id === 'cus-demo-subscriber');
  assert.equal(c.authHash, 'pbkdf2$1$aa$bb'); assert.ok(d.operations.some(o => o.type === 'password_changed' && !JSON.stringify(o).includes('pbkdf2')));
  await assert.rejects(() => D.setPasswordHash('cus-demo-subscriber', ''), /غير صالحة/);
});

test('U7: حذف الحساب يخفي الهوية ويلغي المعلق ويحذف الإشعارات والمتابعة ويُبقي السجلات المالية والنقاط والتدقيق', async () => {
  seed();
  const before = D.read(), id = 'cus-demo-subscriber', fin = before.financeEntries.length, pts = before.pointTransactions.filter(t => t.customerId === id).length, reqs = before.purchaseRequests.filter(r => r.customerId === id).length, subs = before.subscriptions.filter(s => s.customerId === id).length;
  await D.deleteAccount(id);
  const d = D.read(), c = d.customers.find(v => v.id === id);
  assert.equal(c.status, 'deleted'); assert.equal(c.name, 'حساب محذوف'); assert.doesNotMatch(c.email, /subscriber@|demo/); assert.equal(c.authHash, undefined);
  assert.equal(d.financeEntries.length, fin); assert.equal(d.pointTransactions.filter(t => t.customerId === id).length, pts);
  assert.equal(d.purchaseRequests.filter(r => r.customerId === id).length, reqs); assert.equal(d.subscriptions.filter(s => s.customerId === id).length, subs);
  assert.equal(d.purchaseRequests.filter(r => r.customerId === id && r.status === 'pending').length, 0);
  assert.equal(d.notifications.filter(n => n.customerId === id).length, 0); assert.equal(d.numberLinks.filter(l => l.customerId === id).length, 0);
  assert.ok(d.operations.some(o => o.type === 'account_deleted'));
  await assert.rejects(() => D.deleteAccount(id), /غير موجود/);
  await assert.rejects(() => D.setPasswordHash(id, 'x'), /غير موجود/);
  // الإدارة تعرض الحساب المحذوف دون أخطاء
  for (const r of ['customers/all', `customer/${id}`, 'requests/all', 'finance', 'home']) { const v = AmanAdminScreens.build(r, d, { q: '', filter: 'all', demo: false }); assert.doesNotMatch(v.html, /undefined|\[object Object\]|NaN/, r); }
});

test('U7: المساعدة تعرض الأسئلة الشائعة وبيانات التواصل من محتوى الإدارة وتتحمل غيابهما، والحساب يعرض الإجراءات الجديدة', async () => {
  seed();
  await D.updateContent('admin', 'faq', 'كيف أشتري نقاطًا؟\nمن شاشة شراء نقاط.\n\nكيف أجدد؟\nمن الاشتراكات.');
  await D.updateContent('admin', 'contact', 'واتساب: 700000000');
  const d = D.readForCustomer('cus-demo-subscriber'), c = d.customers[0];
  const h = S.build('help', d, c, x({ id: c.id })).html;
  assert.match(h, /<summary>كيف أشتري نقاطًا؟<\/summary>/); assert.match(h, /من الاشتراكات/); assert.match(h, /واتساب: 700000000/); assert.match(h, /1\. اشحن رصيد أمان|١\. اشحن رصيد أمان/);
  assert.equal(S.parseFaq('س\nج\n\nس2').length, 2); assert.equal(S.parseFaq('').length, 0);
  d.content.faq = ''; d.content.contact = ''; assert.match(S.build('help', d, c, x({ id: c.id })).html, /لم تضف الإدارة أسئلة شائعة بعد/);
  d.content.faq = '<img src=x onerror=1>\n<b>x</b>'; assert.doesNotMatch(S.build('help', d, c, x({ id: c.id })).html, /<img src=x|<b>x/);
  const a = S.build('account', d, c, x({ id: c.id })).html; assert.match(a, /data-act="password-open"/); assert.match(a, /data-act="delete-open"/);
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

/* ===== U1-ب: الحالات والتغذية الراجعة (البنود 36 و37 و38 و39 و58 و24) ===== */
test('U1 (39): الشاشات الفارغة تقدّم الخطوة التالية بزر مناسب، والبحث بلا نتائج يعرض مسح التصفية', () => {
  const base = D.seedData(); base.customers.push({ id: 'c9', accountId: 'A9', name: 'جديد', email: 'n9@aman.test', status: 'active', isSubscriber: false, createdAt: new Date().toISOString() });
  D.setStorageForTests(store(JSON.stringify(base)));
  const d = D.readForCustomer('c9'), c = d.customers[0], v = r => S.build(r, d, c, x({ id: 'c9' })).html;
  for (const r of ['orders', 'operations']) assert.match(v(r), /empty-action[^]*data-to="buy"/, r + ' يوجّه إلى شراء النقاط');
  assert.match(v('radar'), /data-to="numbers"/); assert.match(v('subscriptions'), /data-to="numbers"/);
  assert.match(v('notifications'), /لا توجد إشعارات/);assert.doesNotMatch(v('notifications'), /empty-action/, 'الإشعارات إعلامية بلا إجراء');
  assert.doesNotMatch(v('operations') + v('orders'), /undefined|\[object Object\]|NaN/);
  assert.match(K.empty('سبب', 'inbox', 'عنوان', '<button>زر</button>'), /<b>عنوان<\/b><p>سبب<\/p><div class="empty-action"><button>زر<\/button><\/div>/);
  assert.doesNotMatch(K.empty('سبب'), /empty-action/);
  const all = seed(), id = 'cus-demo-subscriber', d2 = D.readForCustomer(id);
  assert.match(S.build('subscriptions', d2, d2.customers[0], x({ id, q: 'لا-يوجد-رقم-كهذا' })).list(), /data-act="clear-filter"/);
});

test('U1 (36 و37): هيكل التحميل مُعلَن لقارئات الشاشة ويظهر قبل تحميل السكربت، وشاشة الخطأ تحوي إعادة المحاولة', () => {
  const sk = K.skeleton(3);
  assert.match(sk, /role="status" aria-busy="true" aria-label="جارٍ التحميل"/);
  assert.equal((sk.match(/sk-row/g) || []).length, 3);
  const html = read('customer.html'), css = read('customer.css'), js = read('customer.js');
  assert.match(html, /<main id="screen"[^>]*><div class="skeleton" role="status" aria-busy="true"/, 'هيكل أولي بدل شاشة فارغة');
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)\{\.sk\{animation:none/);
  assert.match(js, /K\.btn\('إعادة المحاولة', 'retry', 'primary'\)/);
  assert.match(js, /case 'retry': retryLoad\(\)/);assert.match(js, /K\.skeleton\(4\)/);
  assert.match(js, /لم تُستبدل البيانات المحفوظة/, 'الخطأ لا يستبدل البيانات');
});

test('U1 (38): شريط الاتصال الثابت يوضح الحالة دون منع العمليات المحلية', () => {
  const html = read('customer.html'), js = read('customer.js'), css = read('customer.css');
  assert.match(html, /<div id="netbar" class="netbar hidden" role="status"><\/div>/);
  assert.match(js, /addEventListener\('offline'/);assert.match(js, /addEventListener\('online'/);
  assert.match(js, /لا يوجد اتصال بالإنترنت\. بياناتك المحفوظة على هذا الجهاز ما زالت متاحة\./);
  assert.match(js, /عاد الاتصال بالإنترنت/);
  assert.match(css, /\.netbar\{flex:none/);
  assert.doesNotMatch(js, /navigator\.onLine[^;]*throw/, 'الاتصال لا يمنع أي عملية');
});

test('U1 (58 و24): تراجع لثوانٍ للإجراءات غير المالية فقط (المتابعة وتنبيه الإشعارات)، وبلا تراجع للمالية', () => {
  const js = read('customer.js'), lines = js.split('\n');
  assert.match(js, /function toast\(text, bad = false, undo = null\)/);
  assert.match(js, /case 'toast-undo'/);assert.match(js, /undo \? 6500 : 3800/);
  assert.match(js, /setRadar\(ui\.id, id, true\) \}\)/, 'إيقاف المتابعة قابل للتراجع');
  assert.match(js, /fn: \(\) => D\.setRadar\(ui\.id, id, was\)/, 'تبديل المتابعة يعيد الحالة السابقة');
  assert.match(js, /fn: async \(\) => localStorage\.setItem\(key, on \? '0' : '1'\)/);
  for (const needle of ['D.createPurchase', 'D.performProtectionOperation', 'D.addNumber'])
    for (const l of lines.filter(l => l.includes(needle) && !l.includes('function'))) assert.doesNotMatch(l, /fn:/, `${needle}: لا تراجع للعمليات المالية/الحساسة`);
  const longToasts = [...js.matchAll(/toast\('([^']+)'/g)].map(m => m[1]).filter(t => t.length > 60);
  assert.deepEqual(longToasts, [], 'الإشعارات قصيرة');
});

test('U2-د: تحميل المزيد والسحب للتحديث في العميل (55 و56) بلا تغيير في بناء الشاشات', () => {
  const js = read('customer.js'), css = read('customer.css');
  assert.match(js, /const PAGE = 30/);assert.match(js, /function applyPaging\(\)/);
  assert.match(js, /case 'load-more': ui\.limit = \(ui\.limit \|\| PAGE\) \+ PAGE; applyPaging\(\)/);
  assert.match(js, /\n    applyPaging\(\);\n(    maybeWelcome\(snap\);\n)?    if \(opt\.top\)/, 'يُطبَّق بعد كل عرض');
  assert.match(js, /b\.innerHTML = S\.build\(ui\.route, d, c, ctxNow\(\)\)\.list\(\); applyPaging\(\)/, 'ويُطبَّق بعد تحديث البحث');
  assert.equal((js.match(/ui\.limit = 0/g) || []).length >= 5, true, 'إعادة الضبط عند تغيّر الشاشة والبحث والفلتر والمسح');
  assert.match(css, /\.row\[hidden\]\{display:none!important\}/);
  assert.match(js, /pullToRefresh/);assert.match(js, /s\.scrollTop > 0 \|\| e\.target\.closest\?\.\('input,textarea,select'\)/);
  assert.match(js, /if \(go\) \{ render\(\{\}\); toast\('حُدّثت البيانات\.'\); \}/);
});

/* ===== نوافذ العميل: البنية، الاستجابة، ومنظومة التركيز ===== */
function assertCustomerSheet(html, label) {
  assert.equal((html.match(/role="dialog"/g) || []).length, 1, `${label}: نافذة واحدة`);
  assert.match(html, /role="dialog" aria-modal="true" aria-labelledby="customer-sheet-title"/);
  assert.equal((html.match(/class="sheet-close"/g) || []).length, 1, `${label}: زر إغلاق واحد`);
  const close = html.match(/<button[^>]*class="sheet-close"[^>]*>([\s\S]*?)<\/button>/)?.[1] || '';
  assert.match(close, /^<svg[\s\S]*<\/svg>$/, `${label}: الإغلاق أيقوني فقط`);
  assert.match(html, /class="sheet-body" tabindex="0"/);
  assert.match(html, /class="sheet-foot"/);
  assert.ok((html.match(/class="btn primary"/g) || []).length <= 1, `${label}: إجراء أساسي واحد كحد أقصى`);
}

test('نوافذ التفاصيل لكل أرقام وعمليات بيانات العينة تبقى ضمن حوار واحد ذي إغلاق ورأس وإجراء سفلي', () => {
  const done = K.btn('تم', 'sheet-close', 'primary');
  for (const id of ['cus-demo-subscriber', 'cus-demo-low', 'cus-demo-new']) {
    const d = D.readForCustomer(id), c = d.customers[0];
    for (const n of D.customerNumbers(id, d)) {
      const v = S.numberDetail(d, n, id);
      assertCustomerSheet(K.sheet(v.title, v.body, v.foot || done), `${id}:number:${n.id}`);
      assert.match(v.body, /class="kv"/, `${id}:${n.id}: تفاصيل مترابطة`);
      assert.match(v.body, /sheet-secondary-actions/, `${id}:${n.id}: الإجراءات الثانوية ليست أزرارًا أساسية`);
    }
    const entries = [
      ['points', d.pointTransactions.filter(v => v.customerId === id)],
      ['request', d.purchaseRequests.filter(v => v.customerId === id)],
      ['subscription', d.subscriptions.filter(v => v.customerId === id)],
      ['protection', (d.protectionOperations || []).filter(v => v.customerId === id)]
    ];
    for (const [kind, records] of entries) for (const rec of records) {
      const v = S.operationDetail(d, kind, rec.id, c);
      if (!v) continue;
      assertCustomerSheet(K.sheet(v.title, v.body, v.foot || done), `${id}:${kind}:${rec.id}`);
      assert.match(v.body, /class="kv"|class="stages"/, `${id}:${kind}:${rec.id}: المحتوى منظّم`);
    }
  }
});

test('نافذة تفاصيل الرقم تجمع المعلومات وتُبقي إجراءات التنبيه والإشعار ثانوية', () => {
  seed();
  const d = D.readForCustomer('cus-demo-subscriber'), c = d.customers[0];
  for (const n of D.customerNumbers(c.id, d)) {
    const v = S.numberDetail(d, n, c.id);
    assert.match(v.body, /class="kv"/);
    assert.match(v.body, /class="sheet-secondary-actions"[\s\S]*data-act="number-notifications"/);
    assert.doesNotMatch(v.foot, /data-act="radar-toggle|data-act="number-notifications/);
    assert.ok(!v.foot || /class="btn primary"/.test(v.foot), 'إجراء الحماية وحده في التذييل');
  }
});

test('مراجعة الحماية تجمع التكلفة والمدة والأرصدة وتحافظ على تنبيه الخصم والنقص', () => {
  const js = read('customer.js');
  assert.match(js, /class="kv protection-details"[\s\S]*id="protectionPackage"/);
  for (const field of ['الرقم', 'الشركة', 'رصيد النقاط', 'باقة الحماية']) assert.match(js, new RegExp(field));
  assert.match(js, /class="protection-review-financial"/);
  for (const field of ['المدة الصافية', 'التكلفة', 'الرصيد الحالي', 'الرصيد بعد الخصم']) assert.match(js, new RegExp(field));
  assert.match(js, /لن يُخصم الرصيد إلا بعد التأكيد النهائي/);
  assert.match(js, /رصيدك غير كافٍ[\s\S]*لم يُخصم شيء/);
  assert.match(js, /short > 0 \? K\.btn\('اشحن الآن'/);
  assert.match(js, /data-act="protection-confirm"|K\.btn\('تأكيد وخصم النقاط', 'protection-confirm'/);
  assert.match(js, /K\.btn\('رجوع', 'protection-path'/, 'الرجوع إلى اختيار الباقة يبقى فعلًا وظيفيًا');
});

test('كل النوافذ تستخدم زر إغلاق أيقونيًا 44×44 وتمريرًا داخليًا وsafe area وتركيزًا محايدًا', () => {
  const css = read('customer.css'), js = read('customer.js'), sample = K.sheet('اختبار', '<p>محتوى</p>', K.btn('تم', 'sheet-close', 'primary'));
  assertCustomerSheet(sample, 'قالب المجموعة');
  assert.match(css, /\.sheet-close\{[^}]*width:44px;height:44px;min-width:44px;min-height:44px/);
  assert.match(css, /\.sheet-body\{[^}]*overflow-y:auto[^}]*overscroll-behavior:contain/);
  assert.match(css, /\.scrim\{[^}]*padding-top:env\(safe-area-inset-top\)/);
  assert.match(css, /\.sheet\{[^}]*max-height:calc\(100% - env\(safe-area-inset-top\) - 8px\)[^}]*padding:[^;]*env\(safe-area-inset-bottom\)/);
  assert.match(css, /:focus-visible\{outline:2px solid var\(--ink\)/);
  assert.match(css, /\.protection-details \.kv-select-row select:focus-visible\{outline:2px solid var\(--ink\)/);
  assert.match(css, /@media\(max-width:360px\)/);
  assert.equal((css.match(/\.scrim\{/g) || []).length, 1, 'قاعدة النافذة في موضع واحد بلا override');
  assert.equal((css.match(/\.sheet-body\{/g) || []).length, 1, 'قاعدة التمرير في موضع واحد بلا override');
  assert.match(js, /\.sheet-close'\)\?\.focus\(\{ preventScroll: true \}\)/);
  assert.doesNotMatch(js, /#sheetRoot input:not\(\[type=hidden\]\),#sheetRoot select\)\?\.focus/);
  assert.match(js, /ui\.sheetReturnFocus = document\.activeElement/);
  assert.match(js, /target\?\.isConnected\) target\.focus/);
  assert.match(js, /e\.key === 'Tab' && ui\.sheet/);
  assert.match(js, /shiftKey && \(document\.activeElement === first/);
  assert.match(js, /!e\.shiftKey && \(document\.activeElement === last/);
});

test('إزالة أزرار الإلغاء التي تكرر الإغلاق مع إبقاء لاحقًا والرجوع والإلغاء الوظيفي', () => {
  const js = read('customer.js'), screens = read('customer-screens.js');
  assert.doesNotMatch(js, /K\.btn\('إلغاء', 'sheet-close'/);
  assert.doesNotMatch(js, /K\.submitBtn\([^\n]*\) \+ K\.btn\('إلغاء', 'sheet-close'/);
  assert.match(js, /K\.btn\('لاحقًا', 'welcome-done'\)/);
  assert.match(js, /K\.btn\('رجوع', 'protection-path'/);
  assert.match(screens, /K\.btn\('إلغاء الطلب', 'order-cancel', 'danger'/, 'إلغاء الطلب له أثر وظيفي ويظل متاحًا');
  assert.match(js, /K\.submitBtn\('إضافة الرقم', 'add-number-form'\)/);
  assert.match(js, /K\.btn\('تسجيل الخروج', 'logout-confirm', 'primary'\)/);
});
