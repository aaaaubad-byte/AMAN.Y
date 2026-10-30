const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../shared/data.js');
const Fixture = require('./fixture-data.js');

function memoryStorage() {
  const map = new Map();
  return { getItem: k => (map.has(k) ? map.get(k) : null), setItem: (k, v) => { map.set(k, v); } };
}
test.beforeEach(() => { const s = memoryStorage(); D.setStorageForTests(s); s.setItem(D.KEY, JSON.stringify(Fixture.seedData())); });

const ADMIN = 'admin-demo';
const cust = id => D.read().customers.find(c => c.id === id);

test('U10: الحظر يفرض الأثر الثلاثة ويمنع الشراء والاشتراك والحماية ويُسجَّل بالتفاصيل', async () => {
  await D.setCustomerStatus(ADMIN, 'cus-demo-subscriber', { status: 'blocked', reason: 'مخالفة الشروط' });
  const c = cust('cus-demo-subscriber');
  assert.equal(c.status, 'blocked');
  assert.deepEqual(D.restrictionsOf(c), { login: true, purchase: true, protection: true });
  assert.equal(D.canLogin(c), false);
  const before = D.balance('cus-demo-subscriber');
  await assert.rejects(() => D.createPurchase('cus-demo-subscriber', 'pkg-100', 'pay-wallet', 'BLK-1'), /شراء النقاط غير متاح/);
  await assert.rejects(() => D.activateSubscription('cus-demo-subscriber', 'num-1001', 7, 'blk-act'), /خدمات الحماية غير متاحة/);
  await assert.rejects(() => D.performProtectionOperation('cus-demo-subscriber', 'num-1001', 'protect-7', 'extend', 'blk-ext'), /خدمات الحماية غير متاحة/);
  assert.equal(D.balance('cus-demo-subscriber'), before);
  const op = D.read().operations.filter(o => o.type === 'customer_status_changed').at(-1);
  assert.equal(op.entityId, 'cus-demo-subscriber');
  assert.equal(op.details.to, 'blocked');
  assert.equal(op.details.reason, 'مخالفة الشروط');
});

test('U10: الإيقاف يشترط أثرًا واحدًا وسببًا ويفرض ما اختير فقط، ثم الاستعادة تعيد كل شيء', async () => {
  await assert.rejects(() => D.setCustomerStatus(ADMIN, 'cus-demo-subscriber', { status: 'suspended', reason: 'س', restrictions: {} }), /أثرًا واحدًا/);
  await assert.rejects(() => D.setCustomerStatus(ADMIN, 'cus-demo-subscriber', { status: 'suspended', reason: ' ', restrictions: { purchase: true } }), /سبب الإيقاف مطلوب/);
  await assert.rejects(() => D.setCustomerStatus(ADMIN, 'cus-demo-subscriber', { status: 'weird', reason: 'س' }), /غير صالحة/);
  assert.equal(cust('cus-demo-subscriber').status, 'active');
  await D.setCustomerStatus(ADMIN, 'cus-demo-subscriber', { status: 'suspended', reason: 'مراجعة', restrictions: { purchase: true } });
  assert.deepEqual(D.restrictionsOf(cust('cus-demo-subscriber')), { login: false, purchase: true, protection: false });
  await assert.rejects(() => D.createPurchase('cus-demo-subscriber', 'pkg-100', 'pay-wallet', 'SUS-1'), /شراء النقاط غير متاح/);
  const before = D.balance('cus-demo-subscriber');
  await D.activateSubscription('cus-demo-subscriber', 'num-1001', 7, 'sus-act'); // الحماية غير مقيدة
  assert.equal(D.balance('cus-demo-subscriber'), before - 21);
  await D.setCustomerStatus(ADMIN, 'cus-demo-subscriber', { status: 'active' });
  const c = cust('cus-demo-subscriber');
  assert.equal(c.statusReason, null);
  assert.deepEqual(D.restrictionsOf(c), { login: false, purchase: false, protection: false });
  await D.createPurchase('cus-demo-subscriber', 'pkg-100', 'pay-wallet', 'SUS-2');
  await assert.rejects(() => D.setCustomerStatus(ADMIN, 'cus-demo-subscriber', { status: 'active' }), /فعال بالفعل/);
});

test('U10: حظر الدخول فقط عبر الإيقاف لا يمنع الشراء، والحساب المحذوف لا تُغيَّر حالته', async () => {
  await D.setCustomerStatus(ADMIN, 'cus-demo-low', { status: 'suspended', reason: 'تحقق', restrictions: { login: true } });
  assert.equal(D.canLogin(cust('cus-demo-low')), false);
  await D.createPurchase('cus-demo-low', 'pkg-100', 'pay-wallet', 'LOGIN-ONLY');
  await D.deleteAccount('cus-demo-new');
  await assert.rejects(() => D.setCustomerStatus(ADMIN, 'cus-demo-new', { status: 'blocked', reason: 'س' }), /غير موجود أو محذوف/);
});

