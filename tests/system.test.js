const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../shared/data.js');
const X = require('../shared/expiry.js');
const S = require('../shared/system.js');

const DAY = 86400000;
const AT = Date.parse('2026-10-28T10:00:00Z');
function freshStore() {
  const m = new Map();
  D.setStorageForTests({ getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) });
}
const cust = (id, extra = {}) => ({ id, accountId: 'A-' + id, name: 'عميل ' + id, email: id + '@x.test', status: 'active', ...extra });
const backupText = obj => JSON.stringify({ schemaVersion: 2, ...obj });

// نسخة بيانات متسقة (كائن عادي؛ الفحوص نقية ولا تحتاج مخزنًا)
const cleanDb = () => ({
  schemaVersion: 2, revision: 1, updatedAt: '2026-10-28T00:00:00Z',
  customers: [{ id: 'c1' }], companies: [{ id: 'co1' }],
  numbers: [{ id: 'n1', number: '771234567', companyId: 'co1', customerId: 'c1' }],
  numberLinks: [{ id: 'l1', numberId: 'n1', customerId: 'c1' }],
  subscriptions: [{ id: 's1', customerId: 'c1', numberId: 'n1', companyId: 'co1', startsAt: '2026-10-01T00:00:00Z', endsAt: '2026-11-01T00:00:00Z' }],
  pointTransactions: [{ id: 'p1', customerId: 'c1', type: 'credit', points: 5, source: 'manual', sourceId: 'x' }],
  settings: {}
});

/* ----- فحوص السلامة وحالة النظام (76 و77) ----- */
test('فحص السلامة يمرّر نسخة متسقة ويكشف أهم أنواع الخلل مع مستوى كل منها', () => {
  assert.deepEqual(S.checkIntegrity(cleanDb()), []);
  const b = cleanDb();
  b.customers.push({ id: 'c1' });
  b.numbers.push({ id: 'n2', number: '1', companyId: 'ghost' });
  b.subscriptions.push({ id: 's2', customerId: 'c1', numberId: 'n1', companyId: 'co1', startsAt: '2026-11-01T00:00:00Z', endsAt: '2026-10-01T00:00:00Z' });
  b.pointTransactions.push({ id: 'p2', customerId: 'c1', type: 'debit', points: 50, source: 'manual', sourceId: 'y' });
  b.purchaseRequests = [{ id: 'r1', customerId: 'c1', status: 'approved' }];
  b.tasks = [{ id: 't1', subscriptionId: 'gone', status: 'executed' }];
  b.financeEntries = [{ id: 'f1', kind: 'revenue', amount: 0, sourceType: 'manual' }];
  b.settings = { expiryClasses: { byCompany: { ghost: {} } } };
  const issues = S.checkIntegrity(b), codes = new Set(issues.map(i => i.code));
  for (const c of ['id-dup', 'number-company', 'sub-dates', 'balance-negative', 'req-no-points', 'req-no-revenue', 'task-orphan', 'task-no-expense', 'fin-amount', 'expiry-company']) assert.ok(codes.has(c), c);
  assert.equal(issues.find(i => i.code === 'expiry-company').level, 'warn');
  assert.equal(issues.find(i => i.code === 'id-dup').level, 'error');
});

test('حالة النظام تحصي المجموعات والأخطاء والتحذيرات وسلة المحذوفات', () => {
  const ok = S.systemStatus(cleanDb());
  assert.equal(ok.errors, 0); assert.equal(ok.warnings, 0); assert.equal(ok.trash, 0);
  assert.equal(ok.counts.customers, 1); assert.equal(ok.counts.subscriptions, 1); assert.ok(ok.bytes > 0);
  const b = cleanDb(); b.settings = { expiryClasses: { byCompany: { ghost: {} } }, trash: [{ id: 't' }] }; b.customers.push({ id: 'c1' });
  const bad = S.systemStatus(b);
  assert.ok(bad.errors >= 1); assert.equal(bad.warnings, 1); assert.equal(bad.trash, 1);
});

/* ----- استيراد النسخ الاحتياطية (78) ----- */
test('قراءة النسخة ترفض الملفات غير الصالحة وتقبل نسخة صحيحة', () => {
  assert.throws(() => S.parseBackup(''), /فارغ/);
  assert.throws(() => S.parseBackup('   '), /فارغ/);
  assert.throws(() => S.parseBackup(null), /فارغ/);
  assert.throws(() => S.parseBackup('{oops'), /JSON/);
  assert.throws(() => S.parseBackup('[]'), /جذر الملف/);
  assert.throws(() => S.parseBackup('{"schemaVersion":1}'), /إصدار بنية/);
  assert.throws(() => S.parseBackup('{"schemaVersion":2,"customers":{}}'), /customers/);
  assert.throws(() => S.parseBackup('{"schemaVersion":2,"customers":[{"name":"x"}]}'), /سجل بلا/);
  assert.equal(S.parseBackup('{"schemaVersion":2,"customers":[{"id":"a"}]}').customers.length, 1);
});

