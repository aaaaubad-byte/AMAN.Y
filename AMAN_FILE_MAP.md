# خريطة بنية المشروع

**المصدر:** قوائم الملفات الفعلية للفرع `feature/aman-audit-foundation` (مطابقة لفرع المصدر وقت الإنشاء)، ووظائف الملفات كما تصفها الوثائق التي قُرئت. **لم أقرأ مضمون ملفات `apps/` و`shared/` و`tests/`** عدا `sw.js` و`apps/admin-routes.js`؛ فأي وصف لوظيفة ملف مصدره وثيقة أو تسمية، وموسوم **(وثيقة)** أو **(تسمية)**. يُتحقق منه في المرحلة الثانية.

## 1. الجذر

| الملف/المجلد | الدور |
|---|---|
| `index.html` (1.9KB) | صفحة الدخول إلى الواجهتين (وثيقة) |
| `package.json` (230B) | سكربت الاختبار `node --test tests/*.test.js` بلا اعتماديات (وثيقة) |
| `serve.sh` | خادم ملفات ثابتة محلي (وثيقة) |
| `sw.js` (4.6KB) | Service Worker، `aman-static-v6`، تخزين مسبق لأصول ثابتة فقط، شبكة أولًا (قُرئ) |
| `HANDOFF.md`, `README.md` | تسليم تاريخي، وتشغيل (README عليه مدخل جديد في الأعلى) |
| `.github/workflows/deploy-pages.yml` | ينشر المعاينة على Pages عند كل دفع إلى `feature/local-preview-112` وعند التشغيل اليدوي (قُرئ). لا يعمل لدفعات هذا الفرع لأن الشرط مرتبط باسم الفرع الآخر |
| `fonts/` | خطا `AMAN-Arabic-Regular` و`AMAN-Arabic-Bold` (وثيقة) |
| لا `.gitignore` | غائب (وثيقة COMPLETION_PLAN، D-028) |

## 2. `shared/` — طبقة المنطق والبيانات (11 ملفًا)

| الملف | الحجم | الدور (وثيقة ما لم يُذكر) |
|---|---|---|
| `data.js` | 67KB | مخزن `AMAN_SHARED_REGISTRY_V2`، `read`/`transact`، قواعد العمل: الطلبات والأرقام والحماية والمهام والمال والعملاء والإشعارات، `readForCustomer`، PBKDF2 |
| `expiry.js` | 15KB | تصنيفات قرب الانتهاء لكل شركة والتقييم والإشعارات |
| `autorenew.js` | 14KB | التجديد التلقائي وحارس التكرار (U15) |
| `finance-reports.js` | 10KB | تقارير مالية ورسوم ونطاقات (U12) |
| `system.js` | 20KB | استيراد النسخ، حالة النظام، السلة، سجل الإعدادات، فحوص السلامة، المطابقة (U13) |
| `support.js` | 24KB | التذاكر والعروض والقسائم (U14) |
| `ui.js` | 3.9KB | أدوات عرض مشتركة (`esc/fmt/date/day`) |
| `a11y.js` / `a11y.css` | 5.6KB / 2.5KB | وصول: تركيز، رابط تخطٍ، حبس نوافذ |
| `pwa.js` | 4.6KB | تثبيت وتحديث PWA |
| `i18n.js` | 10KB | ترجمة؛ **غير محمّلة في أي صفحة** (وثيقة COMPLETION_PLAN، D-025) |

## 3. `apps/` — تطبيقا العميل والإدارة

### 3.1 العميل (8 ملفات + CSS/HTML/manifest)
| الملف | الدور |
|---|---|
| `customer.html` / `customer.js` (54KB) | غلاف: توجيه `#/route`، سجل رجوع، نوافذ سفلية، عمليات عبر `AmanData` |
| `customer-screens.js` (42KB) | بناة الشاشات (عرض فقط) |
| `customer-kit.js` (16KB) | مكونات واجهة |
| `customer-support.js` (7KB) | أقسام الدعم تُلحق بشاشة «المساعدة» (وثيقة) |
| `customer-autorenew.js` (5KB) | قسم التجديد التلقائي في «الاشتراكات» (وثيقة) |
| `customer.css`، `customer.webmanifest` | تصميم وPWA |

**مسارات العميل (وثيقة):** `home`، `radar` (اسم قديم يفتح الاشتراكات)، `numbers`، `buy`، `operations`، `points`، `orders`، `notifications`، `account`، `settings`، `security`، `help`؛ تبويبات سفلية خمسة: الاشتراكات، الأرقام، الرئيسية، شراء نقاط، العمليات.

