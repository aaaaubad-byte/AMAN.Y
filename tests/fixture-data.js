/* AMAN local reference data layer. Demo only; not production security or accounting. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.AmanData = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const KEY = 'AMAN_TEST_FIXTURE_ONLY';
  const LOCK = KEY + ':WRITE_LOCK';
  const clone = x => JSON.parse(JSON.stringify(x));
  const uid = prefix => `${prefix}_${(globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}${Math.random().toString(36).slice(2,10)}`).replaceAll('-', '')}`;
  const now = () => new Date().toISOString();
  const datePlus = (base, days) => new Date(new Date(base).getTime() + days * 86400000).toISOString();
  const safeArray = x => Array.isArray(x) ? x : [];
  const digitsOnly = value => String(value||'').replace(/[٠-٩۰-۹]/g,ch=>String(ch.charCodeAt(0)>='۰'.charCodeAt(0)?ch.charCodeAt(0)-'۰'.charCodeAt(0):ch.charCodeAt(0)-'٠'.charCodeAt(0))).replace(/\D/g,'');
  let injectedStorage = null;
  const storage = () => injectedStorage || (typeof localStorage !== 'undefined' ? localStorage : null);

  function seedData() {
    const t = Date.now();
    const ago = d => new Date(t - d * 86400000).toISOString();
    const future = d => new Date(t + d * 86400000).toISOString();
    const companies = [
      {id:'co-net77',name:'شبكة تجريبية 77',prefixes:['77','78'],lengths:[9],dailyRate:3,durations:[7,30,90],taskSchedule:{createFirstOnActivation:true,intervalDays:7,visibleBeforeDays:1,expenseAmount:2500,allowReschedule:true,createAfterExpiry:false,allowDuringGrace:false,graceDays:0,unit:'YER'},active:true},
      {id:'co-net73',name:'شبكة تجريبية 73',prefixes:['73'],lengths:[9],dailyRate:4,durations:[7,30,60],taskSchedule:{createFirstOnActivation:true,intervalDays:5,visibleBeforeDays:1,expenseAmount:1800,allowReschedule:true,createAfterExpiry:false,allowDuringGrace:false,graceDays:0,unit:'YER'},active:true},
      {id:'co-net71',name:'شبكة تجريبية 71',prefixes:['71'],lengths:[9],dailyRate:2,durations:[7,30,90],taskSchedule:{createFirstOnActivation:true,intervalDays:10,visibleBeforeDays:1,expenseAmount:2200,allowReschedule:true,createAfterExpiry:false,allowDuringGrace:false,graceDays:0,unit:'YER'},active:true},
      {id:'co-net70',name:'شبكة تجريبية 70',prefixes:['70'],lengths:[9],dailyRate:3,durations:[7,30,90],taskSchedule:{createFirstOnActivation:true,intervalDays:7,visibleBeforeDays:1,expenseAmount:2000,allowReschedule:true,createAfterExpiry:false,allowDuringGrace:false,graceDays:0,unit:'YER'},active:true}
    ];
    const customers = [
      {id:'cus-demo-subscriber',accountId:'AMAN-1001',name:'عميل تجريبي مشترك',email:'subscriber@aman.test',status:'active',isSubscriber:true,createdAt:ago(90)},
      {id:'cus-demo-low',accountId:'AMAN-1002',name:'عميل تجريبي برصيد منخفض',email:'lowbalance@aman.test',status:'active',isSubscriber:true,createdAt:ago(35)},
      {id:'cus-demo-new',accountId:'AMAN-1003',name:'عميل تجريبي جديد',email:'new@aman.test',status:'active',isSubscriber:false,createdAt:ago(2)}
    ];
    const numbers = [
      {id:'num-1001',customerId:'cus-demo-subscriber',number:'771234567',companyId:'co-net77',addedAt:ago(60),status:'active'},
      {id:'num-1002',customerId:'cus-demo-subscriber',number:'731234568',companyId:'co-net73',addedAt:ago(40),status:'active'},
      {id:'num-1003',customerId:'cus-demo-subscriber',number:'711234569',companyId:'co-net71',addedAt:ago(20),status:'active'},
      {id:'num-2001',customerId:'cus-demo-low',number:'771112223',companyId:'co-net77',addedAt:ago(20),status:'active'},
      {id:'num-3001',customerId:'cus-demo-new',number:'731010101',companyId:'co-net73',addedAt:ago(2),status:'active'}
    ];
    const subscriptions = [
      {id:'sub-1001',customerId:'cus-demo-subscriber',numberId:'num-1001',companyId:'co-net77',status:'active',startsAt:ago(25),endsAt:future(5),days:30,rateSnapshot:3,pointsCost:90,createdAt:ago(25)},
      {id:'sub-1002',customerId:'cus-demo-subscriber',numberId:'num-1002',companyId:'co-net73',status:'active',startsAt:ago(25),endsAt:future(2),days:30,rateSnapshot:4,pointsCost:120,createdAt:ago(25)},
      {id:'sub-expired',customerId:'cus-demo-subscriber',numberId:'num-1003',companyId:'co-net71',status:'expired',startsAt:ago(45),endsAt:ago(15),days:30,rateSnapshot:2,pointsCost:60,createdAt:ago(45)},
      {id:'sub-low',customerId:'cus-demo-low',numberId:'num-2001',companyId:'co-net77',status:'expired',startsAt:ago(40),endsAt:ago(10),days:30,rateSnapshot:3,pointsCost:90,createdAt:ago(40)}
    ];
    const packages = [
      {id:'pkg-100',name:'باقة 100 نقطة',points:100,price:5000,active:true},
      {id:'pkg-300',name:'باقة 300 نقطة',points:300,price:13500,active:true},
      {id:'pkg-1000',name:'باقة 1000 نقطة',points:1000,price:42000,active:true}
    ];
    const paymentMethods = [
      {id:'pay-wallet',name:'محفظة تجريبية',summary:'بيانات تدريبية غير حقيقية',instructions:'هذه وسيلة دفع تجريبية. لا ترسل أموالًا حقيقية. أدخل مرجعًا تجريبيًا للاختبار.',active:true},
      {id:'pay-bank',name:'تحويل بنكي تجريبي',summary:'حساب تدريبي',instructions:'استخدم مرجع تحويل وهميًا فقط. هذا النموذج لا يتصل بالبنوك ولا يتحقق من الدفع.',active:true}
    ];
    const pointTransactions = [
      {id:'pt-open-1',customerId:'cus-demo-subscriber',type:'credit',points:500,source:'seed',sourceId:'seed-subscriber',createdAt:ago(30),description:'رصيد افتتاحي تجريبي'},
      {id:'pt-spend-1',customerId:'cus-demo-subscriber',type:'debit',points:90,source:'subscription',sourceId:'sub-1001',createdAt:ago(25),description:'تفعيل تجريبي — 30 يومًا'},
      {id:'pt-spend-2',customerId:'cus-demo-subscriber',type:'debit',points:120,source:'subscription',sourceId:'sub-1002',createdAt:ago(25),description:'تفعيل تجريبي — 30 يومًا'},
      {id:'pt-spend-3',customerId:'cus-demo-subscriber',type:'debit',points:60,source:'subscription',sourceId:'sub-expired',createdAt:ago(45),description:'تفعيل تجريبي — 30 يومًا'},
      {id:'pt-open-2',customerId:'cus-demo-low',type:'credit',points:8,source:'seed',sourceId:'seed-low',createdAt:ago(10),description:'رصيد افتتاحي تجريبي منخفض'},
      {id:'pt-open-3',customerId:'cus-demo-new',type:'credit',points:0,source:'seed',sourceId:'seed-new',createdAt:ago(2),description:'حساب جديد دون رصيد'}
    ];
    const purchaseRequests = [
      {id:'req-pending-demo',customerId:'cus-demo-subscriber',packageId:'pkg-100',packageSnapshot:{name:'باقة 100 نقطة',points:100,price:5000},paymentMethodId:'pay-wallet',paymentMethodSnapshot:{name:'محفظة تجريبية',instructions:'تعليمات دفع تدريبية'},paymentReference:'DEMO-PENDING-001',status:'pending',createdAt:ago(1)},
      {id:'req-approved-demo',customerId:'cus-demo-subscriber',packageId:'pkg-300',packageSnapshot:{name:'باقة 300 نقطة',points:300,price:13500},paymentMethodId:'pay-bank',paymentMethodSnapshot:{name:'تحويل بنكي تجريبي',instructions:'حساب تدريبي'},paymentReference:'DEMO-APPROVED-001',status:'approved',createdAt:ago(20),reviewedAt:ago(19),pointTransactionId:'pt-approved-seed'},
      {id:'req-rejected-demo',customerId:'cus-demo-low',packageId:'pkg-100',packageSnapshot:{name:'باقة 100 نقطة',points:100,price:5000},paymentMethodId:'pay-wallet',paymentMethodSnapshot:{name:'محفظة تجريبية',instructions:'تعليمات دفع تدريبية'},paymentReference:'DEMO-REJECTED-001',status:'rejected',createdAt:ago(8),reviewedAt:ago(7),reviewNote:'طلب تجريبي مرفوض',pointTransactionId:null}
    ];
    pointTransactions.push({id:'pt-approved-seed',customerId:'cus-demo-subscriber',type:'credit',points:300,source:'purchase',sourceId:'req-approved-demo',createdAt:ago(19),description:'طلب شراء تجريبي معتمد'});
    const tasks = [
      {id:'task-due-demo',subscriptionId:'sub-1001',numberId:'num-1001',customerId:'cus-demo-subscriber',companyId:'co-net77',dueAt:ago(1),status:'due',expenseAmount:2500,createdAt:ago(8)},
      {id:'task-done-demo',subscriptionId:'sub-1002',numberId:'num-1002',customerId:'cus-demo-subscriber',companyId:'co-net73',dueAt:ago(8),status:'executed',expenseAmount:1800,executedAt:ago(8),createdAt:ago(13),financeEntryId:'fin-task-demo'},
      {id:'task-future-demo',subscriptionId:'sub-1002',numberId:'num-1002',customerId:'cus-demo-subscriber',companyId:'co-net73',dueAt:future(1),status:'planned',expenseAmount:1800,createdAt:ago(2)}
    ];
    return {
      schemaVersion:2,revision:1,updatedAt:now(),customers,companies,packages,paymentMethods,purchaseRequests,numbers,subscriptions,
      pointTransactions,tasks,operations:[{id:'op-seed',actorId:'system',type:'demo_seed',entityType:'system',entityId:'seed',result:'success',createdAt:ago(30),summary:'تهيئة بيانات الاختبار'}],
      financeEntries:[{id:'fin-task-demo',kind:'expense',amount:1800,currency:'YER',sourceType:'task',sourceId:'task-done-demo',description:'مصروف مهمة تجريبية منفذة',createdAt:ago(8)},{id:'fin-purchase-demo',kind:'revenue',amount:13500,currency:'YER',sourceType:'purchase',sourceId:'req-approved-demo',customerId:'cus-demo-subscriber',description:'إيراد طلب نقاط تجريبي معتمد',createdAt:ago(19)}],
      notifications:[{id:'notice-seed',customerId:'cus-demo-subscriber',title:'مرحبًا بك في نموذج أمان',body:'هذه رسالة محلية تجريبية.',status:'delivered-local',createdAt:ago(1),readAt:null}],
      idempotencyKeys:[],
      notificationSettings:{subscriptionExpiring:true,purchaseStatus:true,taskUpdates:true},
      admin:{id:'admin-demo',name:'مدير تجريبي',email:'admin@aman.test',darkMode:false,lockEnabled:false},
      content:{terms:'نص تجريبي للشروط والأحكام.',privacy:'نص تجريبي لسياسة الخصوصية.',contact:'بيانات تواصل تجريبية — استبدلها قبل الإنتاج.'}
    };
  }

  function normalize(db) {
    const d = db && typeof db === 'object' ? db : {};
    const legacy=Number(d.schemaVersion||1)<2;
    const collections=['customers','companies','packages','paymentMethods','purchaseRequests','numbers','subscriptions','pointTransactions','tasks','operations','financeEntries','notifications','idempotencyKeys'];
    for(const k of collections)d[k]=safeArray(d[k]);
    if(!d.admin)d.admin={id:'admin-demo',name:'مدير تجريبي',email:'admin@aman.test',darkMode:false,lockEnabled:false};
    if(!d.content)d.content={terms:'',privacy:'',contact:''};
    if(!d.notificationSettings)d.notificationSettings={subscriptionExpiring:true,purchaseStatus:true,taskUpdates:true};
    d.customers.forEach((c,i)=>{c.id ||= `legacy-customer-${i+1}`;c.accountId ||= c.id;c.status ||= 'active';c.isSubscriber=Boolean(c.isSubscriber||c.firstPurchaseApproved||d.purchaseRequests.some(r=>r.customerId===c.id&&['approved','معتمد','مكتملة'].includes(r.status)));});
    d.companies.forEach((c,i)=>{c.id ||= `legacy-company-${i+1}`;c.name ||= `شركة ${i+1}`;c.prefixes=safeArray(c.prefixes).map(String);c.lengths=safeArray(c.lengths).map(Number);c.dailyRate=Number(c.dailyRate||c.dailyTariff||c.tariff||1);c.durations=safeArray(c.durations).map(Number);if(!c.durations.length)c.durations=[7,30];c.taskSchedule ||= {intervalDays:7,expenseAmount:1000,unit:'YER'};c.active=c.active!==false;});
    d.packages.forEach((p,i)=>{p.id ||= `legacy-package-${i+1}`;p.name ||= `باقة ${i+1}`;p.points=Number(p.points||0);p.price=Number(p.price||0);p.active=p.active!==false;});
    d.paymentMethods.forEach((m,i)=>{m.id ||= `legacy-payment-${i+1}`;m.name ||= `وسيلة دفع ${i+1}`;m.instructions ||= String(m.summary||'تعليمات قديمة غير متوفرة');m.active=m.active!==false;});
    d.numbers.forEach((n,i)=>{n.id ||= `legacy-number-${i+1}`;n.number=digitsOnly(n.number||n.phone||'');n.customerId ||= d.customers.find(c=>c.email===n.customerEmail)?.id;let co=d.companies.find(c=>c.id===n.companyId||c.name===n.company)||companyFor(n.number,d);if(!co){co={id:'legacy-unknown-company',name:String(n.company||'شركة غير محددة (بيانات قديمة)'),prefixes:[],lengths:[9,10],dailyRate:1,durations:[7,30],taskSchedule:{intervalDays:7,expenseAmount:1000,unit:'YER'},active:false};if(!d.companies.some(x=>x.id===co.id))d.companies.push(co);}n.companyId=co.id;});
    if(legacy&&!d.pointTransactions.length)for(const c of d.customers){const opening=Math.max(0,Number(c.balance||0));d.pointTransactions.push({id:`legacy-opening-${c.id}`,customerId:c.id,type:'credit',points:opening,source:'migration',sourceId:c.id,createdAt:c.createdAt||now(),description:'رصيد محوّل من بيانات المعاينة القديمة'});}
    d.pointTransactions.forEach((x,i)=>{x.id ||= `legacy-point-${i+1}`;x.type=x.type==='debit'?'debit':'credit';x.points=Math.max(0,Number(x.points||0));});
    d.purchaseRequests.forEach((r,i)=>{r.id ||= `legacy-request-${i+1}`;r.status=({'قيد المراجعة':'pending','مكتملة':'approved','مرفوضة':'rejected'})[r.status]||r.status||'pending';r.packageSnapshot ||= {name:r.name||'باقة قديمة',points:Number(r.points||0),price:Number(r.price||0)};r.paymentMethodSnapshot ||= {name:r.paymentMethod||'وسيلة قديمة',instructions:r.paymentInstructions||'تعليمات غير محفوظة'};});
    d.subscriptions.forEach((s,i)=>{s.id ||= `legacy-subscription-${i+1}`;let n=d.numbers.find(x=>x.id===s.numberId||x.number===String(s.number||s.phone||'').replace(/\D/g,''));if(!n&&s.customerId){const co=d.companies.find(c=>c.id===s.companyId)||d.companies[0];n={id:`legacy-sub-number-${i+1}`,customerId:s.customerId,number:String(s.number||s.phone||`00000000${i}`).replace(/\D/g,''),companyId:co?.id||'legacy-unknown-company',addedAt:s.createdAt||now(),status:'active'};d.numbers.push(n);}s.numberId=n?.id||s.numberId;s.companyId ||= n?.companyId;s.days=Number(s.days||s.duration||0);s.rateSnapshot=Number(s.rateSnapshot||s.dailyRate||1);s.pointsCost=Number(s.pointsCost||s.days*s.rateSnapshot);s.status ||= 'active';});
    d.tasks.forEach((t,i)=>{t.id ||= `legacy-task-${i+1}`;});d.operations.forEach((x,i)=>{x.id ||= `legacy-operation-${i+1}`;});d.financeEntries.forEach((x,i)=>{x.id ||= `legacy-finance-${i+1}`;x.amount=Number(x.amount||0);x.kind=x.kind==='revenue'?'revenue':'expense';x.sourceType ||= 'legacy';});d.notifications.forEach((x,i)=>{x.id ||= `legacy-notice-${i+1}`;});
    d.schemaVersion=2;d.revision=Number(d.revision||0);return d;
  }
  function read() {
    const s = storage(); if (!s) throw new Error('التخزين المحلي غير متاح. افتح التطبيق عبر خادم HTTP محلي.');
    const raw = s.getItem(KEY);
    if (raw === null) { const d = seedData(); writeDirect(d); return clone(d); }
    let parsed; try { parsed = JSON.parse(raw); } catch { throw new Error('تعذر قراءة بيانات التخزين؛ لم تُستبدل البيانات تلقائيًا. استخدم إعادة التهيئة التجريبية إذا كانت هذه بيانات اختبار.'); }
    return clone(normalize(parsed));
  }
  function writeDirect(db) {
    const s = storage(); if (!s) throw new Error('التخزين المحلي غير متاح.');
    try { s.setItem(KEY, JSON.stringify(db)); }
    catch (e) { throw new Error(`فشل حفظ البيانات: ${e?.message || 'المساحة غير كافية أو التخزين محظور'}`); }
  }
  function validate(db) {
    const ids = ['customers','companies','packages','paymentMethods','purchaseRequests','numbers','subscriptions','pointTransactions','tasks','financeEntries','operations'];
    for (const list of ids) {
      const arr=safeArray(db[list]); const set=new Set();
      for (const x of arr) { if (!x.id || set.has(x.id)) throw new Error(`معرّف مفقود أو مكرر في ${list}`); set.add(x.id); }
    }
    const customerIds=new Set(db.customers.map(x=>x.id)), numberIds=new Set(db.numbers.map(x=>x.id)), subIds=new Set(db.subscriptions.map(x=>x.id));
    for(const n of db.numbers) if(!customerIds.has(n.customerId)||!db.companies.some(c=>c.id===n.companyId)) throw new Error(`علاقة رقم غير صالحة: ${n.id}`);
    for(const s of db.subscriptions) if(!customerIds.has(s.customerId)||!numberIds.has(s.numberId)||!db.companies.some(c=>c.id===s.companyId)) throw new Error(`علاقة اشتراك غير صالحة: ${s.id}`);
    for(const t of db.tasks) if(!subIds.has(t.subscriptionId)||!numberIds.has(t.numberId)) throw new Error(`علاقة مهمة غير صالحة: ${t.id}`);
    for(const tx of db.pointTransactions) if(!customerIds.has(tx.customerId)||!Number.isFinite(Number(tx.points))||Number(tx.points)<0) throw new Error(`معاملة نقاط غير صالحة: ${tx.id}`);
    for(const r of db.purchaseRequests) if(!customerIds.has(r.customerId)) throw new Error(`طلب بلا عميل: ${r.id}`);
    for(const f of db.financeEntries) if(!Number.isFinite(Number(f.amount))||Number(f.amount)<=0) throw new Error(`قيد مالي غير صالح: ${f.id}`);
    for(const c of db.customers) if(balanceFrom(db,c.id)<0) throw new Error(`رصيد نقاط سالب للعميل ${c.id}`);
  }
  async function transact(actor, action, mutator) {
    const work = async () => {
      const before=read(), draft=clone(before); const result=mutator(draft);
      draft.revision=before.revision+1; draft.updatedAt=now();
      if(action) draft.operations.push({id:uid('op'),actorId:actor||'system',type:action,entityType:result?.entityType||'system',entityId:result?.entityId||null,result:'success',createdAt:now(),summary:result?.summary||action});
      validate(draft); writeDirect(draft); return {db:clone(draft),result};
    };
    if (typeof navigator!=='undefined' && navigator.locks?.request) return navigator.locks.request(LOCK,{mode:'exclusive'},work);
    return work();
  }
  function balanceFrom(db, customerId) { return db.pointTransactions.filter(x=>x.customerId===customerId).reduce((s,x)=>s+(x.type==='credit'?1:-1)*Number(x.points),0); }
  function balance(customerId, db=read()) { return balanceFrom(db,customerId); }
  function companyFor(number, db=read()) {
    const digits=digitsOnly(number);
    return db.companies.filter(c=>c.active!==false&&(c.prefixes||[]).some(p=>digits.startsWith(String(p).replace(/\D/g,''))))
      .sort((a,b)=>Math.max(...(b.prefixes||[]).map(p=>String(p).replace(/\D/g,'').length),0)-Math.max(...(a.prefixes||[]).map(p=>String(p).replace(/\D/g,'').length),0))[0] || null;
  }
  function validPhone(number, company) { const n=digitsOnly(number); return !!company && (company.lengths||[]).includes(n.length) && /^\d+$/.test(n); }
  function activeSubscription(db, numberId, at=Date.now()) { return db.subscriptions.filter(s=>s.numberId===numberId&&new Date(s.endsAt).getTime()>at).sort((a,b)=>new Date(b.endsAt)-new Date(a.endsAt))[0]||null; }
  function ownedNumber(db, customerId, numberId) { const n=db.numbers.find(x=>x.id===numberId); if(!n||n.customerId!==customerId) throw new Error('هذا الرقم غير موجود ضمن أرقام حسابك.'); return n; }
  async function addNumber(customerId, value) {
    const digits=digitsOnly(value);
    return transact(customerId,'number_added',db=>{
      const co=companyFor(digits,db); if(!validPhone(digits,co)) throw new Error(co?'طول الرقم لا يطابق قواعد الشركة المسجلة.':'لا يمكن اكتشاف الشركة من بادئة الرقم.');
      if(db.numbers.some(n=>n.number===digits)) throw new Error('هذا الرقم مسجل مسبقًا في النظام.');
      const n={id:uid('num'),customerId,number:digits,companyId:co.id,addedAt:now(),status:'active'};db.numbers.push(n);
      return {entityType:'number',entityId:n.id,summary:`إضافة رقم ${digits} دون تفعيل اشتراك`};
    });
  }
  async function createPurchase(customerId, packageId, paymentMethodId, reference) {
    return transact(customerId,'purchase_requested',db=>{
      const c=db.customers.find(x=>x.id===customerId); if(!c) throw new Error('الحساب غير موجود.');
      const p=db.packages.find(x=>x.id===packageId&&x.active!==false),m=db.paymentMethods.find(x=>x.id===paymentMethodId&&x.active!==false);
      if(!p||!m) throw new Error('الباقة أو وسيلة الدفع غير متاحة.');
      if(!Number.isInteger(Number(p.points))||Number(p.points)<=0||!Number.isFinite(Number(p.price))||Number(p.price)<=0)throw new Error('قيم الباقة غير صالحة.');
      if(!String(reference||'').trim()) throw new Error('أدخل مرجع إثبات الدفع التجريبي.');
      if(db.purchaseRequests.some(r=>r.customerId===customerId&&r.paymentReference===String(reference).trim())) throw new Error('مرجع الدفع استُخدم في طلب سابق بالفعل.');
      const r={id:uid('req'),customerId,packageId:p.id,packageSnapshot:{name:p.name,points:Number(p.points),price:Number(p.price)},paymentMethodId:m.id,paymentMethodSnapshot:{name:m.name,instructions:m.instructions},paymentReference:String(reference).trim(),status:'pending',createdAt:now(),reviewedAt:null,reviewNote:null,pointTransactionId:null};db.purchaseRequests.push(r);
      return {entityType:'purchase_request',entityId:r.id,summary:`طلب باقة ${p.name}`};
    });
  }
  async function reviewPurchase(adminId, requestId, decision, note='') {
    if(!['approved','rejected'].includes(decision)) throw new Error('قرار الطلب غير صالح.');
    return transact(adminId,decision==='approved'?'purchase_approved':'purchase_rejected',db=>{
      const r=db.purchaseRequests.find(x=>x.id===requestId);if(!r)throw new Error('الطلب غير موجود.');if(r.status!=='pending')throw new Error('لا يمكن مراجعة الطلب: حالته ليست معلقة.');
      const c=db.customers.find(x=>x.id===r.customerId);if(!c)throw new Error('العميل المرتبط بالطلب غير موجود.');
      r.status=decision;r.reviewedAt=now();r.reviewNote=String(note||'').trim()||null;
      if(decision==='approved'){
        if(db.pointTransactions.some(t=>t.source==='purchase'&&t.sourceId===r.id))throw new Error('توجد معاملة نقاط سابقة لهذا الطلب.');
        const tx={id:uid('pt'),customerId:c.id,type:'credit',points:Number(r.packageSnapshot.points),source:'purchase',sourceId:r.id,createdAt:now(),description:`اعتماد طلب ${r.id} — ${r.packageSnapshot.name}`};db.pointTransactions.push(tx);r.pointTransactionId=tx.id;
        if(!db.financeEntries.some(f=>f.sourceType==='purchase'&&f.sourceId===r.id))db.financeEntries.push({id:uid('fin'),kind:'revenue',amount:Number(r.packageSnapshot.price),currency:'YER',sourceType:'purchase',sourceId:r.id,customerId:c.id,description:`إيراد طلب نقاط ${r.id}`,createdAt:now()});
        c.isSubscriber=true;
      }
      if(db.notificationSettings?.purchaseStatus)db.notifications.unshift({id:uid('notice'),customerId:c.id,title:decision==='approved'?'تم اعتماد طلب النقاط':'تم رفض طلب النقاط',body:`حالة الطلب ${r.id}: ${decision==='approved'?'معتمد':'مرفوض'}.${decision==='rejected'&&r.reviewNote?' السبب: '+r.reviewNote:''}`,status:'delivered-local',createdAt:now(),readAt:null});
      return {entityType:'purchase_request',entityId:r.id,summary:`${decision==='approved'?'اعتماد':'رفض'} طلب ${r.id}`};
    });
  }
  async function activateSubscription(customerId, numberId, days, idempotencyKey='') {
    days=Number(days);
    return transact(customerId,'subscription_activated_or_extended',db=>{
      if(idempotencyKey&&db.idempotencyKeys.some(x=>x.customerId===customerId&&x.key===idempotencyKey))throw new Error('تم تنفيذ هذا التأكيد بالفعل؛ لم يُخصم رصيد إضافي.');
      const n=ownedNumber(db,customerId,numberId),co=db.companies.find(c=>c.id===n.companyId&&c.active!==false);
      if(!co)throw new Error('شركة الرقم غير متاحة.');if(!Number.isInteger(days)||!(co.durations||[]).includes(days))throw new Error('مدة الاشتراك غير صالحة وفق مدد الشركة.');
      const rate=Number(co.dailyRate);if(!Number.isFinite(rate)||rate<=0)throw new Error('تعرفة الشركة غير صالحة.');
      const cost=rate*days;if(!Number.isSafeInteger(cost))throw new Error('تكلفة الاشتراك غير صالحة.');
      const old=activeSubscription(db,n.id),remaining=old?Math.max(0,Math.ceil((new Date(old.endsAt)-Date.now())/86400000)):0;
      if(balanceFrom(db,customerId)<cost)throw new Error('رصيد أمان غير كافٍ؛ لم يتم خصم نقاط أو إنشاء اشتراك.');
      const startsAt=old?old.startsAt:now(),endsAt=datePlus(old?old.endsAt:now(),days);
      if(old)old.status='extended';
      const s={id:uid('sub'),customerId,numberId:n.id,companyId:co.id,status:'active',startsAt,endsAt,days:remaining+days,addedDays:days,rateSnapshot:rate,pointsCost:cost,previousSubscriptionId:old?.id||null,createdAt:now()};db.subscriptions.push(s);
      db.pointTransactions.push({id:uid('pt'),customerId,type:'debit',points:cost,source:'subscription',sourceId:s.id,createdAt:now(),description:`${old?'تمديد':'تفعيل'} رقم ${n.number} لمدة ${days} يومًا`});
      const schedule=co.taskSchedule||{},interval=Number(schedule.intervalDays),expense=Number(schedule.expenseAmount);
      if(!Number.isInteger(interval)||interval<=0||!Number.isFinite(expense)||expense<=0)throw new Error('إعداد جدولة المهام أو قيمتها المالية غير صالحة؛ لم تحفظ العملية.');
      const dueAt=datePlus(now(),interval);if(new Date(dueAt)<=new Date(endsAt))db.tasks.push({id:uid('task'),subscriptionId:s.id,numberId:n.id,customerId,companyId:co.id,dueAt,status:'planned',expenseAmount:expense,createdAt:now()});
      if(idempotencyKey)db.idempotencyKeys.push({id:uid('idem'),customerId,key:idempotencyKey,createdAt:now(),entityId:s.id});
      return {entityType:'subscription',entityId:s.id,summary:`${old?'تمديد':'تفعيل'} ${n.number} بتكلفة ${cost} نقطة`,cost,remainingDays:remaining};
    });
  }
  async function executeTask(adminId, taskId) {
    return transact(adminId,'task_executed',db=>{
      const t=db.tasks.find(x=>x.id===taskId);if(!t)throw new Error('المهمة غير موجودة.');if(t.status==='executed')throw new Error('سبق تنفيذ هذه المهمة.');
      if(t.status==='cancelled')throw new Error('لا يمكن تنفيذ مهمة ملغاة.');if(new Date(t.dueAt)>Date.now())throw new Error('لم يحِن موعد المهمة بعد.');
      const c=db.companies.find(x=>x.id===t.companyId),interval=Number(c?.taskSchedule?.intervalDays);if(!Number.isInteger(interval)||interval<=0)throw new Error('إعداد الجدولة غير صالح.');
      t.status='executed';t.executedAt=now();
      const fin={id:uid('fin'),kind:'expense',amount:Number(t.expenseAmount),currency:'YER',sourceType:'task',sourceId:t.id,customerId:t.customerId,description:`مصروف تنفيذ مهمة ${t.id}`,createdAt:now()};
      if(db.financeEntries.some(f=>f.sourceType==='task'&&f.sourceId===t.id))throw new Error('المصروف مسجل مسبقًا لهذه المهمة.');db.financeEntries.push(fin);t.financeEntryId=fin.id;
      if(db.notificationSettings?.taskUpdates)db.notifications.unshift({id:uid('notice'),customerId:t.customerId,numberId:t.numberId,title:'تم تحديث مهمة رقمك',body:`نُفذت المهمة ${t.id} للرقم ${db.numbers.find(n=>n.id===t.numberId)?.number||''} محليًا.`,status:'delivered-local',createdAt:now(),readAt:null});
      const sub=db.subscriptions.find(s=>s.id===t.subscriptionId);
      const nextDue=sub?datePlus(t.executedAt,interval):null;if(sub&&new Date(sub.endsAt)>Date.now()&&new Date(nextDue)<=new Date(sub.endsAt))db.tasks.push({id:uid('task'),subscriptionId:sub.id,numberId:t.numberId,customerId:t.customerId,companyId:t.companyId,dueAt:nextDue,status:'planned',expenseAmount:Number(c.taskSchedule.expenseAmount),createdAt:now(),previousTaskId:t.id});
      return {entityType:'task',entityId:t.id,summary:`تنفيذ مهمة ${t.id} وتسجيل مصروف مرة واحدة`};
    });
  }
  async function addFinancialEntry(adminId, kind, amount, description) {
    amount=Number(amount);if(!['revenue','expense'].includes(kind)||!Number.isFinite(amount)||amount<=0||!String(description||'').trim())throw new Error('أدخل نوع القيد ومبلغًا موجبًا وبيانًا واضحًا.');
    return transact(adminId,'manual_finance_entry',db=>{const x={id:uid('fin'),kind,amount,currency:'YER',sourceType:'manual',sourceId:null,description:String(description).trim(),createdAt:now()};db.financeEntries.push(x);return {entityType:'finance_entry',entityId:x.id,summary:`قيد مالي يدوي ${kind}`};});
  }
  async function saveCompany(adminId, input) {
    return transact(adminId,'company_saved',db=>{const c={...input,id:input.id||uid('co'),name:String(input.name||'').trim(),prefixes:[...new Set((input.prefixes||[]).map(digitsOnly).filter(Boolean))],lengths:(input.lengths||[]).map(Number),dailyRate:Number(input.dailyRate),durations:(input.durations||[]).map(Number),taskSchedule:{intervalDays:Number(input.intervalDays),expenseAmount:Number(input.expenseAmount),unit:'YER'},active:input.active!==false};if(!c.name||!c.prefixes.length||!c.lengths.length||!c.lengths.every(x=>Number.isInteger(x)&&x>0)||!Number.isInteger(c.dailyRate)||c.dailyRate<=0||!c.durations.length||!c.durations.every(x=>Number.isInteger(x)&&x>0)||!Number.isInteger(c.taskSchedule.intervalDays)||c.taskSchedule.intervalDays<=0||!Number.isFinite(c.taskSchedule.expenseAmount)||c.taskSchedule.expenseAmount<=0)throw new Error('بيانات الشركة أو التعرفة أو الجدولة غير مكتملة.');const i=db.companies.findIndex(x=>x.id===c.id);if(i<0)db.companies.push(c);else db.companies[i]=c;return {entityType:'company',entityId:c.id,summary:`حفظ الشركة ${c.name}`};});
  }
  async function savePackage(adminId, input) {
    return transact(adminId,'package_saved',db=>{const p={id:input.id||uid('pkg'),name:String(input.name||'').trim(),points:Number(input.points),price:Number(input.price),active:input.active!==false};if(!p.name||!Number.isInteger(p.points)||p.points<=0||!Number.isFinite(p.price)||p.price<=0)throw new Error('بيانات الباقة غير صالحة.');const i=db.packages.findIndex(x=>x.id===p.id);if(i<0)db.packages.push(p);else db.packages[i]=p;return {entityType:'package',entityId:p.id,summary:`حفظ الباقة ${p.name}`};});
  }
  async function savePaymentMethod(adminId, input) {
    return transact(adminId,'payment_method_saved',db=>{const m={id:input.id||uid('pay'),name:String(input.name||'').trim(),summary:String(input.summary||'').trim(),instructions:String(input.instructions||'').trim(),active:input.active!==false};if(!m.name||!m.instructions)throw new Error('اسم وسيلة الدفع وتعليماتها مطلوبان.');const i=db.paymentMethods.findIndex(x=>x.id===m.id);if(i<0)db.paymentMethods.push(m);else db.paymentMethods[i]=m;return {entityType:'payment_method',entityId:m.id,summary:`حفظ وسيلة الدفع ${m.name}`};});
  }
  async function sendLocalNotice(adminId, title, body, audience='all', customerId='') {
    if(!String(title||'').trim()||!String(body||'').trim())throw new Error('عنوان الإشعار ونصه مطلوبان.');
    return transact(adminId,'admin_notice_created',db=>{const recipients=audience==='customer'?[db.customers.find(c=>c.id===customerId)].filter(Boolean):db.customers.filter(c=>audience==='subscribers'?c.isSubscriber:true);if(!recipients.length)throw new Error('لا يوجد جمهور مطابق.');for(const c of recipients)db.notifications.push({id:uid('notice'),customerId:c.id,title:String(title).trim(),body:String(body).trim(),status:'delivered-local',createdAt:now(),readAt:null});return {entityType:'notification',entityId:null,summary:`إشعار محلي إلى ${recipients.length} عميلًا`};});
  }
  async function markNoticeRead(customerId, noticeId) { return transact(customerId,'notification_read',db=>{const n=db.notifications.find(x=>x.id===noticeId&&x.customerId===customerId);if(!n)throw new Error('الإشعار غير موجود لهذا الحساب.');if(!n.readAt)n.readAt=now();return {entityType:'notification',entityId:n.id,summary:'قراءة إشعار محلي'};}); }
  async function updateContent(adminId, key, value) { if(!['terms','privacy','contact'].includes(key))throw new Error('نوع المحتوى غير صالح.');return transact(adminId,'content_updated',db=>{db.content[key]=String(value||'');return {entityType:'content',entityId:key,summary:`تعديل محتوى ${key}`};}); }
  async function resetDemo() { const d=seedData(); writeDirect(d); return clone(d); }
  function setStorageForTests(s) { injectedStorage=s; }
  function exportJSON() { return JSON.stringify(read(),null,2); }
  return {KEY,seedData,read,transact,balance,balanceFrom,companyFor,validPhone,activeSubscription,addNumber,createPurchase,reviewPurchase,activateSubscription,executeTask,addFinancialEntry,saveCompany,savePackage,savePaymentMethod,sendLocalNotice,markNoticeRead,updateContent,resetDemo,setStorageForTests,exportJSON,uid,now,datePlus};
});
