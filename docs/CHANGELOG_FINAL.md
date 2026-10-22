# سجل استكمال الحزمة

## النسخة المكتملة كمرجع تطوير

- توحيد وثائق مفتاح المخزن المحلي على `AMAN_SHARED_REGISTRY_V2`.
- توحيد نطاق الأدوار على المدير والعميل، وإزالة الإشارة إلى أدوار مالية/تشغيلية/دعم منفصلة من نموذج SQL.
- إضافة نظرة شاملة للنظام ومصادر الحقيقة وحدود المعاينة.
- إضافة تدفق بيانات ودفتر مالية يشرح الإيرادات والمصروفات ومصادرها ومنع ازدواج إيراد النقاط.
- إضافة مصفوفة تتبع المتطلبات من الواجهة إلى منطق البيانات ومرجع الإنتاج والاختبار.
- إضافة مصفوفة اختبارات ومعايير قبول وحدود الاختبارات غير المنفذة.
- إضافة خطة تجهيز Supabase مع تحذير واضح بأن SQL مرجع غير منشور.
- إضافة قائمة فحص للإصدار والاختبار والرفع.
- توسيع مرجع SQL بدوال مرجعية لإضافة الرقم باكتشاف البادئة، وإنشاء طلب شراء بلقطات تاريخية، وإضافة قيد مالي يدوي من المدير.

## ما لا تدعيه هذه النسخة

- لا تدعي وجود قاعدة Supabase منشورة أو مختبرة.
- لا تدعي أن الدفع أو تنفيذ مهمة الاتصالات أو Push/SMS متصل بخدمة حقيقية.
- لا تدعي جاهزية إنتاجية أمنية أو أن سجل المعاينة المحلية بديل لقاعدة بيانات.
- أضيف الآن مسار عكس القيد المالي محليًا وRPC مرجعية في SQL؛ لم يُنشر SQL ولم يُختبر على Supabase.


## إصلاحات مراجعة شاملة — 2026-10-14

- إيقاف تخزين كلمة المرور في تذكرني للعميل والمدير، وإزالة كلمات المرور من سجلات التذكر القديمة مع إبقاء البريد.
- تصحيح تحديد الاشتراك الفعال بحيث تُستبعد الحالات الملغاة/المستبدلة.
- إضافة عكس مالي مرتبط بالأصل مع سبب إلزامي ومنع التكرار، واختبار ذلك.
- إضافة شاشة سجل التدقيق المحلي وزر تنزيل نسخة احتياطية JSON من الحساب الإداري.
- رفض البادئة المتطابقة بين شركتين فعالتين، ودمج إعدادات الإشعارات الافتراضية عند قراءة مخزن جزئي.
- إزالة الاعتماد على تحميل الخطوط من الإنترنت.
- توسيع الاختبارات الآلية إلى 34 اختبارًا بعد تحديثها؛ لا تزال اختبارات القبول البصري على متصفح المستخدم وبيئة Supabase الحقيقية غير منفذة في هذه الجولة.


## تحديث المعاينة — فصل باقات الحماية ودورة المهام

- إضافة واجهة إدارة مستقلة لباقات الحماية، منفصلة عن باقات شراء النقاط.
- إضافة سجلات عمليات الاشتراك والتمديد والتجديد مع لقطات تاريخية للتكلفة والمدة.
- إضافة إعدادات المهام الثمانية إلى إعداد الشركة، ودعم إعادة الجدولة المحكومة بالإعدادات.
- في لقطة المعاينة التاريخية السابقة، توسعت الاختبارات من 34 إلى 40 وكانت ناجحة آنذاك؛ نتيجة الحزمة الحالية موثقة في القسم المؤرخ 2026-10-16 أدناه.
- لم يتغير حد المعاينة: لا Supabase منشور ولا دفع أو اتصال مشغل حقيقي.


## تحسينات سلامة المسارات والملكية — 2026-10-15

- منع تفعيل اشتراك جديد فوق سجل حماية سابق؛ تمر الأرقام المنتهية عبر التحقق من التجديد والمهلة بدل تجاوز السياسة.
- إضافة اشتقاق مركزي لصفة المشترك من طلبات الشراء المعتمدة، واستخدامه لقوائم/إشعارات التصنيف.
- تصحيح عرض أرقام الحسابات في ملفات العملاء اعتمادًا على علاقات الإضافة الحالية لا حقل ملكية قديم في سجل الرقم.
- توثيق فصل سجل الرقم عن روابط الحساب، وإضافة اختبارات للتمديد من عميل آخر دون نقل الملكية أو كشف تفاصيل الاشتراك.
- إصلاح لقطة مدة باقة التمديد وإشعار العملية، مع منع إعادة الخصم بالمفتاح نفسه.
- تحقق `npm test`: 51 اختبارًا ناجحًا، 0 فشل. لم يُفحص ملف 1.3.zip ولم تُنشأ حزمة ZIP تنفيذًا لتوجيه المستخدم.

## 2026-10-16 — Refinement of repeated cards (V3)
- Unified repeated data-card geometry across customer and admin screens: consistent radius, padding, border, spacing, content hierarchy, status-pill sizing, and responsive behavior.
- Refined entity cards, customer number cards, list-item cards, menu cards, empty states, metrics, and action-button spacing.
- Added a building SVG icon for company cards.
- Kept all JavaScript workflows, routes, data operations, business rules, and permissions unchanged.
- Historical validation snapshot before the later 2026-10-16 repair: 54/56; both failures were external Google Fonts checks. Those references were subsequently removed; the current result is recorded in `TEST_REPORT.md`.

## 2026-10-16 — Admin-wide card layout (V4)
- Applied the reference card spacing, border, radius, padding, and responsive layout to admin work screens including customers/subscribers, tasks, point requests, numbers/subscriptions, finance entries, notices, audit records, settings, content forms, and entity details.
- Improved separation for list results, filters, metrics, settings groups, and detail records; kept the admin home grid unchanged by scoping the new treatment to non-home screens.
- Visual-only change: no data models, actions, permissions, navigation routes, or business rules changed.
- Historical validation snapshot before the later 2026-10-16 repair: 54/56; both failures were external Google Fonts checks. Those references were subsequently removed; the current result is recorded in `TEST_REPORT.md`.


## 2026-10-16 — الإصلاح النهائي قبل الحزمة

- توحيد تنفيذ المهمة المبكر مع قاعدة `visibleAt`، وفصل حالات المتاحة مبكرًا والمستحقة والمتأخرة والقادمة/المجدولة والمكتملة والملغاة.
- جعل شاشة «كل المهام» تعرض الحالات كلها وإضافة فلاترها، مع توضيح عبارة التنفيذ المبكر في البطاقة ونافذة التفاصيل.
- إضافة تحميل اختياري لبيانات اختبار اصطناعية من رابط `?demo=1`؛ لا يعمل إلا على مخزن فارغ ولا يكتب فوق سجلات موجودة.
- توحيد قواعد العمل ومصفوفة الاختبارات وتدفقات الشاشات والتتبع وتقارير الحالة؛ نتائج 54/56 السابقة موسومة الآن كتاريخية قبل إزالة روابط Google Fonts.
- تحقق الجولة الحالية موثق في `TEST_REPORT.md`: 61 اختبارًا ناجحًا، 0 فشل. لا يعني ذلك اختبار تكامل الإنتاج أو اعتمادًا بصريًا بكسليًا.
