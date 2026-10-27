const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../shared/data.js');
const X = require('../shared/expiry.js');
const Fixture = require('./fixture-data.js');

function memoryStorage() {
  const map = new Map();
  return { getItem: k => (map.has(k) ? map.get(k) : null), setItem: (k, v) => { map.set(k, v); } };
}
test.beforeEach(() => { const s = memoryStorage(); D.setStorageForTests(s); s.setItem(D.KEY, JSON.stringify(Fixture.seedData())); });

const ADMIN = 'admin-demo', DAY = 86400000, AT = Date.parse('2026-10-28T09:00:00Z');
const sub = (daysAhead, extra = {}) => ({ id: 's1', numberId: 'n1', status: 'active', startsAt: new Date(AT - 30 * DAY).toISOString(), endsAt: new Date(AT + daysAhead * DAY).toISOString(), ...extra });
const CLS = () => X.clean([{ name: 'عاجل', upToDays: 3 }, { name: 'قريب', upToDays: 14 }]);

test('U11: القائمة فارغة افتراضيًا، وتُنقّى وتُرتَّب تصاعديًا بلا تداخل', () => {
  assert.deepEqual(X.clean(undefined), []);
  assert.deepEqual(X.clean([]), []);
  const out = X.clean([{ name: '  قريب  ', upToDays: '14' }, { name: 'عاجل', upToDays: 3, notify: true }]);
  assert.deepEqual(out, [{ name: 'عاجل', upToDays: 3, notify: true }, { name: 'قريب', upToDays: 14, notify: false }]);
  assert.throws(() => X.clean('x'), /صيغة/);
  assert.throws(() => X.clean([{ name: '', upToDays: 3 }]), /مطلوب/);
  assert.throws(() => X.clean([{ name: 'أ', upToDays: '' }]), /بين 1 و365/);
  assert.throws(() => X.clean([{ name: 'أ', upToDays: 0 }]), /بين 1 و365/);
  assert.throws(() => X.clean([{ name: 'أ', upToDays: 2.5 }]), /بين 1 و365/);
  assert.throws(() => X.clean([{ name: 'أ', upToDays: 366 }]), /بين 1 و365/);
  assert.throws(() => X.clean([{ name: 'أ', upToDays: 3 }, { name: 'ب', upToDays: 3 }]), /مكرر/);
  assert.throws(() => X.clean([{ name: 'أ', upToDays: 3 }, { name: 'أ', upToDays: 9 }]), /مكرر/);
  assert.throws(() => X.clean(Array.from({ length: 7 }, (_, i) => ({ name: 'ت' + i, upToDays: i + 1 }))), /الحد الأقصى 6/);
  assert.throws(() => X.clean([{ name: 'ا'.repeat(25), upToDays: 3 }]), /أطول من 24/);
});

test('U11: يُختار أضيق تصنيف مطابق، وللمنتهي والبعيد والمعطّل والحالات غير السارية حكمها', () => {
  const cls = CLS();
  assert.equal(X.classify(cls, sub(2.2), AT).cls.name, 'عاجل');
  assert.equal(X.classify(cls, sub(2.2), AT).days, 3);
  assert.equal(X.classify(cls, sub(3), AT).cls.name, 'عاجل');
  assert.equal(X.classify(cls, sub(3.01), AT).cls.name, 'قريب');
  assert.equal(X.classify(cls, sub(14), AT).cls.name, 'قريب');
  assert.equal(X.classify(cls, sub(15), AT).cls, null);
  assert.equal(X.classify(cls, sub(15), AT).state, 'active');
  assert.equal(X.classify([], sub(2), AT).cls, null);
  assert.equal(X.classify(cls, sub(-1), AT).state, 'expired');
  assert.equal(X.classify(cls, sub(5, { status: 'extended' }), AT).state, 'none');
  assert.equal(X.classify(cls, null, AT).state, 'none');
  assert.equal(X.classify(cls, sub(5, { startsAt: new Date(AT + DAY).toISOString() }), AT).state, 'none');
  assert.equal(X.classify(cls, sub(5, { endsAt: 'bad' }), AT).state, 'none');
});

