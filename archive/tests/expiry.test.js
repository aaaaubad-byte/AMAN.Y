const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../shared/data.js');
const X = require('../shared/expiry.js');
const Fixture = require('./fixture-data.js');

let STORE;
function memoryStorage() {
  const map = new Map();
  return { getItem: k => (map.has(k) ? map.get(k) : null), setItem: (k, v) => { map.set(k, v); } };
}
test.beforeEach(() => { STORE = memoryStorage(); D.setStorageForTests(STORE); STORE.setItem(D.KEY, JSON.stringify(Fixture.seedData())); });
// تعديل مباشر على المخزن لتهيئة حالات زمنية (لا يمر بطبقة الأعمال عمدًا)
const patch = fn => { const db = JSON.parse(STORE.getItem(D.KEY)); fn(db); STORE.setItem(D.KEY, JSON.stringify(db)); };

const ADMIN = 'admin-demo', DAY = 86400000, AT = Date.now(), CO = 'co-net77', CO2 = 'co-net73', NUM = 'num-1001';
const sub = (daysAhead, extra = {}) => ({ id: 's1', numberId: 'n1', status: 'active', startsAt: new Date(AT - 30 * DAY).toISOString(), endsAt: new Date(AT + daysAhead * DAY).toISOString(), ...extra });
const CLS = () => X.cleanClasses([{ name: 'عاجل', upToDays: 3 }, { name: 'قريب', upToDays: 14 }]);
// يجعل اشتراك الرقم سارِيًا وينتهي بعد daysAhead يومًا
const setEnd = (daysAhead, numberId = NUM) => patch(db => { const s = db.subscriptions.filter(x => x.numberId === numberId && x.status === 'active').sort((a, b) => new Date(b.endsAt) - new Date(a.endsAt))[0]; s.startsAt = new Date(AT - 30 * DAY).toISOString(); s.endsAt = new Date(AT + daysAhead * DAY).toISOString(); });
const ownerOf = (numberId = NUM) => D.read().subscriptions.filter(x => x.numberId === numberId && x.status === 'active')[0].customerId;
const expiryNotices = () => D.read().notifications.filter(n => n.kind === 'expiry');

test('U11: القائمة فارغة افتراضيًا، وتُنقّى وتُرتَّب تصاعديًا بلا تداخل ولا سقف لعدد التصنيفات', () => {
  assert.deepEqual(X.cleanClasses(undefined), []);
  assert.deepEqual(X.cleanClasses([]), []);
  const out = X.cleanClasses([{ name: '  قريب  ', upToDays: '14' }, { name: 'عاجل', upToDays: 3, notify: true, noticeText: ' ينتهي قريبًا ' }]);
  assert.deepEqual(out.map(c => [c.name, c.upToDays, c.notify, c.noticeText]), [['عاجل', 3, true, 'ينتهي قريبًا'], ['قريب', 14, false, '']]);
  assert.ok(out.every(c => /^ecls_/.test(c.id)));
  assert.throws(() => X.cleanClasses('x'), /صيغة/);
  assert.throws(() => X.cleanClasses([{ name: '', upToDays: 3 }]), /مطلوب/);
  for (const bad of ['', 0, -1, 2.5, 'abc']) assert.throws(() => X.cleanClasses([{ name: 'أ', upToDays: bad }]), /عدد صحيح موجب/, String(bad));
  assert.throws(() => X.cleanClasses([{ name: 'أ', upToDays: 3 }, { name: 'ب', upToDays: 3 }]), /مكرر/);
  assert.throws(() => X.cleanClasses([{ name: 'أ', upToDays: 3 }, { name: 'أ', upToDays: 9 }]), /مكرر/);
  assert.throws(() => X.cleanClasses([{ name: 'ا'.repeat(X.NAME_MAX + 1), upToDays: 3 }]), /أطول من/);
  assert.throws(() => X.cleanClasses([{ name: 'أ', upToDays: 3, notify: true, noticeText: '  ' }]), /نص الإشعار/);
  assert.throws(() => X.cleanClasses([{ name: 'أ', upToDays: 3, notify: true, noticeText: 'ن'.repeat(X.NOTICE_MAX + 1) }]), /أطول من/);
  assert.equal(X.cleanClasses(Array.from({ length: 40 }, (_, i) => ({ name: 'ت' + i, upToDays: i + 1 }))).length, 40, 'لا حد لعدد التصنيفات');
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
  assert.equal(X.classify([], sub(2), AT).cls, null, 'بلا تصنيفات لا تصنيف');
  assert.equal(X.classify(cls, sub(-1), AT).state, 'expired');
  assert.equal(X.classify(cls, sub(5, { status: 'extended' }), AT).state, 'none');
  assert.equal(X.classify(cls, null, AT).state, 'none');
  assert.equal(X.classify(cls, sub(5, { startsAt: new Date(AT + DAY).toISOString() }), AT).state, 'none');
  assert.equal(X.classify(cls, sub(5, { endsAt: 'bad' }), AT).state, 'none');
  // الترتيب لا يؤثر: حتى لو مُرِّرت التصنيفات غير مرتبة يبقى الأضيق
  assert.equal(X.classify([...cls].reverse(), sub(2), AT).cls.name, 'عاجل');
});

