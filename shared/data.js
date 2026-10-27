/* AMAN local reference data layer. Demo only; not production security or accounting. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.AmanData = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const KEY = 'AMAN_SHARED_REGISTRY_V2';
  const LOCK = KEY + ':WRITE_LOCK';
  const clone = x => JSON.parse(JSON.stringify(x));
  const uid = prefix => `${prefix}_${(globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}${Math.random().toString(36).slice(2,10)}`).replaceAll('-', '')}`;
  const now = () => new Date().toISOString();
  const datePlus=(base,days)=>{const d=new Date(new Date(base).getTime()+10800000);d.setUTCDate(d.getUTCDate()+Number(days));return new Date(d.getTime()-10800000).toISOString();};
  function regenerateTaskPlan(db, sub, cfg) {
    const interval=Number(cfg.intervalDays),visibleDays=Number(cfg.visibleBeforeDays||0),expense=Number(cfg.expenseAmount);
    if(!Number.isInteger(interval)||interval<=0||!Number.isInteger(visibleDays)||visibleDays<0||!Number.isFinite(expense)||expense<=0)throw new Error('إعداد جدولة المهام أو قيمتها المالية غير صالحة.');
    const tailDays=cfg.createAfterExpiry===true?Number(cfg.graceDays||0):0;
    if(!Number.isInteger(tailDays)||tailDays<0)throw new Error('مهلة إنشاء المهام بعد الانتهاء غير صالحة.');
    const deadline=new Date(sub.endsAt).getTime()+tailDays*86400000;
    const executed=db.tasks.filter(t=>t.subscriptionId===sub.id&&t.status==='executed').sort((a,b)=>new Date(a.executedAt||a.dueAt)-new Date(b.executedAt||b.dueAt));
    const pending=db.tasks.filter(t=>t.subscriptionId===sub.id&&t.status!=='executed'&&t.scheduleManaged!==false).sort((a,b)=>new Date(a.dueAt)-new Date(b.dueAt));
    let cursor=executed.length?new Date(datePlus(executed.at(-1).executedAt||executed.at(-1).dueAt,interval)).getTime():new Date(cfg.createFirstOnActivation===false?datePlus(sub.startsAt,interval):sub.startsAt).getTime();
    const dates=[];for(let i=0;i<10000&&cursor<=deadline;i++,cursor+=interval*86400000)dates.push(new Date(cursor).toISOString());
    for(let i=0;i<dates.length;i++){
      const dueAt=dates[i],visibleAt=new Date(Math.max(new Date(sub.startsAt).getTime(),new Date(datePlus(dueAt,-visibleDays)).getTime())).toISOString(),task=pending[i],status=i===0&&new Date(dueAt)<=Date.now()?'due':'planned';
      if(task){Object.assign(task,{dueAt,visibleAt,status,expenseAmount:expense,scheduleManaged:true,scheduleIndex:i});}
      else db.tasks.push({id:uid('task'),subscriptionId:sub.id,numberId:sub.numberId,customerId:sub.customerId,companyId:sub.companyId,dueAt,visibleAt,status,expenseAmount:expense,createdAt:now(),scheduleManaged:true,scheduleIndex:i});
    }
    for(let i=dates.length;i<pending.length;i++)pending[i].status='cancelled';
  }
  const safeArray = x => Array.isArray(x) ? x : [];
  const digitsOnly = value => String(value||'').replace(/[٠-٩۰-۹]/g,ch=>String(ch.charCodeAt(0)>='۰'.charCodeAt(0)?ch.charCodeAt(0)-'۰'.charCodeAt(0):ch.charCodeAt(0)-'٠'.charCodeAt(0))).replace(/\D/g,'');
  let injectedStorage = null;
  const storage = () => injectedStorage || (typeof localStorage !== 'undefined' ? localStorage : null);

  // Fresh local workspace: deliberately empty. The owner creates all business data manually.
  function seedData() {
    return {
      schemaVersion: 2, revision: 0, updatedAt: now(),
      customers: [], companies: [], packages: [], protectionPackages: [], paymentMethods: [], purchaseRequests: [],
      numbers: [], numberLinks: [], subscriptions: [], protectionOperations: [], pointTransactions: [], tasks: [], operations: [],
      financeEntries: [], notifications: [], idempotencyKeys: [],
      notificationSettings: { subscriptionExpiring: true, purchaseStatus: true, taskUpdates: true, protectionUpdates: true },
      admin: { id: 'admin-local', name: 'مدير النظام', email: 'admin@aman.test', darkMode: false, lockEnabled: false },
      content: { terms: '', privacy: '', contact: '', faq: '' },
      settings: { customerClasses: { newWithinDays: null, premiumMinApprovedOrders: null } }
    };
  }

  const DEFAULT_TEMPLATES=[{id:'tpl-ref-bad',kind:'reject',title:'مرجع غير صحيح',body:'المرجع الذي أدخلته لم يطابق أي تحويل. تحقق منه وأعد تقديم الطلب.'},{id:'tpl-amount-short',kind:'reject',title:'مبلغ ناقص',body:'المبلغ المحوّل أقل من قيمة الباقة. أعد الطلب بعد تحويل المبلغ الصحيح.'},{id:'tpl-not-received',kind:'reject',title:'تحويل لم يصل',body:'لم يصلنا التحويل بعد. أعد الطلب بعد التأكد من إتمامه.'},{id:'tpl-approved',kind:'reply',title:'تم الاعتماد',body:'تم اعتماد طلبك وإضافة النقاط إلى رصيدك.'}];
    function normalize(db) {
    const d = db && typeof db === 'object' ? db : {};
    const legacy=Number(d.schemaVersion||1)<2;
    const hadNumberLinks=Array.isArray(d.numberLinks);const collections=['customers','companies','packages','protectionPackages','paymentMethods','purchaseRequests','numbers','numberLinks','subscriptions','protectionOperations','pointTransactions','tasks','operations','financeEntries','notifications','idempotencyKeys'];
    for(const k of collections){if(d[k]===undefined)d[k]=[];else if(!Array.isArray(d[k]))throw new Error(`بنية مجموعة ${k} غير صالحة؛ لم تُستبدل البيانات.`);}
    if(!d.admin)d.admin={id:'admin-demo',name:'مدير تجريبي',email:'admin@aman.test',darkMode:false,lockEnabled:false};
    d.content={terms:'',privacy:'',contact:'',faq:'',...(d.content||{})};
    d.settings={...(d.settings||{}),customerClasses:{newWithinDays:null,premiumMinApprovedOrders:null,...(d.settings?.customerClasses||{})}};
    if(!Array.isArray(d.internalNotes))d.internalNotes=[];
    if(!Array.isArray(d.messageTemplates))d.messageTemplates=DEFAULT_TEMPLATES.map(t=>({...t}));
    d.notificationSettings={subscriptionExpiring:true,purchaseStatus:true,taskUpdates:true,protectionUpdates:true,...(d.notificationSettings||{})};
    d.customers.forEach((c,i)=>{c.id ||= `legacy-customer-${i+1}`;c.accountId ||= c.id;c.status ||= 'active';c.tags=safeArray(c.tags).map(String);c.isSubscriber=Boolean(c.isSubscriber||c.firstPurchaseApproved||d.purchaseRequests.some(r=>r.customerId===c.id&&['approved','معتمد','مكتملة'].includes(r.status)));});
    d.companies.forEach((c,i)=>{c.id ||= `legacy-company-${i+1}`;c.name ||= `شركة ${i+1}`;c.prefixes=safeArray(c.prefixes).map(String);c.lengths=safeArray(c.lengths).map(Number);c.dailyRate=Number(c.dailyRate||c.dailyTariff||c.tariff||0);c.durations=safeArray(c.durations).map(Number);if(c.taskSchedule)c.taskSchedule={...c.taskSchedule};c.active=c.active!==false;});
    d.packages.forEach((p,i)=>{p.id ||= `legacy-package-${i+1}`;p.name ||= `باقة ${i+1}`;p.points=Number(p.points||0);p.price=Number(p.price||0);p.active=p.active!==false;});
    d.protectionPackages.forEach((p,i)=>{p.id ||= `legacy-protection-package-${i+1}`;p.name ||= `باقة حماية ${i+1}`;p.companyId ||= d.companies[0]?.id||'';p.days=Number(p.days||p.durationDays||0);p.pointsCost=Number(p.pointsCost||p.costPoints||0);p.active=p.active!==false;});
    d.paymentMethods.forEach((m,i)=>{m.id ||= `legacy-payment-${i+1}`;m.name ||= `وسيلة دفع ${i+1}`;m.instructions ||= String(m.summary||'تعليمات قديمة غير متوفرة');m.active=m.active!==false;});
    d.numbers.forEach((n,i)=>{n.id ||= `legacy-number-${i+1}`;n.number=digitsOnly(n.number||n.phone||'');n.customerId ||= d.customers.find(c=>c.email===n.customerEmail)?.id;let co=d.companies.find(c=>c.id===n.companyId||c.name===n.company)||companyFor(n.number,d);if(!co){co={id:'legacy-unknown-company',name:String(n.company||'شركة غير محددة (بيانات قديمة)'),prefixes:[],lengths:[9,10],dailyRate:0,durations:[],taskSchedule:{},active:false};if(!d.companies.some(x=>x.id===co.id))d.companies.push(co);}n.companyId=co.id;});
    if(!hadNumberLinks){d.numberLinks=[];for(const [i,n] of d.numbers.entries())if(n.customerId&&d.customers.some(c=>c.id===n.customerId))d.numberLinks.push({id:`legacy-number-link-${i+1}`,numberId:n.id,customerId:n.customerId,createdAt:n.addedAt||now()});}
    for(const [i,link] of d.numberLinks.entries()){link.id ||= `legacy-number-link-${i+1}`;link.numberId ||= link.number_id;link.customerId ||= link.customer_id;}
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
    let parsed; try { parsed = JSON.parse(raw); } catch { throw new Error('تعذر قراءة بيانات التخزين؛ لم تُستبدل البيانات تلقائيًا. صدّر نسخة محفوظة أو افحص البيانات يدويًا قبل أي إصلاح.'); }
    if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new Error('جذر بيانات التخزين ليس كائنًا صالحًا؛ لم تُستبدل البيانات.');
    return clone(normalize(parsed));
  }
  function writeDirect(db) {
    const s = storage(); if (!s) throw new Error('التخزين المحلي غير متاح.');
    try { s.setItem(KEY, JSON.stringify(db)); }
    catch (e) { throw new Error(`فشل حفظ البيانات: ${e?.message || 'المساحة غير كافية أو التخزين محظور'}`); }
  }
  function validate(db) {
    const ids = ['customers','companies','packages','protectionPackages','paymentMethods','purchaseRequests','numbers','numberLinks','subscriptions','protectionOperations','pointTransactions','tasks','financeEntries','operations','notifications','idempotencyKeys'];
    for (const list of ids) {
      const arr=safeArray(db[list]); const set=new Set();
      for (const x of arr) { if (!x.id || set.has(x.id)) throw new Error(`معرّف مفقود أو مكرر في ${list}`); set.add(x.id); }
    }
    const customerIds=new Set(db.customers.map(x=>x.id)), numberIds=new Set(db.numbers.map(x=>x.id)), subIds=new Set(db.subscriptions.map(x=>x.id));
    for(const n of db.numbers) if((n.customerId&&!customerIds.has(n.customerId))||!db.companies.some(c=>c.id===n.companyId)) throw new Error(`علاقة رقم غير صالحة: ${n.id}`);for(const l of db.numberLinks){if(!numberIds.has(l.numberId)||!customerIds.has(l.customerId)||db.numberLinks.filter(x=>x.numberId===l.numberId&&x.customerId===l.customerId).length!==1)throw new Error(`علاقة ربط رقم غير صالحة: ${l.id}`);}
    for(const s of db.subscriptions){const n=db.numbers.find(x=>x.id===s.numberId);if(!customerIds.has(s.customerId)||!numberIds.has(s.numberId)||!db.companies.some(c=>c.id===s.companyId)||n?.companyId!==s.companyId)throw new Error(`علاقة اشتراك غير صالحة: ${s.id}`);}
    for(const t of db.tasks){const sub=db.subscriptions.find(x=>x.id===t.subscriptionId),n=db.numbers.find(x=>x.id===t.numberId);if(!subIds.has(t.subscriptionId)||!numberIds.has(t.numberId)||!customerIds.has(t.customerId)||!db.companies.some(c=>c.id===t.companyId)||sub?.customerId!==t.customerId||sub?.numberId!==t.numberId||sub?.companyId!==t.companyId||n?.companyId!==t.companyId)throw new Error(`علاقة مهمة غير صالحة: ${t.id}`);}
    for(const tx of db.pointTransactions) if(!customerIds.has(tx.customerId)||!Number.isFinite(Number(tx.points))||Number(tx.points)<0) throw new Error(`معاملة نقاط غير صالحة: ${tx.id}`);
    for(const op of db.protectionOperations){if(!customerIds.has(op.customerId)||!numberIds.has(op.numberId)||!subIds.has(op.subscriptionId)||!db.companies.some(c=>c.id===op.companyId)||!['subscribe','extend','renew'].includes(op.type)||!Number.isInteger(Number(op.pointsCost))||Number(op.pointsCost)<=0)throw new Error(`عملية حماية غير صالحة: ${op.id}`);const txs=db.pointTransactions.filter(t=>t.source==='protection_operation'&&t.sourceId===op.id);if(txs.length!==1||txs[0].type!=='debit'||Number(txs[0].points)!==Number(op.pointsCost))throw new Error(`خصم نقاط عملية الحماية غير متسق: ${op.id}`);}
    for(const tx of db.pointTransactions.filter(t=>t.source==='protection_operation'))if(db.pointTransactions.filter(x=>x.source==='protection_operation'&&x.sourceId===tx.sourceId).length>1)throw new Error(`خصم حماية مكرر: ${tx.sourceId}`);
    for(const r of db.purchaseRequests) if(!customerIds.has(r.customerId)) throw new Error(`طلب بلا عميل: ${r.id}`);
    for(const p of db.protectionPackages) if(!p.companyId||!db.companies.some(c=>c.id===p.companyId)||!Number.isInteger(Number(p.days))||Number(p.days)<=0||!Number.isInteger(Number(p.pointsCost))||Number(p.pointsCost)<=0) throw new Error(`باقة حماية غير صالحة: ${p.id}`);
    const idem=new Set();for(const x of db.idempotencyKeys){const k=`${x.customerId}:${x.key}`;if(!x.customerId||!x.key||idem.has(k))throw new Error('مفتاح منع تكرار مفقود أو مكرر.');idem.add(k);}
    const reversedSources=new Set();
    for(const f of db.financeEntries) {
      if(!Number.isFinite(Number(f.amount))||Number(f.amount)<=0) throw new Error(`قيد مالي غير صالح: ${f.id}`);
      if(['purchase','task'].includes(f.sourceType)&&f.sourceId) {
        const key=`${f.sourceType}:${f.sourceId}:${f.kind}`;
        if(db.financeEntries.filter(x=>x.sourceType===f.sourceType&&x.sourceId===f.sourceId&&x.kind===f.kind).length>1) throw new Error(`قيد مصدر مكرر: ${key}`);
      }
      if(f.sourceType==='reversal') {
        const originalId=f.reversalOf||f.sourceId, original=db.financeEntries.find(x=>x.id===originalId);
        if(!original||original.sourceType==='reversal'||Number(original.amount)!==Number(f.amount)||original.kind===f.kind||(original.currency||'YER')!==(f.currency||'YER')) throw new Error(`قيد عكسي غير صالح: ${f.id}`);
        if(reversedSources.has(originalId)) throw new Error(`تم عكس القيد مسبقًا: ${originalId}`);
        reversedSources.add(originalId);
      }
    }
    for(const c of db.customers) if(balanceFrom(db,c.id)<0) throw new Error(`رصيد نقاط سالب للعميل ${c.id}`);
  }
  async function transact(actor, action, mutator) {
    const work = async () => {
      const before=read(), draft=clone(before); const result=mutator(draft);
      draft.revision=before.revision+1; draft.updatedAt=now();
      if(action) draft.operations.push({id:uid('op'),actorId:actor||'system',type:action,entityType:result?.entityType||'system',entityId:result?.entityId||null,result:'success',createdAt:now(),summary:result?.summary||action,...(result?.details?{details:result.details}:{})});
      validate(draft); writeDirect(draft); return {db:clone(draft),result};
    };
    if (typeof navigator!=='undefined' && navigator.locks?.request) return navigator.locks.request(LOCK,{mode:'exclusive'},work);
    return work();
  }
  function balanceFrom(db, customerId) { return db.pointTransactions.filter(x=>x.customerId===customerId).reduce((s,x)=>s+(x.type==='credit'?1:-1)*Number(x.points),0); }
  function balance(customerId, db=read()) { return balanceFrom(db,customerId); }
  function isSubscriber(db, customerId) { return db.purchaseRequests.some(r=>r.customerId===customerId&&['approved','معتمد','مكتملة'].includes(r.status)); }
  function companyFor(number, db=read()) {
    const digits=digitsOnly(number);
    return db.companies.filter(c=>c.active!==false&&(c.prefixes||[]).some(p=>digits.startsWith(String(p).replace(/\D/g,''))))
      .sort((a,b)=>Math.max(...(b.prefixes||[]).map(p=>String(p).replace(/\D/g,'').length),0)-Math.max(...(a.prefixes||[]).map(p=>String(p).replace(/\D/g,'').length),0))[0] || null;
  }
  // صيغ الأرقام اليمنية المقبولة: 7XXXXXXXX، 07XXXXXXXX، 9677XXXXXXXX، 009677XXXXXXXX، +9677XXXXXXXX، مع مسافات وشرطات وأرقام عربية.
  function normalizePhone(value){let d=digitsOnly(value);if(d.startsWith('00967')&&d.length===14)d=d.slice(5);else if(d.startsWith('967')&&d.length===12)d=d.slice(3);if(d.startsWith('0')&&d.length===10)d=d.slice(1);return d;}
  function validPhone(number, company) { const n=digitsOnly(number); return !!company && (company.lengths||[]).includes(n.length) && /^\d+$/.test(n); }
  function activeSubscription(db, numberId, at=Date.now()) { return db.subscriptions.filter(s=>s.numberId===numberId&&s.status==='active'&&Number.isFinite(new Date(s.startsAt||0).getTime())&&new Date(s.startsAt||0).getTime()<=at&&Number.isFinite(new Date(s.endsAt).getTime())&&new Date(s.endsAt).getTime()>at).sort((a,b)=>new Date(b.endsAt)-new Date(a.endsAt))[0]||null; }
  function numberLinked(db,customerId,numberId){return db.numberLinks.some(x=>x.customerId===customerId&&x.numberId===numberId)||db.numbers.some(x=>x.id===numberId&&x.customerId===customerId);}
  function customerNumbers(db,customerId){const ids=new Set(db.numberLinks.filter(x=>x.customerId===customerId).map(x=>x.numberId));for(const sub of db.subscriptions)if(sub.customerId===customerId)ids.add(sub.numberId);return db.numbers.filter(n=>ids.has(n.id)||n.customerId===customerId);}
  function ownedNumber(db, customerId, numberId) { const n=db.numbers.find(x=>x.id===numberId); if(!n||!numberLinked(db,customerId,n.id)) throw new Error('هذا الرقم غير موجود ضمن أرقام حسابك.'); return n; }
  async function addNumber(customerId,value){const digits=normalizePhone(value);return transact(customerId,'number_added',db=>{const co=companyFor(digits,db);if(!validPhone(digits,co))throw new Error(co?'طول الرقم لا يطابق قواعد الشركة المسجلة.':'لا يمكن اكتشاف الشركة من بادئة الرقم.');let n=db.numbers.find(x=>digitsOnly(x.number)===digits);if(n&&numberLinked(db,customerId,n.id))throw new Error('هذا الرقم مضاف إلى حسابك بالفعل.');if(!n){n={id:uid('num'),customerId:null,number:digits,companyId:co.id,addedAt:now(),status:'active'};db.numbers.push(n);}if(n.companyId!==co.id)throw new Error('بيانات الشركة المسجلة للرقم متعارضة.');db.numberLinks.push({id:uid('numlink'),numberId:n.id,customerId,createdAt:now()});return{entityType:'number_link',entityId:n.id,summary:`إضافة رقم ${digits} إلى الحساب دون تفعيل اشتراك`};});}
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
  /* ----- قوالب الرفض والرد (بنود 8 و96) والملاحظات الداخلية (بند 10): للإدارة فقط ولا تصل إلى نسخة العميل ----- */
  const normRef=v=>String(v||'').trim().toLowerCase();
  // مراجع مطابقة لطلب: same = نفس المرجع ونفس وسيلة الدفع (الأرجح تكرارًا)، other = نفس المرجع بوسيلة مختلفة (للمراجعة)
  function duplicateReferences(db,req){
    const ref=normRef(req.paymentReference);if(!ref)return{same:[],other:[]};
    const others=db.purchaseRequests.filter(r=>r.id!==req.id&&normRef(r.paymentReference)===ref);
    return{same:others.filter(r=>r.paymentMethodId===req.paymentMethodId),other:others.filter(r=>r.paymentMethodId!==req.paymentMethodId)};
  }
  // العملاء المرتبطون برقم (ملكية أو اشتراك أو متابعة) لتنبيه التكرار
  function numberHolders(db,number){
    const ids=new Set(db.numberLinks.filter(l=>l.numberId===number.id).map(l=>l.customerId));
    if(number.customerId)ids.add(number.customerId);
    for(const sub of db.subscriptions)if(sub.numberId===number.id)ids.add(sub.customerId);
    return[...ids].filter(id=>db.customers.some(c=>c.id===id&&c.status!=='deleted'));
  }
  async function saveTemplate(adminId,input){
    return transact(adminId,'template_saved',db=>{
      const kind=['reject','reply'].includes(input.kind)?input.kind:'',title=String(input.title||'').trim(),body=String(input.body||'').trim();
      if(!kind||!title||!body)throw new Error('نوع القالب وعنوانه ونصه مطلوبة.');if(title.length>60)throw new Error('عنوان القالب أطول من 60 حرفًا.');if(body.length>500)throw new Error('نص القالب أطول من 500 حرف.');
      let t=input.id?db.messageTemplates.find(x=>x.id===input.id):null;if(input.id&&!t)throw new Error('القالب غير موجود.');
      if(t)Object.assign(t,{kind,title,body,updatedAt:now()});else{t={id:uid('tpl'),kind,title,body,createdAt:now()};db.messageTemplates.push(t);}
      return{entityType:'template',entityId:t.id,summary:`حفظ قالب ${title}`};
    });
  }
  async function deleteTemplate(adminId,id){
    return transact(adminId,'template_deleted',db=>{const i=db.messageTemplates.findIndex(x=>x.id===id);if(i<0)throw new Error('القالب غير موجود.');const[t]=db.messageTemplates.splice(i,1);return{entityType:'template',entityId:id,summary:`حذف قالب ${t.title}`};});
  }
  async function addInternalNote(adminId,entityType,entityId,text){
    return transact(adminId,'internal_note_added',db=>{
      const body=String(text||'').trim();if(!body)throw new Error('اكتب نص الملاحظة.');if(body.length>500)throw new Error('الملاحظة أطول من 500 حرف.');
      const coll={customer:db.customers,number:db.numbers,request:db.purchaseRequests}[entityType];if(!coll)throw new Error('نوع الملاحظة غير صالح.');
      if(!coll.some(x=>x.id===entityId))throw new Error('العنصر المرتبط بالملاحظة غير موجود.');
      const n={id:uid('note'),entityType,entityId,text:body,authorId:adminId,createdAt:now()};db.internalNotes.push(n);
      return{entityType:'internal_note',entityId:n.id,summary:`إضافة ملاحظة داخلية على ${entityType}`};
    });
  }
  async function deleteInternalNote(adminId,id){
    return transact(adminId,'internal_note_deleted',db=>{const i=db.internalNotes.findIndex(x=>x.id===id);if(i<0)throw new Error('الملاحظة غير موجودة.');db.internalNotes.splice(i,1);return{entityType:'internal_note',entityId:id,summary:'حذف ملاحظة داخلية'};});
  }
  // إلغاء العميل لطلبه المعلق فقط (بند 21): لا نقاط ولا قيد مالي؛ الحالة cancelled ويبقى الطلب في السجل
  async function cancelPurchase(customerId, requestId) {
    return transact(customerId,'purchase_cancelled',db=>{
      const r=db.purchaseRequests.find(x=>x.id===requestId&&x.customerId===customerId);if(!r)throw new Error('الطلب غير موجود ضمن طلباتك.');
      if(r.status!=='pending')throw new Error('لا يمكن إلغاء الطلب: لم يعد معلقًا.');
      r.status='cancelled';r.cancelledAt=now();r.cancelledBy='customer';
      return {entityType:'purchase_request',entityId:r.id,summary:`إلغاء العميل لطلب ${r.id}`};
    });
  }
  // تغيير كلمة المرور: التجزئة تُحسب في الواجهة (PBKDF2)؛ هنا تُخزَّن وتُسجَّل في التدقيق دون أي نص صريح
  async function setPasswordHash(customerId, authHash) {
    if(typeof authHash!=='string'||!authHash)throw new Error('تجزئة كلمة المرور غير صالحة.');
    return transact(customerId,'password_changed',db=>{const c=db.customers.find(x=>x.id===customerId);if(!c||c.status==='deleted')throw new Error('الحساب غير موجود.');c.authHash=authHash;c.passwordChangedAt=now();return{entityType:'customer',entityId:c.id,summary:'تغيير كلمة مرور العميل'};});
  }
  // حذف الحساب = إخفاء هوية لا حذف سجلات: يبقى سجل النقاط والطلبات والاشتراكات والمالية والتدقيق، وتُلغى الطلبات المعلقة، وتُحذف الإشعارات وروابط المتابعة
  async function deleteAccount(customerId) {
    return transact(customerId,'account_deleted',db=>{
      const c=db.customers.find(x=>x.id===customerId);if(!c||c.status==='deleted')throw new Error('الحساب غير موجود.');
      const stamp=now(),label=c.accountId||c.id;
      for(const r of db.purchaseRequests)if(r.customerId===customerId&&r.status==='pending'){r.status='cancelled';r.cancelledAt=stamp;r.cancelledBy='account_deleted';}
      db.numberLinks=db.numberLinks.filter(l=>l.customerId!==customerId);
      db.notifications=db.notifications.filter(n=>n.customerId!==customerId);
      c.name='حساب محذوف';c.email=`deleted-${label}@removed.invalid`;delete c.authHash;c.status='deleted';c.deletedAt=stamp;
      return{entityType:'customer',entityId:c.id,summary:`حذف حساب العميل ${label} وإخفاء هويته مع الإبقاء على السجلات المالية والتدقيقية`};
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
      if(db.notificationSettings?.purchaseStatus)db.notifications.unshift({id:uid('notice'),customerId:c.id,title:decision==='approved'?'تم اعتماد طلب النقاط':'تم رفض طلب النقاط',body:`حالة الطلب ${r.id}: ${decision==='approved'?'مقبول':'مرفوض'}.${decision==='rejected'&&r.reviewNote?' السبب: '+r.reviewNote:''}`,status:'delivered-local',createdAt:now(),readAt:null});
      return {entityType:'purchase_request',entityId:r.id,summary:`${decision==='approved'?'اعتماد':'رفض'} طلب ${r.id}`};
    });
  }
  async function activateSubscription(customerId, numberId, days, idempotencyKey='') {
    days=Number(days);
    return transact(customerId,'subscription_activated_or_extended',db=>{
      if(idempotencyKey&&db.idempotencyKeys.some(x=>x.customerId===customerId&&x.key===idempotencyKey))throw new Error('تم تنفيذ هذا التأكيد بالفعل؛ لم يُخصم رصيد إضافي.');
      const n=ownedNumber(db,customerId,numberId),co=db.companies.find(c=>c.id===n.companyId&&c.active!==false);if(!co)throw new Error('شركة الرقم غير متاحة.');if(!Number.isInteger(days)||!(co.durations||[]).includes(days))throw new Error('مدة الاشتراك غير صالحة وفق مدد الشركة.');
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
      regenerateTaskPlan(db,s,{...schedule,intervalDays:interval,expenseAmount:expense});
      if(idempotencyKey)db.idempotencyKeys.push({id:uid('idem'),customerId,key:idempotencyKey,createdAt:now(),entityId:s.id});
      return {entityType:'subscription',entityId:s.id,summary:`${old?'تمديد':'تفعيل'} ${n.number} بتكلفة ${cost} نقطة`,cost,remainingDays:remaining};
    });
  }
  async function rescheduleTask(adminId,taskId,newDueAt){
    const time=new Date(newDueAt);if(!Number.isFinite(time.getTime()))throw new Error('موعد المهمة الجديد غير صالح.');
    return transact(adminId,'task_rescheduled',db=>{
      const t=db.tasks.find(x=>x.id===taskId);if(!t)throw new Error('المهمة غير موجودة.');
      if(!['planned','due'].includes(t.status))throw new Error('لا يمكن إعادة جدولة مهمة منفذة أو ملغاة.');
      const co=db.companies.find(x=>x.id===t.companyId),cfg=co?.taskSchedule||{};
      if(cfg.allowReschedule!==true)throw new Error('إعادة الجدولة معطلة في إعدادات الشركة.');
      if(time.getTime()<=Date.now())throw new Error('اختر موعدًا مستقبليًا.');
      const previousDue=new Date(t.dueAt).getTime(),deltaDays=Math.floor((time.getTime()+10800000)/86400000)-Math.floor((previousDue+10800000)/86400000),sub=db.subscriptions.find(x=>x.id===t.subscriptionId);
      t.dueAt=time.toISOString();t.visibleAt=datePlus(t.dueAt,-Number(cfg.visibleBeforeDays||0));t.status='planned';t.rescheduledAt=now();t.manualReschedule=true;
      if(sub){
        const later=db.tasks.filter(x=>x.subscriptionId===sub.id&&x.status!=='executed'&&x.status!=='cancelled'&&x.id!==t.id&&new Date(x.dueAt)>previousDue).sort((x,y)=>new Date(x.dueAt)-new Date(y.dueAt));
        for(const x of later){x.dueAt=datePlus(x.dueAt,deltaDays);x.visibleAt=datePlus(x.dueAt,-Number(cfg.visibleBeforeDays||0));x.status='planned';x.manualReschedule=true;}
        const deadline=new Date(datePlus(sub.endsAt,cfg.createAfterExpiry===true?Number(cfg.graceDays||0):0)).getTime();
        for(const x of db.tasks.filter(x=>x.subscriptionId===sub.id&&x.status!=='executed'&&x.status!=='cancelled'))if(new Date(x.dueAt).getTime()>deadline)x.status='cancelled';
      }
      return{entityType:'task',entityId:t.id,summary:'إعادة جدولة المهمة وتحديث بقية المخطط'};
    });
  }

  async function executeTask(adminId, taskId) {
    return transact(adminId,'task_executed',db=>{
      const t=db.tasks.find(x=>x.id===taskId);if(!t)throw new Error('المهمة غير موجودة.');if(t.status==='executed')throw new Error('سبق تنفيذ هذه المهمة.');
      if(t.status==='cancelled')throw new Error('لا يمكن تنفيذ مهمة ملغاة.');if(new Date(t.visibleAt||t.dueAt)>Date.now())throw new Error('لم تدخل المهمة نافذة الظهور بعد.');const queued=db.tasks.filter(x=>x.subscriptionId===t.subscriptionId&&['due','planned'].includes(x.status)).sort((a,b)=>new Date(a.dueAt)-new Date(b.dueAt));if(queued[0]?.id!==t.id)throw new Error('نفّذ المهمة الحالية في ترتيب الخطة أولًا.');
      const c=db.companies.find(x=>x.id===t.companyId),cfg=c?.taskSchedule||{},interval=Number(cfg.intervalDays);if(!Number.isInteger(interval)||interval<=0)throw new Error('إعداد الجدولة غير صالح.');const subCheck=db.subscriptions.find(s=>s.id===t.subscriptionId);if(subCheck&&new Date(subCheck.endsAt)<=Date.now()){const graceEnd=new Date(datePlus(subCheck.endsAt,Number(cfg.graceDays||0)));if(cfg.allowDuringGrace!==true||Date.now()>graceEnd)throw new Error('انتهت الحماية ولا تسمح إعدادات الشركة بتنفيذ المهمة الآن.');}
      t.status='executed';t.executedAt=now();
      const fin={id:uid('fin'),kind:'expense',amount:Number(t.expenseAmount),currency:'YER',sourceType:'task',sourceId:t.id,customerId:t.customerId,description:`مصروف تنفيذ مهمة ${t.id}`,createdAt:now()};
      if(db.financeEntries.some(f=>f.sourceType==='task'&&f.sourceId===t.id))throw new Error('المصروف مسجل مسبقًا لهذه المهمة.');db.financeEntries.push(fin);t.financeEntryId=fin.id;
      if(db.notificationSettings?.taskUpdates)db.notifications.unshift({id:uid('notice'),customerId:t.customerId,numberId:t.numberId,title:'تم تحديث مهمة رقمك',body:`نُفذت المهمة ${t.id} للرقم ${db.numbers.find(n=>n.id===t.numberId)?.number||''} محليًا.`,status:'delivered-local',createdAt:now(),readAt:null});
      const sub=db.subscriptions.find(s=>s.id===t.subscriptionId);
      if(sub)regenerateTaskPlan(db,sub,cfg);
      return {entityType:'task',entityId:t.id,summary:`تنفيذ مهمة ${t.id} وتسجيل مصروف مرة واحدة`};
    });
  }
  async function addFinancialEntry(adminId, kind, amount, description) {
    amount=Number(amount);if(!['revenue','expense'].includes(kind)||!Number.isFinite(amount)||amount<=0||!String(description||'').trim())throw new Error('أدخل نوع القيد ومبلغًا موجبًا وبيانًا واضحًا.');
    return transact(adminId,'manual_finance_entry',db=>{const x={id:uid('fin'),kind,amount,currency:'YER',sourceType:'manual',sourceId:null,description:String(description).trim(),createdAt:now()};db.financeEntries.push(x);return {entityType:'finance_entry',entityId:x.id,summary:`قيد مالي يدوي ${kind}`};});
  }
  async function reverseFinancialEntry(adminId, entryId, reason) {
    const note=String(reason||'').trim();
    if(!note)throw new Error('سبب عكس القيد مطلوب.');
    return transact(adminId,'finance_entry_reversed',db=>{
      const original=db.financeEntries.find(x=>x.id===entryId);
      if(!original)throw new Error('القيد المالي غير موجود.');
      if(original.sourceType==='reversal')throw new Error('لا يمكن عكس قيد عكسي؛ راجع القيد الأصلي.');
      if(db.financeEntries.some(x=>x.sourceType==='reversal'&&(x.reversalOf||x.sourceId)===original.id))throw new Error('سبق عكس هذا القيد؛ لا يمكن عكسه مرة أخرى.');
      const reversal={id:uid('fin'),kind:original.kind==='revenue'?'expense':'revenue',amount:Number(original.amount),currency:original.currency||'YER',sourceType:'reversal',sourceId:original.id,reversalOf:original.id,description:`عكس القيد ${original.id}: ${note}`,createdAt:now(),reversesEntryId:original.id};
      db.financeEntries.push(reversal);
      original.reversedBy=reversal.id;
      return {entityType:'finance_entry',entityId:reversal.id,summary:`عكس القيد المالي ${original.id}`};
    });
  }

  async function saveCompany(adminId, input) {
    return transact(adminId,'company_saved',db=>{const prior=db.companies.find(x=>x.id===input.id),oldSchedule=prior?.taskSchedule||{};const c={...input,id:input.id||uid('co'),name:String(input.name||'').trim(),prefixes:[...new Set((input.prefixes||[]).map(digitsOnly).filter(Boolean))],lengths:[...new Set((input.lengths||[]).map(Number))],dailyRate:Number(input.dailyRate??prior?.dailyRate??0),durations:[...new Set((input.durations??prior?.durations??[]).map(Number))],taskSchedule:prior?oldSchedule:undefined,active:input.active!==false};if(!c.name||!c.prefixes.length||!c.lengths.length||!c.lengths.every(x=>Number.isInteger(x)&&x>0)||!c.durations.every(x=>Number.isInteger(x)&&x>0))throw new Error('بيانات الشركة أو التعرفة أو إعدادات المهام غير مكتملة.');for(const other of db.companies)if(other.id!==c.id&&String(other.name||'').trim().toLocaleLowerCase()===c.name.toLocaleLowerCase())throw new Error('اسم الشركة مستخدم بالفعل.');if(c.active)for(const other of db.companies)if(other.id!==c.id&&other.active!==false&&(other.prefixes||[]).some(p=>c.prefixes.includes(digitsOnly(p))))throw new Error('توجد شركة فعالة تستخدم بادئة مطابقة بالفعل. لا يمكن توزيع البادئة نفسها على شركتين.');const i=db.companies.findIndex(x=>x.id===c.id);if(i<0)db.companies.push(c);else db.companies[i]=c;return {entityType:'company',entityId:c.id,summary:`حفظ الشركة ${c.name} وتحديث المهام غير المنفذة`};});
  }
  async function saveTaskSettings(adminId,companyId,input){
    return transact(adminId,'task_settings_saved',db=>{
      const c=db.companies.find(x=>x.id===companyId);if(!c)throw new Error('الشركة المحددة غير موجودة.');
      const prior=c.taskSchedule||{},cfg={createFirstOnActivation:input.createFirstOnActivation===true,intervalDays:Number(input.intervalDays),visibleBeforeDays:Number(input.visibleBeforeDays),expenseAmount:Number(input.expenseAmount),allowReschedule:input.allowReschedule===true,createAfterExpiry:input.createAfterExpiry===true,allowDuringGrace:input.allowDuringGrace===true,graceDays:Number(input.graceDays),unit:prior.unit||'YER'};
      if(!Number.isInteger(cfg.intervalDays)||cfg.intervalDays<1||!Number.isInteger(cfg.visibleBeforeDays)||cfg.visibleBeforeDays<0||!Number.isFinite(cfg.expenseAmount)||cfg.expenseAmount<=0||!Number.isInteger(cfg.graceDays)||cfg.graceDays<0)throw new Error('تحقق من إعدادات المهام: الفاصل والمصروف ومدة السماح مطلوبة.');
      c.taskSchedule=cfg;for(const sub of db.subscriptions.filter(x=>x.companyId===c.id&&x.status==='active'))regenerateTaskPlan(db,sub,cfg);
      return{entityType:'task_settings',entityId:c.id,summary:`حفظ إعدادات المهام لشركة ${c.name}`};
    });
  }
  async function saveProtectionPackage(adminId,input){return transact(adminId,'protection_package_saved',db=>{const p={id:input.id||uid('protpkg'),companyId:String(input.companyId||''),name:String(input.name||'').trim(),days:Number(input.days),pointsCost:Number(input.pointsCost),active:input.active!==false};if(!p.name||!db.companies.some(c=>c.id===p.companyId)||!Number.isInteger(p.days)||p.days<=0||!Number.isInteger(p.pointsCost)||p.pointsCost<=0)throw new Error('اسم باقة الحماية والشركة والمدة والتكلفة بالنقاط حقول مطلوبة وصحيحة.');const i=db.protectionPackages.findIndex(x=>x.id===p.id);if(i<0)db.protectionPackages.push(p);else db.protectionPackages[i]=p;return{entityType:'protection_package',entityId:p.id,summary:`حفظ باقة الحماية ${p.name}`};});}
  async function performProtectionOperation(customerId,numberId,packageId,operationType,idempotencyKey=''){
    if(!['subscribe','extend','renew'].includes(operationType))throw new Error('نوع عملية الحماية غير صالح.');
    if(operationType==='renew'){const snap=read(),n=snap.numbers.find(x=>x.id===numberId||digitsOnly(x.number)===digitsOnly(numberId)),latest=n&&snap.subscriptions.filter(x=>x.numberId===n.id).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt))[0];if(latest&&latest.customerId===customerId&&new Date(latest.endsAt)<=Date.now()){const next=snap.tasks.filter(t=>t.subscriptionId===latest.id&&['due','planned'].includes(t.status)).sort((a,b)=>new Date(a.dueAt)-new Date(b.dueAt))[0],deadline=next?new Date(next.dueAt).getTime():new Date(latest.endsAt).getTime();if(Date.now()>deadline){await transact(customerId,'number_restricted_for_late_renewal',db=>{const target=db.numbers.find(x=>x.id===n.id);if(target){target.restricted=true;target.restrictionReason='تجاوز موعد التجديد المسموح المرتبط بالخطة';target.restrictedAt=now();}return{entityType:'number',entityId:n.id,summary:'تقييد الرقم لتجاوز حد التجديد'};});throw new Error('انتهت مهلة التجديد وفق موعد المهمة التالية؛ قُيّد الرقم ويلزم رفع القيد من الإدارة.');}}}
    return transact(customerId,`protection_${operationType}`,db=>{
      if(idempotencyKey&&db.idempotencyKeys.some(x=>x.customerId===customerId&&x.key===idempotencyKey))throw new Error('تم تنفيذ هذا التأكيد بالفعل؛ لم يُخصم رصيد إضافي.');
      let n=db.numbers.find(x=>x.id===numberId||digitsOnly(x.number)===digitsOnly(numberId));if(!n&&/^\d+$/.test(digitsOnly(numberId))&&operationType==='subscribe'){const digits=digitsOnly(numberId),co=companyFor(digits,db);if(!validPhone(digits,co))throw new Error('تعذر تحديد شركة أو طول صالح لهذا الرقم.');n={id:uid('num'),customerId:null,number:digits,companyId:co.id,addedAt:now(),status:'active'};db.numbers.push(n);}if(!n)throw new Error('هذا الإجراء غير متاح لهذا الرقم.');if(operationType==='renew'&&db.subscriptions.some(x=>x.numberId===n.id&&x.customerId!==customerId))throw new Error('لا يملك هذا الحساب سجل الحماية المطلوب تجديده.');if(n.restricted)throw new Error('الرقم مقيّد؛ راجع الإدارة.');const co=db.companies.find(c=>c.id===n.companyId&&c.active!==false);if(!co)throw new Error('شركة الرقم غير متاحة.');
      const p=db.protectionPackages.find(x=>x.id===packageId&&x.companyId===co.id&&x.active!==false);if(!p)throw new Error('باقة الحماية غير متاحة لهذه الشركة.');
      const current=activeSubscription(db,n.id),latest=db.subscriptions.filter(s=>s.numberId===n.id).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt))[0],continuesCurrent=operationType==='extend'||(operationType==='renew'&&!!current);
      if(operationType==='subscribe'&&current)throw new Error('يوجد اشتراك حماية سارٍ؛ استخدم التمديد أو التجديد.');
      if(operationType==='extend'&&!current)throw new Error('التمديد متاح للاشتراك الساري فقط؛ استخدم التجديد أو الاشتراك.');if(operationType==='renew'&&current)throw new Error('الحماية لا تزال سارية؛ استخدم التمديد بدل التجديد.');
      if(operationType==='renew'&&!latest)throw new Error('لا يوجد اشتراك سابق لتجديده؛ استخدم الاشتراك الجديد.');
      if(!current&&latest&&operationType==='subscribe')throw new Error('يوجد سجل حماية سابق لهذا الرقم؛ استخدم مسار التجديد بعد التحقق من المهلة.');
      if(!current&&latest&&operationType==='renew'&&latest.customerId!==customerId)throw new Error('لا يمكن تجديد سجل حماية لا يخص هذا الحساب.');
      const cost=Number(p.pointsCost),packageDays=Number(p.days);let days=packageDays;if(balanceFrom(db,customerId)<cost)throw new Error('رصيد أمان غير كافٍ؛ لم يتم خصم نقاط أو تغيير الحماية.');
      const stamp=now();let sub,startsAt,endsAt;
      if(continuesCurrent){
        startsAt=current.endsAt;endsAt=datePlus(current.endsAt,days);current.endsAt=endsAt;current.days=Number(current.days||0)+days;current.addedDays=Number(current.addedDays||0)+days;current.updatedAt=stamp;sub=current;
      }else{
        if(operationType==='subscribe'&&current)throw new Error('يوجد اشتراك سارٍ.');
        if(operationType==='subscribe'&&latest&&latest.status==='active'&&new Date(latest.endsAt)>Date.now())throw new Error('يوجد اشتراك سارٍ.');
        startsAt=stamp;days=packageDays;if(operationType==='renew'&&latest){const end=new Date(latest.endsAt),nowDate=new Date(stamp),elapsed=Math.max(0,Math.floor((nowDate.getTime()+10800000)/86400000)-Math.floor((end.getTime()+10800000)/86400000));days=packageDays-elapsed;if(days<=0)throw new Error('انتهت المدة الصافية للباقة بعد احتساب الأيام المنقضية؛ اختر باقة أخرى.');}endsAt=datePlus(startsAt,days);
        sub={id:uid('sub'),customerId,numberId:n.id,companyId:co.id,status:'active',startsAt,endsAt,days,addedDays:days,rateSnapshot:null,pointsCost:cost,protectionPackageId:p.id,protectionPackageSnapshot:{name:p.name,days,pointsCost:cost},previousSubscriptionId:latest?.id||null,createdAt:stamp};db.subscriptions.push(sub);
      }
      const op={id:uid('protectop'),customerId,numberId:n.id,companyId:co.id,subscriptionId:sub.id,packageId:p.id,packageSnapshot:{name:p.name,days,offeredDays:packageDays,pointsCost:cost},type:operationType,pointsCost:cost,startsAt,endsAt,createdAt:stamp,idempotencyKey:idempotencyKey||null};db.protectionOperations.push(op);
      db.pointTransactions.push({id:uid('pt'),customerId,type:'debit',points:cost,source:'protection_operation',sourceId:op.id,createdAt:stamp,description:`${operationType==='subscribe'?'اشتراك حماية':operationType==='extend'?'تمديد حماية':'تجديد حماية'} للرقم ${n.number} — ${p.name}`});
      if(db.notificationSettings?.protectionUpdates)db.notifications.unshift({id:uid('notice'),customerId,title:operationType==='extend'?'تم تمديد الحماية':'تم تحديث حماية الرقم',body:`اكتملت عملية ${operationType==='subscribe'?'تفعيل':operationType==='extend'?'تمديد':'تجديد'} الحماية للرقم ${n.number} محليًا.`,numberId:n.id,status:'delivered-local',createdAt:stamp,readAt:null});
      // متابعو الرقم (بند 87): كل عميل آخر فعّل التنبيهات لهذا الرقم يُخطَر بتغيّر فعلي في اشتراكه؛ لا ذكر للمالك ولا للمهام
      if(db.notificationSettings?.protectionUpdates)for(const l of db.numberLinks)if(l.numberId===n.id&&l.customerId!==customerId&&l.radar===true)db.notifications.unshift({id:uid('notice'),customerId:l.customerId,title:'تغيّر حالة اشتراك رقم تتابعه',body:`${operationType==='subscribe'?'فُعّل':operationType==='extend'?'مُدّد':'جُدّد'} اشتراك الرقم ${n.number}، وينتهي في ${String(sub.endsAt).slice(0,10)}.`,numberId:n.id,status:'delivered-local',createdAt:stamp,readAt:null});
      const cfg=co.taskSchedule||{},interval=Number(cfg.intervalDays),expense=Number(cfg.expenseAmount);if(!Number.isInteger(interval)||interval<=0||!Number.isFinite(expense)||expense<=0)throw new Error('إعدادات المهام للشركة غير صالحة.');
      regenerateTaskPlan(db,sub,{...cfg,intervalDays:interval,expenseAmount:expense});
      if(idempotencyKey)db.idempotencyKeys.push({id:uid('idem'),customerId,key:idempotencyKey,createdAt:stamp,entityId:op.id});
      return{entityType:'protection_operation',entityId:op.id,summary:`${operationType} باقة ${p.name} للرقم ${n.number}`,cost,subscriptionId:sub.id,endsAt:sub.endsAt,netDays:sub.days};
    });
  }
  async function savePackage(adminId, input) {
    return transact(adminId,'package_saved',db=>{const p={id:input.id||uid('pkg'),name:String(input.name||'').trim(),points:Number(input.points),price:Number(input.price),active:input.active!==false};if(!p.name||!Number.isInteger(p.points)||p.points<=0||!Number.isFinite(p.price)||p.price<=0)throw new Error('بيانات الباقة غير صالحة.');const i=db.packages.findIndex(x=>x.id===p.id);if(i<0)db.packages.push(p);else db.packages[i]=p;return {entityType:'package',entityId:p.id,summary:`حفظ الباقة ${p.name}`};});
  }
  async function savePaymentMethod(adminId, input) {
    return transact(adminId,'payment_method_saved',db=>{const m={id:input.id||uid('pay'),name:String(input.name||'').trim(),summary:String(input.summary||'').trim(),instructions:String(input.instructions||'').trim(),active:input.active!==false};if(!m.name||!m.instructions)throw new Error('اسم وسيلة الدفع وتعليماتها مطلوبان.');const i=db.paymentMethods.findIndex(x=>x.id===m.id);if(i<0)db.paymentMethods.push(m);else db.paymentMethods[i]=m;return {entityType:'payment_method',entityId:m.id,summary:`حفظ وسيلة الدفع ${m.name}`};});
  }
  async function sendLocalNotice(adminId, title, body, audience='all', customerId='') {
    if(!['all','subscribers','customer'].includes(audience))throw new Error('جمهور الإشعار غير صالح.');
    if(!String(title||'').trim()||!String(body||'').trim())throw new Error('عنوان الإشعار ونصه مطلوبان.');
    return transact(adminId,'admin_notice_created',db=>{const recipients=audience==='customer'?[db.customers.find(c=>c.id===customerId)].filter(Boolean):db.customers.filter(c=>audience==='subscribers'?isSubscriber(db,c.id):true);if(!recipients.length)throw new Error('لا يوجد جمهور مطابق.');for(const c of recipients)db.notifications.push({id:uid('notice'),customerId:c.id,title:String(title).trim(),body:String(body).trim(),status:'delivered-local',createdAt:now(),readAt:null});return {entityType:'notification',entityId:null,summary:`إشعار محلي إلى ${recipients.length} عميلًا`};});
  }
  async function markNoticeRead(customerId, noticeId) { return transact(customerId,'notification_read',db=>{const n=db.notifications.find(x=>x.id===noticeId&&x.customerId===customerId);if(!n)throw new Error('الإشعار غير موجود لهذا الحساب.');if(!n.readAt)n.readAt=now();return {entityType:'notification',entityId:n.id,summary:'قراءة إشعار محلي'};}); }
  async function updateContent(adminId, key, value) { if(!['terms','privacy','contact','faq'].includes(key))throw new Error('نوع المحتوى غير صالح.');return transact(adminId,'content_updated',db=>{db.content[key]=String(value||'');return {entityType:'content',entityId:key,summary:`تعديل محتوى ${key}`};}); }
  function readForCustomer(customerId){const db=read(),customer=db.customers.find(c=>c.id===customerId);if(!customer)throw new Error('الحساب غير موجود.');const linked=customerNumbers(db,customerId),ownedSubs=db.subscriptions.filter(x=>x.customerId===customerId);db.customers=[customer];db.numbers=linked.map(n=>{const copy={...n};if(copy.customerId&&copy.customerId!==customerId)copy.customerId=null;copy.radar=radarFor(db,customerId,n);const active=db.subscriptions.find(s=>s.numberId===n.id&&s.status==='active'&&new Date(s.startsAt||0)<=Date.now()&&new Date(s.endsAt)>Date.now());copy.protectionStatus=active?'protected':db.subscriptions.some(s=>s.numberId===n.id)?'expired':'none';copy.liveSub=active?{startsAt:active.startsAt,endsAt:active.endsAt,own:active.customerId===customerId}:null;return copy;});db.subscriptions=ownedSubs;db.tasks=db.tasks.filter(x=>x.customerId===customerId);db.protectionOperations=db.protectionOperations.filter(x=>x.customerId===customerId);db.internalNotes=[];db.messageTemplates=[];db.pointTransactions=db.pointTransactions.filter(x=>x.customerId===customerId);db.purchaseRequests=db.purchaseRequests.filter(x=>x.customerId===customerId);db.notifications=db.notifications.filter(x=>x.customerId===customerId);db.operations=db.operations.filter(x=>x.actorId===customerId||x.customerId===customerId||x.entityId===customerId);db.financeEntries=[];db.admin=null;db.numberLinks=db.numberLinks.filter(x=>x.customerId===customerId);db.idempotencyKeys=db.idempotencyKeys.filter(x=>x.customerId===customerId);return db;}
  // الرادار تفضيل خاص بكل عميل ويُحفظ على علاقة الربط لا على سجل الرقم المشترك؛ القيمة القديمة على الرقم تُحترم لمالكه الأصلي فقط.
  function radarFor(db,customerId,n){const link=db.numberLinks.find(l=>l.numberId===n.id&&l.customerId===customerId);if(link&&link.radar!==undefined)return !!link.radar;return !!(n.radar&&n.customerId===customerId);}
  async function setRadar(customerId,numberId,on){
    return transact(customerId,'radar_toggled',db=>{
      const n=ownedNumber(db,customerId,numberId);if(on&&!activeSubscription(db,n.id))throw new Error('لا يمكن متابعة الرقم قبل تفعيل الاشتراك.');
      let link=db.numberLinks.find(l=>l.numberId===n.id&&l.customerId===customerId);
      if(!link){link={id:uid('numlink'),numberId:n.id,customerId,createdAt:now()};db.numberLinks.push(link);}
      link.radar=!!on;return{entityType:'number',entityId:n.id,summary:on?'إضافة للرادار':'إزالة من الرادار'};
    });
  }
  function searchNumberStatus(customerId,value){
    const db=read(),digits=normalizePhone(value);if(!digits)throw new Error('أدخل رقمًا صالحًا للبحث.');
    const n=db.numbers.find(x=>digitsOnly(x.number)===digits),co=(n&&db.companies.find(x=>x.id===n.companyId))||companyFor(digits,db),sub=n&&db.subscriptions.filter(x=>x.numberId===n.id&&x.status==='active').sort((a,b)=>new Date(b.endsAt)-new Date(a.endsAt))[0],active=sub&&new Date(sub.startsAt)<=Date.now()&&new Date(sub.endsAt)>Date.now();
    const owner=!!sub&&sub.customerId===customerId;
    if(!co||!validPhone(digits,co))throw new Error('تعذر تحديد شركة أو طول صالح لهذا الرقم.');
    if(!active){const previous=n&&db.subscriptions.filter(x=>x.numberId===n.id&&x.customerId===customerId).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt))[0];return{number:digits,companyId:co.id,companyName:co.name,protected:false,expired:!!previous,ownedByRequester:!!previous,added:!!n&&numberLinked(db,customerId,n.id),subscription:previous?{startsAt:previous.startsAt,endsAt:previous.endsAt,status:previous.status,packageName:previous.protectionPackageSnapshot?.name||null}:null};}
    if(!owner)return{number:digits,companyId:co.id,companyName:co.name,protected:true,ownedByRequester:false,added:!!n&&numberLinked(db,customerId,n.id)};
    return{number:digits,companyId:co.id,companyName:co.name,protected:true,ownedByRequester:true,subscription:{startsAt:sub.startsAt,endsAt:sub.endsAt,status:sub.status,packageName:sub.protectionPackageSnapshot?.name||null}};
  }
  function setStorageForTests(s) { injectedStorage=s; }
  function exportJSON() { return JSON.stringify(read(),null,2); }
  return {KEY,seedData,read,readForCustomer,customerNumbers:(customerId,d=read())=>customerNumbers(d,customerId),transact,balance,balanceFrom,isSubscriber,companyFor,normalizePhone,validPhone,activeSubscription,addNumber,createPurchase,cancelPurchase,duplicateReferences,numberHolders,saveTemplate,deleteTemplate,addInternalNote,deleteInternalNote,setPasswordHash,deleteAccount,reviewPurchase,activateSubscription,performProtectionOperation,executeTask,rescheduleTask,addFinancialEntry,saveCompany,saveTaskSettings,searchNumberStatus,savePackage,saveProtectionPackage,savePaymentMethod,sendLocalNotice,markNoticeRead,setRadar,updateContent,reverseFinancialEntry,setStorageForTests,exportJSON,uid,now,datePlus};
});
