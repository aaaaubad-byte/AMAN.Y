/* AMAN Customer — بناة الشاشات (عرض فقط). لا كتابة هنا؛ كل التعديل يمر عبر AmanData من غلاف التطبيق. */
(function (root) {
  'use strict';
  const D = AmanData, U = AmanUI, K = AmanCustomerKit, E = K.esc, N = U.fmt;

  const LABEL = { pending: 'قيد المراجعة', approved: 'مقبول', rejected: 'مرفوض', cancelled: 'ملغى', active: 'فعال', expired: 'منتهٍ', planned: 'مخطط', due: 'مستحق', executed: 'منفذ', extended: 'ممدد' };
  const TONE = { pending: 'warn', approved: 'ok', rejected: 'bad' };
  const label = s => LABEL[s] || E(s);
  const OP_LABEL = { subscribe: 'اشتراك حماية', extend: 'تمديد حماية', renew: 'تجديد حماية' };

  const company = (d, n) => d.companies.find(c => c.id === n.companyId);
  const liveSub = (d, n, id) => d.subscriptions.find(s => s.numberId === n.id && s.customerId === id && s.status === 'active' && new Date(s.startsAt || 0) <= Date.now() && new Date(s.endsAt) > Date.now()) || null;
  const daysLeft = s => Math.max(0, Math.ceil((new Date(s.endsAt) - Date.now()) / 86400000));
  const owned = (d, id) => D.customerNumbers(id, d);
  const byNew = (a, b) => new Date(b.createdAt) - new Date(a.createdAt);
  const notices = (d, id) => d.notifications.filter(n => n.customerId === id).sort(byNew);

  const NEAR_DAYS = 7; // مؤقت: حد «ينتهي قريبًا». يُضبط إداريًا في U11؛ لا يغيّر أي بيانات.
  // نافذة الاشتراك السارية للرقم: اشتراك العميل نفسه، أو اشتراك عميل آخر لرقم يتابعه (تواريخ فقط بلا هوية المالك)
  function liveInfo(d, n, id) {
    const s = liveSub(d, n, id);
    if (s) return { startsAt: s.startsAt, endsAt: s.endsAt, own: true };
    return n.liveSub ? { startsAt: n.liveSub.startsAt, endsAt: n.liveSub.endsAt, own: !!n.liveSub.own } : null;
  }
  function numberState(d, n, id) {
    const i = liveInfo(d, n, id);
    if (i) { const left = daysLeft(i), near = left <= NEAR_DAYS; return { key: 'active', text: `متبقي ${N(left)} يوم`, tone: near ? 'warn' : 'ok', sub: i, own: i.own, near, left }; }
    if (n.protectionStatus === 'protected') return { key: 'protected', text: 'محمي', tone: 'ok' };
    if (n.protectionStatus === 'expired' || d.subscriptions.some(x => x.numberId === n.id)) return { key: 'expired', text: 'منتهية', tone: 'warn' };
    return { key: 'none', text: 'غير محمي', tone: '' };
  }
  // نسبة المدة المنقضية من مدة الاشتراك (بند 41)
  function progress(i) {
    const a = new Date(i.startsAt).getTime(), b = new Date(i.endsAt).getTime();
    const pct = Number.isFinite(a) && Number.isFinite(b) && b > a ? Math.round(Math.min(1, Math.max(0, (Date.now() - a) / (b - a))) * 100) : 100;
    return `<span class="progress" role="progressbar" aria-label="المدة المنقضية من الاشتراك" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><i style="width:${pct}%"></i></span>`;
  }
  const withBar = (title, sub, html, extra = {}) => ({ chrome: 'tabs', html: K.bar(title, sub) + html, ...extra });

  /* ===================== الدخول والتسجيل ===================== */
  function login(saved, demo = false) {
    return `<div class="brand"><h1>أمان</h1><p>حماية أرقامك</p></div>
<form id="login" data-form="login" novalidate>
 <h2>تسجيل الدخول</h2>
 ${K.authField({ id: 'l_email', name: 'email', label: 'البريد الإلكتروني', type: 'email', autocomplete: 'username', dir: 'ltr', value: saved.email || (demo ? 'demo@aman.test' : '') })}
 ${K.authField({ id: 'l_pass', name: 'password', label: 'كلمة المرور', type: 'password', minlength: 4, autocomplete: 'current-password', dir: 'ltr', value: demo ? 'aman1234' : '' })}
 <label class="remember"><input type="checkbox" name="remember" ${saved.enabled ? 'checked' : ''}><span>تذكرني وحفظ بيانات الدخول على هذا الجهاز</span></label>
 <div id="form-error" class="form-error hidden" role="alert"></div>
 <button class="btn primary" type="submit" data-submit>دخول</button>
 <button type="button" class="btn ghost" data-act="signup-view">إنشاء حساب</button>
</form>`;
  }
  function signup() {
    return `<div class="brand"><h1>أمان</h1><p>إنشاء حساب جديد</p></div>
<form id="signup" data-form="signup" novalidate>
 <h2>إنشاء حساب</h2>
 ${K.authField({ id: 's_name', name: 'name', label: 'الاسم', autocomplete: 'name' })}
 ${K.authField({ id: 's_email', name: 'email', label: 'البريد الإلكتروني', type: 'email', dir: 'ltr', autocomplete: 'email' })}
 ${K.authField({ id: 's_pass', name: 'password', label: 'كلمة المرور (4 خانات فأكثر)', type: 'password', minlength: 4, dir: 'ltr', autocomplete: 'new-password', extra: K.strengthMeter('pass-strength') })}
 <label class="remember"><input id="agree" type="checkbox" aria-describedby="agree-err"><span>أوافق على <button type="button" class="link" data-act="terms">الشروط والأحكام</button></span></label>
 <small class="ferr hidden" id="agree-err" role="alert"></small>
 <div id="form-error" class="form-error hidden" role="alert"></div>
 <button class="btn primary" type="submit" data-submit>إنشاء الحساب</button>
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
    const ns = owned(d, c.id), unreadN = x.noticeDot ? notices(d, c.id).filter(n => !n.readAt).length : 0;
    const lead = `<div class="lead" id="top">${K.tileAction('go', 'user', 'الحساب', 'data-to="account"')}<div class="lead-end"><button type="button" class="tile-btn" data-act="go" data-to="notifications" aria-label="الإشعارات${unreadN ? ` (${N(unreadN)} جديد)` : ''}">${K.ico('bell')}<i id="unreadDot" class="dot ${unreadN ? '' : 'hidden'}">${unreadN ? (unreadN > 9 ? '9+' : N(unreadN)) : ''}</i></button><button type="button" id="balance" class="chip-black" data-act="go" data-to="points">${N(D.balance(c.id, d))} نقطة</button></div></div>`;
    const picker = ns.length ? `<div style="margin-top:10px"><label class="select block">${K.ico('caret')}<select id="quickNumber" aria-label="اختيار رقم من أرقام حسابك"><option value="">اختر من أرقام حسابك</option>${ns.map(n => `<option value="${E(n.number)}">${E(n.number)}</option>`).join('')}</select></label></div>` : '';
    const body = x.lookup
      ? `<section class="card pad inquiry-result-card">${resultView(x.lookup)}<div style="margin-top:12px">${K.btn('بحث عن رقم آخر', 'search-again', '', '', 'search')}</div></section>`
      : `<form id="number-search" class="card pad" data-form="number-search" novalidate><h3>البحث عن حالة الرقم في أمان</h3>${K.fields(K.field({ id: 'search-number-input', name: 'number', label: 'رقم الهاتف', required: true, inputmode: 'numeric', dir: 'ltr', placeholder: 'أدخل رقم الهاتف' }))}${picker}<p id="search-company" class="note">أدخل الرقم للتعرف على الشركة إن أمكن.</p><button type="submit" class="btn primary" data-submit>البحث</button></form>`;
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
  const stateOf = (d, c) => n => numberState(d, n, c.id);
  function numbers(d, c, x) {
    const all = owned(d, c.id).filter(n => stateOf(d, c)(n).key === 'none'), total = owned(d, c.id).length;
    const list = () => {
      const rows = all.filter(n => matches(d, n, x));
      if (!total) return K.empty('أضف رقمك الأول ثم فعّل حمايته من تفاصيله.', 'numbers', 'لا توجد أرقام مضافة بعد');
      if (!all.length) return K.empty('كل أرقامك لها اشتراك، وتجدها في شاشة الاشتراكات.', 'shield', 'لا توجد أرقام بلا اشتراك', K.btn('عرض الاشتراكات', 'go', '', 'data-to="subscriptions"', 'shield'));
      if (!rows.length) return K.empty('لا توجد أرقام تطابق البحث أو الشركة المحددة.', 'search', '', K.btn('مسح البحث والتصفية', 'clear-filter', 'small'));
      return K.card(rows.map(n => numberRow(d, n, c.id)));
    };
    const tool = all.length ? K.toolbar('بحث برقم الهاتف', x.q, [['', 'كل الشركات'], ...companyNames(d, all).map(n => [n, n])], x.co || '') : '';
    return withBar('الأرقام', all.length ? `${N(all.length)} ${all.length === 1 ? 'رقم بلا اشتراك' : 'أرقام بلا اشتراك'}` : 'أرقام لم يُفعَّل لها اشتراك', `${tool}<div id="listbody" class="customer-number-list">${list()}</div>`, { tab: 'numbers', list, bar: `<div class="actionbar">${K.btn('إضافة رقم', 'add-number-open', 'primary', '', 'plus')}</div>` });
  }
  // صف اشتراك: الرقم والشركة وشارة الأيام وشريط التقدم وتاريخ الانتهاء (بنود 28، 40، 41)
  function subRow(d, n, id) {
    const st = numberState(d, n, id), co = company(d, n), live = st.key === 'active';
    const pill = live ? K.pill(st.near ? `ينتهي قريبًا · ${N(st.left)} يوم` : `${N(st.left)} يوم متبقٍ`, st.tone) : K.pill('منتهٍ', 'warn');
    const meta = live ? `${progress(st.sub)}<span class="subline">ينتهي ${U.date(st.sub.endsAt)}${st.own ? '' : ' · متابعة فقط'}</span>` : '<span class="subline">انتهى الاشتراك ويمكن تجديده</span>';
    return K.row({ icon: 'shield', tone: live ? st.tone : 'warn', title: n.number, ltr: true, sub: E(co?.name || 'شركة غير معروفة'), sub2: meta, pill, act: 'number-detail', attrs: `data-id="${E(n.id)}"` });
  }
  // أرقام يملك العميل اشتراكها وهي منتهية أو قريبة الانتهاء: مرشحة للتجديد/التمديد من البطاقة (بنود 17 و86)
  function renewable(d, c) {
    return owned(d, c.id).map(n => ({ n, st: numberState(d, n, c.id) })).filter(({ st }) => st.key === 'expired' || (st.key === 'active' && st.own && st.near)).map(({ n, st }) => ({ n, op: st.key === 'expired' ? 'renew' : 'extend' }));
  }
  function renewFoot(d, n, id) {
    const st = numberState(d, n, id), co = company(d, n);
    if (!co || !(d.protectionPackages || []).some(p => p.companyId === co.id && p.active !== false)) return '';
    if (st.key !== 'expired' && !(st.key === 'active' && st.own && st.near)) return '';
    const op = st.key === 'expired' ? 'renew' : 'extend';
    return `<div class="rowfoot">${K.btn(op === 'renew' ? 'تجديد الاشتراك' : 'تمديد الاشتراك', 'protection-path', 'small', `data-number="${E(n.number)}" data-company="${E(co.id)}" data-operation="${op}"`)}</div>`;
  }
  function subscriptions(d, c, x) {
    const all = owned(d, c.id).filter(n => ['active', 'expired', 'protected'].includes(stateOf(d, c)(n).key))
      .sort((a, b) => { const A = numberState(d, a, c.id), B = numberState(d, b, c.id); return (A.key === 'active' ? 0 : 1) - (B.key === 'active' ? 0 : 1) || (A.left ?? 0) - (B.left ?? 0); });
    const list = () => {
      const rows = all.filter(n => matches(d, n, x));
      if (!all.length) return K.empty('الأرقام التي تفعّل لها الحماية، أو تتابع اشتراكها بعد إضافتها، تظهر هنا.', 'shield', 'لا توجد اشتراكات بعد', K.btn('عرض أرقامي', 'go', '', 'data-to="numbers"', 'numbers'));
      if (!rows.length) return K.empty('لا توجد اشتراكات تطابق البحث أو الشركة المحددة.', 'search', '', K.btn('مسح البحث والتصفية', 'clear-filter', 'small'));
      return `<div class="list">${rows.map(n => `<div class="card">${subRow(d, n, c.id)}${renewFoot(d, n, c.id)}</div>`).join('')}</div>`;
    };
    const tool = all.length ? K.toolbar('بحث برقم الهاتف', x.q, [['', 'كل الشركات'], ...companyNames(d, all).map(n => [n, n])], x.co || '') : '';
    const batch = renewable(d, c).length >= 2 ? `<div class="batch-entry">${K.btn('تجديد عدة أرقام', 'batch-open', '', '', 'repeat')}</div>` : '';
    return withBar('الاشتراكات', all.length ? `${N(all.length)} ${all.length === 1 ? 'اشتراك' : 'اشتراكات'}` : 'اشتراكاتك والأرقام التي تتابعها', `${tool}${batch}<div id="listbody" class="customer-number-list">${list()}</div>`, { tab: 'subscriptions', list });
  }
  function numberDetail(d, n, id) {
    const co = company(d, n), st = numberState(d, n, id), s = st.sub || null, follower = st.key === 'active' && !st.own;
    const latest = d.subscriptions.filter(v => v.numberId === n.id).sort(byNew)[0];
    const packs = (d.protectionPackages || []).filter(p => p.companyId === co?.id && p.active !== false);
    const op = st.key === 'active' ? 'extend' : latest ? 'renew' : 'subscribe';
    const label2 = st.key === 'active' ? (follower ? `سارٍ · ${N(st.left)} يوم متبقٍ · متابعة فقط` : `سارٍ — ${N(st.left)} يوم متبقٍ`) : latest ? 'منتهٍ أو غير ساري' : 'غير محمي';
    const rows = [['رقم الهاتف', `<span class="ltr">${E(n.number)}</span>`], ['الشركة', E(co?.name || '—')], ['حالة الاشتراك', label2]];
    if (s) rows.push(['بداية الاشتراك', U.date(s.startsAt)], ['تاريخ الانتهاء', U.date(s.endsAt)], ['المدة المتبقية', `${N(st.left)} يوم`]);
    const hero = `<div class="hero"><div class="hero-top"><span class="ico">${K.ico('shield')}</span><div><h2 class="ltr">${E(n.number)}</h2><p>${E(co?.name || '—')}</p></div></div><span class="pill ${st.tone === 'ok' ? 'ok' : st.tone === 'warn' ? 'warn' : ''}">${E(label2)}</span>${s ? progress(s) : ''}</div>`;
    const history = follower ? K.note('أنت تتابع هذا الاشتراك ولا تملكه؛ التمديد والتجديد من صاحبه، ويصلك إشعار عند تغيّر حالته إذا فعّلت التنبيهات.')
      : (() => { const ops = (d.protectionOperations || []).filter(o => o.numberId === n.id && o.customerId === id).sort(byNew); return ops.length ? K.section('سجل التجديد') + K.card(ops.map(o => K.row({ icon: 'repeat', title: `${OP_LABEL[o.type] || 'عملية حماية'}${o.packageSnapshot?.name ? ' — ' + E(o.packageSnapshot.name) : ''}`, sub: U.date(o.createdAt), sub2: `حتى ${U.date(o.endsAt)}`, val: `${N(o.pointsCost)} نقطة`, plain: true }))) : ''; })();
    let foot = '';
    if (!follower && packs.length) foot += K.btn(op === 'extend' ? 'تمديد الاشتراك' : op === 'renew' ? 'تجديد الاشتراك' : 'تفعيل الاشتراك', 'protection-path', 'primary', `data-number="${E(n.number)}" data-company="${E(co?.id || '')}" data-operation="${op}"`);
    if (st.key === 'active') foot += K.btn(n.radar ? 'إيقاف تنبيهات تغيّر الحالة' : 'تفعيل تنبيهات تغيّر الحالة', 'radar-toggle', '', `data-id="${E(n.id)}"`, 'bell');
    foot += K.btn('إشعارات الرقم', 'number-notifications', '', `data-id="${E(n.id)}"`, 'bell');
    return { title: 'تفاصيل الاشتراك', body: hero + K.kv(rows) + history + (!follower && !packs.length ? K.note('لا توجد باقات حماية متاحة لهذه الشركة حاليًا.') : ''), foot };
  }

  /* ===================== شراء النقاط والسجلات ===================== */
  // ملخص الرصيد القابل للطي لأعلى الشاشات المالية (بند 42)
  function balanceSummary(d, c) {
    const tx = d.pointTransactions.filter(t => t.customerId === c.id), sum = ty => tx.filter(t => t.type === ty).reduce((a, t) => a + Number(t.points || 0), 0);
    const last = [...tx].sort(byNew)[0];
    return `<details class="bal"><summary><span>رصيد أمان</span><b>${N(D.balance(c.id, d))} نقطة</b>${K.ico('caret')}</summary>${K.kv([['إجمالي الإضافات', `+${N(sum('credit'))} نقطة`], ['إجمالي الخصومات', `−${N(sum('debit'))} نقطة`], ['آخر حركة', last ? U.date(last.createdAt) : '—']])}</details>`;
  }
  // كشف الحساب: الرصيد بعد كل حركة (بند 43) محسوبًا بالترتيب الزمني
  function statement(d, c) {
    const tx = d.pointTransactions.filter(t => t.customerId === c.id).map((t, i) => ({ t, i })).sort((a, b) => new Date(a.t.createdAt) - new Date(b.t.createdAt) || a.i - b.i);
    let run = 0;
    return tx.map(({ t }) => { run += (t.type === 'credit' ? 1 : -1) * Number(t.points || 0); return { ...t, after: run }; }).reverse();
  }
  // «الأفضل» = أعلى نقاط مقابل كل ريال، ولا يظهر إلا لباقة واحدة متفردة بالمعيار (بند 44)
  function bestPack(packs) {
    const r = packs.map(p => ({ id: p.id, v: Number(p.points) / Number(p.price) })).filter(v => Number.isFinite(v.v) && v.v > 0);
    if (r.length < 2) return '';
    const max = Math.max(...r.map(v => v.v)), top = r.filter(v => v.v === max);
    return top.length === 1 ? top[0].id : '';
  }
  const BUY_STEPS = ['الباقة', 'وسيلة الدفع', 'المرجع', 'المراجعة'];
  function stepsBar(step) {
    return `<ol class="steps" aria-label="خطوات الشراء">${BUY_STEPS.map((t, i) => `<li class="${i + 1 < step ? 'done' : i + 1 === step ? 'cur' : ''}" ${i + 1 === step ? 'aria-current="step"' : ''}><b>${N(i + 1)}</b><span>${t}</span></li>`).join('')}</ol>`;
  }
  // حالة الشراء تأتي من غلاف التطبيق: x.buy = { step, packageId, paymentId, reference, saveFav }, x.fav = المفضلة المحفوظة
  function buy(d, c, x = {}) {
    const packs = d.packages.filter(v => v.active !== false), methods = d.paymentMethods.filter(v => v.active !== false);
    const st = x.buy || {}, fav = x.fav || {}, best = bestPack(packs);
    const pickId = (list, ...ids) => ids.find(id => id && list.some(v => v.id === id)) || '';
    const packageId = pickId(packs, st.packageId, st.touched ? '' : fav.packageId), paymentId = pickId(methods, st.paymentId, st.touched ? '' : fav.paymentId);
    const pack = packs.find(v => v.id === packageId), method = methods.find(v => v.id === paymentId);
    const reference = String(st.reference || '');
    const step = Math.min(4, Math.max(1, Number(st.step) || 1));
    const hero = balanceSummary(d, c);
    const choice = (name, v, checked, title, sub, end = '', first = false) => `<label class="choice"><input type="radio" ${first ? `id="${name}"` : ''} name="${name}" value="${E(v)}" ${checked ? 'checked' : ''}><span class="cmain"><b>${E(title)}</b>${sub ? `<small>${sub}</small>` : ''}</span>${end}</label>`;
    const favNote = fav.packageId || fav.paymentId ? `<div class="note fav-note">المفضلة محفوظة وتُملأ تلقائيًا، ويبقى عليك إدخال المرجع. ${K.btn('إزالة المفضلة', 'fav-clear', 'link')}</div>` : '';
    const p1 = `<div class="step" data-step="1" ${step === 1 ? '' : 'hidden'}>${K.section('اختر باقة النقاط')}${favNote}${packs.length ? `<div class="choices" role="radiogroup" aria-label="باقة النقاط">${packs.map((p, i) => choice('packageId', p.id, p.id === packageId, p.name, `${N(p.points)} نقطة · ${N(p.price)} ر.ي`, p.id === best ? K.pill('الأفضل قيمة', 'ok') : '', i === 0)).join('')}</div>${best ? K.note('«الأفضل قيمة» للباقة الأعلى نقاطًا مقابل كل ريال.') : ''}` : K.empty('لا توجد باقات متاحة حاليًا.', 'card')}<small class="ferr hidden" id="packageId-err" role="alert"></small></div>`;
    const p2 = `<div class="step" data-step="2" ${step === 2 ? '' : 'hidden'}>${K.section('اختر وسيلة الدفع')}${methods.length ? `<div class="choices" role="radiogroup" aria-label="وسيلة الدفع">${methods.map((m, i) => choice('paymentId', m.id, m.id === paymentId, m.name, E(m.instructions || ''), '', i === 0)).join('')}</div>` : K.empty('لا توجد وسائل دفع متاحة حاليًا.', 'wallet')}<small class="ferr hidden" id="paymentId-err" role="alert"></small></div>`;
    const amount = pack ? `<div class="amount" id="buyAmount"><small>المبلغ المطلوب تحويله</small><b>${N(pack.price)} ر.ي</b><span>يُحدَّد من الباقة المختارة ولا يمكن تعديله.</span></div>` : '';
    const p3 = `<div class="step" data-step="3" ${step === 3 ? '' : 'hidden'}>${K.section('حوّل المبلغ ثم أدخل المرجع')}${amount}<div id="paymentInstructions" class="note">${E(method?.instructions || 'لا توجد تعليمات لوسيلة الدفع.')}</div>${K.fields(K.field({ id: 'reference', name: 'reference', label: 'مرجع التحويل', required: true, placeholder: 'أدخل مرجع التحويل أو الصقه', dir: 'ltr', value: reference, help: 'يُقبل المرجع كما تعطيه وسيلة الدفع، بلا طول أو صيغة محددة.' }))}<div class="inline-actions">${K.btn('لصق المرجع', 'paste-reference', '', '', 'copy')}</div></div>`;
    const faved = fav.packageId === packageId && fav.paymentId === paymentId && !!packageId;
    const p4 = `<div class="step" data-step="4" ${step === 4 ? '' : 'hidden'}>${K.section('راجع الطلب قبل الإرسال')}${K.kv([['الباقة', E(pack?.name || '—')], ['النقاط', pack ? N(pack.points) : '—'], ['المبلغ المحوَّل', pack ? `${N(pack.price)} ر.ي` : '—', true], ['وسيلة الدفع', E(method?.name || '—')], ['المرجع', `<span class="ltr">${E(reference || '—')}</span>`]])}${K.fields(K.toggle('saveFav', 'حفظ الباقة ووسيلة الدفع كمفضلة', st.saveFav ?? faved, 'تُملأ تلقائيًا في الطلبات القادمة، والمرجع يُدخل كل مرة.'))}${K.note('تُضاف النقاط بعد مراجعة الطلب واعتماده من الإدارة.')}</div>`;
    const form = `<form id="purchase" data-form="purchase" novalidate>${p1}${p2}${p3}${p4}<div id="form-error" class="form-error hidden" role="alert"></div></form>`;
    const recent = d.purchaseRequests.filter(r => r.customerId === c.id).sort(byNew);
    const link = K.card([K.row({ icon: 'receipt', title: 'جميع طلبات شراء النقاط', sub: recent.length ? `${N(recent.length)} طلب` : 'لا توجد طلبات بعد', to: 'orders' })]);
    const blocked = !packs.length || !methods.length;
    const next = K.btn('التالي', 'buy-next', 'primary', blocked ? 'disabled' : '');
    const prev = K.btn('السابق', 'buy-prev', '');
    const bar = `<div class="actionbar">${step === 4 ? K.submitBtn('إرسال الطلب', 'purchase', 'primary', blocked ? 'disabled' : '') : next}${step > 1 ? prev : ''}</div>`;
    return withBar('شراء نقاط', 'طلب شراء رصيد أمان', `${hero}${stepsBar(step)}${form}${step === 1 ? link : ''}`, { tab: 'buy', bar });
  }
  // مراحل الطلب: أُرسل ← قيد المراجعة ← مقبول/مرفوض (بند 31). تعرض الحالة الحالية دون تغيير البيانات المخزنة.
  function requestStages(r) {
    const final = r.status === 'approved' ? ['مقبول', 'ok'] : r.status === 'rejected' ? ['مرفوض', 'bad'] : r.status === 'cancelled' ? ['ملغى بطلبك', 'bad'] : ['مقبول / مرفوض', ''];
    const reviewed = r.status !== 'pending';
    const items = [['أُرسل', 'done', U.date(r.createdAt)], ['قيد المراجعة', reviewed ? 'done' : 'cur', reviewed ? '' : 'بانتظار الإدارة'], [final[0], reviewed ? 'done ' + final[1] : '', reviewed ? U.date(r.reviewedAt || r.cancelledAt) : '']];
    return `<ol class="stages" aria-label="مراحل الطلب">${items.map(([t, cls, sub]) => `<li class="${cls}"><i></i><b>${t}</b>${sub ? `<small>${sub}</small>` : ''}</li>`).join('')}</ol>`;
  }
  function points(d, c, x = {}) {
    const all = statement(d, c);
    const list = () => {
      const q = String(x.q || '').trim().toLowerCase();
      const rows = all.filter(t => (!x.co || t.type === x.co) && (!q || `${t.description || ''} ${t.source || ''} ${t.points} ${t.after}`.toLowerCase().includes(q)));
      if (!all.length) return K.empty('تظهر هنا إضافة النقاط بعد اعتماد طلب الشراء وخصمها عند عمليات الحماية.', 'wallet', 'لا توجد حركات نقاط بعد', K.btn('شراء نقاط', 'go', 'primary', 'data-to="buy"', 'card'));
      if (!rows.length) return K.empty('لا توجد حركات تطابق البحث أو التصفية.', 'search', '', K.btn('مسح البحث والتصفية', 'clear-filter', 'small'));
      return K.card(rows.map(t => K.row({ icon: t.type === 'credit' ? 'wallet' : 'repeat', tone: t.type === 'credit' ? 'ok' : '', title: `${t.type === 'credit' ? '+' : '−'}${N(t.points)} نقطة · ${t.type === 'credit' ? 'إضافة' : 'خصم'}`, sub: E(t.description || t.source), sub2: `${U.date(t.createdAt)} · الرصيد بعدها ${N(t.after)} نقطة`, act: 'operation-detail', attrs: `data-kind="points" data-id="${E(t.id)}"` })));
    };
    const tool = all.length ? K.toolbar('بحث في الحركات', x.q, [['', 'كل الحركات'], ['credit', 'الإضافات'], ['debit', 'الخصومات']], x.co || '', 'تصفية حسب نوع الحركة') : '';
    return withBar('رصيد النقاط وحركتها', '', balanceSummary(d, c) + tool + K.section('كشف الحساب') + `<div id="listbody">${list()}</div>`, { tab: 'account', list });
  }
  function orders(d, c) {
    const rows = d.purchaseRequests.filter(x => x.customerId === c.id).sort(byNew);
    return withBar('طلبات شراء النقاط', '', balanceSummary(d, c) + (rows.length ? K.card(rows.map(r => K.row({ icon: 'receipt', title: r.packageSnapshot.name, sub: `${N(r.packageSnapshot.points)} نقطة · ${N(r.packageSnapshot.price)} ر.ي`, sub2: `${E(r.paymentReference)} · ${U.date(r.createdAt)}`, pill: K.pill(label(r.status), TONE[r.status] || ''), act: 'operation-detail', attrs: `data-kind="request" data-id="${E(r.id)}"` }))) : K.empty('أرسل طلب شراء نقاط وستتابع حالته هنا.', 'receipt', 'لا توجد طلبات بعد', K.btn('شراء نقاط', 'go', 'primary', 'data-to="buy"', 'card'))), { tab: 'buy' });
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
    const list = rows.length ? K.card(rows.map(x => K.row({ icon: icon[x.kind], title: title(x), sub: U.date(x.createdAt), val: x.kind === 'points' ? `${x.type === 'credit' ? '+' : '−'}${N(x.points)} نقطة` : x.kind === 'request' ? '' : `${N(x.pointsCost)} نقطة`, pill: x.kind === 'request' ? K.pill(label(x.status), TONE[x.status] || '') : '', act: 'operation-detail', attrs: `data-kind="${x.kind}" data-id="${E(x.id)}"` }))) : K.empty('يظهر هنا سجل نقاطك وطلباتك وعمليات الحماية.', 'repeat', 'لا توجد عمليات بعد', K.btn('شراء نقاط', 'go', 'primary', 'data-to="buy"', 'card'));
    return withBar('العمليات', 'سجل نقاطك وطلباتك واشتراكاتك', balanceSummary(d, c) + list, { tab: 'operations' });
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
      rows = [['رقم الطلب', `<span class="ltr">${E(x.id)}</span>${K.copyBtn(x.id, 'رقم الطلب')}`], ['الباقة', E(x.packageSnapshot.name)], ['النقاط', N(x.packageSnapshot.points)], ['القيمة المالية', `${N(x.packageSnapshot.price)} ر.ي`], ['وسيلة الدفع', E(x.paymentMethodSnapshot.name)], ['المرجع', `<span class="ltr">${E(x.paymentReference)}</span>${K.copyBtn(x.paymentReference, 'المرجع')}`], ['الحالة', label(x.status)], ['تاريخ الطلب', U.date(x.createdAt)], ['تاريخ المراجعة', U.date(x.reviewedAt)], ['ملاحظة الإدارة', E(x.reviewNote || '—')]];
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
    if (kind !== 'request') return { title, body: K.kv(rows) };
    const r = d.purchaseRequests.find(v => v.id === id);
    const reason = r.status === 'rejected' ? K.callout('info', 'سبب الرفض', `<p>${E(r.reviewNote || 'لم تذكر الإدارة سببًا.')}</p>`, false, 'id="rejectReason"') : '';
    const foot = r.status === 'pending' ? K.btn('إلغاء الطلب', 'order-cancel', '', `data-id="${E(r.id)}"`) : r.status === 'rejected' ? K.btn('إعادة تقديم الطلب', 'order-resubmit', 'primary', `data-id="${E(r.id)}"`) : '';
    return { title, body: requestStages(r) + reason + K.kv(rows), foot };
  }

  /* ===================== الإشعارات والحساب ===================== */
  function notifications(d, c) {
    const ns = notices(d, c.id);
    return withBar('الإشعارات', ns.some(n => !n.readAt) ? `${N(ns.filter(n => !n.readAt).length)} جديد` : '', ns.length ? K.card(ns.map(n => K.row({ icon: 'bell', tone: n.readAt ? '' : 'dark', title: n.title, sub: E(n.body), sub2: U.date(n.createdAt), pill: K.pill(n.readAt ? 'مقروء' : 'جديد', n.readAt ? '' : 'dark'), act: 'notice-open', attrs: `data-id="${E(n.id)}"` }))) : K.empty('ستظهر هنا تحديثات طلباتك واشتراكاتك.', 'bell', 'لا توجد إشعارات'), { tab: 'home' });
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
      case 'radar': case 'subscriptions': return subscriptions(d, c, x);
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