test('U11: فلاتر الأرقام (بند 47) والشارة (بند 28) مشتقة من تصنيفات الشركة', () => {
  const cls = CLS(), [urgent, soon] = cls;
  assert.deepEqual(X.filterOptions(cls), [['all', 'الكل'], ['active', 'الاشتراكات النشطة'], ['near', 'قرب الانتهاء'], [`cls:${urgent.id}`, 'عاجل'], [`cls:${soon.id}`, 'قريب'], ['expired', 'المنتهية']]);
  assert.deepEqual(X.filterOptions([]), [['all', 'الكل'], ['active', 'الاشتراكات النشطة'], ['expired', 'المنتهية']], 'بلا تصنيفات لا فلتر قرب الانتهاء');
  const r1 = X.classify(cls, sub(2), AT), r2 = X.classify(cls, sub(10), AT), r3 = X.classify(cls, sub(60), AT), r4 = X.classify(cls, sub(-2), AT), r5 = X.classify(cls, null, AT);
  const F = ['all', 'active', 'near', `cls:${urgent.id}`, `cls:${soon.id}`, 'expired'], row = r => F.map(f => X.matches(f, r));
  assert.deepEqual(row(r1), [true, true, true, true, false, false]);
  assert.deepEqual(row(r2), [true, true, true, false, true, false]);
  assert.deepEqual(row(r3), [true, true, false, false, false, false]);
  assert.deepEqual(row(r4), [true, false, false, false, false, true]);
  assert.deepEqual(row(r5), [true, false, false, false, false, false]);
  assert.deepEqual(X.badge(r1), { key: `cls:${urgent.id}`, label: 'عاجل', tone: 'warn' });
  assert.deepEqual(X.badge(r3), { key: 'active', label: 'فعال', tone: 'ok' });
  assert.deepEqual(X.badge(r4), { key: 'expired', label: 'منتهٍ', tone: 'bad' });
  assert.equal(X.badge(r5), null);
});

