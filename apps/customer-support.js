/* AMAN Customer — الدعم والقسائم والعروض (U14: بنود 67 و68 و83) داخل شاشة «المساعدة».
   تُحمَّل بعد customer-screens.js وقبل customer.js؛ تلتف حول AmanCustomerScreens.build وتُلحق أقسامًا بمسار help فقط
   (لا مسارات جديدة ولا تعديل على customer.js). الكتابة كلها عبر AmanSupport (D.transact).
   العميل يرى تذاكره وعروضًا سارية وقسائمه فقط عبر AmanSupport.customerView؛ الملاحظات الداخلية لا تصله أبدًا.
   لا يستورد شيئًا من تطبيق الإدارة. */
(function (root) {
  'use strict';
  const D = root.AmanData, U = root.AmanUI, K = root.AmanCustomerKit, S = root.AmanCustomerScreens, SP = root.AmanSupport;
  if (!D || !K || !S || !SP || typeof S.build !== 'function') return;
  const E = K.esc, N = U.fmt;
  const st = { open: '', compose: false };
  const stamp = iso => { try { return new Date(iso).toLocaleString('ar-YE-u-nu-latn', { timeZone: 'Asia/Aden', dateStyle: 'medium', timeStyle: 'short' }); } catch { return String(iso || '').slice(0, 16); } };
  const TONE = { open: 'warn', answered: 'ok', closed: '' };
  const area = (id, label, rows, help) => `<div class="field"><label for="${id}">${E(label)}</label><textarea id="${id}" rows="${rows}" maxlength="${SP.LIM.text}" aria-describedby="${id}-err"></textarea>${help ? `<small>${E(help)}</small>` : ''}<small class="ferr hidden" id="${id}-err" role="alert"></small></div>`;
  const bubble = m => `<div style="margin:8px 0;padding:10px 12px;border-radius:12px;border:1px solid rgba(128,128,128,.3);${m.from === 'admin' ? 'margin-inline-start:24px' : 'margin-inline-end:24px'}"><small style="display:block;opacity:.7">${m.from === 'admin' ? 'الدعم' : 'أنت'} · ${E(stamp(m.at))}</small><div style="white-space:pre-wrap;line-height:1.8">${E(m.text)}</div></div>`;

  function ticketsBlock(v) {
    if (st.compose) return `${K.section('تذكرة جديدة')}${K.fields(K.field({ id: 'cs_subject', name: 'subject', label: 'العنوان', required: true }) + area('cs_body', 'رسالتك', 5, `حتى ${SP.LIM.text} حرفًا.`))}<div style="margin-top:8px">${K.btn('إرسال التذكرة', 'cs-send', 'primary')}${K.btn('إلغاء', 'cs-cancel')}</div>`;
    const t = st.open && v.tickets.find(x => x.id === st.open);
    if (t) {
      const closed = t.status === 'closed';
      return `${K.section(t.subject)}${K.note(SP.TICKET_STATUS[t.status])}${t.messages.map(bubble).join('')}${closed ? K.note('التذكرة مغلقة. افتح تذكرة جديدة إن احتجت مساعدة أخرى.') : `${K.fields(area('cs_reply', 'ردك', 3))}<div style="margin-top:8px">${K.btn('إرسال الرد', 'cs-reply', 'primary', `data-id="${E(t.id)}"`)}</div>`}<div style="margin-top:8px">${K.btn('كل التذاكر', 'cs-list')}</div>`;
    }
    const rows = v.tickets.map(x => K.row({ icon: 'inbox', tone: x.unreadCustomer ? 'warn' : '', title: x.subject, sub: E(SP.TICKET_STATUS[x.status]), sub2: E(stamp(SP.lastAt(x))), pill: x.unreadCustomer ? K.pill('رد جديد', 'bad') : K.pill(SP.TICKET_STATUS[x.status], TONE[x.status]), act: 'cs-open', attrs: `data-id="${E(x.id)}"` }));
    return `${K.section('الدعم', N(v.tickets.length))}${rows.length ? K.card(rows) : K.empty('لم تفتح أي تذكرة بعد. اكتب لنا إن احتجت مساعدة.', 'inbox', 'لا توجد تذاكر')}<div style="margin-top:8px">${K.btn('تذكرة جديدة', 'cs-new', 'primary', '', 'plus')}</div>`;
  }
  function couponBlock(v) {
    const used = v.redemptions.length ? K.card(v.redemptions.slice().reverse().map(r => K.row({ icon: 'check', title: r.code, ltr: true, sub: E(stamp(r.at)), val: `+${N(r.points)} نقطة`, plain: true }))) : '';
    return `${K.section('قسيمة نقاط')}${v.locked ? K.note('محاولات خاطئة كثيرة؛ حاول لاحقًا.') : ''}${K.fields(K.field({ id: 'cs_code', name: 'code', label: 'رمز القسيمة', dir: 'ltr', autocomplete: 'off' }))}<div style="margin-top:8px">${K.btn('استخدام القسيمة', 'cs-redeem', 'primary')}</div>${K.note('لكل قسيمة استخدام واحد لكل حساب، وتُضاف نقاطها إلى رصيدك دون أي رسوم.')}${used}`;
  }
  function promoBlock(v) {
    if (!v.promotions.length) return '';
    return `${K.section('عروض سارية', N(v.promotions.length))}${K.card(v.promotions.map(p => K.row({ icon: 'check', tone: p.awarded ? 'ok' : '', title: p.title, sub: `${E(p.description)}<br>المطلوب: ${E(p.actionLabel)}${p.conditions ? `<br>الشروط: ${E(p.conditions)}` : ''}`, sub2: p.endsAt ? `ينتهي ${E(p.endsAt)}` : '', pill: p.awarded ? K.pill('حصلت على المكافأة', 'ok') : (p.rewardPoints ? K.pill(`${N(p.rewardPoints)} نقطة`, '') : ''), plain: true })))}${K.note('تُضاف مكافأة العرض إلى رصيدك بعد أن تتحقق الإدارة من تنفيذ الإجراء المطلوب.')}`;
  }

  const base = S.build.bind(S);
  S.build = (route, d, c, ctx) => {
    const v = base(route, d, c, ctx);
    if (route !== 'help' || !v || typeof v.html !== 'string') return v;
    try {
      const view = SP.customerView(D.read(), (c && c.id) || (ctx && ctx.id), Date.now());
      return { ...v, html: v.html + ticketsBlock(view) + couponBlock(view) + promoBlock(view) };
    } catch { return v; }
  };

  /* ----- الإجراءات ----- */
  const toast = (text, bad = false) => { const e = document.getElementById('toast'); if (!e) return; clearTimeout(toast.t); e.textContent = text; e.className = 'toast' + (bad ? ' error' : ''); toast.t = setTimeout(() => e.classList.add('hidden'), 4200); };
  const rerender = () => window.dispatchEvent(new PopStateEvent('popstate', { state: history.state }));
  const me = () => sessionStorage.getItem('aman.customer') || '';
  const val = id => document.getElementById(id)?.value ?? '';
  let busy = false;
  document.addEventListener('click', async e => {
    const b = e.target.closest && e.target.closest('[data-act^="cs-"]');
    if (!b || busy) return;
    const a = b.dataset.act, id = b.dataset.id || '', who = me();
    if (!who) return;
    busy = true;
    try {
      if (a === 'cs-new') { st.compose = true; st.open = ''; rerender(); }
      else if (a === 'cs-cancel') { st.compose = false; rerender(); }
      else if (a === 'cs-list') { st.open = ''; rerender(); }
      else if (a === 'cs-open') { await SP.markRead(D, who, id, 'customer'); st.open = id; st.compose = false; rerender(); }
      else if (a === 'cs-send') {
        const r = await SP.createTicket(D, who, { subject: val('cs_subject'), body: val('cs_body') });
        st.compose = false; st.open = r.result.entityId; toast('أُرسلت تذكرتك. سيصلك إشعار عند الرد.'); rerender();
      }
      else if (a === 'cs-reply') { await SP.customerReply(D, who, id, val('cs_reply')); toast('أُرسل ردك.'); rerender(); }
      else if (a === 'cs-redeem') { const r = await SP.redeemCoupon(D, who, val('cs_code')); toast(`أُضيفت ${N(r.points)} نقطة إلى رصيدك.`); rerender(); }
    } catch (err) { toast(err?.message || 'تعذرت العملية.', true); }
    busy = false;
  });
  root.AmanCustomerSupport = { state: st };
})(window);
