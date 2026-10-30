/* AMAN — منطق التقارير المالية والإقفال اليومي (U12: بنود 12 و51 و71 و73 و97 و98).
   منطق نقي فوق financeEntries القائمة بلا أي تعديل على shared/data.js ولا على بنية القيود.
   أيام الحساب بتوقيت صنعاء (UTC+3). العملة: الريال اليمني فقط (قيد بعملة أخرى لا يدخل المجاميع).
   قيود العكس تبقى قيودًا عادية معاكسة النوع فتلغي أثر الأصل في الصافي دون حذف أي قيد.
   الإقفال اليومي يُحفظ في settings.dailyCloses (لا يصل إلى نسخة العميل لأن readForCustomer يحذف settings).
   إعادة فتح يوم مقفل مسار تصحيح موثق: سبب إلزامي، وسجل التاريخ يحفظ لقطة الإقفال السابقة. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.AmanReports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const TZ = 3 * 3600000, DAY = 86400000, SPAN_MAX = 3660, REASON_MAX = 300;
  const RANGES = [['today', 'اليوم'], ['yesterday', 'أمس'], ['7d', 'آخر 7 أيام'], ['30d', 'آخر 30 يومًا'], ['month', 'هذا الشهر'], ['lastMonth', 'الشهر الماضي'], ['custom', 'نطاق مخصص']];
  const BUCKETS = [['day', 'يومي'], ['week', 'أسبوعي'], ['month', 'شهري']];
  const SOURCE_LABEL = { purchase: 'طلب نقاط', task: 'مهمة', manual: 'يدوي', reversal: 'عكس قيد', legacy: 'قديم' };
  const round2 = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

  const dayKey = (t = Date.now()) => { const ms = typeof t === 'number' ? t : new Date(t).getTime(); return Number.isFinite(ms) ? new Date(ms + TZ).toISOString().slice(0, 10) : ''; };
  const keyToUtc = k => Date.UTC(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10));
  const addDays = (k, n) => new Date(keyToUtc(k) + n * DAY).toISOString().slice(0, 10);
  const validKey = k => typeof k === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(k) && new Date(keyToUtc(k)).toISOString().slice(0, 10) === k;
  const monthStart = k => k.slice(0, 8) + '01';
  const monthEnd = k => addDays(addDays(monthStart(k), 32).slice(0, 8) + '01', -1);
  const spanDays = (a, b) => Math.round((keyToUtc(b) - keyToUtc(a)) / DAY) + 1;

  // نطاق مسمى → { key, from, to, days } بمفاتيح أيام. النطاق المخصص يتحقق صراحة ويرمي خطأ عربيًا.
  function rangeFor(key, custom = {}, at = Date.now()) {
    const today = dayKey(at);
    let from, to;
    switch (key) {
      case 'today': from = to = today; break;
      case 'yesterday': from = to = addDays(today, -1); break;
      case '7d': from = addDays(today, -6); to = today; break;
      case '30d': from = addDays(today, -29); to = today; break;
      case 'month': from = monthStart(today); to = today; break;
      case 'lastMonth': { const prev = addDays(monthStart(today), -1); from = monthStart(prev); to = prev; break; }
      case 'custom':
        from = String(custom.from || ''); to = String(custom.to || '');
        if (!validKey(from) || !validKey(to)) throw new Error('اختر تاريخ بداية ونهاية صحيحين.');
        if (from > to) throw new Error('تاريخ البداية يجب ألا يتجاوز تاريخ النهاية.');
        if (spanDays(from, to) > SPAN_MAX) throw new Error('النطاق أطول من الحد المسموح (10 سنوات).');
        break;
      default: throw new Error('نطاق التاريخ غير معروف.');
    }
    return { key, from, to, days: spanDays(from, to) };
  }

  function summarize(entries, from, to) {
    let revenue = 0, expense = 0, count = 0;
    for (const e of entries || []) {
      if ((e.currency || 'YER') !== 'YER') continue;
      const k = dayKey(e.createdAt);
      if (!k || k < from || k > to) continue;
      const a = Number(e.amount) || 0;
      if (e.kind === 'revenue') revenue += a; else expense += a;
      count++;
    }
    revenue = round2(revenue); expense = round2(expense);
    return { revenue, expense, net: round2(revenue - expense), count };
  }

  const autoBucket = days => (days <= 45 ? 'day' : days <= 180 ? 'week' : 'month');
  const coarsen = (bucket, days) => (bucket === 'day' && days > 400 ? 'week' : bucket === 'week' && days > 2800 ? 'month' : bucket);
  const bucketStart = (k, b) => (b === 'day' ? k : b === 'week' ? addDays(k, -((new Date(keyToUtc(k)).getUTCDay() + 1) % 7)) : monthStart(k));
  const bucketEnd = (start, b) => (b === 'day' ? start : b === 'week' ? addDays(start, 6) : monthEnd(start));

  // سلسلة دورية متصلة تشمل الفترات الصفرية (للرسم وللتقرير الدوري). الأسبوع يبدأ السبت.
  function series(entries, from, to, bucket) {
    const b = coarsen(BUCKETS.some(x => x[0] === bucket) ? bucket : autoBucket(spanDays(from, to)), spanDays(from, to));
    const out = [];
    for (let s = bucketStart(from, b), guard = 0; s <= to && guard < 5000; guard++) {
      const e = bucketEnd(s, b), f = s < from ? from : s, t = e > to ? to : e;
      out.push({ key: s, bucket: b, from: f, to: t, label: b === 'month' ? s.slice(0, 7) : b === 'week' ? `${f} ← ${t}` : f, ...summarize(entries, f, t) });
      s = addDays(e, 1);
    }
    return out;
  }

  function csvText(entries, from, to) {
    const cell = v => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",\r\n]/.test(s) ? '"' + s.replaceAll('"', '""') + '"' : s; };
    const rows = (entries || []).filter(e => { const k = dayKey(e.createdAt); return k && k >= from && k <= to; }).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt) || String(a.id).localeCompare(String(b.id)));
    const lines = [['التاريخ (توقيت صنعاء)', 'النوع', 'المبلغ', 'العملة', 'المصدر', 'البيان', 'المعرّف'].map(cell).join(',')];
    for (const e of rows) lines.push([new Date(new Date(e.createdAt).getTime() + TZ).toISOString().slice(0, 19).replace('T', ' '), e.kind === 'revenue' ? 'إيراد' : 'مصروف', Number(e.amount) || 0, e.currency || 'YER', SOURCE_LABEL[e.sourceType] || e.sourceType || '', e.description || '', e.id].map((v, i) => (i === 2 ? String(v) : cell(v))).join(','));
    return '\uFEFF' + lines.join('\r\n') + '\r\n';
  }

  /* ----- الإقفال اليومي (بند 73) ----- */
  const closes = db => (Array.isArray(db?.settings?.dailyCloses) ? db.settings.dailyCloses : []);
  const closeOf = (db, day) => closes(db).find(c => c.day === day) || null;
  const isClosed = (db, day) => closeOf(db, day)?.status === 'closed';
  const todayClosed = (db, at = Date.now()) => isClosed(db, dayKey(at));
  // open | closed | reopened؛ changed = تغيّرت القيود بعد الإقفال (مثلًا من تبويب آخر) فيلزم التصحيح
  function dayStatus(db, day) {
    const c = closeOf(db, day), cur = summarize(db.financeEntries, day, day);
    if (!c) return { state: 'open', close: null, current: cur, changed: false };
    if (c.status !== 'closed') return { state: 'reopened', close: c, current: cur, changed: false };
    return { state: 'closed', close: c, current: cur, changed: cur.count !== c.count || cur.revenue !== c.revenue || cur.expense !== c.expense };
  }
  function writeCloses(db, list) { db.settings = { ...(db.settings || {}), dailyCloses: list }; }

  async function closeDay(D, adminId, day, at = Date.now()) {
    if (!validKey(day)) throw new Error('تاريخ اليوم غير صالح.');
    if (day > dayKey(at)) throw new Error('لا يمكن إقفال يوم لم يبدأ بعد.');
    return D.transact(adminId, 'daily_close', db => {
      const list = closes(db).map(c => ({ ...c, history: [...(c.history || [])] })), cur = list.find(c => c.day === day);
      if (cur?.status === 'closed') throw new Error('اليوم مقفل بالفعل.');
      const snap = summarize(db.financeEntries, day, day), stamp = new Date(at).toISOString();
      const rec = cur || { id: D.uid('dayclose'), day, history: [] };
      Object.assign(rec, { status: 'closed', revenue: snap.revenue, expense: snap.expense, net: snap.net, count: snap.count, closedAt: stamp, closedBy: adminId });
      rec.history.push({ type: 'close', at: stamp, by: adminId, snapshot: snap });
      if (!cur) list.push(rec);
      writeCloses(db, list);
      return { entityType: 'daily_close', entityId: rec.id, summary: `إقفال يوم ${day}`, details: { day, snapshot: snap } };
    });
  }
  async function reopenDay(D, adminId, day, reason, at = Date.now()) {
    const why = String(reason || '').trim();
    if (!why) throw new Error('سبب إعادة الفتح مطلوب.');
    if (why.length > REASON_MAX) throw new Error(`سبب إعادة الفتح أطول من ${REASON_MAX} حرفًا.`);
    return D.transact(adminId, 'daily_close_reopened', db => {
      const list = closes(db).map(c => ({ ...c, history: [...(c.history || [])] })), rec = list.find(c => c.day === day);
      if (!rec || rec.status !== 'closed') throw new Error('اليوم غير مقفل.');
      const stamp = new Date(at).toISOString(), before = { revenue: rec.revenue, expense: rec.expense, net: rec.net, count: rec.count, closedAt: rec.closedAt };
      rec.history.push({ type: 'reopen', at: stamp, by: adminId, reason: why, snapshot: before });
      Object.assign(rec, { status: 'reopened', reopenedAt: stamp, reopenedBy: adminId, reopenReason: why });
      writeCloses(db, list);
      return { entityType: 'daily_close', entityId: rec.id, summary: `إعادة فتح يوم ${day} لتصحيح موثق`, details: { day, reason: why, before } };
    });
  }

  return { TZ, RANGES, BUCKETS, SOURCE_LABEL, REASON_MAX, dayKey, addDays, validKey, spanDays, rangeFor, summarize, autoBucket, series, csvText, closes, closeOf, isClosed, todayClosed, dayStatus, closeDay, reopenDay };
});
