/* AMAN Admin — شاشات التقارير المالية والإقفال اليومي (U12: بنود 12 و51 و71 و73 و97 و98).
   تُحمَّل بعد admin-expiry.js وقبل admin.js؛ تلتف حول AmanAdminExpiry.build فتتولى المسارات:
     reports[/<نطاق>[/<دورة>]] · reports/custom/<من>/<إلى>[/<دورة>] · daily-close · daily-close/<يوم>
   وتضيف مداخل إلى «المزيد» و«المالية». الكتابة كلها عبر AmanReports.closeDay/reopenDay (D.transact).
   PDF = طباعة المتصفح (حفظ كـPDF)؛ لا مولّد PDF مضمّن. */
(function (root) {
  'use strict';
  const D = root.AmanData, U = root.AmanUI, K = root.AmanAdminKit, M = root.AmanAdminModel, S = root.AmanAdminScreens, R = root.AmanReports, EXP = root.AmanAdminExpiry;
  if (!D || !K || !R || !EXP || !S) return;
  const E = K.esc, N = U.fmt, ADMIN = 'admin-demo';
  const money = v => `${v < 0 ? '−' : ''}${N(Math.abs(v))} ر.ي`;
  const small = t => `<small style="display:block;line-height:1.9;margin-top:4px">${t}</small>`;
  const stamp = iso => { try { return new Date(iso).toLocaleString('ar-YE-u-nu-latn', { timeZone: 'Asia/Aden', dateStyle: 'medium', timeStyle: 'short' }); } catch { return String(iso).slice(0, 16); } };
  const failView = (title, msg) => ({ chrome: 'focus', title, html: K.empty(msg, 'info', 'تعذر العرض', K.btn('العودة إلى المالية', 'go', '', 'data-to="finance"')), bar: '' });

  /* ----- التقارير ----- */
  function parse(route) {
    const s = route.split('/'), key = s[1] || '30d';
    return key === 'custom' ? { key, custom: { from: s[2], to: s[3] }, bucket: s[4] || '' } : { key, custom: {}, bucket: s[2] || '' };
  }
  const routeOf = (rg, bucket) => `reports/${rg.key}${rg.key === 'custom' ? `/${rg.from}/${rg.to}` : ''}${bucket ? '/' + bucket : ''}`;
  const chip = (label, to, on) => `<button type="button" class="tpl-chip" data-act="fin-nav" data-to="${E(to)}" aria-pressed="${on ? 'true' : 'false'}" ${on ? 'style="border-color:var(--ink);font-weight:700"' : ''}>${E(label)}</button>`;

  function chart(rows) {
    const W = 320, H = 150, p = 20, n = rows.length;
    if (!n) return '';
    const max = Math.max(1, ...rows.flatMap(r => [r.revenue, r.expense])), slot = (W - 2 * p) / n, bw = Math.max(1, Math.min(14, slot / 2.4)), ph = H - 2 * p;
    const bars = rows.map((r, i) => {
      const x = p + slot * i + slot / 2, rh = (r.revenue / max) * ph, eh = (r.expense / max) * ph;
      return `<rect x="${(x - bw).toFixed(1)}" y="${(H - p - rh).toFixed(1)}" width="${bw.toFixed(1)}" height="${rh.toFixed(1)}" fill="#1da57c"/><rect x="${x.toFixed(1)}" y="${(H - p - eh).toFixed(1)}" width="${bw.toFixed(1)}" height="${eh.toFixed(1)}" fill="#d4493d"/>`;
    }).join('');
    const lab = (t, x, anchor) => `<text x="${x}" y="${H - 4}" font-size="9" fill="#737d87" text-anchor="${anchor}">${E(t)}</text>`;
    return `<div style="direction:ltr;overflow-x:auto"><svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="رسم الإيرادات والمصروفات حسب الفترة، الأقصى ${E(String(max))} ريال"><line x1="${p}" y1="${H - p}" x2="${W - p}" y2="${H - p}" stroke="#c2c4c4"/>${bars}${lab(rows[0].from, p, 'start')}${n > 1 ? lab(rows[n - 1].to, W - p, 'end') : ''}</svg></div>
<p class="note" style="display:flex;gap:14px;align-items:center"><span><i style="display:inline-block;width:10px;height:10px;background:#1da57c;border-radius:2px"></i> إيراد</span><span><i style="display:inline-block;width:10px;height:10px;background:#d4493d;border-radius:2px"></i> مصروف</span><span>أعلى عمود = ${money(max)}</span></p>`;
  }

  function reports(d, route) {
    const q = parse(route);
    let rg;
    try { rg = R.rangeFor(q.key, q.custom); } catch (e) {
      if (q.key === 'custom') return { chrome: 'focus', title: 'التقارير المالية', sub: 'نطاق غير صالح', html: `${K.callout('info', 'تعذر تطبيق النطاق', small(E(e.message)))}<div style="margin-top:12px">${K.btn('العودة إلى آخر 30 يومًا', 'fin-nav', 'primary', 'data-to="reports/30d"')}</div>`, bar: '' };
      return failView('التقارير المالية', e.message);
    }
    const bucket = R.BUCKETS.some(b => b[0] === q.bucket) ? q.bucket : R.autoBucket(rg.days);
    const sum = R.summarize(d.financeEntries, rg.from, rg.to), rows = R.series(d.financeEntries, rg.from, rg.to, bucket), eff = rows[0]?.bucket || bucket;
    const ranges = `<div class="tpl-chips no-print" role="group" aria-label="نطاق التاريخ">${R.RANGES.filter(r => r[0] !== 'custom').map(([k, l]) => chip(l, `reports/${k}`, q.key === k)).join('')}${chip('نطاق مخصص', routeOf({ key: 'custom', from: rg.from, to: rg.to }, ''), q.key === 'custom')}</div>`;
    const custom = q.key === 'custom' ? `<div class="no-print" style="margin-top:10px">${K.fields(K.field({ name: 'from', label: 'من تاريخ', type: 'date', value: rg.from }) + K.field({ name: 'to', label: 'إلى تاريخ', type: 'date', value: rg.to }))}<div style="margin-top:8px">${K.btn('تطبيق النطاق', 'fin-apply', 'primary', `data-bucket="${E(q.bucket)}"`)}</div></div>` : '';
    const buckets = `<div class="tpl-chips no-print" role="group" aria-label="دورة التقرير">${R.BUCKETS.map(([k, l]) => chip(l, routeOf(rg, k), eff === k)).join('')}</div>`;
    const shown = rows.slice().reverse().slice(0, 60);
    const periodic = rows.length ? K.card(shown.map(r => K.row({ icon: 'receipt', tone: r.net >= 0 ? 'ok' : 'warn', title: r.label, ltr: true, sub: `إيراد ${money(r.revenue)} · مصروف ${money(r.expense)}`, sub2: `${N(r.count)} قيد`, val: money(r.net), plain: true }))) + (rows.length > 60 ? K.note(`عُرضت أحدث 60 فترة من ${N(rows.length)}؛ يشمل التصدير كل القيود.`) : '') : K.empty('لا توجد فترات.', 'receipt');
    const html = `${ranges}${custom}
<p class="note">${E(rg.from)} ← ${E(rg.to)} · ${N(rg.days)} يومًا · بتوقيت صنعاء · الريال اليمني فقط</p>
${K.metrics([['الإيرادات', money(sum.revenue)], ['المصروفات', money(sum.expense)], ['الصافي', money(sum.net)]])}
<p class="note">${N(sum.count)} قيد في النطاق، وتشمل القيود العكسية التي تلغي أثر الأصل في الصافي دون حذف أي قيد.</p>
${sum.count ? K.section('الرسم') + chart(rows) : ''}
${K.section('التقرير الدوري')}${buckets}${sum.count ? periodic : K.empty('لا توجد قيود مالية في هذا النطاق.', 'receipt', 'لا توجد بيانات')}
<div class="no-print" style="margin-top:14px">${K.btn('تصدير CSV', 'fin-csv', '', `data-from="${E(rg.from)}" data-to="${E(rg.to)}"`, 'doc')}${K.btn('طباعة / حفظ PDF', 'fin-print', '', '', 'receipt')}</div>
<p class="note no-print">ملف CSV يضم قيود النطاق بتوقيت صنعاء ويُفتح في Excel بالعربية. «حفظ PDF» يفتح نافذة طباعة المتصفح؛ اختر منها «حفظ بصيغة PDF».</p>`;
    return { chrome: 'focus', title: 'التقارير المالية', sub: `${E(rg.from)} ← ${E(rg.to)}`, html, bar: '' };
  }

  /* ----- الإقفال اليومي ----- */
  const STATE = { open: ['مفتوح', ''], closed: ['مقفل', 'ok'], reopened: ['أُعيد فتحه', 'warn'] };
  function dailyList(d) {
    const today = R.dayKey(), days = Array.from({ length: 31 }, (_, i) => R.addDays(today, -i));
    for (const c of R.closes(d)) if (!days.includes(c.day)) days.push(c.day);
    days.sort().reverse();
    const closedN = R.closes(d).filter(c => c.status === 'closed').length;
    const rows = days.map(day => {
      const st = R.dayStatus(d, day), s = st.current, [lab, tone] = STATE[st.state];
      return K.row({ icon: st.state === 'closed' ? 'lock' : 'receipt', tone: st.changed ? 'warn' : tone, title: day + (day === today ? ' · اليوم' : ''), ltr: true, sub: `إيراد ${money(s.revenue)} · مصروف ${money(s.expense)}`, sub2: `${N(s.count)} قيد`, pill: st.changed ? K.pill('تغيّر بعد الإقفال', 'bad') : K.pill(lab, tone), to: `daily-close/${day}` });
    });
    return { chrome: 'focus', title: 'الإقفال اليومي', sub: `${N(closedN)} يوم مقفل`, html: `${K.callout('info', 'كيف يعمل الإقفال؟', small('يثبّت إقفال اليوم لقطة بإيراده ومصروفه وعدد قيوده بتوقيت صنعاء. اليوم المقفل لا تُضاف إليه قيود جديدة: يُمنع القيد اليدوي والعكس واعتماد طلب نقاط وتنفيذ مهمة حتى تُعاد فتحه. إعادة الفتح تتطلب سببًا وتُحفظ لقطة الإقفال السابقة في سجل اليوم.'))}${K.section('الأيام', N(days.length))}${K.card(rows)}`, bar: '' };
  }
  function dayScreen(d, day) {
    if (!R.validKey(day) || day > R.dayKey()) return failView('الإقفال اليومي', 'تاريخ اليوم غير صالح.');
    const st = R.dayStatus(d, day), s = st.current, [lab, tone] = STATE[st.state], c = st.close;
    const entries = d.financeEntries.filter(e => R.dayKey(e.createdAt) === day).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const kv = K.kv([['الحالة', E(lab)], ['الإيرادات', money(s.revenue)], ['المصروفات', money(s.expense)], ['الصافي', money(s.net)], ['عدد القيود', N(s.count)]]);
    const warn = st.changed ? K.callout('info', 'تغيّرت القيود بعد الإقفال', small(`لقطة الإقفال: إيراد ${money(c.revenue)} · مصروف ${money(c.expense)} · ${N(c.count)} قيد. أعد فتح اليوم بسبب موثق ثم أقفله من جديد لتثبيت الأرقام الحالية.`)) : '';
    let action;
    if (st.state === 'closed') action = `${K.callout('info', 'اليوم مقفل', small(`أُقفل ${E(stamp(c.closedAt))}. لا تُقبل قيود جديدة اليوم حتى تُعاد فتحه.`))}${K.fields(K.field({ name: 'reason', label: 'سبب إعادة الفتح (تصحيح موثق)', type: 'textarea', rows: 3, help: `إلزامي، حتى ${R.REASON_MAX} حرفًا، ويُحفظ في سجل اليوم.` }))}<div style="margin-top:8px">${K.btn('إعادة فتح اليوم', 'fin-reopen', 'primary', `data-day="${E(day)}"`, 'repeat')}</div>`;
    else action = `<div style="margin-top:8px">${K.btn('إقفال اليوم', 'fin-close', 'primary', `data-day="${E(day)}"`, 'lock')}</div>`;
    const hist = (c?.history || []).slice().reverse().map(h => K.row({ icon: h.type === 'close' ? 'lock' : 'repeat', title: h.type === 'close' ? 'إقفال' : 'إعادة فتح', sub: E(stamp(h.at)), sub2: h.type === 'reopen' ? E(h.reason || '') : `إيراد ${money(h.snapshot?.revenue || 0)} · مصروف ${money(h.snapshot?.expense || 0)}`, plain: true }));
    const list = entries.length ? K.card(entries.map(e => K.row({ icon: 'receipt', tone: e.kind === 'revenue' ? 'ok' : '', title: (e.description || e.id), sub: `${e.kind === 'revenue' ? 'إيراد' : 'مصروف'} · ${E(R.SOURCE_LABEL[e.sourceType] || '')}`, val: money(e.kind === 'revenue' ? Number(e.amount) : -Number(e.amount)), to: `finance-entry/${e.id}` }))) : K.empty('لا توجد قيود في هذا اليوم.', 'receipt');
    return { chrome: 'focus', title: 'يوم ' + day, sub: lab, html: `${kv}${warn}${K.section('الإجراء')}${action}${hist.length ? K.section('سجل اليوم') + K.card(hist) : ''}${K.section('قيود اليوم', N(entries.length))}${list}`, bar: '' };
  }

  /* ----- المداخل ----- */
  function entryRows() {
    return [K.row({ icon: 'doc', title: 'التقارير المالية', sub: 'نطاقات التاريخ والرسم والتقرير الدوري والتصدير', to: 'reports' }), K.row({ icon: 'lock', title: 'الإقفال اليومي', sub: 'تثبيت أرقام اليوم وتصحيحها بسبب موثق', to: 'daily-close' })];
  }
  function decorate(v) { return v ? { ...v, html: v.html + K.section('التقارير والإقفال') + K.card(entryRows()) } : v; }

  const base = EXP.build;
  EXP.build = (route, d, ui) => {
    const name = String(route || '').split('/')[0];
    if (name === 'reports') return reports(d, route);
    if (name === 'daily-close') { const day = route.split('/')[1]; return day ? dayScreen(d, day) : dailyList(d); }
    if (route === 'finance') return decorate(base(route, d, ui) || S.build(route, d, ui));
    if (route === 'more') return decorate(base(route, d, ui));
    return base(route, d, ui);
  };

  /* ----- الإجراءات ----- */
  const toast = (text, bad = false) => {
    const e = document.getElementById('toast'); if (!e) return;
    clearTimeout(toast.t); e.textContent = text; e.className = 'toast' + (bad ? ' error' : '');
    toast.t = setTimeout(() => e.classList.add('hidden'), 4200);
  };
  const rerender = () => window.dispatchEvent(new PopStateEvent('popstate', { state: history.state }));
  function nav(to) {
    const st = history.state;
    history.replaceState({ amanAdmin: true, route: to, d: st && st.amanAdmin ? st.d || 0 : 0 }, '', '#/' + to);
    rerender();
  }
  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type })), a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  let busy = false;
  document.addEventListener('click', async e => {
    const b = e.target.closest && e.target.closest('[data-act^="fin-"]');
    if (!b || busy) return;
    const a = b.dataset.act;
    try {
      if (a === 'fin-nav') return nav(b.dataset.to);
      if (a === 'fin-print') return root.print();
      if (a === 'fin-apply') {
        const from = document.getElementById('f_from')?.value || '', to = document.getElementById('f_to')?.value || '';
        R.rangeFor('custom', { from, to });
        return nav(`reports/custom/${from}/${to}${b.dataset.bucket ? '/' + b.dataset.bucket : ''}`);
      }
      if (a === 'fin-csv') {
        const { from, to } = b.dataset;
        download(`aman-finance-${from}_${to}.csv`, R.csvText(D.read().financeEntries, from, to), 'text/csv;charset=utf-8');
        return toast('تم تنزيل ملف CSV للقيود في النطاق.');
      }
      if (a === 'fin-close' || a === 'fin-reopen') {
        busy = true;
        if (a === 'fin-close') { await R.closeDay(D, ADMIN, b.dataset.day); toast('أُقفل اليوم وحُفظت لقطة أرقامه.'); }
        else { await R.reopenDay(D, ADMIN, b.dataset.day, document.getElementById('f_reason')?.value || ''); toast('أُعيد فتح اليوم وسُجل السبب ولقطة الإقفال السابقة.'); }
        busy = false; rerender();
      }
    } catch (err) { busy = false; toast(err?.message || 'تعذرت العملية.', true); }
  });

  // اليوم المقفل لا يستقبل قيودًا جديدة: القيد اليدوي والعكس واعتماد طلب نقاط وتنفيذ مهمة (التقاط مبكر قبل معالجات admin.js)
  const block = e => { e.preventDefault(); e.stopImmediatePropagation(); toast('اليوم مقفل: لا تُقبل قيود مالية جديدة. أعد فتح اليوم من «الإقفال اليومي» بسبب موثق أولًا.', true); };
  document.addEventListener('submit', e => {
    const k = e.target?.dataset?.form;
    if ((k === 'finance-add' || k === 'finance-reverse') && R.todayClosed(D.read())) block(e);
  }, true);
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('[data-act="execute-confirm"],[data-act="review-confirm"]');
    if (!b) return;
    if (b.dataset.act === 'review-confirm' && b.dataset.decision !== 'approved') return;
    if (R.todayClosed(D.read())) block(e);
  }, true);

  if (!document.getElementById('fin-print-css')) {
    const st = document.createElement('style'); st.id = 'fin-print-css';
    st.textContent = '@media print{#tabbar,#bar,#toast,#netbar,#sheetRoot,.no-print{display:none!important}html,body,.phone,.screen{height:auto!important;max-height:none!important;overflow:visible!important;position:static!important}}';
    document.head.appendChild(st);
  }
  root.AmanAdminFinance = { reports, dailyList, dayScreen, parse, routeOf };
})(window);
