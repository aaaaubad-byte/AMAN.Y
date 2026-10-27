const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../shared/data.js');
const S = require('../shared/support.js');

const AT = Date.parse('2026-10-28T10:00:00Z');
function freshStore() {
  const m = new Map();
  D.setStorageForTests({ getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) });
}
async function seed() {
  await D.transact('t', null, db => {
    db.customers.push({ id: 'c1', accountId: 'A1', name: 'عميل', email: 'c1@x.test', status: 'active' }, { id: 'c2', accountId: 'A2', name: 'آخر', email: 'c2@x.test', status: 'active' });
  });
}

test('التذكرة: فتح ورد وإغلاق، والعميل لا يرى غير تذاكره ولا الملاحظات الداخلية', async () => {
  freshStore(); await seed();
  await assert.rejects(() => S.createTicket(D, 'c1', { subject: ' ', body: 'x' }));
  await S.createTicket(D, 'c1', { subject: 'مشكلة', body: 'نص' });
  await S.createTicket(D, 'c2', { subject: 'أخرى', body: 'نص' });
  let db = D.read();
  const t = S.inbox(db).find(x => x.customerId === 'c1');
  assert.equal(S.inboxCounts(db).unread, 2);
  await S.addTicketNote(D, 'adm', t.id, 'داخلي');
  await S.adminReply(D, 'adm', t.id, 'تم');
  db = D.read();
  assert.equal(S.sup(db).tickets.find(x => x.id === t.id).status, 'answered');
  assert.ok(db.notifications.some(n => n.customerId === 'c1' && n.title === 'رد جديد من الدعم'));
  const v = S.customerView(db, 'c1', AT);
  assert.equal(v.tickets.length, 1);
  assert.equal(v.tickets[0].notes, undefined);
  assert.equal(v.tickets[0].unreadAdmin, undefined);
  assert.equal(v.unread, 1);
  assert.equal(await S.markRead(D, 'c1', t.id, 'customer'), true);
  assert.equal(S.customerView(D.read(), 'c1', AT).unread, 0);
  await assert.rejects(() => S.customerReply(D, 'c2', t.id, 'اختراق'));
  await S.customerReply(D, 'c1', t.id, 'شكرًا');
  assert.equal(S.sup(D.read()).tickets.find(x => x.id === t.id).status, 'open');
  await S.setTicketStatus(D, 'adm', t.id, 'closed');
  await assert.rejects(() => S.customerReply(D, 'c1', t.id, 'بعد الإغلاق'));
  await assert.rejects(() => S.adminReply(D, 'adm', t.id, 'بعد الإغلاق'));
  await S.setTicketStatus(D, 'adm', t.id, 'open');
  assert.notEqual(S.sup(D.read()).tickets.find(x => x.id === t.id).status, 'closed');
});

test('العرض الترويجي: حالة بتوقيت صنعاء ومنح لمرة واحدة بحد أقصى دون قيد مالي', async () => {
  freshStore(); await seed();
  await assert.rejects(() => S.savePromotion(D, 'adm', { title: 'ع', description: 'و', actionLabel: 'أ', rewardPoints: -1 }));
  await assert.rejects(() => S.savePromotion(D, 'adm', { title: 'ع', description: 'و', actionLabel: 'أ', startsAt: '2026-10-30', endsAt: '2026-10-01' }));
  await S.savePromotion(D, 'adm', { title: 'عرض', description: 'وصف', actionLabel: 'أضف رقمًا', rewardPoints: 5, maxAwards: 1, startsAt: '2026-10-28', endsAt: '2026-10-28' });
  const p = S.sup(D.read()).promotions[0];
  assert.equal(S.promoState(p, Date.parse('2026-10-27T20:59:59Z')), 'scheduled');
  assert.equal(S.promoState(p, Date.parse('2026-10-27T21:00:00Z')), 'running');
  assert.equal(S.promoState(p, Date.parse('2026-10-28T20:59:59Z')), 'running');
  assert.equal(S.promoState(p, Date.parse('2026-10-28T21:00:00Z')), 'ended');
  await assert.rejects(() => S.awardPromotion(D, 'adm', p.id, 'c1', '', Date.parse('2026-10-29T10:00:00Z')));
  const fin = D.read().financeEntries.length;
  await S.awardPromotion(D, 'adm', p.id, 'c1', 'تحقق', AT);
  assert.equal(D.balance('c1'), 5);
  assert.equal(D.read().financeEntries.length, fin);
  assert.equal(D.read().subscriptions.length, 0);
  await assert.rejects(() => S.awardPromotion(D, 'adm', p.id, 'c1', '', AT));
  await assert.rejects(() => S.awardPromotion(D, 'adm', p.id, 'c2', '', AT));
  await assert.rejects(() => S.savePromotion(D, 'adm', { id: p.id, title: 'عرض', description: 'وصف', actionLabel: 'أ', rewardPoints: 9, maxAwards: 1 }));
  await assert.rejects(() => S.deletePromotion(D, 'adm', p.id));
  assert.equal(S.customerView(D.read(), 'c1', AT).promotions[0].awarded, true);
  assert.equal(S.customerView(D.read(), 'c2', AT).promotions[0].awarded, false);
});