test('U11 (ق-1): التصنيفات مستقلة لكل شركة، والحفظ ذرّي بسجل قبل/بعد، والفشل لا يغيّر المحفوظ', async () => {
  assert.deepEqual(X.forCompany(D.read(), CO), { classes: [], autoRenewClassId: null });
  await X.saveClass(D, ADMIN, CO, { name: 'قريب', upToDays: 14, notify: true, noticeText: 'اشتراكك يقترب من الانتهاء' });
  await X.saveClass(D, ADMIN, CO, { name: 'عاجل', upToDays: 3 });
  await X.saveClass(D, ADMIN, CO2, { name: 'عاجل', upToDays: 7 });
  let db = D.read();
  assert.deepEqual(X.forCompany(db, CO).classes.map(c => [c.name, c.upToDays, c.notify]), [['عاجل', 3, false], ['قريب', 14, true]]);
  assert.deepEqual(X.forCompany(db, CO2).classes.map(c => [c.name, c.upToDays]), [['عاجل', 7]], 'إعدادات كل شركة مستقلة تمامًا');
  assert.deepEqual(X.forCompany(db, 'co-net71').classes, [], 'شركة ثالثة لم تُضبط');
  const op = db.operations.filter(o => o.type === 'expiry_class_saved').at(-1);
  assert.equal(op.details.companyId, CO2); assert.deepEqual(op.details.before, []); assert.equal(op.details.after.length, 1);
  assert.ok(db.settings.customerClasses, 'إعدادات تصنيف العملاء باقية');
  // تعديل يبقي المعرّف
  const id = X.forCompany(db, CO).classes.find(c => c.name === 'عاجل').id;
  await X.saveClass(D, ADMIN, CO, { id, name: 'عاجل جدًا', upToDays: 2, notify: true, noticeText: 'نص' });
  db = D.read();
  assert.equal(X.forCompany(db, CO).classes.find(c => c.id === id).name, 'عاجل جدًا');
  assert.equal(X.forCompany(db, CO).classes.length, 2);
  // الفشل لا يغيّر شيئًا (حد مكرر، شركة غير موجودة، تصنيف غير موجود، إشعار بلا نص)
  const snapshot = JSON.stringify(X.forCompany(D.read(), CO));
  await assert.rejects(() => X.saveClass(D, ADMIN, CO, { name: 'جديد', upToDays: 14 }), /مكرر/);
  await assert.rejects(() => X.saveClass(D, ADMIN, CO, { name: 'جديد', upToDays: 20, notify: true, noticeText: '' }), /نص الإشعار/);
  await assert.rejects(() => X.saveClass(D, ADMIN, CO, { id: 'nope', name: 'س', upToDays: 20 }), /غير موجود/);
  await assert.rejects(() => X.saveClass(D, ADMIN, 'co-none', { name: 'س', upToDays: 20 }), /الشركة غير موجودة/);
  await assert.rejects(() => X.saveClass(D, ADMIN, '__proto__', { name: 'س', upToDays: 20 }), /الشركة غير موجودة/);
  assert.equal(JSON.stringify(X.forCompany(D.read(), CO)), snapshot);
});

test('U11 (ق-1): ربط التجديد التلقائي بتصنيف داخل الشركة إعداد فقط، يُعدَّل ويُعطَّل، ويمنع حذف التصنيف المرتبط', async () => {
  await X.saveClass(D, ADMIN, CO, { name: 'قريب', upToDays: 14 });
  await X.saveClass(D, ADMIN, CO2, { name: 'آخر', upToDays: 5 });
  const k = X.forCompany(D.read(), CO).classes[0], other = X.forCompany(D.read(), CO2).classes[0];
  const subsBefore = JSON.stringify(D.read().subscriptions), tasksBefore = JSON.stringify(D.read().tasks), ptBefore = D.read().pointTransactions.length;
  await X.setAutoRenewClass(D, ADMIN, CO, k.id);
  assert.equal(X.forCompany(D.read(), CO).autoRenewClassId, k.id);
  assert.equal(X.forCompany(D.read(), CO2).autoRenewClassId, null, 'الربط لا يتسرب إلى شركة أخرى');
  await assert.rejects(() => X.setAutoRenewClass(D, ADMIN, CO, other.id), /غير موجود في هذه الشركة/, 'لا ربط بتصنيف شركة أخرى');
  await assert.rejects(() => X.deleteClass(D, ADMIN, CO, k.id), /مرتبط بالتجديد التلقائي/);
  // حفظ تعديل على تصنيفات الشركة يحافظ على الربط
  await X.saveClass(D, ADMIN, CO, { name: 'ثانٍ', upToDays: 30 });
  assert.equal(X.forCompany(D.read(), CO).autoRenewClassId, k.id);
  await X.setAutoRenewClass(D, ADMIN, CO, '');
  assert.equal(X.forCompany(D.read(), CO).autoRenewClassId, null, 'التعطيل بقيمة فارغة');
  await X.deleteClass(D, ADMIN, CO, k.id);
  assert.deepEqual(X.forCompany(D.read(), CO).classes.map(c => c.name), ['ثانٍ']);
  await assert.rejects(() => X.deleteClass(D, ADMIN, CO, k.id), /غير موجود/);
  // لا أثر على الاشتراكات ولا المهام ولا النقاط: الربط إعداد فقط ولا تنفيذ تجديد
  assert.equal(JSON.stringify(D.read().subscriptions), subsBefore);
  assert.equal(JSON.stringify(D.read().tasks), tasksBefore);
  assert.equal(D.read().pointTransactions.length, ptBefore);
});