test('المعاينة تحصي المضاف والمطابق والمتعارض دون أي كتابة', () => {
  const db = { customers: [{ id: 'a', name: 'x' }, { id: 'b', name: 'y' }] };
  const p = S.previewImport(db, backupText({ customers: [{ id: 'a', name: 'x' }, { id: 'b', name: 'CHANGED' }, { id: 'c', name: 'z' }] }));
  assert.equal(p.rows.length, 1);
  const r = p.rows[0];
  assert.deepEqual([r.name, r.incoming, r.current, r.added, r.same, r.conflicts], ['customers', 3, 2, 1, 1, 1]);
  assert.deepEqual(r.conflictIds, ['b']);
  assert.deepEqual(p.totals, { incoming: 3, added: 1, same: 1, conflicts: 1 });
});

test('الدمج يضيف الجديد ويُبقي الحالي عند التعارض ما لم يُطلب الاستبدال', async () => {
  freshStore();
  await D.transact('t', null, db => { db.customers.push(cust('c1', { name: 'قديم' })); });
  const text = backupText({ customers: [cust('c1', { name: 'جديد' }), cust('c3')] });
  await S.importBackup(D, 'adm', text);
  assert.equal(D.read().customers.find(c => c.id === 'c1').name, 'قديم');
  assert.ok(D.read().customers.some(c => c.id === 'c3'));
  assert.equal(D.read().customers.length, 2);
  await S.importBackup(D, 'adm', text, { conflicts: 'overwrite' });
  assert.equal(D.read().customers.find(c => c.id === 'c1').name, 'جديد');
  assert.equal(D.read().customers.length, 2);
  assert.equal(D.read().operations.filter(o => o.type === 'backup_imported').length, 2);
});

test('الاستبدال الكامل يعوّض المجموعات الموجودة في النسخة ويسجل العملية', async () => {
  freshStore();
  await D.transact('t', null, db => { db.customers.push(cust('c1')); });
  await S.importBackup(D, 'adm', backupText({ customers: [cust('c9')] }), { mode: 'replace' });
  assert.deepEqual(D.read().customers.map(c => c.id), ['c9']);
  assert.equal(D.read().operations.at(-1).type, 'backup_imported');
});

test('استيراد ينتج بيانات غير متسقة يفشل كله دون أي أثر', async () => {
  freshStore();
  await D.transact('t', null, db => { db.customers.push(cust('c1')); });
  const before = D.read().revision;
  const text = backupText({ customers: [cust('c3')], pointTransactions: [{ id: 'p9', customerId: 'c3', type: 'debit', points: 10, source: 'manual', sourceId: 'z', createdAt: '2026-10-28T00:00:00Z', description: 'x' }] });
  await assert.rejects(() => S.importBackup(D, 'adm', text));
  assert.equal(D.read().customers.some(c => c.id === 'c3'), false);
  assert.equal(D.read().pointTransactions.length, 0);
  assert.equal(D.read().revision, before);
});

/* ----- تتبع النسخ اليدوي والتذكير (102) ----- */
test('التذكير يستحق عند تجاوز المدة أو عند عدم وجود تصدير سابق ولا يستحق دون مدة', () => {
  const st = (daysAgo, rem) => ({ settings: { backup: { lastAt: daysAgo === null ? null : new Date(AT - daysAgo * DAY).toISOString(), reminderDays: rem } } });
  assert.deepEqual(S.backupStatus({}, AT), { lastAt: null, reminderDays: null, daysSince: null, due: false });
  assert.equal(S.backupStatus(st(10, 7), AT).daysSince, 10);
  assert.equal(S.backupStatus(st(10, 7), AT).due, true);
  assert.equal(S.backupStatus(st(3, 7), AT).due, false);
  assert.equal(S.backupStatus(st(null, 7), AT).due, true);
  assert.equal(S.backupStatus(st(10, null), AT).due, false);
});

