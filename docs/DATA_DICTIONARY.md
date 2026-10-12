# قاموس الحقول المحلي

هذا يصف كائنات JavaScript المخزنة في JSON تحت `AMAN_SHARED_REGISTRY_V1`. لا يصف مخطط Supabase المنفذ؛ المقترح الإنتاجي في `SUPABASE_REFERENCE.sql` منفصل.

## اصطلاح الأنواع

- `string`: نص UTF-8. المعرّفات وأرقام الهاتف والمراجع نصوص حتى لا تفقد الأصفار أو التنسيق.
- `number/int`: قيمة JS رقمية؛ `int` عدد صحيح. المال رقم عشري موجب (وفي الإنتاج يفضل `numeric`/الوحدات الصغرى بدل floating point).
- `boolean`: `true/false`.
- `ISO string`: تاريخ ووقت UTC بصيغة ISO-8601، مثل `2026-10-12T00:00:00.000Z`.
- `array<T>`: قائمة مرتبة من القيم المحددة.
- `object`: كائن فرعي موضح أدناه.
- `null?`: اختياري/قد لا تكون له قيمة.

## الكيانات والحقول

### `customers` — حسابات العملاء

| الحقل | النوع | القاعدة/العلاقة |
|---|---|---|
| `id` | string | PK ثابت؛ ينشأ عند التسجيل/seed. |
| `accountId` | string | رقم عرض للحساب، ليس صلاحية. |
| `name` | string | مطلوب للتسجيل. |
| `email` | string | مطلوب وفريد (مطابقة التسجيل دون حساسية حالة الأحرف). |
| `status` | string | محليًا `active`، ويحتفظ بالحقول القديمة. |
| `isSubscriber` | boolean | منفصل عن الحساب؛ true بعد أول طلب شراء نقاط معتمد. |
| `createdAt` | ISO string | وقت الإنشاء. |
| `authHash` | string? | للحساب المنشأ محليًا؛ SHA-256 من WebCrypto للتجربة فقط، لا يصلح لمصادقة إنتاج. |

**ينشأ/يتغير:** تهيئة seed/ترحيل/تسجيل جديد؛ `reviewPurchase` يغير `isSubscriber` عند الاعتماد.

### `companies` — الشركات والجدولة

| الحقل | النوع | القاعدة/العلاقة |
|---|---|---|
| `id` | string | PK ثابت. |
| `name` | string | مطلوب. |
| `prefixes` | array<string> | بادئات رقمية كنص؛ لا اختيار شركة يدويًا من العميل. أطول بادئة مطابقة تفوز. |
| `lengths` | array<int> | أطوال رقم الهاتف المقبولة. |
| `dailyRate` | int | نقاط AMAN لكل يوم؛ موجب وصحيح. |
| `durations` | array<int> | أيام الاشتراك المقترحة؛ موجبة وصحيحة. |
| `taskSchedule` | object | `{intervalDays:int, expenseAmount:number, unit:string}`؛ فاصلة أيام صحيحة موجبة وقيمة مالية موجبة. |
| `active` | boolean | الشركة غير النشطة لا تقبل أرقامًا/تفعيلًا جديدًا. |

**ينشأ/يتغير:** الإدارة عبر `saveCompany`; تظهر قيمها في رقم العميل والاشتراك الجديد والمهام القادمة.

### `packages` — باقات النقاط

`id:string` PK؛ `name:string` مطلوب؛ `points:int` موجب؛ `price:number` موجب بالريال؛ `active:boolean`. تعديل سجل الباقة لا يمس `packageSnapshot` في الطلب السابق. إدارة عبر `savePackage`.

### `paymentMethods` — وسائل الدفع

`id:string` PK؛ `name:string` و`instructions:string` مطلوبان؛ `summary:string` وصف موجز؛ `active:boolean`. لا توجد معاملة دفع حقيقية. الطلب يحفظ لقطة التعليمات/الاسم.

### `purchaseRequests` — طلبات الشراء

| الحقل | النوع | القاعدة/العلاقة |
|---|---|---|
| `id` | string | PK ثابت. |
| `customerId` | string | FK منطقي إلى `customers.id`. |
| `packageId` | string | FK منطقي إلى `packages.id`؛ قد تكون الباقة مؤرشفة/غير متاحة لاحقًا. |
| `packageSnapshot` | object | `{name:string,points:int,price:number}` لقطة السعر والنقاط وقت الطلب. |
| `paymentMethodId` | string | FK منطقي إلى `paymentMethods.id`. |
| `paymentMethodSnapshot` | object | `{name:string,instructions:string}` لقطة تاريخية. |
| `paymentReference` | string | مطلوب؛ فريد لكل عميل في الخدمة المحلية. |
| `status` | string | `pending` أو `approved` أو `rejected`. |
| `createdAt` | ISO string | وقت الطلب. |
| `reviewedAt` | ISO string? | غائب أثناء التعليق؛ يسجل عند قرار الإدارة. |
| `reviewNote` | string? | ملاحظة إدارية، دون إثبات مالي حساس. |
| `pointTransactionId` | string? | رابط إلى معاملة الائتمان عند الاعتماد. |

**ينشأ/يتغير:** `createPurchase` ينشئ معلقًا دون رصيد؛ `reviewPurchase` يراجع المعلق مرة واحدة ويضيف ledger/revenue فقط عند الاعتماد.

### `numbers` — أرقام العميل

