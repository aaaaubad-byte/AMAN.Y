const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const D = require('../shared/data.js');
const Fixture = require('./fixture-data.js');

function memoryStorage(initial=null, failWrite=false) {
  const map=new Map(); if(initial!==null)map.set(D.KEY,initial);
  return {getItem:k=>map.has(k)?map.get(k):null,setItem:(k,v)=>{if(failWrite)throw new Error('blocked');map.set(k,v)},raw:()=>map.get(D.KEY),map};
}
let store;
test.beforeEach(async()=>{store=memoryStorage();D.setStorageForTests(store);store.setItem(D.KEY,JSON.stringify(Fixture.seedData()))});

test('تهيئة بيانات مترابطة واحتساب الرصيد من دفتر النقاط',()=>{
  const d=D.read(); assert.equal(d.customers.length,3);assert.equal(d.numbers.length,5);assert.equal(D.balance('cus-demo-subscriber',d),530);assert.equal(D.balance('cus-demo-low',d),8);
  for(const n of d.numbers){assert.ok(d.customers.some(c=>c.id===n.customerId));assert.ok(d.companies.some(c=>c.id===n.companyId))}
});

test('اكتشاف الشركة بأطول بادئة مطابقة ودعم الأرقام العربية',()=>{
  const d=D.read();
  for(const [phone,id] of [['771234567','co-net77'],['781234567','co-net77'],['731234567','co-net73'],['711234567','co-net71'],['701234567','co-net70']])assert.equal(D.companyFor(phone,d).id,id);
  d.companies.push({id:'co-specific',name:'بادئة أطول',prefixes:['771'],lengths:[9],dailyRate:5,durations:[7],active:true});
  assert.equal(D.companyFor('٧٧١٢٣٤٥٦٧',d).id,'co-specific');
  assert.equal(D.validPhone('٧٧١٢٣٤٥٦٧',D.companyFor('٧٧١٢٣٤٥٦٧',d)),true);
});

test('إضافة الرقم لا تخصم نقاطًا ولا تنشئ اشتراكًا وتمنع التكرار',async()=>{
  const before=D.balance('cus-demo-new');await D.addNumber('cus-demo-new','٧٧١٢٣٤٠٠٠');const d=D.read();
  const n=d.numbers.find(x=>x.number==='771234000');assert.ok(n);assert.equal(n.customerId,'cus-demo-new');assert.equal(D.balance('cus-demo-new'),before);assert.equal(D.activeSubscription(d,n.id),null);
  await assert.rejects(()=>D.addNumber('cus-demo-new','771234000'),/مسجل مسبقًا/);
  await assert.rejects(()=>D.addNumber('cus-demo-new','77123400'),/طول الرقم/);
  await assert.rejects(()=>D.addNumber('cus-demo-new','721234567'),/اكتشاف الشركة/);
});

test('إنشاء طلب شراء لا يضيف نقاطًا ثم الاعتماد يزيدها مرة واحدة مع الإيراد',async()=>{
  const before=D.balance('cus-demo-new');const {result}=await D.createPurchase('cus-demo-new','pkg-100','pay-wallet','TST-REQ-1');
  assert.equal(D.balance('cus-demo-new'),before);let d=D.read(),r=d.purchaseRequests.find(x=>x.id===result.entityId);assert.equal(r.status,'pending');
  await D.reviewPurchase('admin-demo',r.id,'approved');d=D.read();r=d.purchaseRequests.find(x=>x.id===r.id);
  assert.equal(r.status,'approved');assert.equal(D.balance('cus-demo-new'),before+100);assert.equal(d.pointTransactions.filter(x=>x.source==='purchase'&&x.sourceId===r.id).length,1);assert.equal(d.financeEntries.filter(x=>x.sourceType==='purchase'&&x.sourceId===r.id).length,1);assert.equal(d.customers.find(x=>x.id==='cus-demo-new').isSubscriber,true);
  await assert.rejects(()=>D.reviewPurchase('admin-demo',r.id,'approved'),/ليست معلقة/);assert.equal(D.balance('cus-demo-new'),before+100);
});