test('U11: العميل لا يرى إلا الاسم والحد، وقيمة مخزنة تالفة تُقرأ كمعطّلة دون كسر القراءة', async () => {
  await X.saveClass(D, ADMIN, CO, { name: 'عاجل', upToDays: 3, notify: true, noticeText: 'نص سري للإدارة' });
  assert.deepEqual(X.publicClassesMap(D), { [CO]: [{ name: 'عاجل', upToDays: 3 }] });
  const view = D.readForCustomer('cus-demo-low');
  assert.equal('settings' in view, false);
  assert.equal(JSON.stringify(view).includes('expiryClasses'), false);
  assert.equal(JSON.stringify(X.publicClassesMap(D)).includes('نص سري'), false);
  assert.deepEqual(X.forCompany({ settings: { expiryClasses: { byCompany: { [CO]: { classes: [{ name: '', upToDays: 3 }] } } } } }, CO), { classes: [], autoRenewClassId: null });
  assert.deepEqual(X.forCompany({ settings: { expiryClasses: 'bad' } }, CO), { classes: [], autoRenewClassId: null });
  assert.deepEqual(X.forCompany({}, CO), { classes: [], autoRenewClassId: null });
  assert.deepEqual(X.forCompany(undefined, CO), { classes: [], autoRenewClassId: null });
});

test('U11 (ق-1): الإشعار اختياري لكل تصنيف، لمالك الاشتراك فقط، ولا يتكرر بإعادة التقييم، ويتجدد بتصنيف جديد أو بعد التمديد', async () => {
  await X.saveClass(D, ADMIN, CO, { name: 'عاجل', upToDays: 3, notify: true, noticeText: 'اشتراكك على وشك الانتهاء' });
  await X.saveClass(D, ADMIN, CO, { name: 'أخير', upToDays: 1, notify: true, noticeText: 'ينتهي اشتراكك غدًا' });
  await X.saveClass(D, ADMIN, CO, { name: 'صامت', upToDays: 20 });
  const owner = ownerOf();
  // خارج أي تصنيف: لا إشعار
  setEnd(60);
  assert.deepEqual(await X.evaluate(D, 'system', AT), { created: 0 });
  // داخل تصنيف بلا إشعار: لا إشعار
  setEnd(15);
  assert.deepEqual(await X.evaluate(D, 'system', AT), { created: 0 });
  assert.equal(expiryNotices().length, 0);
  // داخل «عاجل»: إشعار واحد لمالك الاشتراك بنص المدير
  setEnd(2);
  assert.equal(X.pendingNotices(D, D.read(), AT).length, 1);
  assert.deepEqual(await X.evaluate(D, 'system', AT), { created: 1 });
  let n = expiryNotices();
  assert.equal(n.length, 1); assert.equal(n[0].customerId, owner); assert.equal(n[0].body, 'اشتراكك على وشك الانتهاء'); assert.equal(n[0].readAt, null);
  assert.ok(n[0].dedupeKey.startsWith('expiry:'));
  // إعادة التقييم المتكررة لا تكرر الإشعار ولا تكتب سجلات
  const opsBefore = D.read().operations.length;
  for (let i = 0; i < 3; i++) assert.deepEqual(await X.evaluate(D, 'system', AT), { created: 0 });
  assert.equal(expiryNotices().length, 1); assert.equal(D.read().operations.length, opsBefore, 'لا كتابة إن لم يوجد مستحق');
  // حالة جديدة: دخول تصنيف أضيق → إشعار جديد
  assert.deepEqual(await X.evaluate(D, 'system', AT + 1.5 * DAY), { created: 1 });
  n = expiryNotices(); assert.equal(n.length, 2); assert.equal(n[0].body, 'ينتهي اشتراكك غدًا');
  assert.deepEqual(await X.evaluate(D, 'system', AT + 1.5 * DAY), { created: 0 });
  // التمديد (تغيّر النهاية) ثم الدخول في التصنيف نفسه من جديد → إشعار جديد
  patch(db => { const s = db.subscriptions.filter(x => x.numberId === NUM && x.status === 'active')[0]; s.endsAt = new Date(AT + 32 * DAY).toISOString(); });
  assert.deepEqual(await X.evaluate(D, 'system', AT + 30 * DAY), { created: 1 });
  assert.equal(expiryNotices().length, 3);
  // لا إشعار لغير المالك
  assert.ok(expiryNotices().every(x => x.customerId === owner));
});

