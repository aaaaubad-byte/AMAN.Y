/* AMAN Admin — شاشات تصنيفات قرب الانتهاء والتنبيهات (U11: بنود 28 و47 و49 و72 و85؛ القرار ق-1).
   عرض فقط: كل كتابة تمر عبر AmanExpiry من admin.js. تُحمَّل بعد admin-screens.js وقبل admin.js.
   build(route, d, ui) يعيد وصف عرض للمسارات التي تملكها هذه الوحدة، أو null فتتولاها AmanAdminScreens:
   - expiry · expiry/:companyId · expiry/:companyId/class/new|:classId · expiry-alerts  (جديدة)
   - numbers/*  (بديل عن شاشة الأرقام: شارة التصنيف وفلاتره بدل الحدود الثابتة)
   - home · more · notices  (تُزخرف نتيجة AmanAdminScreens: استبدال صف «7 أيام» وإضافة المداخل ونص الإعداد). */
(function (root) {
  'use strict';
  const D = root.AmanData, U = root.AmanUI, K = root.AmanAdminKit, M = root.AmanAdminModel, X = root.AmanExpiry, S = root.AmanAdminScreens;
  const E = K.esc, N = U.fmt, DY = U.day;
  const ltr = s => `<span class="ltr">${E(s)}</span>`;
  const PAGE = 30;
  const match = (q, ...parts) => !q || parts.join(' ').toLowerCase().includes(q.trim().toLowerCase());
  const paged = (rows, ui, draw) => { const lim = ui.limit || PAGE; return draw(rows.slice(0, lim)) + (rows.length > lim ? `<div class="more-wrap">${K.btn(`تحميل المزيد (${N(rows.length - lim)} متبقٍ)`, 'load-more', 'small')}</div>` : ''); };
  const emptyQ = (filtered, qText, otherText, icon) => filtered ? K.empty(qText, icon, '', K.btn('مسح البحث والتصفية', 'clear-filter', 'small')) : K.empty(otherText, icon);
  const missing = msg => ({ chrome: 'focus', title: 'غير موجود', html: K.empty(msg, 'info', 'تعذر العثور على السجل'), bar: '' });
  const formView = (title, sub, formId, inner, label, extra = '') => ({ chrome: 'form', title, sub, html: `<form id="${formId}" data-form="${formId}">${inner}<div id="form-error" class="form-error hidden" role="alert"></div></form>${extra}`, bar: `<div class="actionbar">${K.submitBtn(label, formId)}</div>` });
  const small = t => `<small style="display:block;line-height:1.9;margin-top:4px">${t}</small>`;
  const classTotal = d => d.companies.reduce((a, c) => a + X.forCompany(d, c.id).classes.length, 0);

  /* ----- مركز التصنيفات: اختيار الشركة ----- */
  function hub(d) {
    const total = classTotal(d), al = X.alerts(D, d).length;
    const rows = d.companies.map(c => {
      const cfg = X.forCompany(d, c.id);
      return K.row({ icon: 'building', tone: cfg.classes.length ? 'ok' : '', title: c.name, sub: cfg.classes.length ? E(cfg.classes.map(k => `${k.name} (≤ ${N(k.upToDays)} يوم)`).join('، ')) : 'لا توجد تصنيفات', sub2: `التجديد التلقائي: ${cfg.autoRenewClassId ? 'مرتبط بتصنيف' : 'معطّل'}`, val: N(cfg.classes.length), pill: c.active === false ? K.pill('متوقفة', 'bad') : '', to: `expiry/${c.id}` });
    });
    return { chrome: 'tabs', tab: 'more', html: `${K.bar('تصنيفات قرب الانتهاء', 'لكل شركة تصنيفاتها وإشعاراتها')}
${K.callout('info', 'كيف تعمل؟', small('اختر شركة ثم عرّف تصنيفاتها: اسم التصنيف وحد الأيام المتبقية. يُطبَّق على كل اشتراك أضيق تصنيف مطابق فقط، فلا يتداخل تصنيفان. الشركة بلا تصنيفات لا تظهر لها شارة ولا فلتر ولا إشعار. إعدادات كل شركة مستقلة عن غيرها.'))}
${K.section('الشركات', N(d.companies.length))}${d.companies.length ? K.card(rows) : K.empty('أضف شركة أولًا ثم عرّف تصنيفاتها.', 'building', 'لا توجد شركات', K.btn('إضافة شركة', 'go', 'primary', 'data-to="company/new"', 'plus'))}
${K.section('التنبيهات')}${K.card([K.row({ icon: 'clock', tone: al ? 'warn' : '', title: 'تنبيهات قرب الانتهاء', sub: total ? 'الاشتراكات داخل التصنيفات وحالة إشعاراتها' : 'عرّف تصنيفات لتظهر التنبيهات', val: N(al), to: 'expiry-alerts' })])}` };
  }

  /* ----- تصنيفات شركة واحدة ----- */
  function companyScreen(d, id) {
    const co = M.company(d, id);
    if (!co) return missing('الشركة غير موجودة.');
    const cfg = X.forCompany(d, id), ents = X.entries(D, d, id), inCls = k => ents.filter(e => e.result.cls?.id === k.id).length;
    const rows = cfg.classes.map(k => K.row({ icon: 'clock', tone: k.notify ? 'warn' : '', title: k.name, sub: `≤ ${N(k.upToDays)} يوم متبقٍ`, sub2: `${k.notify ? 'إشعار العميل: مفعّل' : 'إشعار العميل: غير مفعّل'} · ${N(inCls(k))} اشتراك الآن`, pill: cfg.autoRenewClassId === k.id ? K.pill('تجديد تلقائي', 'ok') : '', to: `expiry/${id}/class/${k.id}` }));
    const add = `data-to="expiry/${E(id)}/class/new"`;
    const body = cfg.classes.length ? K.card(rows) : K.empty('لا تظهر شارة قرب الانتهاء ولا فلاتره ولا تُنشأ إشعارات لهذه الشركة حتى تُعرَّف تصنيفاتها.', 'clock', 'لا توجد تصنيفات', K.btn('إضافة تصنيف', 'go', 'primary', add, 'plus'));
    const opts = [['', 'معطّل']].concat(cfg.classes.map(k => [k.id, `${k.name} (≤ ${k.upToDays} يوم)`]));
    const auto = cfg.classes.length ? `${K.section('التجديد التلقائي لهذه الشركة')}<div class="fields"><div class="field"><label for="autoRenewClass">التصنيف المرتبط بالتجديد التلقائي</label><select id="autoRenewClass" data-expiry-autorenew data-company="${E(id)}" aria-describedby="autoRenewClass-err">${opts.map(([k, l]) => `<option value="${E(k)}" ${k === (cfg.autoRenewClassId || '') ? 'selected' : ''}>${E(l)}</option>`).join('')}</select><small>اختر تصنيفًا لربط الميزة به أو «معطّل». يُحفظ الاختيار فور تغييره.</small><small class="ferr hidden" id="autoRenewClass-err" role="alert"></small></div></div>${K.callout('info', 'إعداد محفوظ فقط', small('لا يُنفَّذ أي تجديد من هذا الربط الآن. دخول الاشتراك في التصنيف وحده لا يجدّده؛ يلزم استيفاء شروط التجديد القائمة والتحقق من الرصيد وقواعد الاشتراك. تنفيذ التجديد التلقائي مؤجل إلى وحدته (U15) بعد حسم بنوده المفتوحة.'))}` : '';
    const html = `${K.callout('info', 'تصنيفات شركة ' + co.name, small('حدود الأيام داخل الشركة غير مكررة، ويُطبَّق على الاشتراك أضيق تصنيف مطابق فقط. العدد الظاهر لكل تصنيف هو الاشتراكات السارية التي تقع فيه الآن.'))}
${K.section('التصنيفات', N(cfg.classes.length))}${body}${auto}
${K.section('الوضع الحالي')}${K.kv([['اشتراكات سارية', N(ents.length)], ['داخل تصنيف', N(ents.filter(e => e.result.cls).length)], ['خارج التصنيفات', N(ents.filter(e => !e.result.cls).length)]])}`;
    return { chrome: 'focus', title: 'تصنيفات الشركة', sub: co.name, html, end: cfg.classes.length ? K.tileAction('go', 'plus', 'إضافة تصنيف', add) : '' };
  }

  /* ----- نموذج تصنيف (إضافة/تعديل) ----- */
  function classForm(d, coId, classId) {
    const co = M.company(d, coId);
    if (!co) return missing('الشركة غير موجودة.');
    const isNew = classId === 'new', cfg = X.forCompany(d, coId), k = isNew ? {} : cfg.classes.find(c => c.id === classId);
    if (!isNew && !k) return missing('التصنيف غير موجود.');
    const others = cfg.classes.filter(c => c.id !== k.id).map(c => `${c.name} (≤ ${N(c.upToDays)})`).join('، ');
    const inner = `<input type="hidden" name="companyId" value="${E(coId)}"><input type="hidden" name="id" value="${E(k.id || '')}">${K.fields(
      K.field({ name: 'name', label: 'اسم التصنيف', value: k.name, required: true, help: `حتى ${X.NAME_MAX} حرفًا ولا يتكرر داخل الشركة.` }) +
      K.field({ name: 'upToDays', label: 'عدد الأيام المتبقية (الحد الأعلى)', type: 'number', min: 1, step: 1, value: k.upToDays, required: true, inputmode: 'numeric', help: 'يدخل الاشتراك التصنيف حين تكون أيامه المتبقية أقل من هذا العدد أو تساويه. لا يتكرر هذا العدد في تصنيف آخر لنفس الشركة.' }) +
      K.toggle('notify', 'إشعار العميل عند دخول هذا التصنيف', k.notify === true, 'اختياري. يُنشأ مرة واحدة لكل اشتراك وتصنيف ولا يتكرر بإعادة التقييم.') +
      K.field({ name: 'noticeText', label: 'نص الإشعار', type: 'textarea', rows: 3, value: k.noticeText || '', help: `مطلوب عند تفعيل الإشعار (حتى ${X.NOTICE_MAX} حرفًا). يصل إلى مالك الاشتراك فقط.` }))}${others ? K.note('حدود التصنيفات الأخرى لهذه الشركة: ' + others) : ''}`;
    const del = isNew ? '' : `<div style="margin-top:12px">${K.btn('حذف التصنيف', 'exp-class-delete-open', '', `data-co="${E(coId)}" data-id="${E(k.id)}"`, 'close')}</div>`;
    return formView(isNew ? 'إضافة تصنيف' : 'تعديل تصنيف', co.name, 'expiry-class-form', inner, 'حفظ التصنيف', del);
  }

  /* ----- تنبيهات قرب الانتهاء (بند 85) ----- */
  function alertsScreen(d, ui) {
    const all = X.alerts(D, d), pend = X.pendingNotices(D, d), off = d.notificationSettings?.subscriptionExpiring === false;
    const withCls = d.companies.filter(c => X.forCompany(d, c.id).classes.length);
    const opts = withCls.length > 1 ? [['all', 'كل الشركات'], ...withCls.map(c => [c.id, c.name])] : null;
    const list = () => {
      const rows = all.filter(a => ui.filter === 'all' || a.company.id === ui.filter).filter(a => match(ui.q, a.number.number, a.company.name, a.cls.name, M.customer(d, a.sub.customerId)?.name));
      if (!all.length) return K.empty(withCls.length ? 'لا توجد اشتراكات ضمن تصنيفات قرب الانتهاء الآن.' : 'لم تُعرَّف تصنيفات لأي شركة بعد.', 'clock', '', withCls.length ? '' : K.btn('تعريف التصنيفات', 'go', 'primary', 'data-to="expiry"'));
      if (!rows.length) return emptyQ(true, 'لا توجد نتائج تطابق البحث.', '', 'search');
      return paged(rows, ui, rows => K.card(rows.map(a => {
        const c = M.customer(d, a.sub.customerId), st = !a.cls.notify ? K.pill('بلا إشعار') : a.sent ? K.pill('أُنشئ الإشعار', 'ok') : K.pill('بانتظار الإشعار', 'warn');
        return K.row({ icon: 'clock', tone: 'warn', title: a.number.number, ltr: true, sub: `${E(a.company.name)} · ${E(c?.name || '—')}`, sub2: `ينتهي ${E(DY(a.sub.endsAt))} · متبقٍ ${N(a.days)} يوم`, badges: st, pill: K.pill(a.cls.name, 'warn'), to: `number/${a.number.id}` });
      })));
    };
    const html = `${off ? K.callout('info', 'إشعارات قرب الانتهاء معطّلة', small('أُوقف نوع «قرب انتهاء الاشتراك» من شاشة الإشعارات؛ لن يُنشأ أي إشعار للعملاء حتى يُفعَّل.')) : ''}
<div style="margin-top:12px">${K.metrics([['داخل التصنيفات', N(all.length)], ['بانتظار الإشعار', N(pend.length)], ['شركات بتصنيفات', N(withCls.length)]])}</div>
<div style="margin-top:12px">${K.btn('إعادة التقييم الآن', 'exp-evaluate', pend.length ? 'primary' : '', '', 'repeat')}</div>
<p class="note">يُجرى التقييم تلقائيًا عند فتح الإدارة وبعد الدخول؛ لا يوجد مجدول خلفي، فلا يُنشأ الإشعار إلا حين تُفتح الإدارة أو بهذا الزر. إعادة التقييم لا تكرر إشعارًا أُنشئ سابقًا.</p>
${K.toolbar('ابحث بالرقم أو العميل أو الشركة', ui.q, opts, ui.filter)}<div id="listbody">${list()}</div>
${K.card([K.row({ icon: 'sliders', title: 'تعريف التصنيفات لكل شركة', sub: 'الأسماء وحدود الأيام والإشعارات', to: 'expiry' })])}`;
    return { chrome: 'focus', title: 'تنبيهات قرب الانتهاء', sub: `${N(all.length)} اشتراك`, list, html };
  }

  /* ----- الأرقام والاشتراكات: شارة التصنيف وفلاتره (بندا 28 و47) بدل أي حد ثابت ----- */
  function numbers(d, a, ui) {
    const tab = a === 'all' ? 'all' : 'active';
    const cfgs = new Map(d.companies.map(c => [c.id, X.forCompany(d, c.id)]));
    const classesOf = id => (cfgs.get(id) || { classes: [] }).classes;
    const any = [...cfgs.values()].some(c => c.classes.length);
    const classOpts = any ? [['near', 'قرب الانتهاء'], ...d.companies.flatMap(c => classesOf(c.id).map(k => [`cls:${k.id}`, `${c.name} · ${k.name}`]))] : [];
    const subOf = n => D.activeSubscription(d, n.id);
    const resultOf = (n, s) => X.classify(classesOf(n.companyId), s);
    const pillOf = r => { const b = X.badge(r) || { label: 'فعال', tone: 'ok' }; return K.pill(b.label, b.tone); };
    const toneOf = r => (X.badge(r)?.tone === 'warn' ? 'warn' : 'ok');
    const list = () => {
      if (tab === 'active') {
        const rows = d.subscriptions.filter(M.isLive).sort((x, y) => new Date(x.endsAt) - new Date(y.endsAt)).filter(s => {
          const n = M.number(d, s.numberId), c = M.customer(d, s.customerId || n?.customerId), co = M.company(d, s.companyId || n?.companyId);
          return match(ui.q, n?.number, c?.name, c?.email, co?.name) && (!n || X.matches(ui.filter, resultOf({ companyId: s.companyId || n.companyId }, s)));
        });
        if (!rows.length) return emptyQ(!!ui.q || ui.filter !== 'all', 'لا توجد نتائج تطابق البحث.', 'لا توجد اشتراكات فعالة.', 'shield');
        return paged(rows, ui, rows => K.card(rows.map(s => {
          const n = M.number(d, s.numberId), c = M.customer(d, s.customerId), co = M.company(d, s.companyId || n?.companyId), r = X.classify(classesOf(s.companyId || n?.companyId), s);
          return K.row({ icon: 'shield', tone: toneOf(r), title: n?.number || '—', ltr: true, sub: `${E(c?.name || '—')} · ${E(co?.name || '—')}`, sub2: `ينتهي ${E(DY(s.endsAt))}${r.days != null ? ` · متبقٍ ${N(r.days)} يوم` : ''} · ${N(s.rateSnapshot)} نقطة/يوم`, pill: pillOf(r), to: n ? 'number/' + n.id : '' });
        })));
      }
      const f = ui.filter;
      const keep = n => { const s = subOf(n); if (f === 'all') return true; if (f === 'active') return !!s; if (f === 'inactive') return !s; if (f === 'expired') return !s && d.subscriptions.some(x => x.numberId === n.id); return X.matches(f, resultOf(n, s)); };
      const rows = d.numbers.filter(n => { const s = subOf(n), c = M.customer(d, s?.customerId || n.customerId), co = M.company(d, n.companyId); return match(ui.q, n.number, c?.name, c?.email, co?.name); }).filter(keep);
      if (!rows.length) return emptyQ(!!ui.q || f !== 'all', 'لا توجد نتائج تطابق البحث.', 'لا توجد أرقام مضافة بعد.', 'phone');
      return paged(rows, ui, rows => K.card(rows.map(n => {
        const s = subOf(n), c = M.customer(d, s?.customerId || n.customerId), co = M.company(d, n.companyId), r = s ? resultOf(n, s) : null;
        return K.row({ icon: 'phone', tone: s ? toneOf(r) : '', title: n.number, ltr: true, sub: `${E(c?.name || '—')} · ${E(co?.name || '—')}`, sub2: s ? `ينتهي ${E(DY(s.endsAt))}${r?.days != null ? ` · متبقٍ ${N(r.days)} يوم` : ''}` : 'لا يوجد اشتراك فعال', pill: n.restricted ? K.pill('مقيّد', 'bad') : s ? pillOf(r) : K.pill('بلا اشتراك'), to: 'number/' + n.id });
      })));
    };
    const options = tab === 'all' ? [['all', 'كل الحالات'], ['active', 'له اشتراك فعال'], ['inactive', 'بلا اشتراك فعال'], ...classOpts, ['expired', 'منتهية']] : (any ? [['all', 'كل الاشتراكات'], ...classOpts] : null);
    return { chrome: 'tabs', tab: 'more', list, html: `${K.bar('الأرقام والاشتراكات', 'حماية الأرقام ومدتها', K.tileAction('add-number-open', 'plus', 'إضافة رقم'))}
${K.tabs([['active', 'اشتراكات فعالة', d.subscriptions.filter(M.isLive).length], ['all', 'كل الأرقام', d.numbers.length]], tab, 'numbers')}
${K.toolbar('ابحث برقم الهاتف أو العميل أو الشركة', ui.q, options, ui.filter)}<div id="listbody">${list()}</div>` };
  }

  /* ----- زخرفة شاشات AmanAdminScreens بلا تعديل ملفها ----- */
  // يستبدل زر الصف الذي يحوي النص بصفٍّ جديد؛ إن لم يوجد النص يعيد الصفحة كما هي (والاختبارات تحرس ذلك)
  function swapRow(html, marker, row) {
    const i = html.indexOf(marker); if (i < 0) return html;
    const s = html.lastIndexOf('<button', i), e = html.indexOf('</button>', i);
    return s < 0 || e < 0 ? html : html.slice(0, s) + row + html.slice(e + '</button>'.length);
  }
  function insertAfterRow(html, marker, row) {
    const i = html.indexOf(marker); if (i < 0) return null;
    const e = html.indexOf('</button>', i);
    return e < 0 ? null : html.slice(0, e + '</button>'.length) + row + html.slice(e + '</button>'.length);
  }
  const OLD_HOME_ROW = 'اشتراكات تنتهي خلال 7 أيام';
  function decorateHome(v, d) {
    const total = classTotal(d), al = X.alerts(D, d).length;
    const row = total ? K.row({ icon: 'clock', tone: al ? 'warn' : '', title: 'اشتراكات قرب الانتهاء', sub: 'بحسب تصنيفات كل شركة', val: N(al), to: 'expiry-alerts' }) : K.row({ icon: 'clock', title: 'اشتراكات قرب الانتهاء', sub: 'لم تُعرَّف تصنيفات لأي شركة بعد', to: 'expiry' });
    return { ...v, html: swapRow(v.html, OLD_HOME_ROW, row) };
  }
  function decorateMore(v, d) {
    const total = classTotal(d), al = X.alerts(D, d).length;
    const cfgRow = K.row({ icon: 'clock', title: 'تصنيفات قرب الانتهاء', sub: total ? `${N(total)} تصنيف · لكل شركة تصنيفاتها` : 'لكل شركة تصنيفاتها وإشعاراتها', to: 'expiry' });
    const alRow = K.row({ icon: 'bell', tone: al ? 'warn' : '', title: 'تنبيهات قرب الانتهاء', sub: 'اشتراكات داخل التصنيفات وإشعارات العملاء', val: total ? N(al) : '', to: 'expiry-alerts' });
    let html = insertAfterRow(v.html, 'data-to="customer-classes"', cfgRow);
    html = html == null ? v.html + K.section('تصنيفات قرب الانتهاء') + K.card([cfgRow]) : html;
    const withAl = insertAfterRow(html, 'data-to="unrecorded"', alRow);
    return { ...v, html: withAl == null ? html + K.card([alRow]) : withAl };
  }
  const OLD_NOTICE_HELP = 'إعداد محلي؛ لا يوجد مجدول خلفي';
  const NEW_NOTICE_HELP = 'يتحكم بإنشاء إشعارات قرب الانتهاء المعرّفة في تصنيفات الشركات؛ يُجرى التقييم عند فتح الإدارة أو بزر إعادة التقييم';
  const decorateNotices = v => ({ ...v, html: v.html.replace(OLD_NOTICE_HELP, NEW_NOTICE_HELP) });

  function build(route, d, ui) {
    const [name = 'home', a, b, c] = String(route || 'home').split('/');
    switch (name) {
      case 'expiry': return !a ? hub(d) : b === 'class' ? classForm(d, a, c) : b ? null : companyScreen(d, a);
      case 'expiry-alerts': return alertsScreen(d, ui);
      case 'numbers': return numbers(d, a, ui);
      case 'home': return decorateHome(S.build(route, d, ui), d);
      case 'more': return decorateMore(S.build(route, d, ui), d);
      case 'notices': return decorateNotices(S.build(route, d, ui));
      default: return null;
    }
  }
  // تقييم الإشعارات المستحقة (لا مجدول خلفي: يُستدعى عند فتح الإدارة وبعد الدخول وبزر إعادة التقييم)
  const evaluate = (actor = 'system') => X.evaluate(D, actor);

  root.AmanAdminExpiry = { build, evaluate, OLD_HOME_ROW, OLD_NOTICE_HELP };
})(window);