test('رفض طلب شراء لا يسجل نقاطًا ولا إيرادًا ويمنع تكرار المرجع',async()=>{
  const before=D.balance('cus-demo-low');const {result}=await D.createPurchase('cus-demo-low','pkg-100','pay-wallet','REF-REJECT');
  await D.reviewPurchase('admin-demo',result.entityId,'rejected','إثبات غير صالح');const d=D.read();
  assert.equal(D.balance('cus-demo-low'),before);assert.equal(d.financeEntries.some(x=>x.sourceType==='purchase'&&x.sourceId===result.entityId),false);
  await assert.rejects(()=>D.createPurchase('cus-demo-low','pkg-100','pay-wallet','REF-REJECT'),/استُخدم/);
});

test('طلب الشراء يحتفظ بلقطة الباقة وتعليمات وسيلة الدفع التاريخية',async()=>{
  const {result}=await D.createPurchase('cus-demo-subscriber','pkg-100','pay-wallet','SNAP-1');
  await D.savePackage('admin-demo',{id:'pkg-100',name:'اسم جديد',points:900,price:99000,active:true});
  await D.savePaymentMethod('admin-demo',{id:'pay-wallet',name:'وسيلة معدلة',summary:'جديد',instructions:'تعليمات جديدة',active:true});
  const r=D.read().purchaseRequests.find(x=>x.id===result.entityId);assert.equal(r.packageSnapshot.name,'باقة 100 نقطة');assert.equal(r.packageSnapshot.points,100);assert.equal(r.paymentMethodSnapshot.name,'محفظة تجريبية');assert.match(r.paymentMethodSnapshot.instructions,/تجريبية/);
});

test('الاشتراك يحسب التكلفة من التعرفة اليومية ويمنع تكرار التأكيد بنفس المفتاح',async()=>{
  const before=D.balance('cus-demo-subscriber');await D.activateSubscription('cus-demo-subscriber','num-1001',7,'confirm-once');
  let d=D.read();assert.equal(D.balance('cus-demo-subscriber'),before-21);const sub=d.subscriptions.at(-1);assert.equal(sub.pointsCost,21);assert.equal(sub.rateSnapshot,3);assert.ok(d.tasks.some(t=>t.subscriptionId===sub.id));
  await assert.rejects(()=>D.activateSubscription('cus-demo-subscriber','num-1001',7,'confirm-once'),/بالفعل/);assert.equal(D.balance('cus-demo-subscriber'),before-21);assert.equal(D.read().subscriptions.filter(s=>s.idempotencyKey==='confirm-once').length,0);
});

test('الاشتراك يرفض الرصيد غير الكافي والمدة غير الصالحة والرقم غير المملوك دون تغيير جزئي',async()=>{
  const snapshot=()=>{const d=D.read();return {balance:D.balance('cus-demo-low',d),subs:d.subscriptions.length,tasks:d.tasks.length,tx:d.pointTransactions.length}};
  const before=snapshot();await assert.rejects(()=>D.activateSubscription('cus-demo-low','num-2001',30,'low'),/غير كافٍ/);assert.deepEqual(snapshot(),before);
  await assert.rejects(()=>D.activateSubscription('cus-demo-subscriber','num-1001',8,'bad-days'),/غير صالحة/);assert.equal(D.balance('cus-demo-subscriber'),530);
  await assert.rejects(()=>D.activateSubscription('cus-demo-low','num-1001',7,'not-owner'),/غير موجود ضمن أرقام حسابك/);
});

