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
  assert.match(html,/fonts\.googleapis\.com/i); // خط اختياري موثق؛ تعمل الواجهة بالبدائل عند انقطاع الإنترنت.
  assert.doesNotMatch(customer,/aria-hidden=\"true\">[⌂◉◇§⧉‹]/);
  assert.doesNotMatch(customer,/reset-seed/);
  const loginTemplate=admin.slice(admin.indexOf('function login()'),admin.indexOf('function body(d)'));
  assert.doesNotMatch(loginTemplate,/reset-demo|استعادة بيانات الاختبار/);
});

test('التهيئة الفعلية تبدأ فارغة دون سجلات أو إعدادات تجارية تجريبية',()=>{const d=D.seedData();for(const k of ['customers','companies','packages','paymentMethods','purchaseRequests','numbers','subscriptions','pointTransactions','tasks','financeEntries','notifications'])assert.equal(d[k].length,0,k);});

test('حفظ الشركة يقبل الفواصل العربية ويحفظ إعدادات المهام',async()=>{
  await D.saveCompany('admin-demo',{name:'شركة اختبار',prefixes:['77','78'],lengths:['9'],dailyRate:'2',durations:['7','30'],intervalDays:'5',expenseAmount:'1250',active:true});
  const c=D.read().companies.find(x=>x.name==='شركة اختبار');
  assert.ok(c);assert.deepEqual(c.prefixes,['77','78']);assert.deepEqual(c.lengths,[9]);assert.deepEqual(c.durations,[7,30]);assert.equal(c.taskSchedule.intervalDays,5);assert.equal(c.taskSchedule.expenseAmount,1250);
});
