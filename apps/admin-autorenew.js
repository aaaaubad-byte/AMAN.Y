/* AMAN Admin — التجديد التلقائي (U15: بنود 29 و62 و84): سماح لكل شركة، حالة الربط بالتصنيف، تشغيل التقييم الآن، السجل.
   تُحمَّل بعد admin-support.js وقبل admin-routes.js وadmin.js؛ تلتف حول AmanAdminExpiry.build. المسار: autorenew
   ربط التجديد بتصنيف يتم من «تصنيفات قرب الانتهاء» (U11)؛ هنا السماح والتشغيل فقط. الكتابة عبر AmanAutoRenew (D.transact).
   التنفيذ يدوي بزر «تشغيل الآن» (لا مجدول خلفي ولا تشغيل تلقائي عند فتح الإدارة لأنه يخصم نقاط عملاء). */
(function (root) {
  'use strict';
  const D = root.AmanData, U = root.AmanUI, K = root.AmanAdminKit, M = root.AmanAdminModel, AR = root.AmanAutoRenew, X = root.AmanExpiry, EXP = root.AmanAdminExpiry;
  if (!D || !K || !AR || !X || !EXP) return;
  const E = K.esc, N = U.fmt, ADMIN = 'admin-local';
  const small = t => `<small style="display:block;line-height:1.9;margin-top:4px">${t}</small>`;
  const stamp = iso => { try { return new Date(iso).toLocaleString('ar-YE-u-nu-latn', { timeZone: 'Asia/Aden', dateStyle: 'medium', timeStyle: 'short' }); } catch { return String(iso || '').slice(0, 16); } };
  const RES = { renewed: ['تم', 'ok'], failed: ['فشل', 'bad'] };

  function screen(d) {
    const cfg = AR.cfg(d), opt = Object.values(cfg.optIns).filter(o => o.enabled === true);
    const rows = d.companies.map(co => {
      const cc = X.forCompany(d, co.id), cls = cc.classes.find(k => k.id === cc.autoRenewClassId), on = AR.companyAllowed(d, co.id);
      const nOpt = Object.entries(cfg.optIns).filter(([nid, o]) => o.enabled === true && (d.numbers.find(n => n.id === nid) || {}).companyId === co.id).length;
      const sub = cls ? `التصنيف المربوط: ${E(cls.name)} (≤ ${N(cls.upToDays)} يوم) · مفعّل على ${N(nOpt)} رقم` : 'لم يُربط تصنيف؛ اربطه من «تصنيفات قرب الانتهاء» أولًا.';
      return K.row({ icon: 'repeat', tone: on ? 'ok' : '', title: co.name, sub, pill: K.pill(on ? 'مسموح' : 'غير مسموح', on ? 'ok' : ''), plain: true })
        + `<div class="rowfoot">${K.btn(on ? 'منع التجديد التلقائي' : 'السماح بالتجديد التلقائي', 'ar-allow', on ? '' : 'primary', `data-id="${E(co.id)}" data-to="${on ? 'off' : 'on'}"`)}${K.btn('تصنيفات الشركة', 'go', '', `data-to="expiry/${E(co.id)}"`)}</div>`;
    });
    const log = AR.logList(d, 30).map(l => { const n = d.numbers.find(x => x.id === l.numberId), [lab, tone] = RES[l.result] || [l.result, '']; return K.row({ icon: 'clock', title: n ? n.number : l.numberId, ltr: true, sub: E(l.message || ''), sub2: E(stamp(l.at)), pill: K.pill(lab, tone), plain: true }); });
    return { chrome: 'focus', title: 'التجديد التلقائي', sub: `${N(opt.length)} رقم مفعّل`, bar: '', html: `${K.callout('info', 'كيف يعمل؟', small('تسمح الإدارة بالميزة لكل شركة وتربطها بتصنيف قرب انتهاء. يفعّلها العميل على رقمه باختيار باقة حماية. عند دخول اشتراكه ساري المفعول ذلك التصنيف وتوفر رصيده يُمدَّد اشتراكه بتلك الباقة مرة واحدة (مفتاح منع تكرار)؛ عند عدم كفاية الرصيد لا يُخصم شيء ويُسجَّل السبب ويُشعَر العميل مرة واحدة. لا مجدول خلفي: ينفّذ زر «تشغيل الآن» فقط، ولا يتكرر تجديد الرقم الواحد أكثر من مرة كل 24 ساعة.'))}${K.section('الشركات', N(rows.length))}${rows.length ? K.card(rows) : K.empty('لا توجد شركات بعد.', 'building', 'لا توجد شركات')}${K.section('التنفيذ')}<div>${K.btn('تشغيل التجديد التلقائي الآن', 'ar-run', 'primary', '', 'repeat')}</div>${K.note('يخصم نقاط العملاء المؤهلين المفعّلين فعليًا. لا تتكرر العملية على الاشتراك نفسه.')}${K.section('سجل التنفيذ', N(log.length))}${log.length ? K.card(log) : K.empty('لم يُنفَّذ تجديد تلقائي بعد.', 'clock', 'لا توجد أحداث')}` };
  }

  const base = EXP.build;
  EXP.build = (route, d, ui) => {
    if (String(route || '').split('/')[0] === 'autorenew') return screen(d);
    const v = base(route, d, ui);
    if (route === 'more' && v) return { ...v, html: v.html + K.section('التجديد التلقائي') + K.card([K.row({ icon: 'repeat', title: 'التجديد التلقائي', sub: 'سماح الشركات وتشغيل التجديد وسجله', to: 'autorenew' })]) };
    return v;
  };

  const toast = (text, bad = false) => { const e = document.getElementById('toast'); if (!e) return; clearTimeout(toast.t); e.textContent = text; e.className = 'toast' + (bad ? ' error' : ''); toast.t = setTimeout(() => e.classList.add('hidden'), 4600); };
  const rerender = () => window.dispatchEvent(new PopStateEvent('popstate', { state: history.state }));
  let busy = false;
  document.addEventListener('click', async e => {
    const b = e.target.closest && e.target.closest('[data-act^="ar-"]');
    if (!b || busy) return;
    busy = true;
    try {
      if (b.dataset.act === 'ar-allow') { await AR.setCompanyAllowed(D, ADMIN, b.dataset.id, b.dataset.to === 'on', X); toast(b.dataset.to === 'on' ? 'سُمح بالتجديد التلقائي للشركة.' : 'مُنع التجديد التلقائي للشركة.'); rerender(); }
      else if (b.dataset.act === 'ar-run') {
        const r = await AR.run(D, X);
        toast(r.renewed || r.failed ? `جُدّد ${N(r.renewed)} رقم، وتعذر ${N(r.failed)}.` + (r.guarded ? ` وحُجب ${N(r.guarded)} لتجديدها مؤخرًا.` : '') : r.guarded ? `لم يُنفَّذ تجديد جديد: ${N(r.guarded)} رقم جُدّد مؤخرًا أو قيد التنفيذ (حد أقصى مرة كل 24 ساعة لكل رقم).` : 'لا توجد أرقام مؤهلة الآن.', r.failed > 0 && !r.renewed); rerender();
      }
    } catch (err) { toast(err?.message || 'تعذرت العملية.', true); }
    busy = false;
  });
  root.AmanAdminAutoRenew = { screen };
})(window);
