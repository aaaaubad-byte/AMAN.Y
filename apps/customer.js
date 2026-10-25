/* AMAN Customer — غلاف التطبيق: التوجيه، النوافذ السفلية، النماذج والعمليات.
   كل الكتابة تمر عبر AmanData (المخزن المحلي AMAN_SHARED_REGISTRY_V2)؛ لا منطق أعمال هنا. */
(function () {
  'use strict';
  const D = AmanData, U = AmanUI, K = AmanCustomerKit, S = AmanCustomerScreens;
  const E = K.esc, N = U.fmt, $ = s => document.querySelector(s);
  const TABS = [['radar', 'الرادار', 'radar'], ['numbers', 'الأرقام', 'numbers'], ['home', 'الرئيسية', 'home'], ['buy', 'شراء نقاط', 'card'], ['operations', 'العمليات', 'repeat']];
  const ROUTES = ['home', 'radar', 'numbers', 'buy', 'operations', 'points', 'orders', 'notifications', 'account', 'settings', 'security'];
  const PARENT = { orders: 'buy', settings: 'account', security: 'account' };

  const DEMO = new URLSearchParams(location.search).get('demo') === '1'; // وضع المعاينة فقط: تعبئة بيانات الدخول وحساب العميل التجريبي
  const ui = { limit: 0, id: sessionStorage.getItem('aman.customer') || '', route: 'home', auth: 'login', q: '', co: '', lookup: null, sheet: false, busy: false, view: null, pending: null, key: '', scroll: {} };

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
  /* كلمات المرور: PBKDF2-SHA256 بملح عشوائي لكل حساب. التجزئة القديمة (SHA-256 بلا ملح) تُقبل وتُرقّى عند أول دخول ناجح.
     تنبيه: هذا نموذج محلي؛ التجزئة والتحقق في المتصفح لا يغنيان عن مصادقة خادم في الإنتاج. */
  const PBKDF2_ITER = 150000;
  const b64 = u8 => btoa(String.fromCharCode(...u8));
  const unb64 = t => Uint8Array.from(atob(t), ch => ch.charCodeAt(0));
  async function sha256hex(p) {
    const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(p));
    return [...new Uint8Array(h)].map(x => x.toString(16).padStart(2, '0')).join('');
  }
  async function pbkdf2(p, salt, iter) {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(p), 'PBKDF2', false, ['deriveBits']);
    return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, key, 256));
  }
  const sameText = (a, b) => { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; };
  async function hashPassword(p) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    return `pbkdf2$${PBKDF2_ITER}$${b64(salt)}$${b64(await pbkdf2(p, salt, PBKDF2_ITER))}`;
  }
  async function verifyPassword(p, stored) {
    if (typeof stored !== 'string' || !stored) return false;
    if (stored.startsWith('pbkdf2$')) {
      const [, iter, salt, hash] = stored.split('$'), n = Number(iter);
      if (!Number.isInteger(n) || n < 1000 || !salt || !hash) return false;
      return sameText(b64(await pbkdf2(p, unb64(salt), n)), hash);
    }
    return sameText(await sha256hex(p), stored); // تجزئة قديمة
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
  // رابط فيه % مشوّه لا يجوز أن يكسر التطبيق: يُعامَل كمسار غير معروف فيعود إلى الرئيسية
  const hashRoute = () => { let r = 'home'; try { r = decodeURIComponent(location.hash.replace(/^#\/?/, '')) || 'home'; } catch { /* مشوّه */ } return ROUTES.includes(r) ? r : 'home'; };
  const histState = () => (history.state && history.state.amanCustomer ? history.state : null);
  function saveScroll() { const s = $('#screen'); if (s) ui.scroll[ui.route] = s.scrollTop; }
  function go(route, { replace = false } = {}) {
    if (!ROUTES.includes(route)) return;
    closeSheet(); saveScroll();
    const d = histState()?.d || 0, st = { amanCustomer: true, route, d: replace ? d : d + 1 };
    (replace ? history.replaceState : history.pushState).call(history, st, '', '#/' + route);
    if (route !== ui.route) { ui.q = ''; ui.co = ''; ui.limit = 0; }
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
    if (r !== ui.route) { ui.q = ''; ui.co = ''; ui.limit = 0; }
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
    $('#screen').innerHTML = `<div class="card empty" style="margin-top:40px">${K.tile('info', 'bad')}<b>تعذر تحميل البيانات</b><p>${E(e.message)}</p><p>لم تُستبدل البيانات المحفوظة.</p><div class="empty-action">${K.btn('إعادة المحاولة', 'retry', 'primary')}</div></div>`;
  }
  // إعادة المحاولة (37): يظهر هيكل التحميل لحظة ثم تُعاد المحاولة؛ إن تكرر الفشل تعود شاشة الخطأ نفسها
  function retryLoad() {
    const screen = $('#screen'); screen.className = 'screen'; screen.innerHTML = K.skeleton(4);
    setTimeout(() => render({ top: true }), 350);
  }
  function render(opt = {}) {
    let snap;
    try { snap = snapshot(); } catch (e) { fatal(e); return; }
    applyTheme();
    const screen = $('#screen'), tabbar = $('#tabbar'), barEl = $('#bar'), keepTop = screen.scrollTop;
    if (!snap.c) {
      screen.className = 'screen auth auth-screen';
      screen.innerHTML = ui.auth === 'login' ? S.login(rememberedCredentials(), DEMO) : S.signup();
      barEl.innerHTML = ''; tabbar.hidden = true; ui.view = null;
      { // تركيز تلقائي على أول حقل فارغ في شاشات الدخول (البند 14)
        const els = [...screen.querySelectorAll('input:not([type=checkbox]):not([type=hidden])')];
        (els.find(i => !i.value) || els[0])?.focus({ preventScroll: true });
      }
      return;
    }
    const v = S.build(ui.route, snap.d, snap.c, ctxNow());
    ui.view = v;
    screen.className = 'screen' + (v.bar ? ' with-bar' : '');
    screen.innerHTML = v.html;
    barEl.innerHTML = v.bar || '';
    tabbar.hidden = false;
    tabbar.innerHTML = TABS.map(([k, label, icon]) => `<button type="button" class="tab" data-act="go" data-to="${k}" ${k === (v.tab || 'home') ? 'aria-current="page"' : ''}>${K.ico(icon)}<span>${label}</span></button>`).join('');
    document.title = 'أمان | العميل';
    applyPaging();
    if (opt.top) screen.scrollTop = 0; else if (opt.restore) screen.scrollTop = ui.scroll[ui.route] || 0; else screen.scrollTop = keepTop;
  }
  // تحديث القائمة وحدها أثناء الكتابة في البحث/الفلتر (تُبنى من جديد ببيانات وقيم البحث الحالية)
  /* تحميل المزيد (56): القوائم الطويلة (أكثر من 30 صفًا في بطاقة واحدة) تُعرض على صفحات بعد العرض؛ لا يتغير بناء الشاشات */
  const PAGE = 30;
  function applyPaging() {
    const lim = ui.limit || PAGE;
    document.querySelectorAll('#screen .more-wrap').forEach(w => w.remove());
    document.querySelectorAll('#screen .card').forEach(card => {
      const rows = [...card.children].filter(e => e.classList.contains('row'));
      rows.forEach(r => { r.hidden = false; });
      if (rows.length <= lim) return;
      rows.forEach((r, i) => { r.hidden = i >= lim; });
      const w = document.createElement('div'); w.className = 'more-wrap';
      w.innerHTML = K.btn(`تحميل المزيد (${N(rows.length - lim)} متبقٍ)`, 'load-more', 'small'); card.after(w);
    });
  }
  function refreshList() {
    const b = $('#listbody'); if (!b || !ui.view?.list) return;
    try { const { d, c } = snapshot(); if (c) { b.innerHTML = S.build(ui.route, d, c, ctxNow()).list(); applyPaging(); } } catch (e) { fatal(e); }
  }
  /* ----- الباقة ووسيلة الدفع المفضلتان (بند 46): تُحفظ محليًا لكل عميل؛ المرجع والمبلغ لا يُحفظان أبدًا ----- */
  const favKey = () => 'aman.customer.fav.' + ui.id;
  function loadFav() {
    try { const v = JSON.parse(localStorage.getItem(favKey()) || 'null'); return v && typeof v === 'object' ? { packageId: String(v.packageId || ''), paymentId: String(v.paymentId || '') } : {}; } catch { return {}; }
  }
  function storeFav(v) { try { v ? localStorage.setItem(favKey(), JSON.stringify(v)) : localStorage.removeItem(favKey()); } catch { /* التخزين غير متاح: تبقى المفضلة للجلسة فقط */ } }
  // يزامن حالة الشراء مع ما اختاره العميل في النموذج قبل أي انتقال أو إعادة رسم
  function syncBuy() {
    const f = $('#purchase'); if (!f) return ui.buy ||= { step: 1 };
    const fd = new FormData(f), b = ui.buy ||= { step: 1 };
    b.touched = true;
    for (const k of ['packageId', 'paymentId', 'reference']) if (fd.has(k)) b[k] = String(fd.get(k));
    b.saveFav = !!$('#saveFav')?.checked || (b.saveFav && !$('#saveFav'));
    return b;
  }
  function buyStep(to) { const b = syncBuy(); b.step = Math.min(4, Math.max(1, to)); render({ top: true }); }
  const ctxNow = () => ({ buy: ui.buy || {}, fav: loadFav(), q: ui.q, co: ui.co, lookup: ui.lookup, theme: selectedTheme(), noticeDot: notificationsEnabled(), id: ui.id });
  // تحديث الرأس فقط (الرصيد ونقطة الإشعارات) دون إعادة بناء الشاشة، حتى لا يضيع ما يكتبه العميل
  function refreshHeader() {
    try {
      const { d, c } = snapshot(); if (!c) return render();
      const bal = $('#balance'); if (bal) bal.textContent = `${N(D.balance(c.id, d))} نقطة`;
      const dot = $('#unreadDot'); if (dot) { const n = notificationsEnabled() ? S.notices(d, c.id).filter(x => !x.readAt).length : 0; dot.textContent = n ? (n > 9 ? '9+' : N(n)) : ''; dot.classList.toggle('hidden', !n); }
    } catch { /* يظهر الخطأ عند إعادة العرض التالية */ }
  }

  /* ===================== التنبيه والنوافذ ===================== */
  /* إشعار قصير (58). undo = { fn, label? } للإجراءات غير المالية القابلة للعكس بأمان فقط (24)؛
     يبقى التراجع متاحًا ما دام الإشعار ظاهرًا، ويُلغى بظهور أي إشعار آخر. */
  function toast(text, bad = false, undo = null) {
    const e = $('#toast'); clearTimeout(toast.t); ui.undo = undo;
    e.replaceChildren(Object.assign(document.createElement('span'), { textContent: text }));
    if (undo) e.append(Object.assign(document.createElement('button'), { type: 'button', className: 'toast-undo', textContent: undo.label || 'تراجع' }));
    e.querySelector('.toast-undo')?.setAttribute('data-act', 'toast-undo');
    e.classList.remove('hidden', 'error'); e.classList.toggle('error', bad); e.classList.toggle('has-undo', !!undo);
    e.classList.toggle('up', !!$('#bar .actionbar')); e.classList.toggle('auth-toast', !ui.id);
    toast.t = setTimeout(() => { e.classList.add('hidden'); ui.undo = null; }, undo ? 6500 : 3800);
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

  /* ----- أخطاء بجانب الحقول (البند 13) ----- */
  const fieldBox = id => document.getElementById(id)?.closest('.field,.afield,.remember');
  function setFieldError(id, msg) {
    const input = document.getElementById(id), box = document.getElementById(id + '-err');
    if (!input || !box) return false;
    box.textContent = msg; box.classList.remove('hidden');
    input.setAttribute('aria-invalid', 'true'); fieldBox(id)?.classList.add('invalid');
    return true;
  }
  function clearFieldError(id) {
    const input = document.getElementById(id), box = document.getElementById(id + '-err');
    if (box) { box.textContent = ''; box.classList.add('hidden'); }
    input?.removeAttribute('aria-invalid'); fieldBox(id)?.classList.remove('invalid');
  }
  const clearFieldErrors = () => document.querySelectorAll('.ferr').forEach(b => { if (b.id) clearFieldError(b.id.replace(/-err$/, '')); });
  const focusField = id => { const el = document.getElementById(id); el?.focus?.({ preventScroll: false }); el?.scrollIntoView?.({ block: 'nearest' }); };
  function showFailure(err, kind) {
    const msg = err?.message || 'تعذرت العملية ولم تُحفظ تغييرات.', id = K.fieldForError(kind, msg);
    if (id && setFieldError(id, msg)) { focusField(id); return; }
    showError(msg);
  }

  /* ----- تعطيل الأزرار أثناء التنفيذ مع مؤشر تقدم (البند 26): لا يُعاد تمكين زر عُطّل أصلًا ----- */
  async function run(fn, kind) {
    if (ui.busy) return false;
    ui.busy = true; clearError(); clearFieldErrors();
    const locked = [...lockables()].filter(b => !b.disabled);
    locked.forEach(b => { b.disabled = true; b.classList.add('busy'); b.setAttribute('aria-busy', 'true'); });
    try { await fn(); return true; }
    catch (err) { showFailure(err, kind); return false; }
    finally { ui.busy = false; locked.forEach(b => { b.disabled = false; b.classList.remove('busy'); b.removeAttribute('aria-busy'); }); }
  }

  /* ----- النسخ مع إشعار بالنتيجة (البند 16) ----- */
  async function copyText(value, what) {
    value = String(value ?? '');
    if (!value) { toast(`لا يوجد ${what} للنسخ.`, true); return; }
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(value);
      else { const t = document.createElement('textarea'); t.value = value; t.setAttribute('readonly', ''); t.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(t); t.select(); const ok = document.execCommand('copy'); t.remove(); if (!ok) throw new Error('copy'); }
      toast(`تم نسخ ${what}.`);
    } catch { toast(`تعذر النسخ. انسخه يدويًا: ${value}`, true); }
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
    openSheet('إضافة رقم إلى أرقامي', `<form id="add-number-form" data-form="add-number" novalidate>${K.fields(K.field({ id: 'newNumber', name: 'number', label: 'رقم الهاتف', type: 'tel', required: true, inputmode: 'numeric', dir: 'ltr', autocomplete: 'tel-national' }))}<p id="modal-company" class="note">أدخل الرقم لتحديد شركة الاتصالات</p>${errBox}</form><p class="note">إضافة الرقم لا تخصم نقاطًا ولا تفعّل الحماية.</p>`, K.submitBtn('إضافة الرقم', 'add-number-form') + K.btn('إلغاء', 'sheet-close'));
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
        case 'buy-prev': buyStep((syncBuy().step || 1) - 1); return;
        case 'buy-next': {
          const bs = syncBuy(), step = bs.step || 1;
          clearFieldErrors();
          if (step === 1 && !bs.packageId) { setFieldError('packageId', 'اختر باقة النقاط.'); focusField('packageId'); return; }
          if (step === 2 && !bs.paymentId) { setFieldError('paymentId', 'اختر وسيلة الدفع.'); focusField('paymentId'); return; }
          if (step === 3 && !String(bs.reference || '').trim()) { setFieldError('reference', 'أدخل مرجع التحويل.'); focusField('reference'); return; }
          buyStep(step + 1); return;
        }
        case 'paste-reference': {
          let text = '';
          try { text = String(await navigator.clipboard.readText()).trim(); } catch { /* الإذن مرفوض أو غير مدعوم */ }
          if (!text) { toast('تعذر اللصق من الحافظة. الصق المرجع يدويًا في الحقل.', true); $('#reference')?.focus(); return; }
          const el = $('#reference'); if (el) { el.value = text; clearFieldError('reference'); syncBuy(); toast('تم لصق المرجع.'); }
          return;
        }
        case 'fav-clear': storeFav(null); render(); toast('أُزيلت المفضلة.'); return;
        case 'go': go(b.dataset.to); return;
        case 'back': back(); return;
        case 'sheet-close': closeSheet(); return;
        case 'signup-view': ui.auth = 'signup'; render(); return;
        case 'login-view': ui.auth = 'login'; render(); return;
        case 'search-again': ui.lookup = null; render(); return;
        case 'retry': retryLoad(); return;
        case 'clear-filter': ui.q = ''; ui.co = ''; ui.limit = 0; render(); return;
        case 'load-more': ui.limit = (ui.limit || PAGE) + PAGE; applyPaging(); return;
        case 'toast-undo': {
          const u = ui.undo; ui.undo = null; $('#toast').classList.add('hidden');
          if (u) await run(async () => { await u.fn(); render(); toast('تم التراجع.'); });
          return;
        }
        case 'number-detail': openNumberDetail(id); return;
        case 'add-number-open': addNumberSheet(); return;
        case 'add-search-number': await run(async () => { await D.addNumber(ui.id, b.dataset.number); ui.lookup = D.searchNumberStatus(ui.id, b.dataset.number); render(); toast('أُضيف الرقم إلى أرقامك.'); }); return;
        case 'protection-path': protectionPathSheet(b.dataset.number, b.dataset.company, b.dataset.operation); return;
        case 'protection-review': protectionReviewSheet(b.dataset.number, b.dataset.company, b.dataset.operation); return;
        case 'protection-confirm': await run(async () => {
          const p = ui.pending; if (!p) throw new Error('انتهت صلاحية المراجعة؛ أعد المحاولة.');
          await D.performProtectionOperation(ui.id, p.number, p.packageId, p.operation, p.key);
          ui.pending = null; closeSheet(); ui.lookup = null; render(); toast('تمت العملية وخُصمت النقاط.');
        }); return;
        case 'radar-toggle': await run(async () => {
          const n = ownedNumber(data(), id); if (!n) throw new Error('هذا الرقم غير موجود ضمن أرقام حسابك.');
          const was = !!n.radar;
          await D.setRadar(ui.id, id, !was);
          closeSheet(); render(); toast(was ? 'أُوقفت المتابعة.' : 'بدأت المتابعة.', false, { fn: () => D.setRadar(ui.id, id, was) });
        }); return;
        case 'radar-remove': await run(async () => {
          await D.setRadar(ui.id, id, false);
          render(); toast('أُوقفت المتابعة.', false, { fn: () => D.setRadar(ui.id, id, true) });
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
          openSheet(v.title, v.body, (v.foot || '') + K.btn('إغلاق', 'sheet-close', v.foot ? '' : 'primary')); return;
        }
        case 'order-cancel': {
          await D.cancelPurchase(ui.id, id); closeSheet(); render(); toast('أُلغي الطلب. لم تُخصم أو تُضف أي نقاط.'); return;
        }
        case 'order-resubmit': { // يملأ الباقة ووسيلة الدفع من الطلب المرفوض ويطلب مرجعًا جديدًا
          const r = data().purchaseRequests.find(x => x.id === id && x.customerId === ui.id);
          if (!r || r.status !== 'rejected') { toast('لا يمكن إعادة تقديم هذا الطلب.', true); return; }
          const d0 = data(), okP = d0.packages.some(p => p.id === r.packageId && p.active !== false), okM = d0.paymentMethods.some(m => m.id === r.paymentMethodId && m.active !== false);
          ui.buy = { step: okP && okM ? 3 : okP ? 2 : 1, packageId: okP ? r.packageId : '', paymentId: okM ? r.paymentMethodId : '', reference: '', touched: true };
          closeSheet(); go('buy'); toast(okP && okM ? 'أدخل مرجع تحويل جديد لإعادة التقديم.' : 'الباقة أو وسيلة الدفع لم تعد متاحة؛ اختر من المتاح.'); return;
        }
        case 'terms': case 'privacy': {
          const content = data().content?.[a] || 'لم يضف المسؤول نصًا بعد.';
          textSheet(a === 'terms' ? 'الشروط والأحكام' : 'سياسة الخصوصية', content); return;
        }
        case 'account-help': {
          const c = data().customers?.[0];
          textSheet('المساعدة', `معرّف الحساب ${c?.accountId || c?.id || ''} هو الرمز المستخدم للتعريف بحسابك في هذا النموذج المحلي.`); return;
        }
        case 'copy-account-id': { const c = data().customers[0]; await copyText(c?.accountId || c?.id || '', 'معرّف الحساب'); return; }
        case 'copy': await copyText(b.dataset.copy, b.dataset.label || 'القيمة'); return;
        case 'toggle-pass': {
          const input = document.getElementById(b.dataset.target); if (!input) return;
          const show = input.type === 'password';
          input.type = show ? 'text' : 'password';
          b.setAttribute('aria-pressed', String(show)); b.setAttribute('aria-label', show ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور');
          b.innerHTML = K.ico(show ? 'eyeoff' : 'eye'); input.focus(); return;
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
    if (ui.busy) return;
    clearFieldErrors();
    const bad = K.validate(kind, { ...Object.fromEntries(fd.entries()), agree: !!$('#agree')?.checked });
    if (bad.length) { bad.forEach(x => setFieldError(x.id, x.msg)); focusField(bad[0].id); return; }
    await run(async () => {
      switch (kind) {
        case 'login': {
          const email = String(fd.get('email')).trim().toLowerCase(), password = String(fd.get('password')), remember = fd.get('remember') === 'on';
          if (password.length < 4) throw new Error('كلمة المرور يجب ألا تقل عن 4 خانات.');
          let c = D.read().customers.find(x => x.email.toLowerCase() === email);
          /* حساب معاينة محلي مخصص لتسريع اختبار واجهة العميل فقط. */
          if (DEMO && !c && email === 'demo@aman.test' && password === 'aman1234') {
            const hash = await hashPassword(password);
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
          if (!(await verifyPassword(password, c.authHash))) throw new Error('بيانات الدخول غير صحيحة.');
          if (!String(c.authHash).startsWith('pbkdf2$')) { // ترقية التجزئة القديمة بعد التحقق الناجح
            const upgraded = await hashPassword(password);
            await D.transact('local-auth', 'password_hash_upgraded', d => { const x = d.customers.find(y => y.id === c.id); if (x) x.authHash = upgraded; return { entityType: 'customer', entityId: c.id, summary: 'ترقية تجزئة كلمة المرور' }; });
          }
          saveRememberedCredentials(email, remember);
          ui.id = c.id; sessionStorage.setItem('aman.customer', c.id);
          history.replaceState({ amanCustomer: true, route: 'home', d: 0 }, '', '#/home'); ui.route = 'home'; render({ top: true }); return;
        }
        case 'signup': {
          const name = String(fd.get('name')).trim(), email = String(fd.get('email')).trim().toLowerCase(), password = String(fd.get('password'));
          if (password.length < 4) throw new Error('كلمة المرور يجب ألا تقل عن 4 خانات.');
          if (!$('#agree')?.checked) throw new Error('وافق على الشروط والأحكام للمتابعة.');
          const hash = await hashPassword(password);
          const { result } = await D.transact('local-signup', 'customer_registered', d => {
            if (d.customers.some(x => x.email.toLowerCase() === email)) throw new Error('البريد مسجل بالفعل.');
            const c = { id: D.uid('cus'), accountId: D.uid('AMAN'), name, email, status: 'active', isSubscriber: false, createdAt: D.now(), authHash: hash };
            d.customers.push(c);
            d.pointTransactions.push({ id: D.uid('pt'), customerId: c.id, type: 'credit', points: 0, source: 'signup', sourceId: c.id, createdAt: D.now(), description: 'تسجيل حساب جديد' });
            return { entityType: 'customer', entityId: c.id, summary: 'تسجيل عميل محلي' };
          });
          ui.id = result.entityId; sessionStorage.setItem('aman.customer', ui.id);
          history.replaceState({ amanCustomer: true, route: 'home', d: 0 }, '', '#/home'); ui.route = 'home'; render({ top: true });
          toast('أُنشئ حسابك. تصبح مشتركًا بعد اعتماد أول طلب نقاط.'); return;
        }
        case 'number-search': ui.lookup = D.searchNumberStatus(ui.id, fd.get('number')); render(); return;
        case 'add-number': await D.addNumber(ui.id, fd.get('number')); closeSheet(); render(); toast('أُضيف الرقم إلى أرقامك.'); return;
        case 'purchase': {
          const b = syncBuy();
          try { await D.createPurchase(ui.id, fd.get('packageId'), fd.get('paymentId'), String(fd.get('reference')).trim()); }
          catch (err) { // أعد العميل للخطوة المعنية ليرى الخطأ بجانب حقله
            const m = String(err?.message || ''); b.step = /مرجع/.test(m) ? 3 : /وسيلة الدفع/.test(m) ? 2 : /الباقة/.test(m) ? 1 : b.step; render({ top: true }); throw err;
          }
          if (b.saveFav) storeFav({ packageId: String(fd.get('packageId')), paymentId: String(fd.get('paymentId')) });
          ui.buy = null; render({ top: true }); toast('تم إرسال الطلب للمراجعة.'); return;
        }
        default: throw new Error('تعذر العثور على النموذج.');
      }
    }, kind);
  });

  /* ===================== البحث والفلترة والإعدادات ===================== */
  document.addEventListener('input', e => {
    const t = e.target;
    if (t.id === 'q') { ui.q = t.value; ui.limit = 0; refreshList(); return; }
    if (t.id && t.closest?.('.field,.afield')) clearFieldError(t.id); // التعديل يزيل خطأ الحقل
    if (t.id === 's_pass') { // مؤشر قوة كلمة المرور: استرشادي فقط
      const m = $('#pass-strength'), s = K.passwordStrength(t.value);
      if (m) { m.dataset.level = String(s.level); m.dataset.key = s.key; m.querySelector('span').textContent = s.text; }
    }
    if (t.id === 'newNumber' || t.id === 'search-number-input') {
      const co = D.companyFor(D.normalizePhone(t.value), D.read()), el = $(t.id === 'newNumber' ? '#modal-company' : '#search-company');
      if (el) el.textContent = co ? `شركة الاتصالات: ${co.name}` : (t.value.trim() ? 'لم يتم التعرف على شركة الاتصالات من بادئة الرقم' : (t.id === 'newNumber' ? 'أدخل الرقم لتحديد شركة الاتصالات' : 'أدخل الرقم للتعرف على الشركة إن أمكن.'));
    }
  });
  document.addEventListener('change', e => {
    const t = e.target;
    if (t.id === 'agree' || t.id === 'packageId' || t.id === 'paymentId') clearFieldError(t.id);
    if (t.id === 'flt') { ui.co = t.value; ui.limit = 0; refreshList(); return; }
    if (t.id === 'quickNumber') { const input = $('#search-number-input'); if (input) { input.value = t.value; input.dispatchEvent(new Event('input', { bubbles: true })); } return; }
    if (t.name === 'packageId' || t.name === 'paymentId') { clearFieldError(t.name); syncBuy(); return; }
    if (t.id === 'saveFav') { syncBuy(); return; }
    if (t.id === 'theme') { localStorage.setItem('aman.customer.theme', t.value); localStorage.setItem('aman.customer.dark', t.value === 'dark' ? '1' : '0'); applyTheme(); return; }
    if (t.id === 'notifications-enabled') {
      const key = `aman.customer.notifications.${ui.id}`, on = t.checked;
      localStorage.setItem(key, on ? '1' : '0'); render();
      toast(on ? 'فُعّل تنبيه الإشعارات.' : 'أُوقف تنبيه الإشعارات.', false, { fn: async () => localStorage.setItem(key, on ? '0' : '1') });
    }
  });
  /* اختصارات لوحة المفاتيح (البند 15): Esc يغلق النافذة؛ Enter يرسل فقط عند اكتمال الحقول المطلوبة
     وإلا ينتقل إلى أول حقل ناقص، ولا يرسل أثناء تنفيذ عملية سابقة. */
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && ui.sheet) { e.preventDefault(); closeSheet(); return; }
    if (e.key !== 'Enter' || e.isComposing) return;
    const t = e.target;
    if (!(t instanceof HTMLInputElement) || ['checkbox', 'radio', 'button', 'submit'].includes(t.type)) return;
    const form = t.closest('form[data-form]'); if (!form) return;
    if (ui.busy) { e.preventDefault(); return; }
    if (form.dataset.form === 'purchase' && (ui.buy?.step || 1) < 4) { e.preventDefault(); $('[data-act=buy-next]')?.click(); return; }
    const missing = [...form.querySelectorAll('input:not([type=checkbox]):not([type=hidden]),select')].find(c => (c.required || ['login', 'signup'].includes(form.dataset.form)) && !String(c.value).trim());
    if (missing && missing !== t) { e.preventDefault(); missing.focus(); }
  });

  // تغيّر المخزن من تبويب آخر (مثل الإدارة): حدّث الرأس دائمًا، وأعد بناء الشاشة فقط إن لم يكن العميل يكتب أو في نافذة مفتوحة
  window.addEventListener('storage', e => {
    if (e.key !== D.KEY) return;
    const typing = document.activeElement && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName) && $('#screen')?.contains(document.activeElement);
    if (ui.sheet || typing) { refreshHeader(); return; }
    render();
  });
  window.addEventListener('pageshow', () => { if (!ui.sheet) render(); });

  /* ===================== السحب لتحديث البيانات (55) ===================== */
  // من أعلى الشاشة؛ يعيد قراءة المخزن المحلي فقط ولا يعمل داخل الحقول أو النوافذ أو أثناء عملية جارية
  (function pullToRefresh() {
    let y0 = null, pulled = 0; const LIMIT = 70;
    const ind = Object.assign(document.createElement('div'), { id: 'ptr', className: 'ptr hidden', role: 'status' });
    document.querySelector('.phone')?.appendChild(ind);
    const reset = () => { y0 = null; pulled = 0; ind.classList.add('hidden'); };
    document.addEventListener('touchstart', e => {
      const s = $('#screen');
      if (!ui.id || ui.sheet || ui.busy || !s || !s.contains(e.target) || s.scrollTop > 0 || e.target.closest?.('input,textarea,select')) { y0 = null; return; }
      y0 = e.touches[0].clientY; pulled = 0;
    }, { passive: true });
    document.addEventListener('touchmove', e => {
      if (y0 == null) return; pulled = Math.max(0, e.touches[0].clientY - y0);
      if (pulled > 12) { ind.textContent = pulled > LIMIT ? 'أفلت للتحديث' : 'اسحب للتحديث'; ind.classList.remove('hidden'); } else ind.classList.add('hidden');
    }, { passive: true });
    document.addEventListener('touchend', () => { const go = y0 != null && pulled > LIMIT; reset(); if (go) { render({}); toast('حُدّثت البيانات.'); } }, { passive: true });
    document.addEventListener('touchcancel', reset, { passive: true });
  })();

  /* ===================== حالة الاتصال (البند 38) ===================== */
  // التطبيق يعمل على بيانات هذا الجهاز؛ الشريط يوضّح الحالة فقط ولا يمنع أي عملية محلية
  function netState(announce) {
    const online = navigator.onLine !== false, bar = $('#netbar');
    document.body.classList.toggle('offline', !online);
    if (bar) { bar.classList.toggle('hidden', online); bar.textContent = online ? '' : 'لا يوجد اتصال بالإنترنت. بياناتك المحفوظة على هذا الجهاز ما زالت متاحة.'; }
    if (announce && online) toast('عاد الاتصال بالإنترنت.');
  }
  window.addEventListener('online', () => netState(true));
  window.addEventListener('offline', () => netState(false));
  netState(false);

  /* ===================== الإقلاع ===================== */
  ui.route = ui.id ? hashRoute() : 'home';
  if (!histState()) history.replaceState({ amanCustomer: true, route: ui.route, d: 0 }, '', '#/' + ui.route);
  render({ top: true });
})();
