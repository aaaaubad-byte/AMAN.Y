/* AMAN Admin — الدعم والتسويق (U14: بنود 67 و68 و82 و83): صندوق وارد التذاكر، العروض الترويجية، القسائم والنقاط المجانية.
   تُحمَّل بعد admin-system.js وقبل admin-routes.js وadmin.js؛ تلتف حول AmanAdminExpiry.build.
   المسارات: support[/<مرشّح>] · support-ticket/<id> · promotions · promotions/new|<id> · coupons · coupons/new|<id>
   كل الكتابة عبر AmanSupport (D.transact). لا تعديل على admin.js ولا على shared/data.js. */
(function (root) {
  'use strict';
  const D = root.AmanData, U = root.AmanUI, K = root.AmanAdminKit, M = root.AmanAdminModel, SP = root.AmanSupport, EXP = root.AmanAdminExpiry;
  if (!D || !K || !SP || !EXP) return;
  const E = K.esc, N = U.fmt, ADMIN = 'admin-demo';
  const small = t => `<small style="display:block;line-height:1.9;margin-top:4px">${t}</small>`;
  const stamp = iso => { try { return new Date(iso).toLocaleString('ar-YE-u-nu-latn', { timeZone: 'Asia/Aden', dateStyle: 'medium', timeStyle: 'short' }); } catch { return String(iso || '').slice(0, 16); } };
  const view = (title, sub, html) => ({ chrome: 'focus', title, sub, html, bar: '' });
  const chip = (label, to, on) => `<button type="button" class="tpl-chip" data-act="fin-nav" data-to="${E(to)}" aria-pressed="${on ? 'true' : 'false'}" ${on ? 'style="border-color:var(--ink);font-weight:700"' : ''}>${E(label)}</button>`;
  const missing = (title, back, msg) => view(title, '', K.empty(msg, 'info', 'غير موجود', K.btn('العودة', 'fin-nav', 'primary', `data-to="${back}"`)));
  const custName = (d, id) => { const c = M.customer(d, id); return c ? c.name : 'عميل غير موجود'; };
  const STATE_PROMO = { off: ['معطّل', ''], scheduled: ['لم يبدأ', 'warn'], running: ['ساري', 'ok'], ended: ['انتهى', ''] };
  const STATE_COUPON = { off: ['معطّلة', ''], expired: ['منتهية', ''], exhausted: ['استُنفدت', 'warn'], live: ['سارية', 'ok'] };
  const TONE = { open: 'warn', answered: 'ok', closed: '' };

  /* ----- صندوق الوارد ----- */
  const FILTERS = [['all', 'الكل'], ['unread', 'غير مقروءة'], ['open', 'بانتظار الدعم'], ['answered', 'تم الرد'], ['closed', 'مغلقة']];
  function inbox(d, route) {
    const q = route.split('/')[1] || 'all', key = FILTERS.some(f => f[0] === q) ? q : 'all', c = SP.inboxCounts(d), list = SP.inbox(d, key);
    const chips = `<div class="tpl-chips" role="group" aria-label="تصفية التذاكر">${FILTERS.map(([k, l]) => chip(`${l} (${N(c[k])})`, `support/${k}`, k === key)).join('')}</div>`;
    const rows = list.map(t => K.row({ icon: 'doc', tone: t.unreadAdmin ? 'warn' : '', title: E(t.subject), sub: `${E(custName(d, t.customerId))} · ${E(SP.TICKET_STATUS[t.status])}`, sub2: E(stamp(SP.lastAt(t))), pill: t.unreadAdmin ? K.pill('جديد', 'bad') : K.pill(SP.TICKET_STATUS[t.status], TONE[t.status]), to: `support-ticket/${t.id}` }));
    return view('صندوق الدعم', `${N(c.unread)} غير مقروءة`, `${chips}${rows.length ? K.card(rows) : K.empty(c.all ? 'لا توجد تذاكر في هذا التصنيف.' : 'لا توجد تذاكر بعد. تظهر هنا حين يفتحها العملاء من تطبيقهم.', 'doc', 'لا توجد تذاكر')}`);
  }
  const bubble = m => `<div style="margin:8px 0;padding:10px 12px;border-radius:12px;border:1px solid rgba(128,128,128,.3);${m.from === 'admin' ? 'margin-inline-start:24px' : 'margin-inline-end:24px'}"><small style="display:block;opacity:.7">${m.from === 'admin' ? 'الدعم' : 'العميل'} · ${E(stamp(m.at))}</small><div style="white-space:pre-wrap;line-height:1.8">${E(m.text)}</div></div>`;
  function ticket(d, id) {
    const t = SP.sup(d).tickets.find(x => x.id === id);
    if (!t) return missing('تذكرة دعم', 'support', 'التذكرة غير موجودة.');
    const closed = t.status === 'closed';
    const reply = closed ? K.callout('info', 'التذكرة مغلقة', small('أعد فتحها للرد على العميل.')) : `${K.fields(K.field({ name: 'reply', label: 'الرد على العميل', type: 'textarea', rows: 4, help: `حتى ${SP.LIM.text} حرفًا. يصل العميل إشعار محلي.` }))}<div style="margin-top:8px">${K.btn('إرسال الرد', 'sup-reply', 'primary', `data-id="${E(t.id)}"`, 'doc')}</div>`;
    const notes = (t.notes || []).slice().reverse().map(n => K.row({ icon: 'clock', title: E(n.text), sub: E(stamp(n.at)), plain: true }));
    return view(E(t.subject), `${E(custName(d, t.customerId))} · ${E(SP.TICKET_STATUS[t.status])}`, `${t.messages.map(bubble).join('')}${K.section('الرد')}${reply}
<div style="margin-top:8px">${closed ? K.btn('إعادة فتح التذكرة', 'sup-status', '', `data-id="${E(t.id)}" data-to="open"`, 'repeat') : K.btn('إغلاق التذكرة', 'sup-status', '', `data-id="${E(t.id)}" data-to="closed"`, 'lock')}${K.btn('العميل', 'go', '', `data-to="customer/${E(t.customerId)}"`, 'users')}</div>
${K.section('ملاحظات داخلية', N(notes.length))}${K.note('لا تظهر للعميل أبدًا.')}${K.fields(K.field({ name: 'tnote', label: 'ملاحظة جديدة', type: 'textarea', rows: 2 }))}<div style="margin-top:8px">${K.btn('حفظ الملاحظة', 'sup-note', '', `data-id="${E(t.id)}"`)}</div>${notes.length ? K.card(notes) : ''}`);
  }

  /* ----- العروض الترويجية ----- */
  function promos(d) {
    const list = SP.sup(d).promotions, now = Date.now();
    const rows = list.map(p => { const [lab, tone] = STATE_PROMO[SP.promoState(p, now)], n = SP.sup(d).awards.filter(a => a.promotionId === p.id).length; return K.row({ icon: 'gift', tone, title: E(p.title), sub: `${p.rewardPoints ? N(p.rewardPoints) + ' نقطة' : 'بلا نقاط'} · مُنحت ${N(n)}${p.maxAwards ? ' من ' + N(p.maxAwards) : ''}`, sub2: E(p.actionLabel), pill: K.pill(lab, tone), to: `promotions/${p.id}` }); });
    return view('العروض الترويجية', `${N(list.length)} عرض`, `${K.callout('info', 'كيف تعمل العروض؟', small('تحدد الإدارة العرض والإجراء المطلوب من العميل والمكافأة وشروطها وفترته. يرى العميل العروض السارية فقط. تُمنح المكافأة يدويًا بعد التحقق من الإجراء، مرة واحدة لكل عميل، كنقاط مجانية بلا قيد مالي ولا اشتراك.'))}<div style="margin:10px 0">${K.btn('عرض جديد', 'go', 'primary', 'data-to="promotions/new"', 'plus')}</div>${rows.length ? K.card(rows) : K.empty('لم تُنشأ عروض بعد.', 'gift', 'لا توجد عروض')}`);
  }
  function promoForm(d, id) {
    const isNew = id === 'new', p = isNew ? {} : SP.sup(d).promotions.find(x => x.id === id);
    if (!p) return missing('عرض ترويجي', 'promotions', 'العرض غير موجود.');
    const awards = isNew ? [] : SP.sup(d).awards.filter(a => a.promotionId === p.id).slice().reverse();
    const f = K.fields(K.field({ name: 'title', label: 'عنوان العرض', value: p.title || '', required: true }) + K.field({ name: 'description', label: 'وصف العرض (يراه العميل)', type: 'textarea', rows: 3, value: p.description || '', required: true }) + K.field({ name: 'actionLabel', label: 'الإجراء المطلوب من العميل', value: p.actionLabel || '', required: true, help: 'نص حر تحدده الإدارة.' }) + K.field({ name: 'rewardPoints', label: 'مكافأة النقاط', type: 'number', min: 0, step: 1, value: p.rewardPoints ?? '', inputmode: 'numeric', help: 'فارغ أو 0 = عرض بلا نقاط.' }) + K.field({ name: 'maxAwards', label: 'الحد الأقصى للمنح', type: 'number', min: 1, step: 1, value: p.maxAwards ?? '', inputmode: 'numeric', help: 'فارغ = بلا سقف.' }) + K.field({ name: 'startsAt', label: 'تاريخ البداية', type: 'date', value: p.startsAt || '' }) + K.field({ name: 'endsAt', label: 'تاريخ النهاية (يشمل اليوم)', type: 'date', value: p.endsAt || '' }) + K.field({ name: 'conditions', label: 'شروط العرض', type: 'textarea', rows: 3, value: p.conditions || '' })) + K.toggle('active', 'العرض مفعّل', isNew ? true : !!p.active);
    const award = isNew ? '' : `${K.section('منح مكافأة')}${p.rewardPoints > 0 ? K.fields(K.field({ name: 'awardCustomer', label: 'العميل', type: 'select', value: '', options: [['', 'اختر عميلًا'], ...d.customers.filter(c => c.status !== 'deleted').map(c => [c.id, `${c.name} — ${c.email}`])] }) + K.field({ name: 'awardNote', label: 'ملاحظة (داخلية)', value: '' })) + `<div style="margin-top:8px">${K.btn('منح المكافأة', 'sup-promo-award', 'primary', `data-id="${E(p.id)}"`, 'gift')}</div>${K.note('تُضاف النقاط إلى رصيد العميل مرة واحدة ولا تُسجَّل إيرادًا. لا يتكرر المنح لنفس العميل.')}` : K.note('لا مكافأة نقاط لهذا العرض.')}${awards.length ? K.section('سجل المنح', N(awards.length)) + K.card(awards.map(a => K.row({ icon: 'gift', title: E(custName(d, a.customerId)), sub: E(stamp(a.at)), sub2: E(a.note || ''), val: `${N(a.points)} نقطة`, plain: true }))) : ''}`;
    return view(isNew ? 'عرض جديد' : E(p.title), isNew ? '' : STATE_PROMO[SP.promoState(p)][0], `${f}<div style="margin-top:12px">${K.btn('حفظ العرض', 'sup-promo-save', 'primary', `data-id="${isNew ? '' : E(p.id)}"`)}${isNew ? '' : K.btn('حذف العرض', 'sup-promo-delete', '', `data-id="${E(p.id)}"`)}</div>${award}`);
  }

  /* ----- القسائم ----- */
  function coupons(d) {
    const list = SP.sup(d).coupons, now = Date.now(), r = SP.reportFor(d);
    const rows = list.map(k => { const st = SP.couponState(k, d, now), [lab, tone] = STATE_COUPON[st.state]; return K.row({ icon: 'gift', tone, title: E(k.code), ltr: true, sub: `${N(k.points)} نقطة · استُخدمت ${N(st.used)} من ${N(k.maxUses)}`, sub2: k.endsAt ? `تنتهي ${E(k.endsAt)}` : 'بلا تاريخ انتهاء', pill: K.pill(lab, tone), to: `coupons/${k.id}` }); });
    return view('القسائم والنقاط المجانية', `${N(list.length)} قسيمة`, `${K.callout('info', 'ضوابط القسائم', small('لكل قسيمة رمز وقيمة بالنقاط وحد أقصى إلزامي للاستخدام وتاريخ انتهاء اختياري. يستخدمها العميل مرة واحدة فقط، والمحاولات الخاطئة المتتالية تُقفل الإدخال مؤقتًا. تُضاف النقاط كحركة رصيد دائنة بمصدر «قسيمة» بلا قيد مالي ولا اشتراك.'))}${K.metrics([['استخدامات', N(r.redemptions)], ['نقاط مجانية ممنوحة', N(r.redeemedPoints + r.awardedPoints)]])}<div style="margin:10px 0">${K.btn('قسيمة جديدة', 'go', 'primary', 'data-to="coupons/new"', 'plus')}</div>${rows.length ? K.card(rows) : K.empty('لم تُنشأ قسائم بعد.', 'gift', 'لا توجد قسائم')}`);
  }
  function couponForm(d, id) {
    const isNew = id === 'new', k = isNew ? {} : SP.sup(d).coupons.find(x => x.id === id);
    if (!k) return missing('قسيمة', 'coupons', 'القسيمة غير موجودة.');
    const reds = isNew ? [] : SP.sup(d).redemptions.filter(r => r.couponId === k.id).slice().reverse();
    const f = K.fields(K.field({ name: 'code', label: 'رمز القسيمة', value: k.code || '', required: true, dir: 'ltr', help: `${SP.LIM.codeMin}–${SP.LIM.codeMax} خانة: حروف إنجليزية وأرقام وشرطة. يُوحَّد إلى الأحرف الكبيرة.` }) + K.field({ name: 'points', label: 'القيمة بالنقاط', type: 'number', min: 1, step: 1, value: k.points ?? '', required: true, inputmode: 'numeric' }) + K.field({ name: 'maxUses', label: 'الحد الأقصى للاستخدام (إلزامي)', type: 'number', min: 1, step: 1, value: k.maxUses ?? '', required: true, inputmode: 'numeric', help: 'عدد مرات الاستخدام الكلي عبر كل العملاء. لا قسائم بلا سقف.' }) + K.field({ name: 'endsAt', label: 'تاريخ الانتهاء (يشمل اليوم)', type: 'date', value: k.endsAt || '' }) + K.field({ name: 'note', label: 'ملاحظة داخلية', type: 'textarea', rows: 2, value: k.note || '' })) + K.toggle('active', 'القسيمة مفعّلة', isNew ? true : !!k.active);
    const hist = reds.length ? K.section('سجل الاستخدام', N(reds.length)) + K.card(reds.map(r => K.row({ icon: 'gift', title: E(custName(d, r.customerId)), sub: E(stamp(r.at)), val: `${N(r.points)} نقطة`, plain: true }))) : '';
    return view(isNew ? 'قسيمة جديدة' : E(k.code), isNew ? '' : STATE_COUPON[SP.couponState(k, d).state][0], `${reds.length ? K.note('سبق استخدام هذه القسيمة: لا يمكن تغيير رمزها أو قيمتها، ويمكن تعطيلها أو رفع حدها.') : ''}${f}<div style="margin-top:12px">${K.btn('حفظ القسيمة', 'sup-coupon-save', 'primary', `data-id="${isNew ? '' : E(k.id)}"`)}${isNew ? '' : K.btn('حذف القسيمة', 'sup-coupon-delete', '', `data-id="${E(k.id)}"`)}</div>${hist}`);
  }

  /* ----- التوجيه والمداخل ----- */
  const base = EXP.build;
  EXP.build = (route, d, ui) => {
    const [name, a] = String(route || '').split('/');
    if (name === 'support') return inbox(d, route);
    if (name === 'support-ticket') { if (a) setTimeout(() => SP.markRead(D, ADMIN, a, 'admin').catch(() => {}), 0); return ticket(d, a); }
    if (name === 'promotions') return a ? promoForm(d, a) : promos(d);
    if (name === 'coupons') return a ? couponForm(d, a) : coupons(d);
    const v = base(route, d, ui);
    if (route === 'more' && v) {
      const c = SP.inboxCounts(d);
      return { ...v, html: v.html + K.section('الدعم والتسويق') + K.card([
        K.row({ icon: 'doc', tone: c.unread ? 'warn' : '', title: 'صندوق الدعم', sub: c.unread ? `${N(c.unread)} تذكرة غير مقروءة` : 'تذاكر العملاء والرد عليها', to: 'support' }),
        K.row({ icon: 'gift', title: 'العروض الترويجية', sub: 'عروض بمكافآت نقاط تحددها الإدارة', to: 'promotions' }),
        K.row({ icon: 'gift', title: 'القسائم والنقاط المجانية', sub: 'رموز نقاط بحد استخدام وانتهاء', to: 'coupons' })]) };
    }
    return v;
  };

  /* ----- الإجراءات ----- */
  const toast = (text, bad = false) => { const e = document.getElementById('toast'); if (!e) return; clearTimeout(toast.t); e.textContent = text; e.className = 'toast' + (bad ? ' error' : ''); toast.t = setTimeout(() => e.classList.add('hidden'), 4200); };
  const rerender = () => window.dispatchEvent(new PopStateEvent('popstate', { state: history.state }));
  const nav = to => { const st = history.state; history.replaceState({ amanAdmin: true, route: to, d: st && st.amanAdmin ? st.d || 0 : 0 }, '', '#/' + to); rerender(); };
  const val = n => document.querySelector(`[name="${n}"]`)?.value ?? '';
  const on = n => !!document.querySelector(`[name="${n}"]`)?.checked;
  let busy = false;
  document.addEventListener('click', async e => {
    const b = e.target.closest && e.target.closest('[data-act^="sup-"]');
    if (!b || busy) return;
    const a = b.dataset.act, id = b.dataset.id || '';
    busy = true;
    try {
      if (a === 'sup-reply') { await SP.adminReply(D, ADMIN, id, val('reply')); toast('أُرسل الرد وأُشعر العميل.'); rerender(); }
      else if (a === 'sup-status') { await SP.setTicketStatus(D, ADMIN, id, b.dataset.to); toast(b.dataset.to === 'closed' ? 'أُغلقت التذكرة.' : 'أُعيد فتح التذكرة.'); rerender(); }
      else if (a === 'sup-note') { await SP.addTicketNote(D, ADMIN, id, val('tnote')); toast('حُفظت الملاحظة الداخلية.'); rerender(); }
      else if (a === 'sup-promo-save') { await SP.savePromotion(D, ADMIN, { id: id || undefined, title: val('title'), description: val('description'), actionLabel: val('actionLabel'), rewardPoints: val('rewardPoints'), maxAwards: val('maxAwards'), startsAt: val('startsAt'), endsAt: val('endsAt'), conditions: val('conditions'), active: on('active') }); toast('حُفظ العرض.'); nav('promotions'); }
      else if (a === 'sup-promo-delete') { await SP.deletePromotion(D, ADMIN, id); toast('حُذف العرض.'); nav('promotions'); }
      else if (a === 'sup-promo-award') {
        const cid = val('awardCustomer'); if (!cid) throw new Error('اختر العميل أولًا.');
        await SP.awardPromotion(D, ADMIN, id, cid, val('awardNote')); toast('مُنحت المكافأة وأُضيفت النقاط مرة واحدة.'); rerender();
      }
      else if (a === 'sup-coupon-save') { await SP.saveCoupon(D, ADMIN, { id: id || undefined, code: val('code'), points: val('points'), maxUses: val('maxUses'), endsAt: val('endsAt'), note: val('note'), active: on('active') }); toast('حُفظت القسيمة.'); nav('coupons'); }
      else if (a === 'sup-coupon-delete') { await SP.deleteCoupon(D, ADMIN, id); toast('حُذفت القسيمة.'); nav('coupons'); }
    } catch (err) { toast(err?.message || 'تعذرت العملية.', true); }
    busy = false;
  });
  root.AmanAdminSupport = { inbox, ticket, promos, promoForm, coupons, couponForm };
})(window);