### 3.2 الإدارة (13 ملفًا)
| الملف | الحجم | الدور |
|---|---|---|
| `admin.html` / `admin.js` | 49KB | غلاف: توجيه، نماذج، نوافذ، عمليات |
| `admin-screens.js` | 77KB | معظم الشاشات (وثيقة) |
| `admin-model.js` | 14KB | نموذج عرض: تصنيف المهام، تجميع، الشارات (وثيقة) |
| `admin-kit.js` | 11KB | مكونات الواجهة |
| `admin-expiry.js` | 21KB | شاشات تصنيفات قرب الانتهاء (`expiry`، `expiry-alerts`) |
| `admin-finance.js` | 17KB | تقارير وإقفال يومي (`reports`، `daily-close`) |
| `admin-system.js` | 21KB | شاشات `system/*` |
| `admin-support.js` | 18KB | `support`، `support-ticket`، `promotions`، `coupons` |
| `admin-autorenew.js` | 6KB | `autorenew` |
| `admin-routes.js` | 1.7KB | آباء المسارات عند الدخول المباشر (قُرئ) |
| `admin.css`، `admin.webmanifest` | | تصميم وPWA |

**مسارات الإدارة المذكورة (وثيقة وكود):** `home`، `requests/<pending|approved|rejected|all>`، `request/:id`، `tasks/<available|all>`، `task/:id`، `customers/<all|subscribers|users>`، `customer/:id[/numbers|requests|subs|ops]`، `numbers`، `number/:id`، `finance[/revenue|expense]`، `finance-entry/:id`، `more`، `companies`، `company/*`، `task-settings`، `packages`، `package/*`، `protection`، `payments`، `notices`، `content`، `audit`، `search`، `account`؛ ومن U10–U15: `unrecorded`، `expiry`، `expiry/:id`، `expiry-alerts`، `reports`، `daily-close`، `system[/backup[/preview]]`، `support`، `support-ticket`، `promotions`، `coupons`، `autorenew`. تبويبات الإدارة الخمسة: الرئيسية، الطلبات، المهام، العملاء، المزيد.

### 3.3 `apps/icons/`
أيقونات SVG للتطبيقين وmaskable (محتوى المجلد لم يُسرد تفصيلًا).

## 4. `tests/` — 11 ملفًا + بيانات اختبار

| الملف | الحجم | يختبر (تسمية/وثيقة) |
|---|---|---|
| `core.test.js` | 39KB | قواعد البيانات المحلية وقواعد العمل |
| `customer.test.js` | 47KB | واجهة العميل (شاشات وتسرب وتهريب) |
| `admin.test.js` | 25KB | واجهة الإدارة |
| `reference.test.js` | 8KB | ضمانات المراجع/الوثائق |
| `customers-admin.test.js` / `-ui.test.js` | 13KB / 6.6KB | وحدة العملاء U10 |
| `expiry.test.js` | 17KB | تصنيفات الانتهاء U11 |
| `finance-reports.test.js` | 5KB | تقارير U12 |
| `system.test.js` | 15KB | وحدة النظام U13 (**لم يُشغَّل قط** وفق RESUME_POINT) |
| `support.test.js` | 7KB | الدعم U14 |
| `autorenew.test.js` | 10KB | التجديد التلقائي U15 (اختبارات الحارس **لم تُشغَّل**) |
| `fixture-data.js` | 34KB | بيانات اصطناعية للاختبار فقط |

**تنبيه:** بعض الاختبارات نصية تفحص نص الكود والوثائق (وثيقة COMPLETION_PLAN C-14)؛ تعديل ملف نصي قد يكسرها دون خلل وظيفي. لذلك عدّلت `README.md` بإضافة المدخل في أعلاه **دون تغيير أي نص أصلي**، ولم أشغّل الاختبارات للتأكد.

## 5. `docs/` — 34 ملفًا
انظر `AMAN_SOURCE_REGISTER.md` (تصنيف كل ملف وحالته).

## 6. ما لم يمكن التحقق منه بعد
- مواقع الشاشات والوظائف داخل `admin-screens.js` و`customer-screens.js` (ملفات كبيرة).
- ربط الوحدات (U10–U15) فعليًا بالصفحات وترتيب تحميل السكربتات.
- محتوى `apps/icons/` و`fonts/` وملفات PWA.
- أي ملفات بلا مرجع في `PRECACHE` أو الصفحات.

تُنجز هذه التحققات في المرحلة الثانية (انظر `AMAN_AUDIT_PLAN.md`).
