/* AMAN Customer — غلاف التطبيق: التوجيه، النوافذ السفلية، النماذج والعمليات.
   كل الكتابة تمر عبر AmanData (المخزن المحلي AMAN_SHARED_REGISTRY_V2)؛ لا منطق أعمال هنا. */
(function () {
  'use strict';
  const D = AmanData, U = AmanUI, K = AmanCustomerKit, S = AmanCustomerScreens;
  const E = K.esc, N = U.fmt, $ = s => document.querySelector(s);
  const TABS = [['radar', 'الرادار', 'radar'], ['numbers', 'الأرقام', 'numbers'], ['home', 'الرئيسية', 'home'], ['buy', 'شراء نقاط', 'card'], ['operations', 'العمليات', 'repeat']];
  const ROUTES = ['home', 'radar', 'numbers', 'buy', 'operations', 'points', 'orders', 'notifications', 'account', 'settings', 'security'];
  const PARENT = { orders: 'buy', settings: 'account', security: 'account' };

  const ui = { id: sessionStorage.getItem('aman.customer') || '', route: 'home', auth: 'login', q: '', co: '', lookup: null, sheet: false, busy: false, view: null, pending: null, key: '', scroll: {} };

  /* ===================== الدخول وتذكر البريد (البريد فقط) ===================== */
  function rememberedCredentials() {
    try {
      const key = 'aman.customer.remember', v = JSON.parse(localStorage.getItem(key) || 'null'), result = { email: String(v?.email || ''), enabled: !!v?.enabled };
      if (v && Object.prototype.hasOwnProperty.call(v, 'password')) { if (result.enabled) localStorage.setItem(key, JSON.stringify(result)); else localStorage.removeItem(key); }
      return result;
    } catch { return { email: '', enabled: false }; }
  }
  function saveRememberedCredentials(email, enabled) {
    if (enabled) localStorage.setItem('aman.customer.remember', JSON.stringify({ email, enabled: true }));
    else localStorage.removeItem('aman.customer.remember');
  }
  async function digest(p) {
    const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(p));
    return [...new Uint8Array(h)].map(x => x.toString(16).padStart(2, '0')).join('');
  }

  /* ===================== المظهر والتفضيلات ===================== */
  const selectedTheme = () => localStorage.getItem('aman.customer.theme') || (localStorage.getItem('aman.customer.dark') === '1' ? 'dark' : 'light');
  const notificationsEnabled = () => localStorage.getItem(`aman.customer.notifications.${ui.id}`) !== '0';
  function applyTheme() {
    const t = selectedTheme();
    document.body.classList.toggle('dark', t === 'dark' || (t === 'device' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches));
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', document.body.classList.contains('dark') ? '#0c0d0d' : '#f1f3f2');
  }

  /* ===================== التوجيه وسجل الرجوع ===================== */
  const hashRoute = () => { const r = decodeURIComponent(location.hash.replace(/^#\/?/, '')) || 'home'; return ROUTES.includes(r) ? r : 'home'; };
  const histState = () => (history.state && history.state.amanCustomer ? history.state : null);
  function saveScroll() { const s = $('#screen'); if (s) ui.scroll[ui.route] = s.scrollTop; }
  function go(route, { replace = false } = {}) {
    if (!ROUTES.includes(route)) return;
    closeSheet(); saveScroll();
    const d = histState()?.d || 0, st = { amanCustomer: true, route, d: replace ? d : d + 1 };
    (replace ? history.replaceState : history.pushState).call(history, st, '', '#/' + route);
    if (route !== ui.route) { ui.q = ''; ui.co = ''; }
    ui.route = route;
    render({ top: true });
  }
  function back() {
    closeSheet();
    if ((histState()?.d || 0) > 0) history.back();
    else go(PARENT[ui.route] || 'home', { replace: true });
  }
  window.addEventListener('popstate', e => {
    if (ui.sheet) { // زر الرجوع يغلق النافذة السفلية أولًا ولا يغادر الصفحة
      closeSheet();
      history.pushState({ amanCustomer: true, route: ui.route, d: (e.state?.d || 0) + 1 }, '', '#/' + ui.route);
      return;
    }
    const r = e.state?.amanCustomer ? e.state.route : hashRoute();
    if (r !== ui.route) { ui.q = ''; ui.co = ''; }
    ui.route = ROUTES.includes(r) ? r : 'home';
    render({ restore: true });
  });

  /* ===================== العرض ===================== */
  function snapshot() {
    const all = D.read();
    if (ui.id && !all.customers.some(x => x.id === ui.id)) { sessionStorage.removeItem('aman.customer'); ui.id = ''; }
    if (!ui.id) return { d: all, c: null };
    const d = D.readForCustomer(ui.id);
    return { d, c: d.customers[0] };
  }
  function fatal(e) {
    $('#screen').className = 'screen'; $('#bar').innerHTML = ''; $('#tabbar').hidden = true;
    $('#screen').innerHTML = `<div class="card empty" style="margin-top:40px">${K.tile('info', 'bad')}<b>تعذر تحميل البيانات</b><p>${E(e.message)}</p><p>لم تُستبدل البيانات المحفوظة.</p></div>`;
  }
  function render(opt = {}) {
    let snap;
    try { snap = snapshot(); } catch (e) { fatal(e); return; }
    applyTheme();
    const screen = $('#screen'), tabbar = $('#tabbar'), barEl = $('#bar'), keepTop = screen.scrollTop;
    if (!snap.c) {
      screen.className = 'screen auth auth-screen';
      screen.innerHTML = ui.auth === 'login' ? S.login(rememberedCredentials()) : S.signup();
      barEl.innerHTML = ''; tabbar.hidden = true; ui.view = null; return;
    }
    const v = S.build(ui.route, snap.d, snap.c, ctxNow());
    ui.view = v;
    screen.className = 'screen' + (v.bar ? ' with-bar' : '');
    screen.innerHTML = v.html;
    barEl.innerHTML = v.bar || '';
    tabbar.hidden = false;
    tabbar.innerHTML = TABS.map(([k, label, icon]) => `<button type="button" class="tab" data-act="go" data-to="${k}" ${k === (v.tab || 'home') ? 'aria-current="page"' : ''}>${K.ico(icon)}<span>${label}</span></button>`).join('');
    document.title = 'أمان | العميل';
    if (opt.top) screen.scrollTop = 0; else if (opt.restore) screen.scrollTop = ui.scroll[ui.route] || 0; else screen.scrollTop = keepTop;
  }
  // تحديث القائمة وحدها أثناء الكتابة في البحث/الفلتر (تُبنى من جديد ببيانات وقيم البحث الحالية)
  function refreshList() {
    const b = $('#listbody'); if (!b || !ui.view?.list) return;
    try { const { d, c } = snapshot(); if (c) b.innerHTML = S.build(ui.route, d, c, ctxNow()).list(); } catch (e) { fatal(e); }
  }
  const ctxNow = () => ({ q: ui.q, co: ui.co, lookup: ui.lookup, theme: selectedTheme(), noticeDot: notificationsEnabled(), id: ui.id });
  // تحديث الرأس فقط (الرصيد ونقطة الإشعارات) دون إعادة بناء الشاشة، حتى لا يضيع ما يكتبه العميل
  function refreshHeader() {
    try {
      const { d, c } = snapshot(); if (!c) return render();
      const bal = $('#balance'); if (bal) bal.textContent = `${N(D.balance(c.id, d))} نقطة`;
      const dot = $('#unreadDot'); if (dot) dot.classList.toggle('hidden', !(notificationsEnabled() && S.notices(d, c.id).some(n => !n.readAt)));
    } catch { /* يظهر الخطأ عند إعادة العرض التالية */ }
  }

  /* ===================== التنبيه والنوافذ ===================== */
  function toast(text, bad = false) {
    const e = $('#toast'); e.textContent = text; e.classList.remove('hidden', 'error'); e.classList.toggle('error', bad);
    e.classList.toggle('up', !!$('#bar .actionbar')); e.classList.toggle('auth-toast', !ui.id);
    clearTimeout(toast.t); toast.t = setTimeout(() => e.classList.add('hidden'), 3800);
  }
  function openSheet(title, body, foot) {
    ui.sheet = true; $('#sheetRoot').innerHTML = K.sheet(title, body, foot);
    setTimeout(() => $('#sheetRoot input:not([type=hidden]),#sheetRoot select')?.focus(), 30);
  }
  function closeSheet() { if (!ui.sheet) return; ui.sheet = false; $('#sheetRoot').innerHTML = ''; }
  function showError(msg) {
    const el = document.querySelector('#sheetRoot #form-error') || $('#form-error');
    if (el) { el.textContent = msg; el.classList.remove('hidden'); el.scrollIntoView?.({ block: 'nearest' }); return true; }
    toast(msg, true); return false;
  }
  const clearError = () => document.querySelectorAll('#form-error').forEach(e => e.classList.add('hidden'));
  const lockables = () => document.querySelectorAll('[data-submit],.btn[data-confirm]');
  async function run(fn) {
    if (ui.busy) return false;
    ui.busy = true; clearError(); lockables().forEach(b => b.disabled = true);
    try { await fn(); return true; }
    catch (err) { showError(err?.message || 'تعذرت العملية ولم تُحفظ تغييرات.'); return false; }
    finally { ui.busy = false; lockables().forEach(b => b.disabled = false); }
  }
  const errBox = '<div id="form-error" class="form-error hidden" role="alert"></div>';
  const textSheet = (title, text) => openSheet(title, `<p class="sheet-text">${E(text)}</p>`, K.btn('إغلاق', 'sheet-close', 'primary'));

  /* ===================== نوافذ العمليات ===================== */
  const data = () => (ui.id ? D.readForCustomer(ui.id) : D.read());
  const ownedNumber = (d, id) => D.customerNumbers(ui.id, d).find(n => n.id === id);

  function openNumberDetail(id) {
    const d = data(), n = ownedNumber(d, id); if (!n) return;
    const v = S.numberDetail(d, n, ui.id);
    openSheet(v.title, v.body, v.foot);
  }
  function addNumberSheet() {
    openSheet('إضافة رقم إلى أرقامي', `<form id="add-number-form" data-form="add-number">${K.fields(K.field({ id: 'newNumber', name: 'number', label: 'رقم الهاتف', type: 'tel', required: true, inputmode: 'numeric', dir: 'ltr', autocomplete: 'tel-national' }))}<p id="modal-company" class="note">أدخل الرقم لتحديد شركة الاتصالات</p>${errBox}</form><p class="note">إضافة الرقم لا تخصم نقاطًا ولا تفعّل الحماية.</p>`, K.submitBtn('إضافة الرقم', 'add-number-form') + K.btn('إلغاء', 'sheet-close'));
  }
  function protectionPathSheet(number, companyId, operation) {
    const d = data(), packs = (d.protectionPackages || []).filter(p => p.companyId === companyId && p.active !== false);
    if (!packs.length) throw new Error('لا توجد باقات حماية متاحة لهذه الشركة.');
    ui.key = D.uid('idem');
    const title = operation === 'extend' ? 'تمديد الحماية' : operation === 'renew' ? 'تجديد الحماية' : 'تفعيل الحماية';
    openSheet(title, `${K.kv([['الرقم', `<span class="ltr">${E(number)}</span>`], ['الشركة', E(d.companies.find(c => c.id === companyId)?.name || '')], ['رصيد النقاط', `${N(D.balance(ui.id, d))} نقطة`]])}${K.fields(K.field({ id: 'protectionPackage', name: 'protectionPackage', label: 'باقة الحماية', type: 'select', options: packs.map(p => [p.id, `${p.name} · ${N(p.days)} يوم · ${N(p.pointsCost)} نقطة`]) }))}${errBox}`,
      K.btn('مراجعة العملية', 'protection-review', 'primary', `data-number="${E(number)}" data-company="${E(companyId)}" data-operation="${operation}"`) + K.btn('إلغاء', 'sheet-close'));
  }
  function protectionReviewSheet(number, companyId, operation) {
    const packageId = $('#protectionPackage')?.value;
    if (!packageId) throw new Error('اختر باقة حماية متاحة.');
    const d = data(), p = (d.protectionPackages || []).find(x => x.id === packageId);
    if (!p) throw new Error('باقة الحماية غير متاحة.');
    const balance = D.balance(ui.id, d);
    let netDays = Number(p.days), starts = 'الآن', ends = '';
    if (operation === 'renew') {
      const previous = d.subscriptions.filter(x => x.numberId === (d.numbers.find(n => n.number === number)?.id)).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
      if (previous) {
        const elapsed = Math.max(0, Math.floor((Date.now() + 10800000) / 86400000) - Math.floor((new Date(previous.endsAt).getTime() + 10800000) / 86400000));
        netDays = Math.max(0, Number(p.days) - elapsed);
      }
      if (netDays <= 0) throw new Error('انتهت المدة الصافية للباقة بعد احتساب الأيام المنقضية؛ اختر باقة أخرى.');
    }
    if (operation === 'extend') {
      const cur = D.activeSubscription(d, d.numbers.find(n => n.number === number)?.id);
      if (cur) { starts = U.date(cur.endsAt); ends = U.date(D.datePlus(cur.endsAt, Number(p.days))); }
    }
    ui.pending = { number, operation, packageId, key: ui.key };
    const labels = { subscribe: 'الاشتراك في الحماية', extend: 'تمديد الحماية', renew: 'تجديد الحماية' };
    const rows = [['العملية', labels[operation] || 'عملية الحماية'], ['رقم الهاتف', `<span class="ltr">${E(number)}</span>`], ['الباقة', E(p.name)], ['المدة الصافية', `${N(netDays)} يوم`], ['التكلفة', `${N(p.pointsCost)} نقطة`], ['الرصيد الحالي', `${N(balance)} نقطة`], ['الرصيد بعد الخصم', `${N(balance - Number(p.pointsCost))} نقطة`], ['بداية العملية', starts]];
    if (ends) rows.push(['الانتهاء المتوقع', ends]);
    openSheet('مراجعة عملية الحماية', `${K.kv(rows)}<p class="sheet-text">لن يُخصم الرصيد إلا بعد التأكيد النهائي.</p>${errBox}`,
      K.btn('تأكيد وخصم النقاط', 'protection-confirm', 'primary', 'data-confirm') + K.btn('رجوع', 'protection-path', '', `data-number="${E(number)}" data-company="${E(companyId)}" data-operation="${operation}"`));
  }
  function numberNotificationsSheet(id) {
    const d = data(), n = ownedNumber(d, id); if (!n) return;
    const list = S.notices(d, ui.id).filter(x => x.numberId === n.id || String(x.body || '').includes(n.number));
    openSheet('إشعارات الرقم', `<p class="sheet-text ltr">${E(n.number)}</p>${list.length ? K.card(list.map(x => K.row({ icon: 'bell', title: x.title, sub: E(x.body), sub2: `${U.date(x.createdAt)} · ${x.readAt ? 'مقروء' : 'جديد'}`, act: 'notice-open', attrs: `data-id="${E(x.id)}"` }))) : K.empty('لا توجد إشعارات مرتبطة بهذا الرقم.', 'bell')}`, K.btn('إغلاق', 'sheet-close', 'primary'));
  }
  const logoutSheet = () => openSheet('تسجيل الخروج', '<p class="sheet-text">هل تريد إنهاء الجلسة الحالية؟ لا تُحذف أي بيانات محفوظة.</p>', K.btn('تسجيل الخروج', 'logout-confirm', 'primary') + K.btn('إلغاء', 'sheet-close'));

  /* ===================== معالجة النقر ===================== */
  document.addEventListener('click', async e => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const a = b.dataset.act, id = b.dataset.id;
    if (a === 'sheet-scrim') { if (e.target === b) closeSheet(); return; }
    try {
      switch (a) {
        case 'go': go(b.dataset.to); return;
        case 'back': back(); return;
        case 'sheet-close': closeSheet(); return;
        case 'signup-view': ui.auth = 'signup'; render(); return;
        case 'login-view': ui.auth = 'login'; render(); return;
        case 'search-again': ui.lookup = null; render(); return;
        case 'number-detail': openNumberDetail(id); return;
        case 'add-number-open': addNumberSheet(); return;
        case 'add-search-number': await run(async () => { await D.addNumber(ui.id, b.dataset.number); ui.lookup = D.searchNumberStatus(ui.id, b.dataset.number); render(); toast('أُضيف الرقم إلى أرقامك دون إجراء بحث جديد أو تفعيل حماية.'); }); return;
        case 'protection-path': protectionPathSheet(b.dataset.number, b.dataset.company, b.dataset.operation); return;
        case 'protection-review': protectionReviewSheet(b.dataset.number, b.dataset.company, b.dataset.operation); return;
        case 'protection-confirm': await run(async () => {
          const p = ui.pending; if (!p) throw new Error('انتهت صلاحية المراجعة؛ أعد المحاولة.');
          await D.performProtectionOperation(ui.id, p.number, p.packageId, p.operation, p.key);
          ui.pending = null; closeSheet(); ui.lookup = null; render(); toast('نُفذت عملية الحماية وسُجل الخصم محليًا.');
        }); return;
        case 'radar-toggle': await run(async () => {
          await D.transact(ui.id, 'radar_toggled', d => { const n = D.customerNumbers(ui.id, d).find(x => x.id === id); if (!n || !D.activeSubscription(d, n.id)) throw new Error('لا يمكن متابعة الرقم قبل تفعيل الاشتراك.'); n.radar = !n.radar; return { entityType: 'number', entityId: n.id, summary: n.radar ? 'إضافة للرادار' : 'إزالة من الرادار' }; });
          closeSheet(); render(); toast('تم تحديث المتابعة.');
        }); return;
        case 'radar-remove': await run(async () => {
          await D.transact(ui.id, 'radar_toggled', d => { const n = D.customerNumbers(ui.id, d).find(x => x.id === id); if (n) n.radar = false; return { entityType: 'number', entityId: n?.id, summary: 'إيقاف متابعة الرادار' }; });
          render(); toast('تم إيقاف المتابعة.');
        }); return;
        case 'number-notifications': numberNotificationsSheet(id); return;
        case 'notice-open': {
          const n = S.notices(data(), ui.id).find(x => x.id === id); if (!n) return;
          await D.markNoticeRead(ui.id, n.id);
          openSheet(n.title, `<p class="sheet-text" style="color:var(--ink)">${E(n.body)}</p><p class="note">${U.date(n.createdAt)}</p>`, K.btn('إغلاق', 'sheet-close', 'primary'));
          render(); return;
        }
        case 'operation-detail': {
          const v = S.operationDetail(data(), b.dataset.kind, id, data().customers[0]); if (!v) return;
          openSheet(v.title, v.body, K.btn('إغلاق', 'sheet-close', 'primary')); return;
        }
        case 'terms': case 'privacy': {
          const content = data().content?.[a] || 'لم يضف المسؤول نصًا بعد.';
          textSheet(a === 'terms' ? 'الشروط والأحكام' : 'سياسة الخصوصية', content); return;
        }
        case 'account-help': {
          const c = data().customers?.[0];
          textSheet('المساعدة', `معرّف الحساب ${c?.accountId || c?.id || ''} هو الرمز المستخدم للتعريف بحسابك في هذا النموذج المحلي.`); return;
        }
        case 'copy-account-id': {
          const c = data().customers[0], value = c?.accountId || c?.id || '';
          if (navigator.clipboard?.writeText) { try { await navigator.clipboard.writeText(value); toast('تم نسخ معرّف الحساب.'); } catch { toast(`معرّف الحساب: ${value}`); } }
          else toast(`معرّف الحساب: ${value}`);
          return;
        }
        case 'logout-open': logoutSheet(); return;
        case 'logout-confirm':
          sessionStorage.removeItem('aman.customer'); ui.id = ''; ui.auth = 'login'; ui.lookup = null; closeSheet();
          history.replaceState({ amanCustomer: true, route: 'home', d: 0 }, '', '#/home'); ui.route = 'home'; render({ top: true }); return;
      }
    } catch (x) { toast(x.message || 'تعذرت العملية ولم تُحفظ تغييرات.', true); }
  });

  /* ===================== معالجة النماذج ===================== */
  document.addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target, kind = f.dataset.form, fd = new FormData(f);
    await run(async () => {
      switch (kind) {
        case 'login': {
          const email = String(fd.get('email')).trim().toLowerCase(), password = String(fd.get('password')), remember = fd.get('remember') === 'on';
          if (password.length < 4) throw new Error('كلمة المرور يجب ألا تقل عن 4 خانات.');
          let c = D.read().customers.find(x => x.email.toLowerCase() === email);
          /* حساب معاينة محلي مخصص لتسريع اختبار واجهة العميل فقط. */
          if (!c && email === 'demo@aman.test' && password === 'aman1234') {
            const hash = await digest(password);
            const created = await D.transact('local-demo', 'customer_demo_created', x => {
              const existing = x.customers.find(y => y.email.toLowerCase() === email);
              if (existing) return { entityType: 'customer', entityId: existing.id, summary: 'استخدام حساب العميل التجريبي' };
              const demo = { id: 'cus-aman-demo', accountId: 'AMAN-DEMO', name: 'عميل تجريبي', email, status: 'active', isSubscriber: false, createdAt: D.now(), authHash: hash };
              x.customers.push(demo);
              x.pointTransactions.push({ id: D.uid('pt'), customerId: demo.id, type: 'credit', points: 0, source: 'demo', sourceId: demo.id, createdAt: D.now(), description: 'حساب معاينة تجريبي' });
              return { entityType: 'customer', entityId: demo.id, summary: 'إنشاء حساب العميل التجريبي' };
            });
            c = D.read().customers.find(x => x.id === created.result.entityId);
          }
          if (!c) throw new Error('البريد الإلكتروني غير مسجل.');
          if (!c.authHash || (await digest(password)) !== c.authHash) throw new Error('بيانات الدخول غير صحيحة.');
          saveRememberedCredentials(email, remember);
          ui.id = c.id; sessionStorage.setItem('aman.customer', c.id);
          history.replaceState({ amanCustomer: true, route: 'home', d: 0 }, '', '#/home'); ui.route = 'home'; render({ top: true }); return;
        }
        case 'signup': {
          const name = String(fd.get('name')).trim(), email = String(fd.get('email')).trim().toLowerCase(), password = String(fd.get('password'));
          if (password.length < 4) throw new Error('كلمة المرور يجب ألا تقل عن 4 خانات.');
          if (!$('#agree')?.checked) throw new Error('وافق على الشروط والأحكام للمتابعة.');
          const hash = await digest(password);
          const { result } = await D.transact('local-signup', 'customer_registered', d => {
            if (d.customers.some(x => x.email.toLowerCase() === email)) throw new Error('البريد مسجل بالفعل.');
            const c = { id: D.uid('cus'), accountId: D.uid('AMAN'), name, email, status: 'active', isSubscriber: false, createdAt: D.now(), authHash: hash };
            d.customers.push(c);
            d.pointTransactions.push({ id: D.uid('pt'), customerId: c.id, type: 'credit', points: 0, source: 'signup', sourceId: c.id, createdAt: D.now(), description: 'تسجيل حساب جديد' });
            return { entityType: 'customer', entityId: c.id, summary: 'تسجيل عميل محلي' };
          });
          ui.id = result.entityId; sessionStorage.setItem('aman.customer', ui.id);
          history.replaceState({ amanCustomer: true, route: 'home', d: 0 }, '', '#/home'); ui.route = 'home'; render({ top: true });
          toast('أُنشئ الحساب. الحساب الجديد ليس مشتركًا حتى اعتماد أول طلب نقاط.'); return;
        }
        case 'number-search': ui.lookup = D.searchNumberStatus(ui.id, fd.get('number')); render(); return;
        case 'add-number': await D.addNumber(ui.id, fd.get('number')); closeSheet(); render(); toast('أُضيف الرقم إلى أرقامك دون تفعيل حماية أو خصم نقاط.'); return;
        case 'purchase': await D.createPurchase(ui.id, fd.get('packageId'), fd.get('paymentId'), fd.get('reference')); render(); toast('تم إرسال الطلب للمراجعة.'); return;
        default: throw new Error('تعذر العثور على النموذج.');
      }
    });
  });

  /* ===================== البحث والفلترة والإعدادات ===================== */
  document.addEventListener('input', e => {
    const t = e.target;
    if (t.id === 'q') { ui.q = t.value; refreshList(); return; }
    if (t.id === 'newNumber' || t.id === 'search-number-input') {
      const co = D.companyFor(t.value, D.read()), el = $(t.id === 'newNumber' ? '#modal-company' : '#search-company');
      if (el) el.textContent = co ? `شركة الاتصالات: ${co.name}` : (t.value.trim() ? 'لم يتم التعرف على شركة الاتصالات من بادئة الرقم' : (t.id === 'newNumber' ? 'أدخل الرقم لتحديد شركة الاتصالات' : 'أدخل الرقم للتعرف على الشركة إن أمكن.'));
    }
  });
  document.addEventListener('change', e => {
    const t = e.target;
    if (t.id === 'flt') { ui.co = t.value; refreshList(); return; }
    if (t.id === 'quickNumber') { const input = $('#search-number-input'); if (input) { input.value = t.value; input.dispatchEvent(new Event('input', { bubbles: true })); } return; }
    if (t.id === 'paymentId') { const m = data().paymentMethods.find(x => x.id === t.value); const el = $('#paymentInstructions'); if (el) el.textContent = m?.instructions || 'لا توجد تعليمات'; return; }
    if (t.id === 'theme') { localStorage.setItem('aman.customer.theme', t.value); localStorage.setItem('aman.customer.dark', t.value === 'dark' ? '1' : '0'); applyTheme(); return; }
    if (t.id === 'notifications-enabled') { localStorage.setItem(`aman.customer.notifications.${ui.id}`, t.checked ? '1' : '0'); render(); toast(t.checked ? 'تم تفعيل تنبيه الإشعارات المحلي.' : 'تم إيقاف تنبيه الإشعارات المحلي.'); }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && ui.sheet) { e.preventDefault(); closeSheet(); } });

  // تغيّر المخزن من تبويب آخر (مثل الإدارة): حدّث الرأس دائمًا، وأعد بناء الشاشة فقط إن لم يكن العميل يكتب أو في نافذة مفتوحة
  window.addEventListener('storage', e => {
    if (e.key !== D.KEY) return;
    const typing = document.activeElement && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName) && $('#screen')?.contains(document.activeElement);
    if (ui.sheet || typing) { refreshHeader(); return; }
    render();
  });
  window.addEventListener('pageshow', () => { if (!ui.sheet) render(); });

  /* ===================== الإقلاع ===================== */
  ui.route = ui.id ? hashRoute() : 'home';
  if (!histState()) history.replaceState({ amanCustomer: true, route: ui.route, d: 0 }, '', '#/' + ui.route);
  render({ top: true });
})();
