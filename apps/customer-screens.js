/* AMAN Customer — بناة الشاشات (عرض فقط). لا كتابة هنا؛ كل التعديل يمر عبر AmanData من غلاف التطبيق. */
(function (root) {
  'use strict';
  const D = AmanData, U = AmanUI, K = AmanCustomerKit, E = K.esc, N = U.fmt;

  const LABEL = { pending: 'قيد المراجعة', approved: 'معتمد', rejected: 'مرفوض', active: 'فعال', expired: 'منتهٍ', planned: 'مخطط', due: 'مستحق', executed: 'منفذ', extended: 'ممدد' };
  const TONE = { pending: 'warn', approved: 'ok', rejected: 'bad' };
  const label = s => LABEL[s] || E(s);
  const OP_LABEL = { subscribe: 'اشتراك حماية', extend: 'تمديد حماية', renew: 'تجديد حماية' };

  const company = (d, n) => d.companies.find(c => c.id === n.companyId);
  const liveSub = (d, n, id) => d.subscriptions.find(s => s.numberId === n.id && s.customerId === id && s.status === 'active' && new Date(s.startsAt || 0) <= Date.now() && new Date(s.endsAt) > Date.now()) || null;
  const daysLeft = s => Math.max(0, Math.ceil((new Date(s.endsAt) - Date.now()) / 86400000));
  const owned = (d, id) => D.customerNumbers(id, d);
  const byNew = (a, b) => new Date(b.createdAt) - new Date(a.createdAt);
  const notices = (d, id) => d.notifications.filter(n => n.customerId === id).sort(byNew);

  function numberState(d, n, id) {
    const s = liveSub(d, n, id);
    if (s) return { key: 'active', text: `متبقي ${N(daysLeft(s))} يوم`, tone: 'ok', sub: s };
    if (n.protectionStatus === 'protected') return { key: 'protected', text: 'محمي', tone: 'ok' };
    if (n.protectionStatus === 'expired' || d.subscriptions.some(x => x.numberId === n.id)) return { key: 'expired', text: 'منتهية', tone: 'warn' };
    return { key: 'none', text: 'غير محمي', tone: '' };
  }
  const withBar = (title, sub, html, extra = {}) => ({ chrome: 'tabs', html: K.bar(title, sub) + html, ...extra });

  /* ===================== الدخول والتسجيل ===================== */
  function login(saved, demo = false) {
    return `<div class="brand"><h1>أمان</h1><p>حماية أرقامك</p></div>
<form id="login" data-form="login">
 <h2>تسجيل الدخول</h2>
 <div class="afield"><label for="l_email">البريد الإلكتروني</label><input id="l_email" name="email" type="email" autocomplete="username" dir="ltr" style="text-align:right" value="${E(saved.email || (demo ? 'demo@aman.test' : ''))}" required></div>
 <div class="afield"><label for="l_pass">كلمة المرور</label><input id="l_pass" name="password" type="password" minlength="4" autocomplete="current-password" dir="ltr" style="text-align:right" value="${demo ? 'aman1234' : ''}" required></div>
 <label class="remember"><input type="checkbox" name="remember" ${saved.enabled ? 'checked' : ''}><span>تذكرني وحفظ بيانات الدخول على هذا الجهاز</span></label>
 <div id="form-error" class="form-error hidden" role="alert"></div>
 <button class="btn primary" type="submit">دخول</button>
 <button type="button" class="btn ghost" data-act="signup-view">إنشاء حساب</button>
</form>`;
  }
  function signup() {
    return `<div class="brand"><h1>أمان</h1><p>إنشاء حساب جديد</p></div>
<form id="signup" data-form="signup">
 <h2>إنشاء حساب</h2>
 <div class="afield"><label for="s_name">الاسم</label><input id="s_name" name="name" required autocomplete="name"></div>
 <div class="afield"><label for="s_email">البريد الإلكتروني</label><input id="s_email" name="email" type="email" dir="ltr" style="text-align:right" required autocomplete="email"></div>
 <div class="afield"><label for="s_pass">كلمة المرور (4 خانات فأكثر)</label><input id="s_pass" name="password" type="password" minlength="4" dir="ltr" style="text-align:right" required autocomplete="new-password"></div>
 <label class="remember"><input id="agree" type="checkbox" required><span>أوافق على <button type="button" class="link" data-act="terms">الشروط والأحكام</button></span></label>
 <div id="form-error" class="form-error hidden" role="alert"></div>
 <button class="btn primary" type="submit">إنشاء الحساب</button>
 <button type="button" class="btn ghost" data-act="login-view">العودة للدخول</button>
</form>`;
  }

  /* ===================== الرئيسية والبحث عن رقم ===================== */
  function resultView(r) {
    const num = `<div class="result-number ltr">${E(r.number)}</div>`;
    const head = (icon, tone, title) => `<div class="result-head"><span class="ico ${tone}">${K.ico(icon)}</span><h3 class="search-result-status">${E(title)}</h3>${num}</div>`;
    const act = (text, op, cls = 'primary') => K.btn(text, 'protection-path', cls, `data-number="${E(r.number)}" data-company="${E(r.companyId)}" data-operation="${op}"`);
    const co = ['شركة الاتصالات', E(r.companyName)];
    if (r.protected && !r.ownedByRequester)
      return `<div class="result">${head('shield', 'ok', 'الرقم محمي في أمان')}${K.kv([co, ['حالة الحماية', 'محمي']])}${act('تمديد الحماية', 'extend')}</div>`;
    if (r.protected)
      return `<div class="result">${head('shield', 'ok', 'حماية رقمك سارية')}${K.kv([co, ['حالة الاشتراك', 'ساري'], ['بداية الاشتراك', U.date(r.subscription.startsAt)], ['تاريخ الانتهاء', U.date(r.subscription.endsAt)], ['باقة الحماية', E(r.subscription.packageName || '—')]])}${act('تمديد الحماية', 'extend')}</div>`;
    if (r.expired && r.ownedByRequester)
      return `<div class="result">${head('clock', 'warn', 'انتهت الحماية المسجلة لهذا الرقم')}${K.kv([co, ['حالة الاشتراك', 'منتهٍ'], ['آخر بداية مسجلة', U.date(r.subscription?.startsAt || '')], ['تاريخ الانتهاء', U.date(r.subscription?.endsAt || '')]])}${K.note('تحقّق من أهلية التجديد قبل المتابعة.')}${act('التحقق من التجديد', 'renew')}</div>`;
    return `<div class="result">${head('shield', '', 'الحماية غير مفعّلة في أمان')}${K.kv([co, ['حالة الحماية', 'غير مفعّلة']])}${K.note('الحالة المعروضة تخص بيانات أمان.')}${act('تفعيل الحماية', 'subscribe')}${r.added ? K.note('الرقم مضاف إلى حسابك بالفعل.') : K.btn('إضافة إلى أرقامي', 'add-search-number', '', `data-number="${E(r.number)}"`)}</div>`;
  }
  function home(d, c, x) {
    const ns = owned(d, c.id), unread = x.noticeDot && notices(d, c.id).some(n => !n.readAt);
    const lead = `<div class="lead" id="top">${K.tileAction('go', 'user', 'الحساب', 'data-to="account"')}<div class="lead-end"><button type="button" class="tile-btn" data-act="go" data-to="notifications" aria-label="الإشعارات">${K.ico('bell')}<i id="unreadDot" class="dot ${unread ? '' : 'hidden'}"></i></button><button type="button" id="balance" class="chip-black" data-act="go" data-to="points">${N(D.balance(c.id, d))} نقطة</button></div></div>`;
    const picker = ns.length ? `<div style="margin-top:10px"><label class="select block">${K.ico('caret')}<select id="quickNumber" aria-label="اختيار رقم من أرقام حسابك"><option value="">اختر من أرقام حسابك</option>${ns.map(n => `<option value="${E(n.number)}">${E(n.number)}</option>`).join('')}</select></label></div>` : '';
    const body = x.lookup
      ? `<section class="card pad inquiry-result-card">${resultView(x.lookup)}<div style="margin-top:12px">${K.btn('بحث عن رقم آخر', 'search-again', '', '', 'search')}</div></section>`
      : `<form id="number-search" class="card pad" data-form="number-search"><h3>البحث عن حالة الرقم في أمان</h3>${K.fields(K.field({ id: 'search-number-input', name: 'number', label: 'رقم الهاتف', required: true, inputmode: 'numeric', dir: 'ltr', placeholder: 'أدخل رقم الهاتف' }))}${picker}<p id="search-company" class="note">أدخل الرقم للتعرف على الشركة إن أمكن.</p><button type="submit" class="btn primary">البحث</button></form>`;
    return { chrome: 'tabs', html: `${lead}<h1 class="display">مرحبًا، ${E(c.name)}</h1><p class="lede">${ns.length ? `لديك ${N(ns.length)} ${ns.length === 1 ? 'رقم' : 'أرقام'} في حسابك.` : 'ابحث عن حالة أي رقم أو أضف أرقامك من قسم الأرقام.'}</p>${body}` };
  }

  /* ===================== الأرقام والرادار ===================== */
  function numberRow(d, n, id, extra = {}) {
    const st = numberState(d, n, id), co = company(d, n);
    return K.row({ icon: 'phone', tone: st.tone === 'ok' ? 'ok' : st.tone === 'warn' ? 'warn' : '', title: n.number, ltr: true, sub: E(co?.name || 'شركة غير معروفة'), pill: K.pill(st.text, st.tone), act: 'number-detail', attrs: `data-id="${E(n.id)}"`, ...extra });
  }
  const companyNames = (d, rows) => [...new Set(rows.map(n => company(d, n)?.name).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ar'));
  const matches = (d, n, x) => {
    const q = String(x.q || '').trim().toLowerCase(), name = company(d, n)?.name || '';
    return (!q || String(n.number).toLowerCase().includes(q) || name.toLowerCase().includes(q)) && (!x.co || name === x.co);
  };
  function numbers(d, c, x) {
    const all = owned(d, c.id);
    const list = () => {
      const rows = all.filter(n => matches(d, n, x));
      if (!all.length) return K.empty('أضف رقمك الأول ثم فعّل حمايته من تفاصيله.', 'numbers', 'لا توجد أرقام مضافة بعد');
      if (!rows.length) return K.empty('لا توجد أرقام تطابق البحث أو الشركة المحددة.', 'search');
      return K.card(rows.map(n => numberRow(d, n, c.id)));
    };
    const tool = all.length ? K.toolbar('بحث برقم الهاتف', x.q, [['', 'كل الشركات'], ...companyNames(d, all).map(n => [n, n])], x.co || '') : '';
    return withBar('الأرقام', all.length ? `${N(all.length)} ${all.length === 1 ? 'رقم' : 'أرقام'}` : '', `${tool}<div id="listbody" class="customer-number-list">${list()}</div>`, { tab: 'numbers', list, bar: `<div class="actionbar">${K.btn('إضافة رقم', 'add-number-open', 'primary', '', 'plus')}</div>` });
  }
  function radar(d, c, x) {
    const all = owned(d, c.id).filter(n => n.radar && liveSub(d, n, c.id));
    const list = () => {
      const rows = all.filter(n => matches(d, n, x));
      if (!all.length) return K.empty('افتح تفاصيل رقم ذي اشتراك فعال لإضافته إلى الرادار.', 'radar', 'لا توجد أرقام فعالة في الرادار');
      if (!rows.length) return K.empty('لا توجد أرقام تطابق البحث أو الشركة المحددة.', 'search');
      return `<div class="list">${rows.map(n => `<div class="card">${numberRow(d, n, c.id)}<div class="rowfoot">${K.btn('إيقاف المتابعة', 'radar-remove', 'small', `data-id="${E(n.id)}"`)}</div></div>`).join('')}</div>`;
    };
    const tool = all.length ? K.toolbar('بحث برقم الهاتف', x.q, [['', 'كل الشركات'], ...companyNames(d, all).map(n => [n, n])], x.co || '') : '';
    return withBar('الرادار', 'يتابع الأرقام ذات الاشتراك الفعال', `${tool}<div id="listbody">${list()}</div>`, { tab: 'radar', list });
  }
  function numberDetail(d, n, id) {
    const co = company(d, n), st = numberState(d, n, id), s = st.sub || null;
    const latest = d.subscriptions.filter(v => v.numberId === n.id).sort(byNew)[0];
    const packs = (d.protectionPackages || []).filter(p => p.companyId === co?.id && p.active !== false);
    const op = st.key === 'active' ? 'extend' : latest ? 'renew' : 'subscribe';
    const stateText = st.key === 'active' ? `سارية — ${N(daysLeft(s))} يوم متبقٍ` : latest ? 'منتهية أو غير سارية' : 'غير محمي';
    const rows = [['رقم الهاتف', `<span class="ltr">${E(n.number)}</span>`], ['الشركة', E(co?.name || '—')], ['حالة الحماية', stateText]];
    if (s) rows.push(['بداية الحماية', U.date(s.startsAt)], ['تاريخ الانتهاء', U.date(s.endsAt)]);
    const hero = `<div class="hero"><div class="hero-top"><span class="ico">${K.ico('shield')}</span><div><h2 class="ltr">${E(n.number)}</h2><p>${E(co?.name || '—')}</p></div></div><span class="pill ${st.tone === 'ok' ? 'ok' : ''}">${E(st.key === 'active' ? `سارية · ${N(daysLeft(s))} يوم متبقٍ` : latest ? 'منتهية أو غير سارية' : 'غير محمي')}</span></div>`;
    let foot = '';
    if (packs.length) foot += K.btn(op === 'extend' ? 'تمديد الحماية' : op === 'renew' ? 'تجديد الحماية' : 'تفعيل الحماية', 'protection-path', 'primary', `data-number="${E(n.number)}" data-company="${E(co?.id || '')}" data-operation="${op}"`);
    if (st.key === 'active') foot += K.btn(n.radar ? 'إيقاف متابعة الرادار' : 'إضافة إلى الرادار', 'radar-toggle', '', `data-id="${E(n.id)}"`, 'radar');
    foot += K.btn('إشعارات الرقم', 'number-notifications', '', `data-id="${E(n.id)}"`, 'bell');
    return { title: 'تفاصيل الحماية', body: hero + K.kv(rows) + (packs.length ? '' : K.note('لا توجد باقات حماية متاحة لهذه الشركة حاليًا.')), foot };
  }

  /* ===================== شراء النقاط والسجلات ===================== */
  function buy(d, c) {
    const packs = d.packages.filter(x => x.active !== false), methods = d.paymentMethods.filter(x => x.active !== false);
    const hero = `<div class="hero"><small>رصيد أمان الحالي</small><div class="big">${N(D.balance(c.id, d))}<em>نقطة</em></div></div>`;
    const form = `<form id="purchase" data-form="purchase">${K.fields(
      K.field({ id: 'packageId', name: 'packageId', label: 'باقة النقاط', type: 'select', required: true, options: packs.length ? packs.map(p => [p.id, `${p.name} — ${N(p.points)} نقطة · ${N(p.price)} ر.ي`]) : [['', 'لا توجد باقات متاحة']] }) +
      K.field({ id: 'paymentId', name: 'paymentId', label: 'وسيلة الدفع', type: 'select', required: true, options: methods.length ? methods.map(m => [m.id, m.name]) : [['', 'لا توجد وسائل دفع متاحة']] }) +
      K.field({ id: 'reference', name: 'reference', label: 'مرجع التحويل', required: true, placeholder: 'أدخل مرجع التحويل' }))}
<div id="paymentInstructions" class="note">${E(methods[0]?.instructions || 'لا توجد وسيلة دفع متاحة')}</div><div id="form-error" class="form-error hidden" role="alert"></div></form>`;
    const recent = d.purchaseRequests.filter(r => r.customerId === c.id).sort(byNew);
    return withBar('شراء نقاط', 'طلب شراء رصيد أمان', `${hero}${K.section('طلب جديد')}${form}${K.note('تُضاف النقاط بعد مراجعة الطلب واعتماده من الإدارة.')}${K.card([K.row({ icon: 'receipt', title: 'جميع طلبات شراء النقاط', sub: recent.length ? `${N(recent.length)} طلب` : 'لا توجد طلبات بعد', to: 'orders' })])}`, { tab: 'buy', bar: `<div class="actionbar">${K.submitBtn('إرسال الطلب', 'purchase', 'primary', !packs.length || !methods.length ? 'disabled' : '')}</div>` });
  }
  function points(d, c) {
    const rows = d.pointTransactions.filter(t => t.customerId === c.id).sort(byNew);
    const hero = `<div class="hero"><small>الرصيد الحالي</small><div class="big">${N(D.balance(c.id, d))}<em>نقطة</em></div></div>`;
    const list = rows.length ? K.card(rows.map(x => K.row({ icon: x.type === 'credit' ? 'wallet' : 'repeat', tone: x.type === 'credit' ? 'ok' : '', title: `${x.type === 'credit' ? '+' : '−'}${N(x.points)} نقطة · ${x.type === 'credit' ? 'إضافة' : 'خصم'}`, sub: E(x.description || x.source), sub2: U.date(x.createdAt), act: 'operation-detail', attrs: `data-kind="points" data-id="${E(x.id)}"` }))) : K.empty('لا توجد حركات نقاط.', 'wallet');
    return withBar('رصيد النقاط وحركتها', '', hero + K.section('الحركات') + list, { tab: 'account' });
  }
  function orders(d, c) {
    const rows = d.purchaseRequests.filter(x => x.customerId === c.id).sort(byNew);
    return withBar('طلبات شراء النقاط', '', rows.length ? K.card(rows.map(r => K.row({ icon: 'receipt', title: r.packageSnapshot.name, sub: `${N(r.packageSnapshot.points)} نقطة · ${N(r.packageSnapshot.price)} ر.ي`, sub2: `${E(r.paymentReference)} · ${U.date(r.createdAt)}`, pill: K.pill(label(r.status), TONE[r.status] || ''), act: 'operation-detail', attrs: `data-kind="request" data-id="${E(r.id)}"` }))) : K.empty('لا توجد طلبات بعد.', 'receipt'), { tab: 'buy' });
  }
  function operations(d, c) {
    const rows = [
      ...d.pointTransactions.filter(t => t.customerId === c.id).map(x => ({ ...x, kind: 'points' })),
      ...d.purchaseRequests.filter(x => x.customerId === c.id).map(x => ({ ...x, kind: 'request' })),
      ...d.subscriptions.filter(x => x.customerId === c.id).map(x => ({ ...x, kind: 'subscription' })),
      ...(d.protectionOperations || []).filter(x => x.customerId === c.id).map(x => ({ ...x, kind: 'protection' }))
    ].sort(byNew);
    const title = x => x.kind === 'protection' ? `${OP_LABEL[x.type] || 'عملية حماية'}${x.packageSnapshot?.name ? ' — ' + x.packageSnapshot.name : ''}` : (x.description || x.packageSnapshot?.name || (x.kind === 'subscription' ? 'اشتراك حماية' : 'طلب نقاط'));
    const icon = { points: 'wallet', request: 'receipt', subscription: 'shield', protection: 'shield' };
    const list = rows.length ? K.card(rows.map(x => K.row({ icon: icon[x.kind], title: title(x), sub: U.date(x.createdAt), val: x.kind === 'points' ? `${x.type === 'credit' ? '+' : '−'}${N(x.points)} نقطة` : x.kind === 'request' ? '' : `${N(x.pointsCost)} نقطة`, pill: x.kind === 'request' ? K.pill(label(x.status), TONE[x.status] || '') : '', act: 'operation-detail', attrs: `data-kind="${x.kind}" data-id="${E(x.id)}"` }))) : K.empty('لا توجد عمليات مسجلة.', 'repeat');
    return withBar('العمليات', 'سجل نقاطك وطلباتك واشتراكاتك', list, { tab: 'operations' });
  }
  function operationDetail(d, kind, id, c) {
    const numberFor = nid => d.numbers.find(n => n.id === nid), companyOf = n => n && company(d, n);
    let title = 'تفاصيل العملية', rows = [];
    if (kind === 'points') {
      const x = d.pointTransactions.find(v => v.id === id && v.customerId === c.id); if (!x) return null;
      rows = [['نوع الحركة', x.type === 'credit' ? 'إضافة نقاط' : 'استخدام نقاط'], ['النقاط', `${x.type === 'credit' ? '+' : '−'}${N(x.points)}`], ['المصدر', E(x.source)], ['الوصف', E(x.description || '—')], ['التاريخ', U.date(x.createdAt)]];
    } else if (kind === 'request') {
      const x = d.purchaseRequests.find(v => v.id === id && v.customerId === c.id); if (!x) return null;
      title = 'تفاصيل طلب النقاط';
      rows = [['الباقة', E(x.packageSnapshot.name)], ['النقاط', N(x.packageSnapshot.points)], ['القيمة المالية', `${N(x.packageSnapshot.price)} ر.ي`], ['وسيلة الدفع', E(x.paymentMethodSnapshot.name)], ['المرجع', E(x.paymentReference)], ['الحالة', label(x.status)], ['تاريخ الطلب', U.date(x.createdAt)], ['تاريخ المراجعة', U.date(x.reviewedAt)], ['ملاحظة الإدارة', E(x.reviewNote || '—')]];
    } else if (kind === 'subscription') {
      const x = d.subscriptions.find(v => v.id === id && v.customerId === c.id); if (!x) return null;
      const n = numberFor(x.numberId);
      title = 'تفاصيل الاشتراك';
      rows = [['الرقم', `<span class="ltr">${E(n?.number || '—')}</span>`], ['الشركة', E(companyOf(n)?.name || '—')], ['الحالة', label(x.status)], ['بداية الاشتراك', U.date(x.startsAt)], ['الانتهاء', U.date(x.endsAt)], ['الأيام المضافة', N(x.addedDays || x.days)], ['تكلفة العملية', `${N(x.pointsCost)} نقطة`]];
      if (x.rateSnapshot) rows.splice(6, 0, ['التعرفة المسجلة', `${N(x.rateSnapshot)} نقطة/يوم`]);
    } else if (kind === 'protection') {
      const x = (d.protectionOperations || []).find(v => v.id === id && v.customerId === c.id); if (!x) return null;
      title = 'تفاصيل عملية الحماية';
      rows = [['نوع العملية', E(({ subscribe: 'اشتراك جديد', extend: 'تمديد', renew: 'تجديد' })[x.type] || x.type)], ['الرقم', `<span class="ltr">${E(numberFor(x.numberId)?.number || '—')}</span>`], ['باقة الحماية', E(x.packageSnapshot?.name || '—')], ['المدة', `${N(x.packageSnapshot?.days)} يوم`], ['التكلفة', `${N(x.pointsCost)} نقطة`], ['بداية الحماية', U.date(x.startsAt)], ['الانتهاء', U.date(x.endsAt)], ['التاريخ', U.date(x.createdAt)]];
    } else return null;
    return { title, body: K.kv(rows) };
  }

  /* ===================== الإشعارات والحساب ===================== */
  function notifications(d, c) {
    const ns = notices(d, c.id);
    return withBar('الإشعارات', ns.some(n => !n.readAt) ? `${N(ns.filter(n => !n.readAt).length)} جديد` : '', ns.length ? K.card(ns.map(n => K.row({ icon: 'bell', tone: n.readAt ? '' : 'dark', title: n.title, sub: E(n.body), sub2: U.date(n.createdAt), pill: K.pill(n.readAt ? 'مقروء' : 'جديد', n.readAt ? '' : 'dark'), act: 'notice-open', attrs: `data-id="${E(n.id)}"` }))) : K.empty('لا توجد إشعارات.', 'bell'), { tab: 'home' });
  }
  function account(d, c) {
    const sub = D.isSubscriber(d, c.id);
    const profile = `<section class="account-profile"><div class="hero center"><span class="ico">${K.ico('user')}</span><h2>${E(c.name)}</h2><p class="ltr" style="color:var(--hero-muted)">${E(c.email)}</p></div>${K.section('بيانات الحساب')}${K.kv([['البريد الإلكتروني', `<span class="ltr">${E(c.email)}</span>`], ['رصيد أمان', `${N(D.balance(c.id, d))} نقطة`], ['الصفة', sub ? 'مشترك' : 'حساب عميل غير مشترك']])}</section>`;
    const links = K.card([
      K.row({ icon: 'copy', title: 'معرّف الحساب', sub: `<span class="ltr">${E(c.accountId || c.id)}</span>`, act: 'copy-account-id' }),
      K.row({ icon: 'wallet', title: 'رصيد النقاط وحركتها', to: 'points' }),
      K.row({ icon: 'sliders', title: 'الإعدادات', to: 'settings' }),
      K.row({ icon: 'lock', title: 'تأمين التطبيق', to: 'security' }),
      K.row({ icon: 'help', title: 'المساعدة', act: 'account-help' }),
      K.row({ icon: 'doc', title: 'الشروط والأحكام', act: 'terms' }),
      K.row({ icon: 'shield', title: 'سياسة الخصوصية', act: 'privacy' })
    ]);
    return withBar('الحساب', '', `${profile}${K.section('الحساب والإعدادات')}${links}<div style="margin-top:16px">${K.btn('تسجيل الخروج', 'logout-open', '', '', 'logout')}</div>`, { tab: 'home' });
  }
  function settings(d, c, x) {
    const theme = x.theme;
    return withBar('الإعدادات', 'المظهر والإشعارات', `${K.fields(K.field({ id: 'theme', name: 'theme', label: 'نمط العرض', type: 'select', value: theme, options: [['light', 'فاتح'], ['dark', 'داكن'], ['device', 'حسب إعداد الجهاز']] }) + K.toggle('notifications-enabled', 'إظهار تنبيه الإشعارات داخل التطبيق', x.noticeDot, 'نقطة التنبيه فوق أيقونة الإشعارات في الرئيسية'))}`, { tab: 'home' });
  }
  function security(d, c) {
    return withBar('تأمين التطبيق', E(c.name), `${K.callout('lock', 'الجلسة الحالية', '<p class="sheet-text">يمكنك إنهاء الجلسة الحالية من هنا. لا تُحذف أي بيانات محفوظة.</p>')}<div style="margin-top:14px">${K.btn('إنهاء الجلسة', 'logout-open', 'primary')}</div>`, { tab: 'home' });
  }

  function build(route, d, c, x) {
    switch (route) {
      case 'radar': return radar(d, c, x);
      case 'numbers': return numbers(d, c, x);
      case 'buy': return buy(d, c, x);
      case 'operations': return operations(d, c, x);
      case 'points': return points(d, c, x);
      case 'orders': return orders(d, c, x);
      case 'notifications': return notifications(d, c, x);
      case 'account': return account(d, c, x);
      case 'settings': return settings(d, c, x);
      case 'security': return security(d, c, x);
      default: return { ...home(d, c, x), tab: 'home' };
    }
  }

  root.AmanCustomerScreens = { build, login, signup, numberDetail, operationDetail, resultView, numberState, notices, OP_LABEL };
})(window);