test('تنفيذ المهمة يسجل المصروف مرة واحدة ويمنع التنفيذ المتكرر',async()=>{
  const before=D.read().financeEntries.filter(x=>x.sourceType==='task'&&x.sourceId==='task-due-demo').length;
  await D.executeTask('admin-demo','task-due-demo');let d=D.read(),t=d.tasks.find(x=>x.id==='task-due-demo');assert.equal(t.status,'executed');assert.ok(t.executedAt);assert.equal(d.financeEntries.filter(x=>x.sourceType==='task'&&x.sourceId===t.id).length,before+1);
  await assert.rejects(()=>D.executeTask('admin-demo','task-due-demo'),/سبق تنفيذ/);assert.equal(D.read().financeEntries.filter(x=>x.sourceType==='task'&&x.sourceId===t.id).length,before+1);
});

test('الإشعار محلي ويُسجل كمقروء للعميل الصحيح فقط',async()=>{
  await D.sendLocalNotice('admin-demo','عنوان','نص','customer','cus-demo-new');let d=D.read(),n=d.notifications.find(x=>x.customerId==='cus-demo-new'&&x.title==='عنوان');assert.equal(n.status,'delivered-local');
  await D.markNoticeRead('cus-demo-new',n.id);assert.ok(D.read().notifications.find(x=>x.id===n.id).readAt);
  await assert.rejects(()=>D.markNoticeRead('cus-demo-subscriber',n.id),/غير موجود لهذا الحساب/);
});

test('القيد اليدوي لا يغير رصيد نقاط العميل',async()=>{const before=D.balance('cus-demo-subscriber');await D.addFinancialEntry('admin-demo','expense',1000,'قيد اختبار');assert.equal(D.balance('cus-demo-subscriber'),before);assert.ok(D.read().financeEntries.some(x=>x.description==='قيد اختبار'));});

test('ترحيل بيانات قديمة يحافظ على رصيدها ولا يضيف بيانات عملاء اختبار متعارضة',()=>{
  const old={version:1,customers:[{id:'old-customer',email:'old@test',name:'قديم',balance:25}],companies:[{id:'old-co',name:'قديم',prefixes:['77'],lengths:[9],dailyRate:2}],numbers:[{id:'old-num',customerId:'old-customer',number:'771234000',companyId:'old-co'}],operations:[],packages:[],paymentMethods:[],purchaseRequests:[],subscriptions:[],financeEntries:[]};
  const s=memoryStorage(JSON.stringify(old));D.setStorageForTests(s);const d=D.read();assert.equal(d.customers.length,1);assert.equal(D.balance('old-customer',d),25);assert.equal(d.numbers[0].companyId,'old-co');
});

test('بيانات JSON التالفة لا تُستبدل تلقائيًا',()=>{
  const s=memoryStorage('{not-json');D.setStorageForTests(s);assert.throws(()=>D.read(),/تعذر قراءة بيانات التخزين/);assert.equal(s.raw(),'{not-json');
});

test('فشل التخزين لا يعلن نجاحًا ولا يغير الرصيد المحفوظ',async()=>{
  const base=memoryStorage();D.setStorageForTests(base);base.setItem(D.KEY,JSON.stringify(Fixture.seedData()));const original=base.raw();
  D.setStorageForTests({getItem:k=>k===D.KEY?original:null,setItem:()=>{throw new Error('blocked')}});
  await assert.rejects(()=>D.addFinancialEntry('admin-demo','expense',100,'فشل حفظ'),/فشل حفظ البيانات/);assert.equal(base.raw(),original);
});

test('JSON صحيح نحويًا لكنه ليس كائنًا أو يحتوي مجموعة بتركيب خاطئ لا يُستبدل تلقائيًا',()=>{
  const s=memoryStorage('[]');D.setStorageForTests(s);assert.throws(()=>D.read(),/جذر بيانات التخزين/);assert.equal(s.raw(),'[]');
  const malformed=memoryStorage(JSON.stringify({schemaVersion:2,customers:{important:'data'}}));D.setStorageForTests(malformed);const original=malformed.raw();
  assert.throws(()=>D.read(),/بنية مجموعة customers غير صالحة/);assert.equal(malformed.raw(),original);
});

