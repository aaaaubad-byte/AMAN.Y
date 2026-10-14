# مرجع البيانات والعلاقات

## جذر المخزن

المفتاح الوحيد: `AMAN_SHARED_REGISTRY_V2`. قيمة المفتاح كائن JSON ذو `schemaVersion`, `revision`, `updatedAt` ومجموعات مترابطة. كل المعرّفات المحلية نصوص ثابتة بعد الإنشاء (UUID-like/معرّف seed)، والتعديل يحافظ على `id`. بيانات seed مصطنعة.

| المجموعة | المعرّف الأساسي | الحقول المهمة | العلاقات والقيود |
|---|---|---|---|
| `customers` | `id` | `accountId`, `name`, `email`, `status`, `isSubscriber`, `createdAt`, `authHash` (للحسابات المحلية الجديدة) | الحساب منفصل عن الاشتراك. البريد فريد عند التسجيل في المحاكي. لا تخزن كلمة المرور التجريبية لحسابات seed. |
| `companies` | `id` | `name`, `prefixes[]`, `lengths[]`, `dailyRate`, `durations[]`, `taskSchedule{intervalDays,expenseAmount,unit}`, `active` | قيمة الاشتراك في `dailyRate` نقاط/يوم. قيمة تشغيل المهمة `expenseAmount` مالية. أطول بادئة مطابقة. |
| `packages` | `id` | `name`, `points`, `price`, `active` | نقاط عدد صحيح موجب؛ `price` قيمة مالية، لقطة الطلب مستقلة عن التعديل اللاحق. |
| `paymentMethods` | `id` | `name`, `summary`, `instructions`, `active` | تعليمات عرض، محفوظة بلقطة داخل كل طلب. لا يوجد اتصال مزود دفع. |
| `purchaseRequests` | `id` | `customerId`, `packageId`, `packageSnapshot{name,points,price}`, `paymentMethodId`, `paymentMethodSnapshot{name,instructions}`, `paymentReference`, `status`, `createdAt`, `reviewedAt`, `reviewNote`, `pointTransactionId` | `customerId → customers.id`; حالات `pending/approved/rejected`. لا تُراجع إلا pending. مرجع الدفع يمنع تكراره للعميل. |
| `numbers` | `id` | `customerId`, `number`, `companyId`, `addedAt`, `status`, `radar` اختياري | مالك واحد للشخص/الرقم، رقم فريد على مستوى النظام محليًا؛ `customerId → customers`, `companyId → companies`. إضافة الرقم لا تنشئ اشتراكًا. |
| `subscriptions` | `id` | `customerId`, `numberId`, `companyId`, `status`, `startsAt`, `endsAt`, `days`, `addedDays`, `rateSnapshot`, `pointsCost`, `previousSubscriptionId`, `createdAt` | `numberId → numbers`; المالك والشركة متطابقان. `rateSnapshot` لا يتغير عند تحديث company. سجل الفترة السابقة لا يستبدل. |
| `pointTransactions` | `id` | `customerId`, `type=credit/debit`, `points`, `source`, `sourceId`, `createdAt`, `description` | `customerId → customers`; الرصيد يشتق منها ولا يعدّل يدويًا. قيمة غير سالبة؛ رصيد لا يقل عن صفر. مصدر المعاملة يربط طلب الشراء أو الاشتراك. |
| `tasks` | `id` | `subscriptionId`, `numberId`, `customerId`, `companyId`, `dueAt`, `status`, `expenseAmount`, `executedAt`, `financeEntryId`, `previousTaskId` | روابط subscription/number/customer/company. الحالات planned/due/executed/cancelled. قيد مالي واحد فقط عند التنفيذ. |
| `financeEntries` | `id` | `kind=revenue/expense`, `amount`, `currency`, `sourceType`, `sourceId`, `reversalOf?`, `reversedBy?`, `customerId?`, `description`, `createdAt` | القيمة موجبة؛ قيد شراء مربوط بالطلب، وقيد مصروف مربوط بالمهمة. القيد اليدوي لا يلمس النقاط. منع التكرار بحسب المصدر للقيود الآلية، وقيد عكسي واحد فقط لكل قيد أصلي. لا يحذف العكس القيد الأصلي. |
| `operations` | `id` | `actorId`, `type`, `entityType`, `entityId`, `result`, `createdAt`, `summary` | سجل تدقيق مبسط، لا يخزن كلمات مرور أو تفاصيل إثبات حساسة. |
| `notifications` | `id` | `customerId`, `title`, `body`, `status`, `createdAt`, `readAt` | `customerId → customers.id`; محلية فقط. القراءة تخص العميل نفسه. |
| `notificationSettings` | مفتاح لكل نوع | `purchaseStatus`, `taskUpdates`, `subscriptionExpiring` | إعدادات نظام منفصلة عن إشعارات المسؤول. الثالثة لا تعمل خلفيًا في هذا النموذج. |
| `admin` | `id` | `name`, `email`, `darkMode` (قد يبقى `lockEnabled` في بيانات قديمة ولا يمثل ميزة فعالة) | مسؤول seed واحد محليًا؛ لا تمثل مصادقة أو صلاحيات آمنة. |
| `content` | `terms/privacy/contact` | نصوص | مدخلات إدارية محلية. |
| `idempotencyKeys` | `id` + `key` فريد | `createdAt`, `entityId` | تمنع تنفيذ نفس تأكيد الاشتراك أكثر من مرة في النموذج. في الإنتاج يلزم قيد unique دائم في قاعدة البيانات. |