`id:string` PK؛ `customerId:string` FK منطقي للمالك؛ `number:string` بعد تحويل الأرقام العربية إلى اللاتينية وفريد على النظام المحلي؛ `companyId:string` FK منطقي؛ `addedAt:ISO string`؛ `status:string` حالة محلية؛ `radar:boolean?` متابعة اختيارية. `addNumber` يتحقق من الملكية، والطول، والبادئة والشركة الفعالة؛ لا ينشئ اشتراكًا أو خصمًا.

### `subscriptions` — فترات الاشتراك

`id:string` PK؛ `customerId:string`, `numberId:string`, `companyId:string` علاقات متسقة؛ `status:string` (نشط/ممدد تاريخيًا/منتهٍ)؛ `startsAt`, `endsAt`, `createdAt:ISO string`؛ `days:int` مدة/أيام تراكمية؛ `addedDays:int?` أيام عملية التمديد الحالية؛ `rateSnapshot:int` نقاط/يوم وقت العملية؛ `pointsCost:int` الخصم لهذه العملية؛ `previousSubscriptionId:string?` مرجع الفترة السابقة. `activateSubscription` ينشئ الفترة ومعاملة الخصم ومهمة أولى داخل معاملة المخزن المحلي؛ لا يعتمد تمديدًا إداريًا.

### `pointTransactions` — دفتر نقاط AMAN

`id:string` PK؛ `customerId:string` FK؛ `type:string` إما `credit` أو `debit`؛ `points:number` غير سالب في بيانات seed (المعاملات العادية موجبة وصحيحة)؛ `source:string` مثل `seed/purchase/subscription/migration`؛ `sourceId:string` معرف المصدر؛ `createdAt:ISO string`؛ `description:string`. الرصيد المشتق هو مجموع credit ناقص debit ولا يعدل مباشرة.

### `tasks` — مهام تشغيلية مجدولة

`id:string` PK؛ `subscriptionId`, `numberId`, `customerId`, `companyId:string` علاقات؛ `dueAt:ISO string`؛ `status:string` (`planned`, `due`, `executed`, `cancelled`)؛ `expenseAmount:number` مصروف مالي موجب؛ `createdAt:ISO string`؛ `executedAt:ISO string?`؛ `financeEntryId:string?`؛ `previousTaskId:string?`. `executeTask` يتحقق من الاستحقاق وعدم التنفيذ السابق ويكتب مصروفًا واحدًا وتاريخ التنفيذ والمهمة التالية؛ لا إلغاء عبر شاشة التنفيذ.

### `financeEntries` — دفتر المال بالريال

`id:string` PK؛ `kind:string` (`revenue` أو `expense`)؛ `amount:number` موجب؛ `currency:string` افتراضي `YER`؛ `sourceType:string` (`purchase/task/manual` وغيرها للترحيل)؛ `sourceId:string?`؛ `customerId:string?`؛ `description:string`؛ `createdAt:ISO string`. الإيراد الآلي مرتبط بطلب معتمد، والمصروف الآلي بمهمة منفذة. القيد اليدوي لا يؤثر على دفتر النقاط.

### `operations` — التدقيق المحلي

`id:string` PK؛ `actorId:string` هو معرّف عميل/إدارة تجريبي أو `system`؛ `type:string` اسم الحدث؛ `entityType:string` نوع الكيان؛ `entityId:string?`؛ `result:string` (`success` في المعاملات المحفوظة)؛ `createdAt:ISO string`؛ `summary:string` وصف آمن. يسجل `transact` الحدث والبيانات في الحفظ نفسه. لا يضم كلمة مرور أو محتوى إثبات حساسًا.

### `notifications` و`notificationSettings`

- الإشعار: `id:string`، `customerId:string` FK، `title:string`، `body:string`، `status:string` (`delivered-local`)، `createdAt:ISO string`، `readAt:ISO string?`.
- الإعداد: `purchaseStatus:boolean`, `taskUpdates:boolean`, `subscriptionExpiring:boolean`. أول نوعين يوجهان إشعارًا محليًا؛ لا يوجد عامل خلفي للقرب من الانتهاء.
- `sendLocalNotice` ينشئ إشعارات للجمهور، `markNoticeRead` يسمح لمالك العميل وحده بتسجيل القراءة.

### `admin`, `content`, `idempotencyKeys`

- `admin`: `id/name/email:string`, `darkMode/lockEnabled:boolean`. هو إعداد seed تجريبي؛ `lockEnabled` محفوظ ولكنه ليس قفلًا أمنيًا.
- `content`: مفاتيح ثابتة `terms/privacy/contact:string` تحفظها الإدارة عبر `updateContent`.
- المفتاح: `id:string`, `key:string` فريد محليًا داخل العمليات، `createdAt:ISO string`, `entityId:string`. يمنع إعادة نفس مفتاح تأكيد الاشتراك في المخزن؛ في الإنتاج يلزم قيد قاعدة دائم.

## قواعد التحقق والعلاقات المشتركة

- كل مجموعة لها `id` غير فارغ وفريد؛ كل رقم يشير إلى مالك وشركة؛ كل اشتراك يطابق رقم المالك وشركته؛ كل مهمة تشير إلى اشتراك ورقم قائمين؛ كل طلب ونقاط/إشعار يشير إلى عميل قائم؛ كل قيد مالي موجب؛ لا يسمح برصيد نقاط سالب.
- `operations` تحوي حدثًا لكل `transact` ناجح؛ فشل validation أو كتابة التخزين لا يعلن نجاحًا ولا يستبدل الحالة المخزنة.
- أنواع الحقول في هذا النموذج تمثيل JavaScript؛ أنواع SQL وقيود الإنتاج مرئية في `SUPABASE_REFERENCE.sql`.