test('جمهور الإشعار غير المعروف يُرفض بدل توجيهه إلى جميع العملاء',async()=>{
  const before=D.read().notifications.length;await assert.rejects(()=>D.sendLocalNotice('admin-demo','عنوان','نص','unknown',''),/جمهور الإشعار غير صالح/);assert.equal(D.read().notifications.length,before);
});

test('الهوية البصرية الأساسية سوداء والأزرار العائمة مثبتة خارج تمرير المحتوى',()=>{
  const root=path.join(__dirname,'..','apps');
  const customerCss=fs.readFileSync(path.join(root,'customer-base.css'),'utf8');
  const adminCss=fs.readFileSync(path.join(root,'admin-base.css'),'utf8');
  const sharedCss=fs.readFileSync(path.join(root,'reference.css'),'utf8');
  assert.match(customerCss,/--button:#141615/i);
  assert.match(adminCss,/--button:#141615/i);
  assert.doesNotMatch(sharedCss,/#087F6E|#19989A|#E9F8F5|#6EE7B7/i);
  assert.match(sharedCss,/\.floating-root \.floating-add\s*\{[^}]*position:absolute/s);
  assert.match(sharedCss,/bottom:calc\(77px \+ 14px \+ env\(safe-area-inset-bottom\)\)/);
  const adminHtml=fs.readFileSync(path.join(root,'admin.html'),'utf8');
  const adminJs=fs.readFileSync(path.join(root,'admin.js'),'utf8');
  assert.match(adminHtml,/id=\"floatingRoot\"/);
  assert.match(adminJs,/floatingRoot\.appendChild\(floating\)/);
  assert.doesNotMatch(sharedCss,/position:sticky[^}]*floating-add|floating-add[^}]*position:sticky/i);
  assert.doesNotMatch(customerCss,/position:sticky[^}]*floating-add|floating-add[^}]*position:sticky/i);
});


test('مجموعة الاختبار المعزولة تحتوي الشركات الأربع ودفتر النقاط',()=>{
  const d=D.read();
  assert.equal(d.companies.length,4);
  assert.equal(D.balance('cus-demo-low',d),8);
  for(const prefix of ['77','78','73','71','70'])assert.ok(d.companies.some(c=>c.prefixes.includes(prefix)),`بادئة الشركة ${prefix} غير معرفة`);
});

