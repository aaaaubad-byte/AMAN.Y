# Manifest تغييرات AMAN.Y — 2026-10-14

المقارنة مع الملف الأصلي المرفوع `AMAN.Y-main.zip`. لم تُحذف ملفات من النسخة الأصلية. تم الحفاظ على الملف الأصلي نفسه خارج هذه الحزمة.

## الملفات المضافة

- `.gitignore`
- `docs/CHANGELOG_FINAL.md`
- `docs/DATA_FLOW_AND_FINANCE.md`
- `docs/RELEASE_CHECKLIST.md`
- `docs/REPAIR_REPORT_2026-10-14.md`
- `docs/SUPABASE_DEPLOYMENT.md`
- `docs/SYSTEM_OVERVIEW.md`
- `docs/TEST_MATRIX.md`
- `docs/TRACEABILITY_MATRIX.md`
- `tests/reference.test.js`

## الملفات المعدلة

- `README.md`
- `apps/admin-base.css`
- `apps/admin.html`
- `apps/admin.js`
- `apps/customer-base.css`
- `apps/customer.html`
- `apps/customer.js`
- `docs/DATA_DICTIONARY.md`
- `docs/DATA_MODEL.md`
- `docs/ISSUE_REGISTER.md`
- `docs/SCREEN_AND_FLOWS.md`
- `docs/SUPABASE_REFERENCE.sql`
- `docs/TEST_REPORT.md`
- `docs/VISUAL_REFINEMENT_REPORT.md`
- `index.html`
- `package.json`
- `shared/data.js`
- `tests/core.test.js`

## الملفات المحذوفة

لا يوجد.

## التحقق

- `npm test`: 34 اختبارًا ناجحًا، 0 فشل.
- `node --check`: ملفات JavaScript الأساسية ناجحة.
- HTML ثابت: لا توجد معرفات مكررة أو مراجع محلية مفقودة في ملفات HTML الثلاثة.
- لم يُختبر SQL على Supabase، ولم يكتمل اختبار Chromium/الهاتف في هذه الجولة. راجع `REPAIR_REPORT_2026-10-14.md`.


## استكمال الحزمة — 2026-10-16

أُضيف هذا الاستكمال إلى البيان التاريخي أعلاه؛ نتائج 34 اختبارًا تخص نسخة 2026-10-14، أما نتيجة الحزمة الحالية فهي 61/61 في `TEST_REPORT.md`.

- تعديلات التطبيق: `apps/admin.js`.
- بيانات/اختبارات: `tests/fixture-data.js`, `tests/reference.test.js`.
- تعليمات/وثائق جرى تحديثها: `README.md`, `docs/BUSINESS_RULES.md`, `docs/CHANGELOG_FINAL.md`, `docs/RELEASE_CHECKLIST.md`, `docs/SCREEN_AND_FLOWS.md`, `docs/SEARCH_AND_ADD_NUMBER_REFERENCE_1_1.md`, `docs/SEARCH_RESULT_CARD_REFERENCE_1_1.md`, `docs/TEST_MATRIX.md`, `docs/TEST_REPORT.md`, `docs/TRACEABILITY_MATRIX.md`, `docs/VISUAL_REFINEMENT_REPORT.md`.
- تقرير جديد: `docs/REPAIR_REPORT_2026-10-16.md`.
- اختبارات الجولة الحالية: `npm test -- --test-reporter=dot` — 61 ناجحًا، 0 فشل؛ `node --check` لملفات JavaScript الأساسية — ناجح.
- لا تُحمّل بيانات المعاينة تلقائيًا؛ يلزم `?demo=1` ومخزن فارغ، ولا تستبدل أداة التحميل أي بيانات قائمة.
