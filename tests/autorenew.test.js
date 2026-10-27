const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../shared/data.js');
const X = require('../shared/expiry.js');
const AR = require('../shared/autorenew.js');

const DAY = 86400000;
function freshStore() {
  const m = new Map();
  D.setStorageForTests({ getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) });
}
// شركة بباقة حماية (10 أيام، 5 نقاط) وتصنيف «≤ 3 أيام»؛ withClassLink يربط التجديد التلقائي بالتصنيف
async function setup(balance, withClassLink = true) {
  freshStore();
  await D.transact('t', null, db => {
    db.customers.push({ id: 'c1', accountId: 'A1', name: 'ع', email: 'c1@x.test', status: 'active' }, { id: 'c2', accountId: 'A2', name: 'آخر', email: 'c2@x.test', status: 'active' });
    db.companies.push({ id: 'co1', name: 'شركة', prefixes: ['77'], lengths: [9], dailyRate: 1, durations: [10], taskSchedule: { intervalDays: 5, visibleBeforeDays: 1, expenseAmount: 10, graceDays: 0, createFirstOnActivation: true }, active: true });
    db.protectionPackages.push({ id: 'pp1', companyId: 'co1', name: 'باقة', days: 10, pointsCost: 5, active: true });
    if (balance) db.pointTransactions.push({ id: 'pt0', customerId: 'c1', type: 'credit', points: balance, source: 't', sourceId: 'x', createdAt: D.now(), description: 't' });
  });
  await D.addNumber('c1', '771234567');
  await X.saveClass(D, 'adm', 'co1', { name: 'قريب', upToDays: 3, notify: false, noticeText: '' });
  if (withClassLink) { const cid = X.forCompany(D.read(), 'co1').classes[0].id; await X.setAutoRenewClass(D, 'adm', 'co1', cid); }
  return D.read().numbers[0];
}
async function subscribed(balance) {
  const n = await setup(balance);
  await D.performProtectionOperation('c1', n.id, 'pp1', 'subscribe', 'k-sub');
  await AR.setCompanyAllowed(D, 'adm', 'co1', true, X);
  await AR.setOptIn(D, 'c1', n.id, 'pp1', true, X);
  return n;
}

test('سماح الشركة يتطلب تصنيفًا مربوطًا، والتفعيل يتطلب سماحًا وصاحب اشتراك سارٍ وباقة صالحة', async () => {
  const n = await setup(20, false);
  await assert.rejects(() => AR.setCompanyAllowed(D, 'adm', 'co1', true, X), /تصنيف/);
  await assert.rejects(() => AR.setCompanyAllowed(D, 'adm', 'nope', true, X), /غير موجودة/);
  const cid = X.forCompany(D.read(), 'co1').classes[0].id; await X.setAutoRenewClass(D, 'adm', 'co1', cid);
  await assert.rejects(() => AR.setOptIn(D, 'c1', n.id, 'pp1', true, X), /غير متاح لشركة/);
  await AR.setCompanyAllowed(D, 'adm', 'co1', true, X);
  await assert.rejects(() => AR.setOptIn(D, 'c1', n.id, 'pp1', true, X), /صاحب اشتراك/);
  await D.performProtectionOperation('c1', n.id, 'pp1', 'subscribe', 'k1');
  await assert.rejects(() => AR.setOptIn(D, 'c2', n.id, 'pp1', true, X), /ضمن أرقام حسابك/);
  await assert.rejects(() => AR.setOptIn(D, 'c1', n.id, 'bad', true, X), /باقة/);
  await AR.setOptIn(D, 'c1', n.id, 'pp1', true, X);
  assert.equal(AR.badgeFor(D.read(), n.id, 'c1'), true);
  assert.equal(AR.badgeFor(D.read(), n.id, 'c2'), false);
  await AR.setCompanyAllowed(D, 'adm', 'co1', false, X);
  assert.equal(AR.badgeFor(D.read(), n.id, 'c1'), false);
});

test('لا تنفيذ قبل دخول تصنيف التجديد، ثم تمديد واحد بخصم واحد ومفتاح منع تكرار', async () => {
  const n = await subscribed(20);
  const t0 = Date.now(), before = D.balance('c1');
  assert.equal(AR.check(D.read(), n.id, X, t0).code, 'wait');
  assert.deepEqual((({ renewed, failed }) => ({ renewed, failed }))(await AR.run(D, X, t0)), { renewed: 0, failed: 0 });
  assert.equal(D.balance('c1'), before);
  const late = t0 + 8 * DAY, chk = AR.check(D.read(), n.id, X, late);
  assert.equal(chk.eligible, true); assert.equal(chk.cost, 5);
  const endBefore = D.read().subscriptions.find(s => s.numberId === n.id).endsAt;
  const r = await AR.run(D, X, late);
  assert.equal(r.renewed, 1);
  assert.equal(D.balance('c1'), before - 5);
  const db = D.read(), sub = db.subscriptions.find(s => s.numberId === n.id);
  assert.ok(new Date(sub.endsAt) > new Date(endBefore));
  assert.ok(db.protectionOperations.some(o => o.type === 'extend' && o.idempotencyKey && o.idempotencyKey.startsWith('auto:')));
  assert.equal(AR.logList(db)[0].result, 'renewed');
  const r2 = await AR.run(D, X, late);
  assert.equal(r2.renewed, 0);
  assert.equal(D.balance('c1'), before - 5);
});

test('رصيد غير كافٍ: لا خصم ولا تمديد، وسجل فشل وإشعار مرة واحدة فقط', async () => {
  const n = await subscribed(5);
  assert.equal(D.balance('c1'), 0);
  const late = Date.now() + 8 * DAY, endBefore = D.read().subscriptions.find(s => s.numberId === n.id).endsAt;
  assert.equal((await AR.run(D, X, late)).failed, 1);
  assert.equal((await AR.run(D, X, late)).failed, 1);
  const db = D.read();
  assert.equal(D.balance('c1'), 0);
  assert.equal(db.subscriptions.find(s => s.numberId === n.id).endsAt, endBefore);
  assert.equal(AR.logList(db).filter(l => l.result === 'failed').length, 1);
  assert.equal(db.notifications.filter(x => x.customerId === 'c1' && x.title === 'تعذر التجديد التلقائي').length, 1);
});

test('إيقاف العميل أو منع الشركة يوقف التنفيذ', async () => {
  const n = await subscribed(20), late = Date.now() + 8 * DAY;
  await AR.setOptIn(D, 'c1', n.id, null, false, X);
  assert.equal(AR.check(D.read(), n.id, X, late).code, 'off');
  assert.equal((await AR.run(D, X, late)).renewed, 0);
  await AR.setOptIn(D, 'c1', n.id, 'pp1', true, X);
  await AR.setCompanyAllowed(D, 'adm', 'co1', false, X);
  assert.equal(AR.check(D.read(), n.id, X, late).code, 'company');
  assert.equal((await AR.run(D, X, late)).renewed, 0);
});

test('إعدادات التجديد التلقائي لا تصل إلى نسخة العميل', async () => {
  await subscribed(20);
  assert.equal(D.readForCustomer('c1').settings, undefined);
});
