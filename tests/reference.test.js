'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const adminSrc = () => ['admin.js','admin-kit.js','admin-screens.js','admin-model.js'].map(f => read('apps/'+f)).join('\n');

test('وثائق البيانات تستخدم مفتاح التخزين الفعلي V2', () => {
  assert.match(read('shared/data.js'), /AMAN_SHARED_REGISTRY_V2/);
  assert.match(read('docs/DATA_MODEL.md'), /AMAN_SHARED_REGISTRY_V2/);
  assert.match(read('docs/DATA_DICTIONARY.md'), /AMAN_SHARED_REGISTRY_V2/);
  assert.doesNotMatch(read('docs/DATA_MODEL.md') + read('docs/DATA_DICTIONARY.md'), /AMAN_SHARED_REGISTRY_V1/);
});

test('نطاق الأدوار الموثق يقتصر على المدير والعميل', () => {
  const overview = read('docs/SYSTEM_OVERVIEW.md');
  const sql = read('docs/SUPABASE_REFERENCE.sql');
  assert.match(overview, /المدير \(`admin`\)/);
  assert.match(overview, /العميل \(`customer`\)/);
  assert.match(sql, /check \(role = 'admin'\)/);
  assert.doesNotMatch(sql, /role in \('admin','finance','operations','support'\)/);
});

test('دفتر المالية موثق منفصلًا عن دفتر النقاط مع منع ازدواج الإيراد', () => {
  const finance = read('docs/DATA_FLOW_AND_FINANCE.md');
  assert.match(finance, /إيراد بيع النقاط/);
  assert.match(finance, /مصروف المهمة/);
  assert.match(finance, /إيراد يدوي/);
  assert.match(finance, /مصروف يدوي/);
  assert.match(finance, /ازدواج/);
});

test('مصفوفة التتبع تغطي الواجهة والبيانات والاختبار وحدود الإنتاج', () => {
  const trace = read('docs/TRACEABILITY_MATRIX.md');
  for (const token of ['واجهة أو مسار', 'منطق محلي', 'البيانات المتأثرة', 'اختبار/تحقق', 'غير جاهز للإنتاج']) assert.ok(trace.includes(token), token);
});

test('مرجع SQL يعرّف RPC لإنشاء طلب شراء وإضافة رقم وقيد مالي يدوي', () => {
  const sql = read('docs/SUPABASE_REFERENCE.sql');
  assert.match(sql, /function public\.add_customer_number/);
  assert.match(sql, /function public\.create_points_purchase/);
  assert.match(sql, /function public\.add_manual_finance_entry/);
  assert.match(sql, /function public\.review_points_purchase/);
  assert.match(sql, /function public\.create_customer_subscription/);
  assert.match(sql, /function public\.execute_aman_task/);
});

test('وثائق الإنتاج تصرح أن Supabase غير منشور وغير مختبر هنا', () => {
  assert.match(read('docs/SUPABASE_DEPLOYMENT.md'), /لم يثبت تطبيقه على مشروع Supabase فعلي/);
  assert.match(read('README.md'), /ليست خدمة إنتاج منشورة/);
});

test('توجد قائمة قبول واختبارات غير منفذة موثقة', () => {
  const matrix = read('docs/TEST_MATRIX.md');
  const release = read('docs/RELEASE_CHECKLIST.md');
  assert.match(matrix, /اختبارات غير منفذة/);
  assert.match(release, /قبل الإنتاج/);
  assert.match(release, /رفع GitHub/);
});


test('واجهة الإدارة توفر تصدير نسخة بيانات وسجل تدقيق وعكسًا ماليًا دون حذف الأصل',()=>{
  const admin=adminSrc(),data=read('shared/data.js'),sql=read('docs/SUPABASE_REFERENCE.sql');
  assert.match(admin,/title: 'تنزيل نسخة احتياطية للبيانات'/);assert.match(admin,/act: 'export-data'/);
  assert.match(admin,/function audit\(/);
  assert.match(admin,/finance-reverse-open/);assert.match(admin,/D\.reverseFinancialEntry/);
  assert.match(data,/async function reverseFinancialEntry/);
  assert.match(sql,/function public\.reverse_finance_entry/);
  assert.match(sql,/reversal_of_entry_id/);
});

test('ملفات التشغيل لا تحمل خطوطًا أو مكتبات من شبكات خارجية',()=>{
  const html=['index.html','apps/customer.html','apps/admin.html'].map(f=>read(f)).join('\n');
  assert.doesNotMatch(html,/https?:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com|cdn\.)/i);
});