test('القسيمة: رمز موحد وحد إلزامي ومرة لكل عميل وسقف كلي وانتهاء', async () => {
  freshStore(); await seed();
  await assert.rejects(() => S.saveCoupon(D, 'adm', { code: 'ab', points: 5, maxUses: 1 }));
  await assert.rejects(() => S.saveCoupon(D, 'adm', { code: 'WELCOME', points: 5 }));
  await assert.rejects(() => S.saveCoupon(D, 'adm', { code: 'WELCOME', points: 0, maxUses: 1 }));
  await S.saveCoupon(D, 'adm', { code: ' welcome ', points: 7, maxUses: 1, endsAt: '2026-10-28' });
  await assert.rejects(() => S.saveCoupon(D, 'adm', { code: 'WELCOME', points: 7, maxUses: 2 }));
  assert.equal(S.sup(D.read()).coupons[0].code, 'WELCOME');
  const fin = D.read().financeEntries.length;
  assert.deepEqual(await S.redeemCoupon(D, 'c1', 'welcome', AT), { points: 7 });
  assert.equal(D.balance('c1'), 7);
  assert.equal(D.read().financeEntries.length, fin);
  assert.ok(D.read().pointTransactions.some(t => t.source === 'coupon' && t.type === 'credit' && t.customerId === 'c1'));
  await assert.rejects(() => S.redeemCoupon(D, 'c1', 'WELCOME', AT));
  await assert.rejects(() => S.redeemCoupon(D, 'c2', 'WELCOME', AT), /غير صالح/);
  assert.equal(D.balance('c2'), 0);
  const k = S.sup(D.read()).coupons[0];
  await assert.rejects(() => S.saveCoupon(D, 'adm', { id: k.id, code: 'WELCOME', points: 9, maxUses: 1, endsAt: '2026-10-28' }));
  await assert.rejects(() => S.deleteCoupon(D, 'adm', k.id));
  await S.saveCoupon(D, 'adm', { code: 'LATE', points: 1, maxUses: 5, endsAt: '2026-10-27' });
  await assert.rejects(() => S.redeemCoupon(D, 'c2', 'LATE', AT), /غير صالح/);
});

test('القسيمة: قفل مؤقت بعد محاولات خاطئة متتالية ثم فتحه بمرور الوقت', async () => {
  freshStore(); await seed();
  await S.saveCoupon(D, 'adm', { code: 'GOOD', points: 3, maxUses: 5 });
  for (let i = 0; i < S.LIM.fails; i++) await assert.rejects(() => S.redeemCoupon(D, 'c1', 'WRONG' + i, AT), /غير صالح/);
  assert.equal(S.customerView(D.read(), 'c1', AT).locked, true);
  await assert.rejects(() => S.redeemCoupon(D, 'c1', 'GOOD', AT), /محاولات/);
  assert.equal(D.balance('c1'), 0);
  const later = AT + S.LIM.lockMs + 1000;
  assert.deepEqual(await S.redeemCoupon(D, 'c1', 'GOOD', later), { points: 3 });
});

test('نسخة العميل لا تتسرب: settings يحذفها readForCustomer ولا قيود مالية', async () => {
  freshStore(); await seed();
  await S.createTicket(D, 'c1', { subject: 'س', body: 'ن' });
  await S.saveCoupon(D, 'adm', { code: 'ZZZZ', points: 1, maxUses: 1 });
  const c = D.readForCustomer('c1');
  assert.equal(c.settings, undefined);
  assert.deepEqual(c.financeEntries, []);
});