test('حفظ مدة التذكير يتحقق من القيمة، والتصدير اليدوي يُسجَّل وقته', async () => {
  freshStore();
  for (const bad of [0, -1, 1.5, 366, 'abc']) await assert.rejects(() => S.saveBackupReminder(D, 'adm', bad), /365/);
  await S.saveBackupReminder(D, 'adm', '7');
  assert.equal(D.read().settings.backup.reminderDays, 7);
  await S.saveBackupReminder(D, 'adm', '');
  assert.equal(D.read().settings.backup.reminderDays, null);
  await S.markBackup(D, 'adm', AT);
  assert.equal(D.read().settings.backup.lastAt, new Date(AT).toISOString());
  const types = D.read().operations.map(o => o.type);
  assert.equal(types.filter(t => t === 'backup_reminder_saved').length, 2);
  assert.equal(types.filter(t => t === 'backup_exported').length, 1);
});

/* ----- سلة المحذوفات (79) ----- */
test('ترتيب السلة من الأحدث إلى الأقدم', () => {
  const db = { settings: { trash: [{ id: 'a', deletedAt: '2026-01-01T00:00:00Z' }, { id: 'b', deletedAt: '2026-02-01T00:00:00Z' }] } };
  assert.deepEqual(S.trashList(db).map(t => t.id), ['b', 'a']);
  assert.deepEqual(S.trashList({}), []);
});

test('السلة: إضافة واستعادة قالب وملاحظة، ورفض الملاحظة غير الصالحة، والحذف النهائي', async () => {
  freshStore();
  await S.trashPush(D, 'adm', 'template', 'قالب', { id: 'tpl1', kind: 'reply', title: 'ت', body: 'ب' });
  await S.trashPush(D, 'adm', 'note', 'ملاحظة', { id: 'nt1', entityType: 'customer', entityId: 'c1', text: 'x' });
  await S.trashPush(D, 'adm', 'note', 'سيئة', { id: 'nt2', entityType: 'weird', entityId: 'z', text: 'x' });
  assert.equal(S.trashList(D.read()).length, 3);
  assert.equal(D.read().operations.length, 0); // الإضافة للسلة لا تُسجَّل كعملية بذاتها
  const by = label => S.trashList(D.read()).find(t => t.label === label);

  const tpl = by('قالب');
  await S.trashRestore(D, 'adm', tpl.id, X);
  assert.ok(D.read().messageTemplates.some(x => x.id === 'tpl1'));
  assert.equal(by('قالب'), undefined);
  await assert.rejects(() => S.trashRestore(D, 'adm', tpl.id, X), /السلة/);

  await S.trashRestore(D, 'adm', by('ملاحظة').id, X);
  assert.ok(D.read().internalNotes.some(x => x.id === 'nt1'));

  const bad = by('سيئة');
  await assert.rejects(() => S.trashRestore(D, 'adm', bad.id, X), /الملاحظة/);
  assert.ok(by('سيئة'), 'الفشل لا يزيل العنصر من السلة');
  await S.trashPurge(D, 'adm', bad.id);
  assert.equal(by('سيئة'), undefined);
  await assert.rejects(() => S.trashPurge(D, 'adm', bad.id), /السلة/);
});

test('استعادة تصنيف قرب انتهاء من السلة تعيد إنشاءه عبر وحدة التصنيفات', async () => {
  freshStore();
  await D.transact('t', null, db => { db.companies.push({ id: 'co1', name: 'شركة', prefixes: ['77'], lengths: [9], dailyRate: 1, durations: [10], taskSchedule: { intervalDays: 5, visibleBeforeDays: 1, expenseAmount: 10, graceDays: 0, createFirstOnActivation: true }, active: true }); });
  await S.trashPush(D, 'adm', 'expiryClass', 'قريب', { name: 'قريب', upToDays: 3, notify: false, noticeText: '' }, { companyId: 'co1' });
  await S.trashRestore(D, 'adm', S.trashList(D.read())[0].id, X);
  assert.deepEqual(X.forCompany(D.read(), 'co1').classes.map(c => [c.name, c.upToDays]), [['قريب', 3]]);
  assert.equal(S.trashList(D.read()).length, 0);
});