test('U10: الوسوم ذرّية وتُدمج دون تكرار وتُزال جماعيًا', async () => {
  await D.addCustomerTags(ADMIN, ['cus-demo-subscriber', 'cus-demo-low'], 'مميز');
  assert.deepEqual(cust('cus-demo-low').tags, ['مميز']);
  const { result } = await D.addCustomerTags(ADMIN, ['cus-demo-subscriber', 'cus-demo-new'], '  مميز ');
  assert.equal(result.details.changed, 1); // المشترك يملكه أصلًا
  assert.deepEqual(cust('cus-demo-subscriber').tags, ['مميز']);
  const snapshot = JSON.stringify(D.read().customers);
  await assert.rejects(() => D.addCustomerTags(ADMIN, ['cus-demo-low', 'no-such-customer'], 'جديد-وسم'), /غير موجودين؛ لم يُحفظ/);
  assert.equal(JSON.stringify(D.read().customers), snapshot, 'لا تغيير جزئي عند الفشل');
  await assert.rejects(() => D.addCustomerTags(ADMIN, [], 'x'), /عميلًا واحدًا/);
  await assert.rejects(() => D.addCustomerTags(ADMIN, ['cus-demo-low'], '   '), /اكتب اسم الوسم/);
  await assert.rejects(() => D.addCustomerTags(ADMIN, ['cus-demo-low'], 'ا'.repeat(25)), /أطول من 24/);
  await D.removeCustomerTag(ADMIN, ['cus-demo-subscriber', 'cus-demo-low', 'cus-demo-new'], 'مميز');
  for (const id of ['cus-demo-subscriber', 'cus-demo-low', 'cus-demo-new']) assert.deepEqual(cust(id).tags, []);
});

test('U10: حد الوسوم لكل عميل يفشل ذرّيًا', async () => {
  for (let i = 0; i < 20; i++) await D.addCustomerTags(ADMIN, ['cus-demo-low'], `وسم${i}`);
  const before = JSON.stringify(D.read().customers);
  await assert.rejects(() => D.addCustomerTags(ADMIN, ['cus-demo-subscriber', 'cus-demo-low'], 'زائد'), /الحد الأقصى/);
  assert.equal(JSON.stringify(D.read().customers), before);
});

test('U10: قواعد التصنيف فارغة افتراضيًا (معطّلة) وتُحفظ وتُتحقق وتُسجَّل قبل/بعد', async () => {
  assert.deepEqual(D.read().settings.customerClasses, { newWithinDays: null, premiumMinApprovedOrders: null });
  await D.saveCustomerClasses(ADMIN, { newWithinDays: '14', premiumMinApprovedOrders: 3 });
  assert.deepEqual(D.read().settings.customerClasses, { newWithinDays: 14, premiumMinApprovedOrders: 3 });
  const op = D.read().operations.filter(o => o.type === 'customer_classes_saved').at(-1);
  assert.deepEqual(op.details.before, { newWithinDays: null, premiumMinApprovedOrders: null });
  assert.deepEqual(op.details.after, { newWithinDays: 14, premiumMinApprovedOrders: 3 });
  await D.saveCustomerClasses(ADMIN, { newWithinDays: '', premiumMinApprovedOrders: null });
  assert.deepEqual(D.read().settings.customerClasses, { newWithinDays: null, premiumMinApprovedOrders: null });
  await assert.rejects(() => D.saveCustomerClasses(ADMIN, { newWithinDays: 0 }), /بين 1 و3650/);
  await assert.rejects(() => D.saveCustomerClasses(ADMIN, { premiumMinApprovedOrders: 1.5 }), /عددًا صحيحًا/);
  await assert.rejects(() => D.saveCustomerClasses(ADMIN, { newWithinDays: -2 }), /عددًا صحيحًا/);
});

test('U10: نسخة العميل لا تسرّب الوسوم ولا السبب ولا الأثر ولا الإعدادات ولا عمليات الإدارة', async () => {
  await D.addCustomerTags(ADMIN, ['cus-demo-low'], 'سري-داخلي');
  await D.setCustomerStatus(ADMIN, 'cus-demo-low', { status: 'suspended', reason: 'سبب-داخلي-خاص', restrictions: { purchase: true } });
  await D.saveCustomerClasses(ADMIN, { newWithinDays: 7 });
  const view = D.readForCustomer('cus-demo-low');
  const text = JSON.stringify(view);
  for (const secret of ['سري-داخلي', 'سبب-داخلي-خاص', 'statusReason', 'restrictions', 'customerClasses', 'customer_status_changed', 'customer_tags_added'])
    assert.equal(text.includes(secret), false, `تسرّب: ${secret}`);
  assert.equal('settings' in view, false);
  assert.equal(view.customers[0].tags, undefined);
  assert.ok(view.operations.every(o => o.details === undefined));
});

test('U10: بيانات قديمة بحالة blocked بلا restrictions تُعامل كحظر كامل', () => {
  assert.deepEqual(D.restrictionsOf({ status: 'blocked' }), { login: true, purchase: true, protection: true });
  assert.deepEqual(D.restrictionsOf({ status: 'suspended' }), { login: false, purchase: false, protection: false });
  assert.deepEqual(D.restrictionsOf(undefined), { login: false, purchase: false, protection: false });
});

