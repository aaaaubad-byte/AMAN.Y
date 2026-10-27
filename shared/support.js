/* AMAN — الدعم والتسويق (U14: بنود 67 و68 و82 و83): تذاكر الدعم والمحادثات (عميل) وصندوق الوارد (إدارة)،
   العروض الترويجية الإدارية، القسائم والنقاط المجانية.
   فوق AmanData.transact بلا تعديل على shared/data.js؛ كل البيانات تحت settings.support:
     { tickets[], promotions[], awards[], coupons[], redemptions[], couponFails{} }
   settings لا يصل إلى نسخة العميل (readForCustomer يحذفه)، فيقرأ العميل ما يخصه فقط عبر customerView.
   لا قيم تجارية مختلَقة: كل مكافأة وحد واستخدام تحدده الإدارة. النقاط المجانية حركة نقاط دائنة بمصدر
   (promotion | coupon) ولا تُنشئ قيدًا ماليًا ولا إيرادًا ولا اشتراكًا. المنح لا يتكرر لنفس العميل. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.AmanSupport = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const TZ = 3 * 3600000, DAY = 86400000;
  const LIM = { subject: 80, text: 1000, note: 500, messages: 200, openPerCustomer: 10, title: 60, desc: 300, cond: 300, action: 60, codeMin: 4, codeMax: 24, points: 1000000, uses: 1000000, fails: 5, lockMs: 15 * 60000 };
  const TICKET_STATUS = { open: 'بانتظار الدعم', answered: 'تم الرد', closed: 'مغلقة' };
  const arr = x => (Array.isArray(x) ? x : []);
  const sup = db => ({ tickets: [], promotions: [], awards: [], coupons: [], redemptions: [], couponFails: {}, ...(db?.settings?.support || {}) });
  function write(db, patch) { db.settings = { ...(db.settings || {}), support: { ...sup(db), ...patch } }; }
  const cp = x => JSON.parse(JSON.stringify(x));
  const txt = (v, max, label, required = true) => {
    const s = String(v ?? '').trim().replace(/\r\n/g, '\n');
    if (required && !s) throw new Error(`${label} مطلوب.`);
    if (s.length > max) throw new Error(`${label} أطول من ${max} حرفًا.`);
    return s;
  };
  const customerOf = (db, id) => { const c = db.customers.find(x => x.id === id); if (!c || c.status === 'deleted') throw new Error('الحساب غير موجود.'); return c; };

  /* ----- تواريخ بتوقيت صنعاء: مفتاح يوم YYYY-MM-DD؛ البداية أول اليوم والنهاية آخره (شاملة) ----- */
  const validKey = k => typeof k === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(k) && new Date(Date.UTC(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10))).toISOString().slice(0, 10) === k;
  const startOf = k => Date.UTC(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10)) - TZ;
  const endOf = k => startOf(k) + DAY - 1;
  const dateOpt = (v, label) => { const s = String(v ?? '').trim(); if (!s) return null; if (!validKey(s)) throw new Error(`${label} غير صالح.`); return s; };

  /* ===================== التذاكر (67 و82) ===================== */
  const lastAt = t => t.messages.length ? t.messages[t.messages.length - 1].at : t.createdAt;
  function pushMessage(t, from, text, stamp, D) { t.messages.push({ id: D.uid('msg'), from, text, at: stamp }); t.updatedAt = stamp; }

  async function createTicket(D, customerId, input = {}) {
    const subject = txt(input.subject, LIM.subject, 'عنوان التذكرة'), body = txt(input.body, LIM.text, 'نص الرسالة');
    return D.transact(customerId, 'support_ticket_created', db => {
      customerOf(db, customerId);
      const s = sup(db), tickets = arr(s.tickets).slice();
      if (tickets.filter(t => t.customerId === customerId && t.status !== 'closed').length >= LIM.openPerCustomer) throw new Error(`بلغت الحد الأقصى (${LIM.openPerCustomer}) من التذاكر المفتوحة؛ انتظر الرد أو أغلق تذكرة قديمة.`);
      const stamp = D.now(), t = { id: D.uid('tkt'), customerId, subject, status: 'open', createdAt: stamp, updatedAt: stamp, unreadAdmin: true, unreadCustomer: false, messages: [], notes: [] };
      pushMessage(t, 'customer', body, stamp, D); tickets.push(t); write(db, { tickets });
      return { entityType: 'support_ticket', entityId: t.id, summary: `فتح تذكرة دعم: ${subject}` };
    });
  }
  async function customerReply(D, customerId, ticketId, text) {
    const body = txt(text, LIM.text, 'نص الرسالة');
    return D.transact(customerId, 'support_ticket_customer_reply', db => {
      customerOf(db, customerId);
      const tickets = arr(sup(db).tickets).map(cp), t = tickets.find(x => x.id === ticketId && x.customerId === customerId);
      if (!t) throw new Error('التذكرة غير موجودة ضمن تذاكرك.');
      if (t.status === 'closed') throw new Error('التذكرة مغلقة؛ افتح تذكرة جديدة.');
      if (t.messages.length >= LIM.messages) throw new Error('بلغت التذكرة الحد الأقصى من الرسائل؛ افتح تذكرة جديدة.');
      pushMessage(t, 'customer', body, D.now(), D); t.status = 'open'; t.unreadAdmin = true; write(db, { tickets });
      return { entityType: 'support_ticket', entityId: t.id, summary: 'رد العميل على تذكرة دعم' };
    });
  }
  async function adminReply(D, adminId, ticketId, text) {
    const body = txt(text, LIM.text, 'نص الرد');
    return D.transact(adminId, 'support_ticket_admin_reply', db => {
      const tickets = arr(sup(db).tickets).map(cp), t = tickets.find(x => x.id === ticketId);
      if (!t) throw new Error('التذكرة غير موجودة.');
      if (t.status === 'closed') throw new Error('التذكرة مغلقة؛ أعد فتحها قبل الرد.');
      if (t.messages.length >= LIM.messages) throw new Error('بلغت التذكرة الحد الأقصى من الرسائل.');
      const stamp = D.now(); pushMessage(t, 'admin', body, stamp, D); t.status = 'answered'; t.unreadCustomer = true; t.unreadAdmin = false; write(db, { tickets });
      db.notifications.unshift({ id: D.uid('notice'), customerId: t.customerId, title: 'رد جديد من الدعم', body: `وصل رد على تذكرتك «${t.subject}».`, status: 'delivered-local', createdAt: stamp, readAt: null });
      return { entityType: 'support_ticket', entityId: t.id, summary: 'رد الإدارة على تذكرة دعم' };
    });
  }
  async function setTicketStatus(D, adminId, ticketId, status) {
    if (!['open', 'closed'].includes(status)) throw new Error('حالة التذكرة غير صالحة.');
    return D.transact(adminId, status === 'closed' ? 'support_ticket_closed' : 'support_ticket_reopened', db => {
      const tickets = arr(sup(db).tickets).map(cp), t = tickets.find(x => x.id === ticketId);
      if (!t) throw new Error('التذكرة غير موجودة.');
      if (status === 'closed' && t.status === 'closed') throw new Error('التذكرة مغلقة بالفعل.');
      if (status === 'open' && t.status !== 'closed') throw new Error('التذكرة غير مغلقة.');
      t.status = status === 'closed' ? 'closed' : (t.messages.at(-1)?.from === 'admin' ? 'answered' : 'open'); t.updatedAt = D.now(); if (status === 'closed') t.unreadAdmin = false; write(db, { tickets });
      return { entityType: 'support_ticket', entityId: t.id, summary: status === 'closed' ? 'إغلاق تذكرة دعم' : 'إعادة فتح تذكرة دعم' };
    });
  }
  async function addTicketNote(D, adminId, ticketId, text) {
    const body = txt(text, LIM.note, 'نص الملاحظة');
    return D.transact(adminId, 'support_ticket_note_added', db => {
      const tickets = arr(sup(db).tickets).map(cp), t = tickets.find(x => x.id === ticketId);
      if (!t) throw new Error('التذكرة غير موجودة.');
      t.notes = arr(t.notes); t.notes.push({ id: D.uid('tnote'), text: body, by: adminId, at: D.now() }); write(db, { tickets });
      return { entityType: 'support_ticket', entityId: t.id, summary: 'ملاحظة داخلية على تذكرة دعم' };
    });
  }
  // قراءة بلا أثر على سجل العمليات (لا تُحدث revision إلا عند وجود غير مقروء فعلًا)
  async function markRead(D, who, ticketId, side) {
    const db0 = D.read(), t0 = arr(sup(db0).tickets).find(x => x.id === ticketId);
    if (!t0 || (side === 'admin' ? !t0.unreadAdmin : !t0.unreadCustomer || t0.customerId !== who)) return false;
    await D.transact(who, null, db => { const tickets = arr(sup(db).tickets).map(cp), t = tickets.find(x => x.id === ticketId); if (t) { if (side === 'admin') t.unreadAdmin = false; else t.unreadCustomer = false; write(db, { tickets }); } });
    return true;
  }
  const inbox = (db, filter = 'all') => arr(sup(db).tickets).filter(t => filter === 'all' || (filter === 'unread' ? t.unreadAdmin : t.status === filter))
    .slice().sort((a, b) => (b.unreadAdmin - a.unreadAdmin) || new Date(lastAt(b)) - new Date(lastAt(a)));
  const inboxCounts = db => { const l = arr(sup(db).tickets); return { all: l.length, unread: l.filter(t => t.unreadAdmin).length, open: l.filter(t => t.status === 'open').length, answered: l.filter(t => t.status === 'answered').length, closed: l.filter(t => t.status === 'closed').length }; };

  /* ===================== العروض الترويجية (68) ===================== */
  // حالة العرض: off (غير مفعّل) | scheduled (لم يبدأ) | running | ended
  function promoState(p, at = Date.now()) {
    if (!p.active) return 'off';
    if (p.startsAt && at < startOf(p.startsAt)) return 'scheduled';
    if (p.endsAt && at > endOf(p.endsAt)) return 'ended';
    return 'running';
  }
  async function savePromotion(D, adminId, input = {}) {
    const title = txt(input.title, LIM.title, 'عنوان العرض'), description = txt(input.description, LIM.desc, 'وصف العرض'), actionLabel = txt(input.actionLabel, LIM.action, 'الإجراء المطلوب من العميل'), conditions = txt(input.conditions, LIM.cond, 'شروط العرض', false);
    const rewardRaw = String(input.rewardPoints ?? '').trim(), reward = rewardRaw === '' ? 0 : Number(rewardRaw);
    if (!Number.isInteger(reward) || reward < 0 || reward > LIM.points) throw new Error(`مكافأة النقاط عدد صحيح بين 0 و${LIM.points}.`);
    const maxRaw = String(input.maxAwards ?? '').trim(), maxAwards = maxRaw === '' ? null : Number(maxRaw);
    if (maxAwards !== null && (!Number.isInteger(maxAwards) || maxAwards < 1 || maxAwards > LIM.uses)) throw new Error('الحد الأقصى للمنح عدد صحيح موجب أو فارغ.');
    const startsAt = dateOpt(input.startsAt, 'تاريخ البداية'), endsAt = dateOpt(input.endsAt, 'تاريخ النهاية');
    if (startsAt && endsAt && startsAt > endsAt) throw new Error('تاريخ البداية يجب ألا يتجاوز تاريخ النهاية.');
    return D.transact(adminId, 'promotion_saved', db => {
      const s = sup(db), list = arr(s.promotions).slice(), i = input.id ? list.findIndex(x => x.id === input.id) : -1;
      if (input.id && i < 0) throw new Error('العرض غير موجود.');
      if (list.some((x, j) => j !== i && x.title.toLocaleLowerCase() === title.toLocaleLowerCase())) throw new Error('عنوان العرض مستخدم بالفعل.');
      const awarded = arr(s.awards).filter(a => a.promotionId === input.id).length;
      if (i >= 0 && maxAwards !== null && maxAwards < awarded) throw new Error(`لا يمكن خفض الحد دون ${awarded} (عدد المنح السابقة).`);
      if (i >= 0 && awarded && reward !== list[i].rewardPoints) throw new Error('لا يمكن تغيير مكافأة عرض سبق المنح منه؛ أنشئ عرضًا جديدًا.');
      const stamp = D.now(), before = i >= 0 ? cp(list[i]) : null;
      const p = { ...(before || { id: D.uid('promo'), createdAt: stamp }), title, description, actionLabel, conditions, rewardPoints: reward, maxAwards, startsAt, endsAt, active: input.active !== false && input.active !== 'off', updatedAt: stamp };
      if (i < 0) list.push(p); else list[i] = p;
      write(db, { promotions: list });
      return { entityType: 'promotion', entityId: p.id, summary: `حفظ العرض ${title}`, details: { before, after: p } };
    });
  }
  async function deletePromotion(D, adminId, id) {
    return D.transact(adminId, 'promotion_deleted', db => {
      const s = sup(db), p = arr(s.promotions).find(x => x.id === id);
      if (!p) throw new Error('العرض غير موجود.');
      if (arr(s.awards).some(a => a.promotionId === id)) throw new Error('سبق المنح من هذا العرض؛ عطّله بدل حذفه حفاظًا على السجل.');
      write(db, { promotions: arr(s.promotions).filter(x => x.id !== id) });
      return { entityType: 'promotion', entityId: id, summary: `حذف العرض ${p.title}` };
    });
  }
  // منح مكافأة عرض لعميل: يدويًا من الإدارة بعد تحقق العميل من الإجراء المطلوب؛ مرة واحدة لكل عميل
  async function awardPromotion(D, adminId, promotionId, customerId, note = '', at = Date.now()) {
    const why = txt(note, LIM.note, 'ملاحظة المنح', false);
    return D.transact(adminId, 'promotion_awarded', db => {
      const c = customerOf(db, customerId), s = sup(db), p = arr(s.promotions).find(x => x.id === promotionId);
      if (!p) throw new Error('العرض غير موجود.');
      if (promoState(p, at) !== 'running') throw new Error('العرض غير ساري حاليًا؛ لا يمكن المنح منه.');
      if (!(p.rewardPoints > 0)) throw new Error('هذا العرض بلا مكافأة نقاط.');
      const awards = arr(s.awards).slice();
      if (awards.some(a => a.promotionId === p.id && a.customerId === customerId)) throw new Error('سبق منح هذا العميل مكافأة هذا العرض.');
      if (p.maxAwards !== null && awards.filter(a => a.promotionId === p.id).length >= p.maxAwards) throw new Error('بلغ العرض حده الأقصى من المنح.');
      const stamp = new Date(at).toISOString(), award = { id: D.uid('award'), promotionId: p.id, customerId, points: p.rewardPoints, note: why, by: adminId, at: stamp, txId: D.uid('pt') };
      awards.push(award);
      db.pointTransactions.push({ id: award.txId, customerId, type: 'credit', points: p.rewardPoints, source: 'promotion', sourceId: award.id, createdAt: stamp, description: `مكافأة عرض: ${p.title}` });
      db.notifications.unshift({ id: D.uid('notice'), customerId, title: 'حصلت على نقاط مجانية', body: `أُضيفت ${p.rewardPoints} نقطة إلى رصيدك من عرض «${p.title}».`, status: 'delivered-local', createdAt: stamp, readAt: null });
      write(db, { awards });
      return { entityType: 'promotion_award', entityId: award.id, summary: `منح ${p.rewardPoints} نقطة للعميل ${c.accountId || c.id} من عرض ${p.title}`, details: { promotionId: p.id, customerId, points: p.rewardPoints } };
    });
  }

  /* ===================== القسائم والنقاط المجانية (83) ===================== */
  const normCode = v => String(v ?? '').trim().toUpperCase().replace(/\s+/g, '');
  const codeOk = c => c.length >= LIM.codeMin && c.length <= LIM.codeMax && /^[A-Z0-9][A-Z0-9-]*[A-Z0-9]$/.test(c);
  function couponState(k, db, at = Date.now()) {
    const used = arr(sup(db).redemptions).filter(r => r.couponId === k.id).length;
    if (!k.active) return { state: 'off', used };
    if (k.endsAt && at > endOf(k.endsAt)) return { state: 'expired', used };
    if (used >= k.maxUses) return { state: 'exhausted', used };
    return { state: 'live', used };
  }
  async function saveCoupon(D, adminId, input = {}) {
    const code = normCode(input.code);
    if (!codeOk(code)) throw new Error(`الرمز ${LIM.codeMin}–${LIM.codeMax} خانة من الحروف الإنجليزية والأرقام والشرطة.`);
    const points = Number(String(input.points ?? '').trim()), maxUses = Number(String(input.maxUses ?? '').trim());
    if (!Number.isInteger(points) || points < 1 || points > LIM.points) throw new Error(`قيمة القسيمة عدد صحيح بين 1 و${LIM.points} نقطة.`);
    if (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > LIM.uses) throw new Error('الحد الأقصى للاستخدام مطلوب: عدد صحيح موجب (لا قسائم بلا سقف).');
    const endsAt = dateOpt(input.endsAt, 'تاريخ الانتهاء'), note = txt(input.note, LIM.note, 'الملاحظة الداخلية', false);
    return D.transact(adminId, 'coupon_saved', db => {
      const s = sup(db), list = arr(s.coupons).slice(), i = input.id ? list.findIndex(x => x.id === input.id) : -1;
      if (input.id && i < 0) throw new Error('القسيمة غير موجودة.');
      if (list.some((x, j) => j !== i && x.code === code)) throw new Error('رمز القسيمة مستخدم بالفعل.');
      const used = i >= 0 ? arr(s.redemptions).filter(r => r.couponId === list[i].id).length : 0;
      if (i >= 0 && used && (code !== list[i].code || points !== list[i].points)) throw new Error('لا يمكن تغيير رمز أو قيمة قسيمة سبق استخدامها؛ عطّلها وأنشئ قسيمة جديدة.');
      if (i >= 0 && maxUses < used) throw new Error(`لا يمكن خفض الحد دون ${used} (عدد الاستخدامات السابقة).`);
      const stamp = D.now(), before = i >= 0 ? cp(list[i]) : null;
      const k = { ...(before || { id: D.uid('coupon'), createdAt: stamp }), code, points, maxUses, endsAt, note, active: input.active !== false && input.active !== 'off', updatedAt: stamp };
      if (i < 0) list.push(k); else list[i] = k;
      write(db, { coupons: list });
      return { entityType: 'coupon', entityId: k.id, summary: `حفظ القسيمة ${code}`, details: { before, after: k } };
    });
  }
  async function deleteCoupon(D, adminId, id) {
    return D.transact(adminId, 'coupon_deleted', db => {
      const s = sup(db), k = arr(s.coupons).find(x => x.id === id);
      if (!k) throw new Error('القسيمة غير موجودة.');
      if (arr(s.redemptions).some(r => r.couponId === id)) throw new Error('سبق استخدام هذه القسيمة؛ عطّلها بدل حذفها حفاظًا على السجل.');
      write(db, { coupons: arr(s.coupons).filter(x => x.id !== id) });
      return { entityType: 'coupon', entityId: id, summary: `حذف القسيمة ${k.code}` };
    });
  }
  const failState = (db, customerId, at) => { const f = sup(db).couponFails[customerId]; return f && f.until && at < new Date(f.until).getTime() ? f : null; };
  // استرداد قسيمة: مرة واحدة لكل عميل، ضمن الحد الكلي والصلاحية؛ المحاولات الفاشلة المتتالية تُقفل مؤقتًا
  async function redeemCoupon(D, customerId, rawCode, at = Date.now()) {
    const code = normCode(rawCode);
    const lock = failState(D.read(), customerId, at);
    if (lock) throw new Error('محاولات خاطئة كثيرة؛ حاول لاحقًا.');
    if (!code) throw new Error('أدخل رمز القسيمة.');
    const fail = async msg => {
      await D.transact(customerId, null, db => {
        const s = sup(db), f = { ...(s.couponFails[customerId] || { n: 0 }) }; f.n = (f.n || 0) + 1;
        if (f.n >= LIM.fails) { f.until = new Date(at + LIM.lockMs).toISOString(); f.n = 0; }
        write(db, { couponFails: { ...s.couponFails, [customerId]: f } });
      }).catch(() => {});
      throw new Error(msg);
    };
    const db0 = D.read(), k0 = arr(sup(db0).coupons).find(x => x.code === code);
    if (!k0 || couponState(k0, db0, at).state !== 'live') return fail('رمز القسيمة غير صالح أو غير متاح.');
    const res = await D.transact(customerId, 'coupon_redeemed', db => {
      const c = customerOf(db, customerId), s = sup(db), k = arr(s.coupons).find(x => x.code === code);
      if (D.restrictionsOf(c).login) throw new Error('تعذر تنفيذ العملية. تواصل مع الإدارة.');
      if (!k || couponState(k, db, at).state !== 'live') throw new Error('رمز القسيمة غير صالح أو غير متاح.');
      const reds = arr(s.redemptions).slice();
      if (reds.some(r => r.couponId === k.id && r.customerId === customerId)) throw new Error('استخدمت هذه القسيمة من قبل.');
      const stamp = new Date(at).toISOString(), r = { id: D.uid('redeem'), couponId: k.id, code: k.code, customerId, points: k.points, at: stamp, txId: D.uid('pt') };
      reds.push(r);
      db.pointTransactions.push({ id: r.txId, customerId, type: 'credit', points: k.points, source: 'coupon', sourceId: r.id, createdAt: stamp, description: `قسيمة ${k.code}` });
      db.notifications.unshift({ id: D.uid('notice'), customerId, title: 'أُضيفت نقاط من قسيمة', body: `أُضيفت ${k.points} نقطة إلى رصيدك.`, status: 'delivered-local', createdAt: stamp, readAt: null });
      const fails = { ...s.couponFails }; delete fails[customerId];
      write(db, { redemptions: reds, couponFails: fails });
      return { entityType: 'coupon_redemption', entityId: r.id, summary: `استرداد قسيمة ${k.code}`, details: { couponId: k.id, customerId, points: k.points }, points: k.points };
    }).catch(e => { if (/غير صالح أو غير متاح/.test(e.message)) return fail(e.message); throw e; });
    return { points: res.result.points };
  }

  /* ===================== نسخة العميل: ما يخصه فقط ===================== */
  function customerView(db, customerId, at = Date.now()) {
    const s = sup(db);
    const tickets = arr(s.tickets).filter(t => t.customerId === customerId).map(({ notes, unreadAdmin, ...t }) => cp(t)).sort((a, b) => new Date(lastAt(b)) - new Date(lastAt(a)));
    const promotions = arr(s.promotions).filter(p => promoState(p, at) === 'running').map(p => {
      const awarded = arr(s.awards).some(a => a.promotionId === p.id && a.customerId === customerId);
      return { id: p.id, title: p.title, description: p.description, actionLabel: p.actionLabel, conditions: p.conditions, rewardPoints: p.rewardPoints, endsAt: p.endsAt, awarded };
    });
    const redemptions = arr(s.redemptions).filter(r => r.customerId === customerId).map(({ id, code, points, at: when }) => ({ id, code, points, at: when }));
    return { tickets, promotions, redemptions, unread: tickets.filter(t => t.unreadCustomer).length, locked: !!failState(db, customerId, at) };
  }
  const reportFor = db => { const s = sup(db); return { tickets: inboxCounts(db), promotions: arr(s.promotions).length, awards: arr(s.awards).length, awardedPoints: arr(s.awards).reduce((t, a) => t + a.points, 0), coupons: arr(s.coupons).length, redemptions: arr(s.redemptions).length, redeemedPoints: arr(s.redemptions).reduce((t, r) => t + r.points, 0) }; };

  return { LIM, TICKET_STATUS, sup, validKey, createTicket, customerReply, adminReply, setTicketStatus, addTicketNote, markRead, inbox, inboxCounts, lastAt, promoState, savePromotion, deletePromotion, awardPromotion, normCode, codeOk, couponState, saveCoupon, deleteCoupon, redeemCoupon, customerView, reportFor };
});