/* ----- سجل تغييرات الإعدادات (80) ----- */
test('سجل الإعدادات يضم أحداث الإعداد الإدارية فقط، ويستبعد أفعال العملاء والدعم', async () => {
  freshStore();
  for (const type of ['coupon_saved', 'promotion_deleted', 'autorenew_company_saved', 'coupon_redeemed', 'autorenew_enabled', 'support_ticket_created']) {
    await D.transact('adm', type, () => ({ entityType: 'x', entityId: 'x', summary: type }));
  }
  assert.deepEqual(S.settingsLog(D.read()).map(o => o.type).sort(), ['autorenew_company_saved', 'coupon_saved', 'promotion_deleted']);
  for (const t of ['promotion_saved', 'coupon_deleted', 'autorenew_company_saved', 'expiry_class_saved']) assert.ok(S.SETTINGS_TYPES.includes(t), t);
  for (const t of ['coupon_redeemed', 'autorenew_enabled', 'autorenew_disabled', 'promotion_awarded']) assert.equal(S.SETTINGS_TYPES.includes(t), false, t);
  assert.equal(S.settingsLog(D.read(), 2).length, 2);
});

/* ----- كلمة مرور الإدارة (81) ----- */
test('كلمة مرور الإدارة: تجزئة PBKDF2 مملّحة، تحقق، رفض الضعيف والتالف، ولا تسرّب إلى السجل', async () => {
  await assert.rejects(() => S.hashPassword('short'), /8/);
  await assert.rejects(() => S.hashPassword(12345678), /8/);
  const rec = await S.hashPassword('correct-horse');
  assert.match(rec, /^pbkdf2\$100000\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
  assert.equal(await S.verifyPassword('correct-horse', rec), true);
  assert.equal(await S.verifyPassword('wrong-horse', rec), false);
  assert.equal(await S.verifyPassword('x', 'garbage'), false);
  assert.equal(await S.verifyPassword('x', null), false);
  assert.notEqual(rec, await S.hashPassword('correct-horse'));
  freshStore();
  await assert.rejects(() => S.setAdminPassword(D, 'adm', 'plain-text'), /تجزئة/);
  await S.setAdminPassword(D, 'adm', rec);
  assert.equal(S.adminHash(D.read()), rec);
  assert.equal(JSON.stringify(D.read().operations).includes(rec), false);
  assert.equal(S.settingsLog(D.read()).length, 1);
});

/* ----- مطابقة المدفوعات (103) ----- */
const dayKey = iso => iso.slice(0, 10);
const pr = (id, status, price, ref, extra = {}) => ({ id, createdAt: '2026-10-28T08:00:00Z', status, paymentMethodId: 'pm1', paymentMethodSnapshot: { name: 'وسيلة' }, packageSnapshot: { price }, paymentReference: ref, ...extra });
const rev = (id, requestId, amount) => ({ id, kind: 'revenue', amount, sourceType: 'purchase', sourceId: requestId });

test('المطابقة: فرق المعتمد عن الإيراد وغياب القيد والمرجع المكرر، وتستثني خارج النطاق', () => {
  const db = {
    purchaseRequests: [pr('r1', 'approved', 1000, 'ABC'), pr('r2', 'approved', 500, 'DEF'), pr('r3', 'pending', 300, 'abc'), pr('old', 'approved', 700, 'Z', { createdAt: '2026-10-20T08:00:00Z' })],
    financeEntries: [rev('f1', 'r1', 1000)]
  };
  const r = S.reconcile(db, '2026-10-28', '2026-10-28', dayKey);
  assert.equal(r.rows.length, 1);
  const m = r.rows[0];
  assert.deepEqual([m.approved.n, m.approved.amount, m.pending.n, m.pending.amount, m.revenue, m.diff], [2, 1500, 1, 300, 1000, 500]);
  assert.deepEqual(r.totals, { approved: 1500, revenue: 1000 });
  assert.deepEqual(r.issues.map(i => `${i.code}:${i.requestId}`).sort(), ['dup-ref:r1', 'dup-ref:r3', 'no-revenue:r2']);
});

test('المطابقة: القيد المعكوس ومخالفة المبلغ وإيراد طلب غير معتمد', () => {
  const db = {
    purchaseRequests: [pr('r1', 'approved', 1000, 'A'), pr('r2', 'approved', 800, 'B'), pr('r3', 'rejected', 200, 'C')],
    financeEntries: [rev('f1', 'r1', 1000), { id: 'f2', kind: 'expense', amount: 1000, sourceType: 'reversal', reversalOf: 'f1' }, rev('f3', 'r2', 900), rev('f4', 'r3', 200)]
  };
  const r = S.reconcile(db, '2026-10-28', '2026-10-28', dayKey);
  assert.deepEqual(Object.fromEntries(r.issues.map(i => [i.requestId, i.code])), { r1: 'reversed', r2: 'amount', r3: 'unapproved-revenue' });
  assert.equal(r.rows[0].revenue, 900);
});
