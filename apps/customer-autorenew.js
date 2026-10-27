/* AMAN Customer — التجديد التلقائي (U15: بنود 29 و62 و84) داخل شاشة «الاشتراكات».
   تُحمَّل بعد customer-screens.js وقبل customer.js؛ تلتف حول AmanCustomerScreens.build وتُلحق قسمًا بمسار subscriptions فقط.
   تظهر الميزة لأرقام العميل ذات الاشتراك الساري باسمه في شركة سمحت بها الإدارة وربطتها بتصنيف.
   الشارة (29) لا تظهر إلا للرقم المفعّل فعليًا. لا استيراد من تطبيق الإدارة. */
(function (root) {
  'use strict';
  const D = root.AmanData, U = root.AmanUI, K = root.AmanCustomerKit, S = root.AmanCustomerScreens, AR = root.AmanAutoRenew, X = root.AmanExpiry;
  if (!D || !K || !S || !AR || !X || typeof S.build !== 'function') return;
  const E = K.esc, N = U.fmt;

  function block(db, me) {
    const items = [];
    for (const n of D.customerNumbers(me, db)) {
      const sub = D.activeSubscription(db, n.id);
      if (!sub || sub.customerId !== me || !AR.companyAllowed(db, n.companyId)) continue;
      const cc = X.forCompany(db, n.companyId), cls = cc.classes.find(k => k.id === cc.autoRenewClassId);
      if (!cls) continue;
      items.push({ n, sub, cls, on: AR.badgeFor(db, n.id, me), packs: db.protectionPackages.filter(p => p.companyId === n.companyId && p.active !== false) });
    }
    if (!items.length) return '';
    const o = AR.cfg(db).optIns;
    const rows = items.map(({ n, sub, cls, on, packs }) => {
      const pk = packs.find(p => p.id === o[n.id]?.packageId);
      const head = K.row({ icon: 'repeat', tone: on ? 'ok' : '', title: n.number, ltr: true, sub: on ? `يُمدَّد تلقائيًا عند دخول «${E(cls.name)}» (≤ ${N(cls.upToDays)} يوم) بباقة ${E(pk ? pk.name : '—')}${pk ? ` · ${N(pk.pointsCost)} نقطة` : ''}` : `ينتهي ${E(U.date(sub.endsAt))}`, pill: on ? K.pill('تجديد تلقائي', 'ok') : '', plain: true });
      const ctl = on ? K.btn('إيقاف التجديد التلقائي', 'ar-off', '', `data-id="${E(n.id)}"`)
        : packs.length ? `<label class="select block"><select id="ar_pkg_${E(n.id)}" aria-label="باقة التجديد للرقم ${E(n.number)}"><option value="">اختر الباقة</option>${packs.map(p => `<option value="${E(p.id)}">${E(p.name)} · ${N(p.days)} يوم · ${N(p.pointsCost)} نقطة</option>`).join('')}</select></label>${K.btn('تفعيل التجديد التلقائي', 'ar-on', 'primary', `data-id="${E(n.id)}"`)}` : K.note('لا توجد باقات حماية متاحة لهذه الشركة.');
      return `${head}<div class="rowfoot">${ctl}</div>`;
    });
    return `${K.section('التجديد التلقائي', N(items.length))}${K.card(rows)}${K.note('يُخصم رصيدك ويُمدَّد اشتراكك مرة واحدة عند دخول الاشتراك التصنيف المحدد، إن كفى رصيدك. إن لم يكفِ فلن يُخصم شيء وسيصلك إشعار. يمكنك الإيقاف في أي وقت.')}`;
  }

  const base = S.build.bind(S);
  S.build = (route, d, c, ctx) => {
    const v = base(route, d, c, ctx);
    if (route !== 'subscriptions' || !v || typeof v.html !== 'string') return v;
    try { return { ...v, html: v.html + block(D.read(), (c && c.id) || (ctx && ctx.id)) }; } catch { return v; }
  };

  const toast = (text, bad = false) => { const e = document.getElementById('toast'); if (!e) return; clearTimeout(toast.t); e.textContent = text; e.className = 'toast' + (bad ? ' error' : ''); toast.t = setTimeout(() => e.classList.add('hidden'), 4200); };
  const rerender = () => window.dispatchEvent(new PopStateEvent('popstate', { state: history.state }));
  let busy = false;
  document.addEventListener('click', async e => {
    const b = e.target.closest && e.target.closest('[data-act="ar-on"],[data-act="ar-off"]');
    if (!b || busy) return;
    const me = sessionStorage.getItem('aman.customer') || '', id = b.dataset.id;
    if (!me) return;
    busy = true;
    try {
      if (b.dataset.act === 'ar-on') {
        const pk = document.getElementById('ar_pkg_' + id)?.value || '';
        if (!pk) throw new Error('اختر باقة التجديد أولًا.');
        await AR.setOptIn(D, me, id, pk, true, X); toast('فُعّل التجديد التلقائي لهذا الرقم.');
      } else { await AR.setOptIn(D, me, id, null, false, X); toast('أُوقف التجديد التلقائي لهذا الرقم.'); }
      rerender();
    } catch (err) { toast(err?.message || 'تعذرت العملية.', true); }
    busy = false;
  });
  root.AmanCustomerAutoRenew = { block };
})(window);
