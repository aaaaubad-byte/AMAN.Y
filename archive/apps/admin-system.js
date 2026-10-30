/* AMAN Admin — شاشات النظام (U13): حالة النظام، فحوص السلامة، النسخ الاحتياطي والاستيراد، مطابقة المدفوعات،
   سجل تغييرات الإعدادات، سلة المحذوفات، كلمة مرور الإدارة. تُحمَّل بعد admin-finance.js وقبل admin.js.
   المسارات: system · system/integrity · system/backup · system/backup/preview · system/reconcile[/<نطاق>] · system/settings-log · system/trash · system/password */
(function (root) {
  'use strict';
  const D = root.AmanData, U = root.AmanUI, K = root.AmanAdminKit, S = root.AmanAdminScreens, R = root.AmanReports, Sys = root.AmanSystem, X = root.AmanExpiry, EXP = root.AmanAdminExpiry;
  if (!D || !K || !Sys || !EXP) return;
  const E = K.esc, N = U.fmt, ADMIN = 'admin-local';
  const money = v => `${v < 0 ? '−' : ''}${N(Math.abs(v))} ر.ي`;
  const small = t => `<small style="display:block;line-height:1.9;margin-top:4px">${t}</small>`;
  const stamp = iso => { try { return new Date(iso).toLocaleString('ar-YE-u-nu-latn', { timeZone: 'Asia/Aden', dateStyle: 'medium', timeStyle: 'short' }); } catch { return String(iso || '').slice(0, 16); } };
  const LABEL = { customers: 'العملاء', companies: 'الشركات', packages: 'باقات النقاط', protectionPackages: 'باقات الحماية', paymentMethods: 'وسائل الدفع', purchaseRequests: 'طلبات الشراء', numbers: 'الأرقام', numberLinks: 'روابط الأرقام', subscriptions: 'الاشتراكات', protectionOperations: 'عمليات الحماية', pointTransactions: 'حركات النقاط', tasks: 'المهام', operations: 'سجل العمليات', financeEntries: 'القيود المالية', notifications: 'الإشعارات', idempotencyKeys: 'مفاتيح منع التكرار', internalNotes: 'الملاحظات الداخلية', messageTemplates: 'القوالب' };
  const KIND = { template: 'قالب', note: 'ملاحظة داخلية', expiryClass: 'تصنيف قرب انتهاء' };
  const view = (title, sub, html) => ({ chrome: 'focus', title, sub, html, bar: '' });
  const bytes = n => (n > 1048576 ? `${(n / 1048576).toFixed(1)} ميغابايت` : `${Math.max(1, Math.round(n / 1024))} كيلوبايت`);
  const chip = (label, act, attrs, on) => `<button type="button" class="tpl-chip" data-act="${act}" ${attrs} aria-pressed="${on ? 'true' : 'false'}" ${on ? 'style="border-color:var(--ink);font-weight:700"' : ''}>${E(label)}</button>`;

  let pending = null, opt = { mode: 'merge', conflicts: 'keep' };

  function hub(d) {
    const st = Sys.systemStatus(d), bk = Sys.backupStatus(d);
    const rows = [
      K.row({ icon: 'shield', tone: st.errors ? 'warn' : 'ok', title: 'فحوص سلامة البيانات', sub: st.errors || st.warnings ? `${N(st.errors)} خطأ · ${N(st.warnings)} تنبيه` : 'لا توجد مشكلات', to: 'system/integrity' }),
      K.row({ icon: 'doc', tone: bk.due ? 'warn' : '', title: 'النسخ الاحتياطي والاستيراد', sub: bk.lastAt ? `آخر تصدير ${stamp(bk.lastAt)}` : 'لم يُصدَّر أي نسخة بعد', to: 'system/backup' }),
      K.row({ icon: 'wallet', title: 'مطابقة المدفوعات', sub: 'طلبات الشراء مقابل قيود الإيراد لكل وسيلة دفع', to: 'system/reconcile' }),
      K.row({ icon: 'clock', title: 'سجل تغييرات الإعدادات', sub: 'من غيّر ماذا ومتى', to: 'system/settings-log' }),
      K.row({ icon: 'repeat', title: 'سلة المحذوفات', sub: `${N(st.trash)} عنصر قابل للاستعادة`, to: 'system/trash' }),
      K.row({ icon: 'lock', title: 'كلمة مرور الإدارة', sub: Sys.adminHash(d) ? 'تم تعيين كلمة مرور محلية' : 'لم تُعيّن بعد', to: 'system/password' })
    ];
    return view('النظام', 'حالة النظام المحلي', `${K.kv([['إصدار البنية', N(st.schemaVersion)], ['رقم المراجعة', N(st.revision)], ['آخر تحديث', E(stamp(st.updatedAt))], ['حجم البيانات', bytes(st.bytes)], ['العملاء', N(st.counts.customers)], ['الأرقام', N(st.counts.numbers)], ['الاشتراكات', N(st.counts.subscriptions)], ['القيود المالية', N(st.counts.financeEntries)]])}${K.note('البيانات محفوظة في متصفح هذا الجهاز فقط. لا يوجد نسخ تلقائي ولا مزامنة؛ صدّر نسخة بانتظام.')}${K.section('الأدوات')}${K.card(rows)}`);
  }
  function integrity(d) {
    const list = Sys.checkIntegrity(d);
    if (!list.length) return view('فحوص السلامة', 'سليمة', K.empty('لم تُرصد أي مشكلة في العلاقات أو الأرصدة أو القيود.', 'shield', 'البيانات سليمة'));
    return view('فحوص السلامة', `${N(list.length)} ملاحظة`, `${K.note('الفحص للقراءة فقط ولا يصلح شيئًا تلقائيًا. صدّر نسخة قبل أي معالجة يدوية.')}${K.card(list.slice(0, 100).map(i => K.row({ icon: i.level === 'error' ? 'info' : 'clock', tone: i.level === 'error' ? 'warn' : '', title: (i.message), sub: i.ref ? `المرجع: ${E(i.ref)}` : '', pill: K.pill(i.level === 'error' ? 'خطأ' : 'تنبيه', i.level === 'error' ? 'bad' : 'warn'), plain: true })))}${list.length > 100 ? K.note(`عُرضت أول 100 من ${N(list.length)}.`) : ''}`);
  }
  function backup(d) {
    const bk = Sys.backupStatus(d);
    const due = bk.due ? K.callout('info', 'حان موعد النسخة الاحتياطية', small(bk.daysSince === null ? 'لم تُصدَّر أي نسخة بعد.' : `مضت ${N(bk.daysSince)} يومًا على آخر تصدير.`)) : '';
    return view('النسخ الاحتياطي', bk.lastAt ? `آخر تصدير ${stamp(bk.lastAt)}` : 'لم يُصدَّر بعد', `${due}${K.section('التصدير')}<div>${K.btn('تصدير نسخة كاملة (JSON)', 'export-data', 'primary', '', 'doc')}</div>${K.note('التصدير يدوي. يتتبع النظام وقت آخر تصدير فقط ولا ينسخ تلقائيًا.')}
${K.section('التذكير')}${K.fields(K.field({ name: 'days', label: 'التذكير كل (يوم)', type: 'number', min: 1, step: 1, value: bk.reminderDays ?? '', inputmode: 'numeric', help: 'اتركه فارغًا لتعطيل التذكير. لا توجد قيمة افتراضية.' }))}<div style="margin-top:8px">${K.btn('حفظ التذكير', 'sys-reminder', '', '', 'clock')}</div>
${K.section('الاستيراد')}<div class="field"><label for="sysFile">ملف نسخة احتياطية (JSON)</label><input type="file" id="sysFile" accept="application/json,.json"></div><div style="margin-top:8px">${K.btn('معاينة الملف', 'sys-preview', '', '', 'search')}</div>${K.note('لا يُكتب شيء قبل أن تراجع المعاينة وتؤكد.')}`);
  }
  function preview(d) {
    if (!pending) return view('معاينة الاستيراد', '', K.empty('اختر ملفًا أولًا.', 'doc', 'لا يوجد ملف', K.btn('العودة', 'fin-nav', 'primary', 'data-to="system/backup"')));
    let p; try { p = Sys.previewImport(d, pending.text); } catch (e) { return view('معاينة الاستيراد', E(pending.name), K.callout('info', 'تعذر قراءة الملف', small(E(e.message))) + `<div style="margin-top:12px">${K.btn('العودة', 'fin-nav', '', 'data-to="system/backup"')}</div>`); }
    const rows = p.rows.map(r => K.row({ icon: r.conflicts ? 'info' : 'doc', tone: r.conflicts ? 'warn' : '', title: LABEL[r.name] || r.name, sub: `وارد ${N(r.incoming)} · جديد ${N(r.added)} · مطابق ${N(r.same)} · تعارض ${N(r.conflicts)}`, sub2: r.conflicts ? `أمثلة: ${E(r.conflictIds.slice(0, 3).join('، '))}` : '', val: `${N(r.current)} حالي`, plain: true }));
    const rep = opt.mode === 'replace';
    return view('معاينة الاستيراد', E(pending.name), `${K.metrics([['جديد', N(p.totals.added)], ['مطابق', N(p.totals.same)], ['تعارض', N(p.totals.conflicts)]])}
${K.section('الوضع')}<div class="tpl-chips">${chip('دمج (إضافة الجديد)', 'sys-opt', 'data-k="mode" data-v="merge"', !rep)}${chip('استبدال كامل', 'sys-opt', 'data-k="mode" data-v="replace"', rep)}</div>
${rep ? K.callout('info', 'استبدال كامل', small('يُستبدل كل ما في هذا الجهاز بمحتوى الملف (بما فيه العملاء والأرصدة والقيود). صدّر نسخة من البيانات الحالية قبل المتابعة. إن كانت النتيجة غير متسقة يُرفض الاستيراد كله ولا يُحفظ شيء.')) + `<label class="toggle" style="margin-top:8px"><span>أدرك أن البيانات الحالية ستُستبدل</span><input class="switch" type="checkbox" role="switch" id="sysConfirm"></label>` : `<div class="tpl-chips" style="margin-top:8px">${chip('عند التعارض: إبقاء الحالي', 'sys-opt', 'data-k="conflicts" data-v="keep"', opt.conflicts === 'keep')}${chip('عند التعارض: استبدال بالوارد', 'sys-opt', 'data-k="conflicts" data-v="overwrite"', opt.conflicts === 'overwrite')}</div>`}
${K.section('تفصيل المجموعات')}${K.card(rows)}
<div style="margin-top:14px">${K.btn(rep ? 'استبدال البيانات' : 'تنفيذ الدمج', 'sys-import', 'primary', '', 'repeat')}${K.btn('إلغاء', 'sys-cancel', '')}</div>`);
  }
  const RK = [['7d', 'آخر 7 أيام'], ['30d', 'آخر 30 يومًا'], ['month', 'هذا الشهر'], ['lastMonth', 'الشهر الماضي']];
  function reconcile(d, route) {
    const key = RK.some(r => r[0] === route.split('/')[2]) ? route.split('/')[2] : '30d', rg = R.rangeFor(key), rec = Sys.reconcile(d, rg.from, rg.to, R.dayKey);
    const rows = rec.rows.map(m => K.row({ icon: 'wallet', tone: m.diff ? 'warn' : 'ok', title: (m.name), sub: `معتمد ${N(m.approved.n)} (${money(m.approved.amount)}) · معلق ${N(m.pending.n)} · مرفوض ${N(m.rejected.n)}`, sub2: `الإيراد المسجل ${money(m.revenue)}`, pill: m.diff ? K.pill(`فرق ${money(m.diff)}`, 'bad') : K.pill('مطابق', 'ok'), plain: true }));
    const iss = rec.issues.slice(0, 50).map(i => K.row({ icon: 'info', tone: 'warn', title: (i.message), sub: `الطلب: ${E(i.requestId)}`, to: `request/${i.requestId}` }));
    return view('مطابقة المدفوعات', `${rg.from} ← ${rg.to}`, `<div class="tpl-chips" role="group">${RK.map(([k, l]) => chip(l, 'fin-nav', `data-to="system/reconcile/${k}"`, k === key)).join('')}</div>${K.metrics([['معتمد', money(rec.totals.approved)], ['إيراد مسجل', money(rec.totals.revenue)], ['الفرق', money(rec.totals.approved - rec.totals.revenue)]])}${rows.length ? K.card(rows) : K.empty('لا توجد طلبات شراء في النطاق.', 'wallet')}${iss.length ? K.section('ملاحظات للمراجعة', N(rec.issues.length)) + K.card(iss) : ''}${K.note('المطابقة للقراءة فقط: تقارن حالة الطلب بقيد الإيراد المرتبط به. لا تؤكد وصول التحويل الفعلي في وسيلة الدفع.')}`);
  }
  function settingsLog(d) {
    const log = Sys.settingsLog(d);
    return view('سجل تغييرات الإعدادات', `${N(log.length)} حدث`, log.length ? K.card(log.map(o => K.row({ icon: 'clock', title: (o.summary || o.type), sub: E(stamp(o.createdAt)), sub2: `المنفِّذ: ${E(o.actorId || '—')}`, plain: true }))) : K.empty('لم تُسجَّل تغييرات إعدادات بعد.', 'clock', 'لا توجد أحداث'));
  }
  function trash(d) {
    const list = Sys.trashList(d);
    return view('سلة المحذوفات', `${N(list.length)} عنصر`, list.length ? `${K.note('تُحفظ هنا القوالب والملاحظات الداخلية وتصنيفات قرب الانتهاء المحذوفة (حتى 100 عنصر). تُستعاد كنسخة جديدة إن لم يوجد تعارض.')}${K.card(list.map(t => K.row({ icon: 'repeat', title: (t.label || KIND[t.kind] || t.kind), sub: `${E(KIND[t.kind] || t.kind)} · ${E(stamp(t.deletedAt))}`, plain: true }) + `<div class="rowfoot">${K.btn('استعادة', 'sys-restore', 'small', `data-id="${E(t.id)}"`)}${K.btn('حذف نهائي', 'sys-purge', 'small', `data-id="${E(t.id)}"`)}</div>`))}` : K.empty('لا توجد عناصر محذوفة.', 'repeat', 'السلة فارغة'));
  }
  function password(d) {
    return view('كلمة مرور الإدارة', '', `${K.callout('info', 'تنبيه', small('كلمة المرور تُخزَّن مجزأة (PBKDF2) على هذا الجهاز فقط، ولا تُحفظ نصًا صريحًا. هذا الدخول المحلي ليس بديلًا عن مصادقة خادم إنتاجي.'))}${K.fields(K.field({ name: 'cur', label: 'كلمة المرور الحالية', type: 'password' }) + K.field({ name: 'new', label: `كلمة المرور الجديدة (${Sys.PASSWORD_MIN} خانات فأكثر)`, type: 'password' }) + K.field({ name: 'conf', label: 'تأكيد كلمة المرور الجديدة', type: 'password' }))}<div style="margin-top:10px">${K.btn('تغيير كلمة المرور', 'sys-pw', 'primary', '', 'lock')}</div>`);
  }

  const base = EXP.build;
  EXP.build = (route, d, ui) => {
    const name = String(route || '').split('/')[0];
    if (name === 'system') {
      const sub = route.split('/')[1];
      if (!sub) return hub(d);
      if (sub === 'integrity') return integrity(d);
      if (sub === 'backup') return route.split('/')[2] === 'preview' ? preview(d) : backup(d);
      if (sub === 'reconcile') return reconcile(d, route);
      if (sub === 'settings-log') return settingsLog(d);
      if (sub === 'trash') return trash(d);
      if (sub === 'password') return password(d);
      return null;
    }
    const v = base(route, d, ui);
    if (route === 'more' && v) {
      const bk = Sys.backupStatus(d), st = Sys.systemStatus(d);
      return { ...v, html: v.html + K.section('النظام') + (bk.due ? K.callout('info', 'حان موعد النسخة الاحتياطية', small('افتح «النظام» ثم «النسخ الاحتياطي» وصدّر نسخة.')) : '') + K.card([K.row({ icon: 'sliders', tone: st.errors || bk.due ? 'warn' : '', title: 'النظام والنسخ الاحتياطي', sub: 'السلامة والاستيراد والمطابقة وسلة المحذوفات', to: 'system' })]) };
    }
    return v;
  };

  /* ----- الإجراءات ----- */
  const toast = (text, bad = false) => { const e = document.getElementById('toast'); if (!e) return; clearTimeout(toast.t); e.textContent = text; e.className = 'toast' + (bad ? ' error' : ''); toast.t = setTimeout(() => e.classList.add('hidden'), 4200); };
  const rerender = () => window.dispatchEvent(new PopStateEvent('popstate', { state: history.state }));
  const nav = to => { const st = history.state; history.replaceState({ amanAdmin: true, route: to, d: st && st.amanAdmin ? st.d || 0 : 0 }, '', '#/' + to); rerender(); };
  let busy = false;
  document.addEventListener('click', async e => {
    const b = e.target.closest && e.target.closest('[data-act^="sys-"]');
    if (!b || busy) return;
    const a = b.dataset.act, val = id => document.getElementById(id)?.value || '';
    busy = true;
    try {
      if (a === 'sys-opt') { opt = { ...opt, [b.dataset.k]: b.dataset.v }; rerender(); }
      else if (a === 'sys-cancel') { pending = null; nav('system/backup'); }
      else if (a === 'sys-preview') {
        const f = document.getElementById('sysFile')?.files?.[0];
        if (!f) throw new Error('اختر ملف النسخة أولًا.');
        if (f.size > 20 * 1024 * 1024) throw new Error('الملف أكبر من الحد المسموح (20 ميغابايت).');
        pending = { name: f.name, text: await f.text() }; opt = { mode: 'merge', conflicts: 'keep' }; nav('system/backup/preview');
      } else if (a === 'sys-import') {
        if (!pending) throw new Error('لا يوجد ملف للاستيراد.');
        if (opt.mode === 'replace' && !document.getElementById('sysConfirm')?.checked) throw new Error('أكّد أولًا أنك تدرك أن البيانات الحالية ستُستبدل.');
        const r = await Sys.importBackup(D, ADMIN, pending.text, opt);
        pending = null; toast(r.result?.summary || 'تم الاستيراد.'); nav('system/backup');
      } else if (a === 'sys-reminder') { await Sys.saveBackupReminder(D, ADMIN, val('f_days')); toast('حُفظ إعداد التذكير.'); rerender(); }
      else if (a === 'sys-restore') { await Sys.trashRestore(D, ADMIN, b.dataset.id, X); toast('تمت الاستعادة.'); rerender(); }
      else if (a === 'sys-purge') { await Sys.trashPurge(D, ADMIN, b.dataset.id); toast('حُذف نهائيًا.'); rerender(); }
      else if (a === 'sys-pw') {
        const d = D.read(), h = Sys.adminHash(d), cur = val('f_cur'), nw = val('f_new');
        const ok = !!h && await Sys.verifyPassword(cur, h);
        if (!ok) throw new Error('كلمة المرور الحالية غير صحيحة.');
        if (nw !== val('f_conf')) throw new Error('تأكيد كلمة المرور لا يطابق الجديدة.');
        if (nw === cur) throw new Error('الكلمة الجديدة مطابقة للحالية.');
        await Sys.setAdminPassword(D, ADMIN, await Sys.hashPassword(nw));
        toast('تم تغيير كلمة مرور الإدارة.'); rerender();
      }
    } catch (err) { toast(err?.message || 'تعذرت العملية.', true); }
    busy = false;
  });

  // تتبع آخر تصدير يدوي (زر التصدير الأصلي في admin.js يعمل كما هو)
  document.addEventListener('click', e => { if (e.target.closest && e.target.closest('[data-act="export-data"]')) Sys.markBackup(D, ADMIN).catch(() => {}); }, true);

  // سلة المحذوفات: لقطة قبل أن تحذف معالجات admin.js العنصر
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('[data-act="template-delete"],[data-act="note-delete"],[data-act="exp-class-delete-confirm"]');
    if (!b) return;
    try {
      const d = D.read(), id = b.dataset.id, a = b.dataset.act;
      if (a === 'template-delete') { const t = d.messageTemplates.find(x => x.id === id); if (t) Sys.trashPush(D, ADMIN, 'template', t.title, t).catch(() => {}); }
      else if (a === 'note-delete') { const n = d.internalNotes.find(x => x.id === id); if (n) Sys.trashPush(D, ADMIN, 'note', String(n.text).slice(0, 40), n).catch(() => {}); }
      else if (X) { const cfg = X.forCompany(d, b.dataset.co), k = cfg.classes.find(c => c.id === id); if (k && cfg.autoRenewClassId !== id) Sys.trashPush(D, ADMIN, 'expiryClass', k.name, k, { companyId: b.dataset.co }).catch(() => {}); }
    } catch { /* لا يمنع الحذف الأصلي */ }
  }, true);

  // إعداد كلمة المرور محليًا أول مرة، ثم التحقق منها عند كل دخول؛ لا توجد بيانات اعتماد افتراضية.
  document.addEventListener('submit', async e => {
    const f = e.target;
    if (!f || !f.dataset || f.dataset.form !== 'login') return;
    e.preventDefault(); e.stopImmediatePropagation();
    const fd = new FormData(f), pw = String(fd.get('password') || ''), confirm = String(fd.get('confirm') || '');
    const showError = (id, message) => { const box = document.getElementById(id); if (box) { box.textContent = message; box.classList.remove('hidden'); } };
    try {
      const h = Sys.adminHash(D.read());
      if (h) {
        if (!(await Sys.verifyPassword(pw, h))) throw new Error('كلمة المرور غير صحيحة.');
      } else {
        if (pw.length < Sys.PASSWORD_MIN) throw new Error(`كلمة المرور ${Sys.PASSWORD_MIN} خانات على الأقل.`);
        if (pw !== confirm) { showError('l_pass_confirm-err', 'تأكيد كلمة المرور لا يطابقها.'); return; }
        await Sys.setAdminPassword(D, ADMIN, await Sys.hashPassword(pw));
      }
      sessionStorage.setItem('aman.admin', '1'); history.replaceState({ amanAdmin: true, route: 'home', d: 0 }, '', '#/home'); location.reload();
    } catch (err) { showError('l_pass-err', err?.message || 'تعذر إعداد كلمة مرور الإدارة.'); }
  }, true);

  root.AmanAdminSystem = { hub, integrity, backup, preview, reconcile, settingsLog, trash, password };
})(window);