test('مرجع SQL يقيّد تحديث الإشعار ويحدد صلاحيات RPC صراحة',()=>{
  const sql=read('docs/SUPABASE_REFERENCE.sql');
  assert.match(sql,/function public\.mark_aman_notification_read/);
  assert.doesNotMatch(sql,/create policy notice_read_update_self/);
  assert.match(sql,/revoke all on all tables in schema public from anon, authenticated/);
  assert.match(sql,/grant execute on function public\.reverse_finance_entry\(uuid,text\) to authenticated/);
});


test('واجهة العميل تعرض قائمة أرقام الحساب مع البحث والفلترة في شاشة الأرقام، وتستخدم زر اختيار صغيرًا في بحث الرئيسية دون تكرار القائمة',()=>{
  const screens=read('apps/customer-screens.js'),shell=read('apps/customer.js'),css=read('apps/customer.css'),data=read('shared/data.js');
  assert.match(data,/for\(const sub of db\.subscriptions\)if\(sub\.customerId===customerId\)ids\.add\(sub\.numberId\)/);
  // شاشة الأرقام: قائمة الحساب + بحث + فلتر الشركة، وتُحدَّث القائمة وحدها أثناء الكتابة
  assert.match(screens,/function numbers\(d, c, x\)/);assert.match(screens,/const all = owned\(d, c\.id\);/);
  assert.match(screens,/K\.toolbar\('بحث برقم الهاتف'/);assert.match(screens,/\['', 'كل الشركات'\]/);assert.match(screens,/id="listbody" class="customer-number-list"/);
  assert.match(shell,/if \(t\.id === 'q'\) \{ ui\.q = t\.value; refreshList\(\)/);assert.match(shell,/if \(t\.id === 'flt'\) \{ ui\.co = t\.value; refreshList\(\)/);
  // بحث الرئيسية: حقل رقم + قائمة اختيار صغيرة لأرقام الحساب، دون تكرار قائمة الأرقام
  const home=screens.slice(screens.indexOf('function home('),screens.indexOf('/* ===================== الأرقام والرادار'));
  assert.match(home,/id="quickNumber"/);assert.match(home,/name: 'number'/);assert.doesNotMatch(home,/numberRow\(/);
  assert.match(css,/\.select\.block select\{width:100%/);
});


test('تصنيفات واجهة المهام تميّز المتأخر والمبكر والمجدول والمكتمل والملغى',()=>{
  const admin=adminSrc();
  assert.match(admin,/const isOverdue = /);
  assert.match(admin,/const taskClass = /);
  assert.match(admin,/متاحة للتنفيذ المبكر/);
  assert.match(admin,/\['early', 'متاحة مبكرًا'\]/);
  assert.match(admin,/\['overdue', 'متأخرة'\]/);
  assert.match(admin,/\['planned', 'قادمة \/ مجدولة'\]/);
  assert.match(admin,/\['completed', 'مكتملة'\]/);
  assert.match(admin,/\['cancelled', 'ملغاة'\]/);
  assert.match(admin,/\['due', 'planned', 'executed', 'cancelled'\]/);
  assert.match(admin,/early \? 'تنفيذ مبكرًا' : 'تنفيذ المهمة'/);
});


test('تحميل بيانات المعاينة مشروط بوضع demo ويمنع الكتابة فوق مخزن غير فارغ',()=>{
  const admin=read('apps/admin.js');
  const fixture=read('tests/fixture-data.js');
  assert.match(admin,/new URLSearchParams\(location\.search\)\.get\('demo'\) === '1'/);
  assert.match(admin,/new URLSearchParams\(location\.search\)\.get\('demo'\) !== '1'/);
  assert.match(admin,/await import\('\.\.\/tests\/fixture-data\.js'\)/);
  assert.match(admin,/if \(keys\.some\(k => \(d\[k\] \|\| \[\]\)\.length\)\) throw new Error\('المخزن يحتوي بيانات بالفعل/);
  assert.match(admin,/crypto\.subtle\.digest\('SHA-256'/);
  assert.match(fixture,/AmanTestFixture/);
  assert.doesNotMatch(fixture,/root\.AmanData = api/);
});
