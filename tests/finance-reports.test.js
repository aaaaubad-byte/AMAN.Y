const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../shared/data.js');
const R = require('../shared/finance-reports.js');

const AT = Date.parse('2026-10-28T10:00:00Z'); // 2026-10-28 بتوقيت صنعاء
const entry = (id, kind, amount, iso, extra = {}) => ({ id, kind, amount, currency: 'YER', sourceType: 'manual', sourceId: null, description: id, createdAt: iso, ...extra });
function freshStore() {
  const m = new Map();
  D.setStorageForTests({ getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) });
}
async function seed(entries) { await D.transact('t', null, db => { db.financeEntries.push(...entries); }); }

test('نطاقات التاريخ السريعة بتوقيت صنعاء والنطاق المخصص يتحقق', () => {
  assert.deepEqual(R.rangeFor('today', {}, AT), { key: 'today', from: '2026-10-28', to: '2026-10-28', days: 1 });
  assert.equal(R.rangeFor('yesterday', {}, AT).from, '2026-10-27');
  assert.equal(R.rangeFor('7d', {}, AT).from, '2026-10-22');
  assert.equal(R.rangeFor('30d', {}, AT).from, '2026-09-29');
  const m = R.rangeFor('month', {}, AT); assert.equal(m.from, '2026-10-01'); assert.equal(m.to, '2026-10-28');
  const lm = R.rangeFor('lastMonth', {}, AT); assert.equal(lm.from, '2026-09-01'); assert.equal(lm.to, '2026-09-30');
  assert.throws(() => R.rangeFor('custom', { from: '2026-10-05', to: '2026-10-01' }, AT));
  assert.throws(() => R.rangeFor('custom', { from: '2026-02-30', to: '2026-03-01' }, AT));
  assert.throws(() => R.rangeFor('custom', { from: '2000-01-01', to: '2026-10-01' }, AT));
  assert.throws(() => R.rangeFor('nope', {}, AT));
});

test('التجميع يحترم حد اليوم بتوقيت صنعاء ويحتسب العكس بلا حذف', () => {
  const list = [
    entry('a', 'revenue', 1000, '2026-10-27T20:59:59Z'), // 27 بتوقيت صنعاء
    entry('b', 'revenue', 500, '2026-10-27T21:00:00Z'),  // 28 بتوقيت صنعاء
    entry('c', 'expense', 200, '2026-10-28T09:00:00Z'),
    entry('d', 'expense', 500, '2026-10-28T09:30:00Z', { sourceType: 'reversal', reversalOf: 'b' }),
    entry('x', 'revenue', 99, '2026-10-28T09:30:00Z', { currency: 'USD' })
  ];
  assert.deepEqual(R.summarize(list, '2026-10-27', '2026-10-27'), { revenue: 1000, expense: 0, net: 1000, count: 1 });
  assert.deepEqual(R.summarize(list, '2026-10-28', '2026-10-28'), { revenue: 500, expense: 700, net: -200, count: 3 });
});

test('السلسلة الدورية متصلة ومجموعها يساوي مجموع النطاق', () => {
  const list = [entry('a', 'revenue', 100, '2026-09-05T09:00:00Z'), entry('b', 'expense', 40, '2026-09-20T09:00:00Z'), entry('c', 'revenue', 60, '2026-10-10T09:00:00Z')];
  for (const bucket of ['day', 'week', 'month']) {
    const rows = R.series(list, '2026-09-01', '2026-10-28', bucket), tot = R.summarize(list, '2026-09-01', '2026-10-28');
    assert.equal(rows[0].from, '2026-09-01'); assert.equal(rows.at(-1).to, '2026-10-28');
    for (let i = 1; i < rows.length; i++) assert.equal(R.addDays(rows[i - 1].to, 1), rows[i].from);
    assert.equal(Math.round(rows.reduce((s, r) => s + r.revenue, 0)), tot.revenue);
    assert.equal(Math.round(rows.reduce((s, r) => s + r.expense, 0)), tot.expense);
  }
  assert.equal(R.series(list, '2026-09-01', '2026-10-28', 'month').length, 2);
});

test('CSV: ترويسة عربية وBOM وتهريب الفواصل وحماية الصيغ', () => {
  const csv = R.csvText([entry('a', 'revenue', 10, '2026-10-28T09:00:00Z', { description: '=cmd|"x", y' }), entry('b', 'expense', 5, '2026-10-20T09:00:00Z')], '2026-10-28', '2026-10-28');
  assert.ok(csv.startsWith('\uFEFFالتاريخ'));
  const lines = csv.trim().split('\r\n');
  assert.equal(lines.length, 2);
  assert.ok(lines[1].includes('"\'=cmd|""x"", y"'));
  assert.ok(lines[1].startsWith('2026-10-28 12:00:00,إيراد,10,YER'));
});

test('الإقفال اليومي: إقفال ثم رفض المكرر ثم إعادة فتح بسبب إلزامي وسجل موثق', async () => {
  freshStore();
  await seed([entry('a', 'revenue', 300, '2026-10-28T08:00:00Z')]);
  await assert.rejects(() => R.closeDay(D, 'adm', '2026-10-29', AT));
  await R.closeDay(D, 'adm', '2026-10-28', AT);
  let db = D.read();
  assert.equal(R.isClosed(db, '2026-10-28'), true);
  assert.equal(R.todayClosed(db, AT), true);
  assert.equal(R.closeOf(db, '2026-10-28').revenue, 300);
  await assert.rejects(() => R.closeDay(D, 'adm', '2026-10-28', AT));
  await assert.rejects(() => R.reopenDay(D, 'adm', '2026-10-28', '  ', AT));
  await seed([entry('b', 'expense', 50, '2026-10-28T09:00:00Z')]);
  assert.equal(R.dayStatus(D.read(), '2026-10-28').changed, true);
  await R.reopenDay(D, 'adm', '2026-10-28', 'تصحيح قيد ناقص', AT);
  db = D.read();
  const rec = R.closeOf(db, '2026-10-28');
  assert.equal(rec.status, 'reopened');
  assert.equal(R.isClosed(db, '2026-10-28'), false);
  assert.deepEqual(rec.history.map(h => h.type), ['close', 'reopen']);
  assert.equal(rec.history[1].reason, 'تصحيح قيد ناقص');
  await R.closeDay(D, 'adm', '2026-10-28', AT);
  assert.equal(R.closeOf(D.read(), '2026-10-28').expense, 50);
  assert.equal(R.closeOf(D.read(), '2026-10-28').history.length, 3);
  assert.equal(D.readForCustomer === undefined, false);
  assert.equal(D.read().settings.dailyCloses.length, 1);
});