test('U11: فلاتر الأرقام وفق التصنيفات (بند 47) والشارة (بند 28)', () => {
  const cls = CLS();
  assert.deepEqual(X.filterOptions(cls), [['all', 'الكل'], ['active', 'الاشتراكات النشطة'], ['near', 'قرب الانتهاء'], ['cls:3', 'عاجل'], ['cls:14', 'قريب'], ['expired', 'المنتهية']]);
  assert.deepEqual(X.filterOptions([]), [['all', 'الكل'], ['active', 'الاشتراكات النشطة'], ['expired', 'المنتهية']]);
  const urgent = X.classify(cls, sub(2), AT), near = X.classify(cls, sub(10), AT), far = X.classify(cls, sub(60), AT), gone = X.classify(cls, sub(-2), AT), none = X.classify(cls, null, AT);
  const F = ['all', 'active', 'near', 'cls:3', 'cls:14', 'expired'], row = r => F.map(f => X.matches(f, r));
  assert.deepEqual(row(urgent), [true, true, true, true, false, false]);
  assert.deepEqual(row(near), [true, true, true, false, true, false]);
  assert.deepEqual(row(far), [true, true, false, false, false, false]);
  assert.deepEqual(row(gone), [true, false, false, false, false, true]);
  assert.deepEqual(row(none), [true, false, false, false, false, false]);
  assert.deepEqual(X.badge(urgent), { key: 'cls:3', label: 'عاجل', tone: 'warn' });
  assert.deepEqual(X.badge(far), { key: 'active', label: 'فعال', tone: 'ok' });
  assert.deepEqual(X.badge(gone), { key: 'expired', label: 'منتهٍ', tone: 'bad' });
  assert.equal(X.badge(none), null);
});

test('U11: الحفظ يُسجَّل قبل/بعد ولا يغيّر المحفوظ عند الفشل، ولا يصل إلى العميل إلا الاسم والحد', async () => {
  assert.deepEqual(X.read(D.read()), []);
  await X.save(D, ADMIN, [{ name: 'قريب', upToDays: 14, notify: true }, { name: 'عاجل', upToDays: 3 }]);
  assert.deepEqual(X.read(D.read()), [{ name: 'عاجل', upToDays: 3, notify: false }, { name: 'قريب', upToDays: 14, notify: true }]);
  assert.ok(D.read().settings.customerClasses, 'إعدادات تصنيف العملاء باقية');
  const op = D.read().operations.filter(o => o.type === 'expiry_classes_saved').at(-1);
  assert.deepEqual(op.details.before, []);
  assert.equal(op.details.after.length, 2);
  await assert.rejects(() => X.save(D, ADMIN, [{ name: 'أ', upToDays: 0 }]), /بين 1 و365/);
  assert.equal(X.read(D.read()).length, 2, 'الفشل لا يغيّر المحفوظ');
  assert.deepEqual(X.publicClasses(D), [{ name: 'عاجل', upToDays: 3 }, { name: 'قريب', upToDays: 14 }]);
  const view = D.readForCustomer('cus-demo-low');
  assert.equal('settings' in view, false);
  assert.equal(JSON.stringify(view).includes('expiryClasses'), false);
  await X.save(D, ADMIN, []);
  assert.deepEqual(X.read(D.read()), []);
});

test('U11: قيمة مخزنة تالفة تُقرأ كمعطّلة ولا تكسر القراءة', () => {
  assert.deepEqual(X.read({ settings: { expiryClasses: { classes: [{ name: '', upToDays: 3 }] } } }), []);
  assert.deepEqual(X.read({ settings: { expiryClasses: 'bad' } }), []);
  assert.deepEqual(X.read({}), []);
  assert.deepEqual(X.read(undefined), []);
});

test('U11: تنبيهات قرب الانتهاء تتبع التصنيفات المفعّل لها التنبيه فقط وتُرتَّب بالأقرب', () => {
  const cls = X.clean([{ name: 'عاجل', upToDays: 3, notify: true }, { name: 'قريب', upToDays: 14, notify: false }]);
  const db = {
    numbers: [{ id: 'n1', companyId: 'co-x' }, { id: 'n2', companyId: 'co-x' }, { id: 'n3', companyId: 'co-y' }, { id: 'n4', companyId: 'co-y' }],
    subscriptions: [
      sub(2, { id: 's1', numberId: 'n1', customerId: 'c1', companyId: 'co-x' }),
      sub(10, { id: 's2', numberId: 'n2', customerId: 'c2', companyId: 'co-x' }),
      sub(0.5, { id: 's3', numberId: 'n3', customerId: 'c3', companyId: 'co-y' }),
      sub(-1, { id: 's4', numberId: 'n4', customerId: 'c4', companyId: 'co-y' })
    ]
  };
  const out = X.alerts(D, db, cls, AT);
  assert.deepEqual(out.map(a => a.subscriptionId), ['s3', 's1']);
  assert.deepEqual(out.map(a => a.days), [1, 2]);
  assert.equal(out[0].className, 'عاجل');
  assert.equal(out[0].companyId, 'co-y');
  assert.deepEqual(X.alerts(D, db, [], AT), [], 'بلا تصنيفات لا تنبيهات');
});