/* ---------- نموذج الإدارة: الشارات والسجل الزمني والنسخ ---------- */
const M = require('../apps/admin-model.js');
const keys = (d, c) => M.customerBadges(d, c).map(b => b.key);

test('U10 نموذج: الشارات — مشترك/مستخدم من الطلبات المعتمدة، وجديد/مميز معطّلان افتراضيًا', () => {
  const d = D.read();
  const approvedId = d.purchaseRequests.find(r => r.status === 'approved').customerId;
  const approved = d.customers.find(c => c.id === approvedId);
  const none = d.customers.find(c => M.approvedOrders(d, c.id) === 0);
  assert.ok(approved && none);
  assert.deepEqual(keys(d, approved), ['subscriber']);
  assert.deepEqual(keys(d, none), ['user']);
  assert.equal(M.kindLabel(M.customerKind(d, none)), 'مستخدم');
  none.createdAt = new Date(Date.now() - 3 * 86400000).toISOString();
  assert.equal(M.isNewCustomer(d, none), false, 'القيمة الفارغة تعطّل «جديد»');
  d.settings.customerClasses.newWithinDays = 7;
  assert.deepEqual(keys(d, none), ['user', 'new']);
  none.createdAt = new Date(Date.now() - 9 * 86400000).toISOString();
  assert.equal(M.isNewCustomer(d, none), false);
  d.settings.customerClasses.premiumMinApprovedOrders = 1;
  assert.ok(keys(d, approved).includes('premium'));
  assert.equal(keys(d, none).includes('premium'), false);
  none.tags = ['مميز'];
  assert.ok(keys(d, none).includes('premium'), 'وسم مميز اليدوي');
});

test('U10 نموذج: شارة المحظور/الموقوف تسبق الباقي وتعتمد حالة الحساب', async () => {
  await D.setCustomerStatus(ADMIN, 'cus-demo-low', { status: 'blocked', reason: 'س' });
  await D.setCustomerStatus(ADMIN, 'cus-demo-new', { status: 'suspended', reason: 'س', restrictions: { purchase: true, protection: true } });
  const d = D.read();
  assert.equal(M.customerBadges(d, d.customers.find(c => c.id === 'cus-demo-low'))[0].key, 'blocked');
  assert.equal(M.customerBadges(d, d.customers.find(c => c.id === 'cus-demo-new'))[0].key, 'suspended');
  assert.deepEqual(M.restrictionList(d.customers.find(c => c.id === 'cus-demo-new'), D), ['شراء النقاط', 'خدمات الحماية']);
});

test('U10 نموذج: السجل الزمني من السجلات الفعلية بترتيب الأحدث أولًا ودون تكرار', async () => {
  await D.addCustomerTags(ADMIN, ['cus-demo-subscriber'], 'عميل-vip');
  await D.addInternalNote(ADMIN, 'customer', 'cus-demo-subscriber', 'اتصل بالإدارة');
  await D.saveProtectionPackage(ADMIN, { id: 'protect-7', companyId: 'co-net77', name: 'حماية أسبوع', days: 7, pointsCost: 25, active: true });
  await D.performProtectionOperation('cus-demo-subscriber', 'num-1001', 'protect-7', 'extend', 'tl-ext');
  await D.setCustomerStatus(ADMIN, 'cus-demo-subscriber', { status: 'suspended', reason: 'تحقق', restrictions: { purchase: true } });
  const d = D.read(), tl = M.customerTimeline(d, 'cus-demo-subscriber');
  for (let i = 1; i < tl.length; i++) assert.ok(new Date(tl[i - 1].at) >= new Date(tl[i].at), 'الأحدث أولًا');
  const kinds = tl.map(e => e.kind);
  for (const k of ['signup', 'request', 'protection', 'status', 'tag', 'note']) assert.ok(kinds.includes(k), `ينقص ${k}`);
  const status = tl.find(e => e.kind === 'status');
  assert.match(status.title, /فعال ← موقوف/);
  assert.match(status.sub, /تحقق/);
  const opsForExtend = d.protectionOperations.filter(o => o.customerId === 'cus-demo-subscriber').length;
  assert.equal(tl.filter(e => e.kind === 'protection').length, opsForExtend);
  // لا ظهور لحدث عميل آخر
  assert.equal(M.customerTimeline(d, 'cus-demo-low').some(e => e.kind === 'status'), false);
});

test('U10 نموذج: نص نسخ بيانات العميل لا يتضمن تجزئة كلمة المرور', () => {
  const d = D.read(), c = d.customers.find(x => x.id === 'cus-demo-subscriber');
  c.authHash = 'pbkdf2$SECRET-HASH-VALUE'; c.tags = ['أ', 'ب'];
  const text = M.customerCopyText(d, c, D);
  assert.ok(text.includes(c.email) && text.includes(c.accountId) && text.includes('أ، ب'));
  assert.equal(/SECRET|pbkdf2|authHash/.test(text), false);
  assert.match(text, /الأرقام \(\d+\)/);
});