## أهم العلاقات

```text
customers 1 ── * numbers 1 ── * subscriptions 1 ── * tasks
    │                 │                  │                 └── 0..1 financeEntries (مصروف)
    ├── * purchaseRequests ── 0..1 pointTransactions (credit)
    │          └── 0..1 financeEntries (إيراد معتمد)
    ├── * pointTransactions (دفتر الرصيد)
    └── * notifications
companies 1 ── * numbers/subscriptions/tasks
packages/paymentMethods تُربط بالطلب مع لقطة تاريخية
```

## دورة الرصيد

`availablePoints(customer) = SUM(pointTransactions.points WHERE type='credit') - SUM(... WHERE type='debit')`.

في بيانات الاختبار: المشترك `cus-demo-subscriber` لديه رصيد افتتاحي 500، واعتمادات مشتريات 300، واستخدامات اشتراك 270؛ الصافي 530. العميل منخفض الرصيد لديه 10 نقاط. العميل الجديد لديه صفر. لا تعتبر المبالغ المالية جزءًا من هذه المعادلة.

## النسخ الاحتياطي

توفر شاشة الحساب الإداري تنزيل JSON للمخزن الحالي. الملف قد يحتوي بيانات العملاء وهاشات كلمات مرور محلية، لذا يجب حفظه في مكان خاص. لا يوجد استيراد تلقائي في هذه النسخة؛ لا تغيّر مفتاح المخزن ولا تمسح بيانات الموقع قبل تصدير النسخة والتحقق منها.

## الترحيل

المخطط المنطقي المحلي `schemaVersion=2`. عند قراءة البيانات القديمة المعروفة تُملأ معرفات/حقول ناقصة وتحوّل أرصدة العميل القديمة إلى قيود افتتاحية؛ لا يُستبدل JSON تالف آليًا. يعاد seed فقط بقرار صريح من المستخدم. الترحيل ليس بديلًا عن تصدير نسخة احتياطية قبل نقل بيانات فعلية.

## الفهارس والقيود المقترحة في الإنتاج

- `customers.auth_user_id UNIQUE`, `numbers.number UNIQUE`, `customers.email` عبر Supabase Auth.
- فهارس `numbers.customer_id`, `subscriptions(number_id,status,ends_at)`, `purchase_requests(status,created_at)`, `tasks(status,due_at)`, `point_transactions(customer_id,created_at)`.
- `UNIQUE(point_transactions.source_type, point_transactions.source_id, point_transactions.type)` حيث يسمح المصدر بذلك، و`UNIQUE(finance_entries.source_type, finance_entries.source_id, finance_entries.kind)` للقيود الآلية.
- قيود CHECK للأرقام والمبالغ الموجبة والحالات، ومفاتيح أجنبية `ON DELETE RESTRICT` للسجلات المالية والتدقيقية.
- سياسة حذف/احتفاظ مؤرخة وموافق عليها؛ لا تحذف تاريخ العمليات بالاعتماد على cascade.

## الكيانات المستقلة المضافة للمعاينة

### `protectionPackages` — باقات الحماية

- `id`: معرّف الباقة.
- `companyId`: الشركة المالكة للباقة.
- `name`: الاسم الظاهر للعميل.
- `days`: مدة الحماية بالأيام.
- `pointsCost`: التكلفة بالنقاط الداخلية.
- `active`: إتاحة الباقة لعمليات جديدة.

هذه المجموعة مستقلة عن `packages` التي تمثل باقات شراء النقاط بسعر مالي وعدد نقاط.

### `protectionOperations` — سجل عمليات الحماية

يسجل كل عملية `subscribe` أو `extend` أو `renew` مع العميل والرقم والشركة والاشتراك المرتبط ولقطة الباقة والتكلفة وتاريخ البداية والنهاية ومفتاح منع التكرار عند استخدامه. حركة الخصم في `pointTransactions` ترتبط بمعرّف العملية، فلا يعتمد السجل التاريخي على السعر الحالي للباقة.

### إعدادات الشركة `taskSchedule`

تتضمن `createFirstOnActivation`, `intervalDays`, `visibleBeforeDays`, `expenseAmount`, `allowReschedule`, `createAfterExpiry`, `allowDuringGrace`, و`graceDays`. تستخدم واجهة الإدارة هذه الحقول، ويستخدمها محرك المعاينة عند إنشاء المهام وإعادة جدولتها وتنفيذها.


> ملاحظة توافق: الحقول القديمة `companies.dailyRate` و`companies.durations` تبقى فقط للتوافق مع بيانات المعاينة السابقة واختبارات المسار القديم. واجهة العميل الجديدة لا تستخدمها لتسعير الحماية؛ مصدر مدة الحماية وتكلفتها هو `protectionPackages`.