test('أيقونات الواجهات SVG ولا توجد مكتبات JavaScript خارجية مطلوبة للتشغيل',()=>{
  const root=path.join(__dirname,'..');
  const customer=fs.readFileSync(path.join(root,'apps/customer.js'),'utf8');
  const admin=fs.readFileSync(path.join(root,'apps/admin.js'),'utf8');
  const ui=fs.readFileSync(path.join(root,'shared/ui.js'),'utf8');
  const html=['index.html','apps/customer.html','apps/admin.html'].map(f=>fs.readFileSync(path.join(root,f),'utf8')).join('\n');
  assert.match(customer,/U\.icon\('home'\)/);assert.match(customer,/U\.icon\('copy'\)/);
  assert.match(ui,/settings:'<path d="M4 6h16M4 12h16M4 18h16"/); // منزلقات الإعدادات، بلا ترس.
  assert.match(admin,/icon\|\|'plus'/);assert.match(ui,/const icon=/);
  assert.doesNotMatch(html,/cdn\.jsdelivr\.net/i);
  assert.doesNotMatch(html,/fonts\.googleapis\.com|fonts\.gstatic\.com/i); // لا تعتمد الواجهة على تحميل خط خارجي.
  assert.doesNotMatch(customer,/aria-hidden=\"true\">[⌂◉◇§⧉‹]/);
  assert.doesNotMatch(customer,/reset-seed/);
  const loginTemplate=admin.slice(admin.indexOf('function login()'),admin.indexOf('function body(d)'));
  assert.doesNotMatch(loginTemplate,/reset-demo|استعادة بيانات الاختبار/);
});

test('التهيئة الفعلية تبدأ فارغة دون سجلات أو إعدادات تجارية تجريبية',()=>{const d=D.seedData();for(const k of ['customers','companies','packages','paymentMethods','purchaseRequests','numbers','subscriptions','pointTransactions','tasks','financeEntries','notifications'])assert.equal(d[k].length,0,k);});

test('حفظ الشركة يقبل الفواصل العربية وتُحفظ إعداداتها في نموذج المهام المستقل',async()=>{
  await assert.rejects(()=>D.saveCompany('admin-demo',{name:'شركة متعارضة',prefixes:['77'],lengths:['9'],dailyRate:'2',durations:['7','30'],intervalDays:'5',expenseAmount:'1250',active:true}),/بادئة مطابقة/);
  await assert.rejects(()=>D.saveCompany('admin-demo',{name:'شبكة تجريبية 77',prefixes:['79'],lengths:['9'],dailyRate:'2',durations:['7','30'],intervalDays:'5',expenseAmount:'1250',active:true}),/اسم الشركة مستخدم/);
  await D.saveCompany('admin-demo',{name:'شركة اختبار',prefixes:['79','80'],lengths:['9'],dailyRate:'2',durations:['7','30'],intervalDays:'5',expenseAmount:'1250',active:true});
  const c=D.read().companies.find(x=>x.name==='شركة اختبار');
  assert.ok(c);assert.deepEqual(c.prefixes,['79','80']);assert.deepEqual(c.lengths,[9]);assert.deepEqual(c.durations,[7,30]);await D.saveTaskSettings('admin-demo',c.id,{intervalDays:5,visibleBeforeDays:0,expenseAmount:1250,graceDays:0,createFirstOnActivation:true,allowReschedule:true,createAfterExpiry:false,allowDuringGrace:false});assert.equal(D.read().companies.find(x=>x.id===c.id).taskSchedule.intervalDays,5);
});


test('الاشتراك الملغى أو المستبدل لا يعامل على أنه اشتراك فعال لمجرد أن تاريخ نهايته مستقبلي',()=>{
  const d=D.read();const s=d.subscriptions.find(x=>x.id==='sub-1001');s.status='cancelled';assert.equal(D.activeSubscription(d,s.numberId),null);
});

test('عكس القيد المالي يحافظ على الأصل ويوازن الأثر ويمنع العكس المكرر',async()=>{
  const initial=D.read().financeEntries.reduce((sum,x)=>sum+(x.kind==='revenue'?1:-1)*x.amount,0);
  await D.addFinancialEntry('admin-demo','revenue',4321,'قيد اختبار للعكس');
  let d=D.read();const original=d.financeEntries.find(x=>x.description==='قيد اختبار للعكس');
  const {result}=await D.reverseFinancialEntry('admin-demo',original.id,'تصحيح إدخال خاطئ');d=D.read();
  const reversal=d.financeEntries.find(x=>x.id===result.entityId);
  assert.ok(reversal);assert.equal(reversal.sourceType,'reversal');assert.equal(reversal.reversalOf,original.id);assert.equal(reversal.amount,original.amount);assert.notEqual(reversal.kind,original.kind);
  assert.ok(d.financeEntries.some(x=>x.id===original.id));assert.equal(d.financeEntries.reduce((sum,x)=>sum+(x.kind==='revenue'?1:-1)*x.amount,0),initial);
  await assert.rejects(()=>D.reverseFinancialEntry('admin-demo',original.id,'عكس مكرر'),/سبق عكس/);
  await assert.rejects(()=>D.reverseFinancialEntry('admin-demo',reversal.id,'عكس عكسي'),/قيد عكسي/);
  await assert.rejects(()=>D.reverseFinancialEntry('admin-demo',original.id,'   '),/سبب عكس/);
});

test('الترحيل من تذكرني القديم يحذف كلمة المرور المخزنة ولا يمس البريد المحفوظ',()=>{
  const fs=require('node:fs'),path=require('node:path');
  const customer=fs.readFileSync(path.join(__dirname,'..','apps','customer.js'),'utf8');
  const admin=fs.readFileSync(path.join(__dirname,'..','apps','admin.js'),'utf8');
  assert.match(customer,/Object\.prototype\.hasOwnProperty\.call\(v,'password'\)/);
  assert.match(admin,/Object\.prototype\.hasOwnProperty\.call\(v,'password'\)/);
  assert.doesNotMatch(customer,/JSON\.stringify\(\{email,password,enabled:true\}\)/);
  assert.doesNotMatch(admin,/JSON\.stringify\(\{email,password,enabled:true\}\)/);
});

test('باقات الحماية مستقلة عن باقات النقاط والاشتراك يسجل عملية مستقلة وخصمًا واحدًا',async()=>{
  await D.saveProtectionPackage('admin-demo',{id:'protect-30',companyId:'co-net71',name:'حماية 30 يوم',days:30,pointsCost:75,active:true});
  let d=D.read();assert.equal(d.packages.some(x=>x.id==='protect-30'),false);assert.equal(d.protectionPackages.length,1);
  const before=D.balance('cus-demo-subscriber');const {result}=await D.performProtectionOperation('cus-demo-subscriber','num-1003','protect-30','subscribe','protection-once');
  d=D.read();assert.equal(D.balance('cus-demo-subscriber'),before-75);assert.equal(d.protectionOperations.filter(x=>x.id===result.entityId).length,1);assert.equal(d.pointTransactions.filter(x=>x.source==='protection_operation'&&x.sourceId===result.entityId).length,1);
  const task=d.tasks.find(x=>x.subscriptionId===result.subscriptionId);assert.ok(task);assert.equal(task.status,'due');assert.ok(Math.abs(Date.now()-new Date(task.dueAt).getTime())<5000);
  await assert.rejects(()=>D.performProtectionOperation('cus-demo-subscriber','num-1003','protect-30','subscribe','protection-once'),/بالفعل/);
  assert.equal(D.balance('cus-demo-subscriber'),before-75);
});

test('تمديد الحماية يحافظ على سجل الاشتراك نفسه ويسجل العملية والخصم بصورة مستقلة',async()=>{
  await D.saveProtectionPackage('admin-demo',{id:'protect-7',companyId:'co-net77',name:'حماية أسبوع',days:7,pointsCost:25,active:true});
  const old=D.read().subscriptions.find(x=>x.id==='sub-1001'),oldEnd=old.endsAt,before=D.balance('cus-demo-subscriber');
  const {result}=await D.performProtectionOperation('cus-demo-subscriber','num-1001','protect-7','extend','extend-once');const d=D.read(),updated=d.subscriptions.find(x=>x.id==='sub-1001');
  assert.equal(d.subscriptions.filter(x=>x.numberId==='num-1001').length,1);assert.equal(updated.endsAt,D.datePlus(oldEnd,7));assert.equal(D.balance('cus-demo-subscriber'),before-25);assert.equal(d.protectionOperations.find(x=>x.id===result.entityId).type,'extend');
});

test('إعادة جدولة المهمة تتحقق من إعداد الشركة ولا تعيد ضبط سجل التنفيذ',async()=>{
  const before=D.read().tasks.find(x=>x.id==='task-due-demo').dueAt;const future=new Date(Date.now()+3*86400000).toISOString();
  await D.rescheduleTask('admin-demo','task-due-demo',future);let d=D.read(),t=d.tasks.find(x=>x.id==='task-due-demo');assert.equal(t.dueAt,future);assert.equal(t.status,'planned');assert.equal(t.executedAt,undefined);assert.equal(d.operations.at(-1).type,'task_rescheduled');
  await D.transact('admin-demo','disable-reschedule',db=>{db.companies.find(x=>x.id==='co-net77').taskSchedule.allowReschedule=false;return{entityType:'company',entityId:'co-net77',summary:'disable'}});
  await assert.rejects(()=>D.rescheduleTask('admin-demo','task-due-demo',new Date(Date.now()+4*86400000).toISOString()),/معطلة/);assert.equal(D.read().tasks.find(x=>x.id==='task-due-demo').dueAt,future);assert.notEqual(before,future);
});

test('واجهة الإدارة تفصل باقات الحماية عن باقات النقاط وتعرض إعدادات المهام الثمانية',()=>{
  const admin=fs.readFileSync(path.join(__dirname,'..','apps','admin.js'),'utf8');
  assert.match(admin,/function protectionPackages\(d\)/);assert.match(admin,/data-route="protection-packages"|\['protection-packages'/);
  for(const field of ['createFirstOnActivation','intervalDays','visibleBeforeDays','expenseAmount','allowReschedule','createAfterExpiry','allowDuringGrace','graceDays'])assert.ok(admin.includes(field),`missing task setting ${field}`);assert.match(admin,/task-settings-form/);assert.match(admin,/D\.saveTaskSettings/);
  const customer=fs.readFileSync(path.join(__dirname,'..','apps','customer.js'),'utf8');assert.match(customer,/performProtectionOperation/);assert.match(customer,/تمديد الحماية/);assert.match(customer,/تجديد الحماية/);
});

test('بيانات الشركة لا تتطلب أسعار الحماية لأن السعر والمدة محفوظان في باقات الحماية المستقلة',async()=>{
  await D.saveCompany('admin-demo',{name:'شركة بلا تعرفة مدمجة',prefixes:['66'],lengths:[9],intervalDays:4,visibleBeforeDays:2,expenseAmount:900,graceDays:3,createFirstOnActivation:false,allowReschedule:true,createAfterExpiry:false,allowDuringGrace:true,active:true});
  const c=D.read().companies.find(x=>x.name==='شركة بلا تعرفة مدمجة');assert.ok(c);assert.deepEqual(c.durations,[]);await D.saveTaskSettings('admin-demo',c.id,{intervalDays:4,visibleBeforeDays:2,expenseAmount:900,graceDays:3,createFirstOnActivation:false,allowReschedule:true,createAfterExpiry:false,allowDuringGrace:true});const updated=D.read().companies.find(x=>x.id===c.id);assert.equal(updated.taskSchedule.createFirstOnActivation,false);assert.equal(updated.taskSchedule.visibleBeforeDays,2);assert.equal(updated.taskSchedule.allowDuringGrace,true);
});

test('التجديد منفصل عن التمديد ولا يقبل حماية ما زالت سارية',async()=>{
  await D.saveProtectionPackage('admin-demo',{id:'protect-renew',companyId:'co-net77',name:'تجديد 7 أيام',days:7,pointsCost:20,active:true});
  const before=D.read(),subCount=before.subscriptions.length,balance=D.balance('cus-demo-subscriber');
  await assert.rejects(()=>D.performProtectionOperation('cus-demo-subscriber','num-1001','protect-renew','renew','renew-active'),/لا تزال سارية/);
  assert.equal(D.read().subscriptions.length,subCount);assert.equal(D.balance('cus-demo-subscriber'),balance);
});

test('حد كلمة المرور الأدنى أربع خانات في تسجيل العميل ودخوله وواجهة الإدارة',()=>{
  const root=path.join(__dirname,'..','apps');
  const customer=fs.readFileSync(path.join(root,'customer.js'),'utf8');
  const admin=fs.readFileSync(path.join(root,'admin.js'),'utf8');
  assert.match(customer,/minlength=\"4\"/);
  assert.match(customer,/password\.length<4/);
  assert.match(customer,/كلمة المرور يجب ألا تقل عن 4 خانات/);
  assert.match(customer,/كلمة المرور \(4 خانات فأكثر\)/);
  assert.match(admin,/name=\"password\" type=\"password\" minlength=\"4\"/);
});


test('عدد المهام يتبع مدة الباقة والفاصل ويبدأ بالمهمة الفورية عند تفعيلها',async()=>{
  await D.transact('admin-demo','schedule-test',d=>{const c=d.companies.find(x=>x.id==='co-net71');Object.assign(c.taskSchedule,{intervalDays:7,visibleBeforeDays:2,expenseAmount:1000,createFirstOnActivation:true,createAfterExpiry:false,graceDays:0});return{entityType:'company',entityId:c.id,summary:'تهيئة اختبار الجدول'}});
  await D.saveProtectionPackage('admin-demo',{id:'protect-180',companyId:'co-net71',name:'اختبار 20',days:20,pointsCost:1,active:true});
  const {result}=await D.performProtectionOperation('cus-demo-subscriber','num-1003','protect-180','subscribe','schedule-180');
  const d=D.read(),sub=d.subscriptions.find(x=>x.id===result.subscriptionId),tasks=d.tasks.filter(x=>x.subscriptionId===sub.id).sort((a,b)=>new Date(a.dueAt)-new Date(b.dueAt));
  assert.equal(tasks.length,3);assert.equal(tasks[0].dueAt,sub.startsAt);assert.ok(tasks.every(t=>new Date(t.dueAt)<=new Date(sub.endsAt)));assert.equal(tasks[0].visibleAt,sub.startsAt);
});

test('تغيير مهلة الظهور يتيح التنفيذ عند دخول النافذة قبل تاريخ الاستحقاق',async()=>{
  const t=D.read().tasks.find(x=>x.id==='task-due-demo');const due=new Date(Date.now()+86400000).toISOString();
  await D.transact('admin-demo','prepare-visible-task',d=>{const x=d.tasks.find(y=>y.id===t.id);x.dueAt=due;x.visibleAt=new Date(Date.now()-1000).toISOString();x.status='planned';return{entityType:'task',entityId:x.id,summary:'تهيئة اختبار نافذة الظهور'}});
  await D.rescheduleTask('admin-demo',t.id,due);
  const updated=D.read().tasks.find(x=>x.id===t.id);assert.ok(new Date(updated.visibleAt)<=new Date());
  await D.executeTask('admin-demo',t.id);assert.equal(D.read().tasks.find(x=>x.id===t.id).status,'executed');
});

test('تعديل إعدادات الشركة يعيد بناء المهام المستقبلية ولا يغير المهام المنفذة',async()=>{
  await D.executeTask('admin-demo','task-due-demo');
  const executed=D.read().tasks.find(x=>x.id==='task-due-demo'),oldExecutedDate=executed.dueAt;
  await D.saveTaskSettings('admin-demo','co-net77',{intervalDays:15,visibleBeforeDays:2,expenseAmount:2222,graceDays:10,createFirstOnActivation:true,allowReschedule:true,createAfterExpiry:true,allowDuringGrace:false});
  const d=D.read();assert.equal(d.tasks.find(x=>x.id===executed.id).dueAt,oldExecutedDate);
  const future=d.tasks.filter(x=>x.subscriptionId===executed.subscriptionId&&x.status!=='executed'&&x.status!=='cancelled');
  assert.ok(future.every(x=>x.expenseAmount===2222));assert.ok(future.every(x=>Number.isFinite(new Date(x.visibleAt).getTime())));
});

test('واجهة الإدارة تعرض إعدادات المهام في شاشة منفصلة وخطة الرقم في التفاصيل',()=>{
  const admin=fs.readFileSync(path.join(__dirname,'..','apps','admin.js'),'utf8');
  assert.match(admin,/task-settings-form/);assert.match(admin,/مخطط المهام/);assert.match(admin,/visibleAt\|\|t\.dueAt/);
});
