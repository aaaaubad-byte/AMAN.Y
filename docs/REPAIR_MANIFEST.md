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