test('U11: إشعارات قرب الانتهاء تحترم الإعداد العام وحالة العميل المحذوف ولا تعبر الشركات', async () => {
  await X.saveClass(D, ADMIN, CO, { name: 'عاجل', upToDays: 3, notify: true, noticeText: 'نص' });
  setEnd(2);
  patch(db => { db.notificationSettings.subscriptionExpiring = false; });
  assert.deepEqual(await X.evaluate(D, 'system', AT), { created: 0 }, 'الإعداد العام معطّل');
  patch(db => { db.notificationSettings.subscriptionExpiring = true; });
  const owner = ownerOf();
  patch(db => { db.customers.find(c => c.id === owner).status = 'deleted'; });
  assert.deepEqual(await X.evaluate(D, 'system', AT), { created: 0 }, 'لا إشعار لحساب محذوف');
  patch(db => { db.customers.find(c => c.id === owner).status = 'active'; });
  // تصنيفات شركة أخرى لا تنطبق على رقم هذه الشركة
  patch(db => { db.settings.expiryClasses.byCompany = {}; });
  await X.saveClass(D, ADMIN, CO2, { name: 'عاجل', upToDays: 30, notify: true, noticeText: 'نص' });
  assert.deepEqual(await X.evaluate(D, 'system', AT), { created: 0 }, 'شركة الرقم بلا تصنيفات');
  assert.equal(X.resultFor(D, D.read(), D.read().numbers.find(n => n.id === NUM), AT).cls, null);
});

test('U11 (بند 85): تنبيهات الإدارة تجمع الاشتراكات داخل التصنيفات عبر الشركات بالأقرب انتهاءً مع حالة إشعارها', async () => {
  assert.deepEqual(X.alerts(D, D.read(), AT), [], 'بلا تصنيفات لا تنبيهات');
  await X.saveClass(D, ADMIN, CO, { name: 'عاجل', upToDays: 3, notify: true, noticeText: 'نص' });
  await X.saveClass(D, ADMIN, CO2, { name: 'قريب', upToDays: 10 });
  setEnd(2); setEnd(8, 'num-1002');
  let out = X.alerts(D, D.read(), AT);
  assert.deepEqual(out.map(a => [a.number.id, a.cls.name, a.days, a.sent]), [[NUM, 'عاجل', 2, false], ['num-1002', 'قريب', 8, false]]);
  assert.equal(out[0].company.id, CO);
  await X.evaluate(D, 'system', AT);
  out = X.alerts(D, D.read(), AT);
  assert.equal(out[0].sent, true, 'أُنشئ إشعار العاجل'); assert.equal(out[1].sent, false, 'تصنيف بلا إشعار لا يُنشأ له');
  assert.equal(out[0].key, X.noticeKey(out[0].sub, out[0].cls));
  assert.deepEqual(X.entries(D, D.read(), CO, AT).map(e => e.number.id).includes(NUM), true);
});
