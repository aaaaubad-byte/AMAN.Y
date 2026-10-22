-- AMAN production schema proposal only. NOT deployed or tested against a Supabase project.
-- Review business decisions and security with the project owner before applying.
create extension if not exists pgcrypto;

create type public.purchase_status as enum ('pending','approved','rejected');
create type public.point_entry_type as enum ('credit','debit');
create type public.subscription_status as enum ('active','superseded','expired','cancelled');
create type public.task_status as enum ('planned','due','executed','cancelled');
create type public.finance_kind as enum ('revenue','expense');

create table public.customer_profiles (
  user_id uuid primary key references auth.users(id) on delete restrict,
  account_id text not null unique default ('AMAN-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,12))),
  display_name text not null,
  is_subscriber boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.admin_roles (
  user_id uuid primary key references auth.users(id) on delete restrict,
  role text not null default 'admin' check (role = 'admin'),
  created_at timestamptz not null default now()
);

-- Create a customer profile for each newly registered Auth user; role is never taken from client metadata.
create or replace function public.handle_new_aman_user()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  insert into public.customer_profiles(user_id,display_name)
  values(new.id,coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'),''),nullif(split_part(new.email,'@',1),''),'عميل جديد'))
  on conflict(user_id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created_aman on auth.users;
create trigger on_auth_user_created_aman after insert on auth.users
for each row execute function public.handle_new_aman_user();

create or replace function public.is_aman_admin()
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from public.admin_roles r where r.user_id=auth.uid() and r.role = 'admin');
$$;

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  prefixes text[] not null check (cardinality(prefixes)>0),
  number_lengths smallint[] not null check (cardinality(number_lengths)>0),
  daily_rate_points integer not null check (daily_rate_points>0),
  allowed_durations_days integer[] not null check (cardinality(allowed_durations_days)>0),
  task_interval_days integer not null check (task_interval_days>0),
  task_expense_amount numeric(14,2) not null check (task_expense_amount>0),
  currency char(3) not null default 'YER',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.points_packages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  points integer not null check (points>0),
  price_amount numeric(14,2) not null check (price_amount>0),
  currency char(3) not null default 'YER',
  is_available boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  summary text not null default '',
  instructions text not null,
  is_available boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.customer_numbers (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customer_profiles(user_id) on delete restrict,
  company_id uuid not null references public.companies(id) on delete restrict,
  phone_e164_or_national text not null unique,
  added_at timestamptz not null default now(),
  status text not null default 'active' check (status in ('active','inactive','transferred'))
);
create index customer_numbers_owner_idx on public.customer_numbers(customer_id);



create table public.purchase_requests (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customer_profiles(user_id) on delete restrict,
  package_id uuid references public.points_packages(id) on delete set null,
  package_snapshot jsonb not null,
  payment_method_id uuid references public.payment_methods(id) on delete set null,
  payment_method_snapshot jsonb not null,
  payment_reference text not null,
  proof_object_path text,
  status public.purchase_status not null default 'pending',
  reviewed_by uuid references auth.users(id) on delete restrict,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  unique(customer_id,payment_reference),
  check ((status='pending' and reviewed_at is null) or (status<>'pending' and reviewed_at is not null))
);
create index purchase_requests_queue_idx on public.purchase_requests(status,created_at);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customer_profiles(user_id) on delete restrict,
  number_id uuid not null references public.customer_numbers(id) on delete restrict,
  company_id uuid not null references public.companies(id) on delete restrict,
  status public.subscription_status not null default 'active',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  days_added integer not null check (days_added>0),
  daily_rate_points_snapshot integer not null check (daily_rate_points_snapshot>0),
  points_cost integer not null check (points_cost>0),
  previous_subscription_id uuid references public.subscriptions(id) on delete restrict,
  created_at timestamptz not null default now(),
  check (ends_at>starts_at)
);
create index subscriptions_owner_idx on public.subscriptions(customer_id,status,ends_at);
create index subscriptions_number_idx on public.subscriptions(number_id,ends_at desc);

create table public.point_transactions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customer_profiles(user_id) on delete restrict,
  entry_type public.point_entry_type not null,
  points integer not null check (points>0),
  source_type text not null check (source_type in ('purchase','subscription','adjustment','migration')),
  source_id uuid not null,
  description text not null,
  created_at timestamptz not null default now(),
  unique(source_type,source_id,entry_type)
);
create index point_transactions_owner_time_idx on public.point_transactions(customer_id,created_at desc);

-- Current local model: a phone record is separate from account links and protection ownership.
alter table public.customer_numbers alter column customer_id drop not null;
create table public.number_customer_links (
  number_id uuid not null references public.customer_numbers(id) on delete restrict,
  customer_id uuid not null references public.customer_profiles(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key(number_id,customer_id)
);
alter table public.number_customer_links enable row level security;
create policy number_links_read_owner_or_admin on public.number_customer_links for select to authenticated using (customer_id=auth.uid() or public.is_aman_admin());
create policy number_links_admin_manage on public.number_customer_links for all to authenticated using (public.is_aman_admin()) with check (public.is_aman_admin());

create table public.protection_packages (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete restrict,
  name text not null, duration_days integer not null check(duration_days>0), points_cost integer not null check(points_cost>0),
  is_available boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.company_task_settings (
  company_id uuid primary key references public.companies(id) on delete restrict,
  create_first_on_activation boolean not null default false, interval_days integer not null check(interval_days>0),
  visible_before_days integer not null default 0 check(visible_before_days>=0), expense_amount numeric(14,2) not null check(expense_amount>0),
  allow_reschedule boolean not null default false, create_after_expiry boolean not null default false,
  allow_during_grace boolean not null default false, grace_days integer not null default 0 check(grace_days>=0), updated_at timestamptz not null default now()
);
create table public.protection_operations (
  id uuid primary key default gen_random_uuid(), customer_id uuid not null references public.customer_profiles(user_id) on delete restrict,
  number_id uuid not null references public.customer_numbers(id) on delete restrict, subscription_id uuid not null references public.subscriptions(id) on delete restrict,
  package_id uuid references public.protection_packages(id) on delete set null, operation_type text not null check(operation_type in ('subscribe','extend','renew')),
  package_snapshot jsonb not null, points_cost integer not null check(points_cost>0), starts_at timestamptz not null, ends_at timestamptz not null,
  idempotency_key text, created_at timestamptz not null default now(), unique(customer_id,idempotency_key)
);
alter table public.protection_packages enable row level security;
alter table public.company_task_settings enable row level security;
alter table public.protection_operations enable row level security;
create policy protection_packages_read_available on public.protection_packages for select to authenticated using (is_available or public.is_aman_admin());
create policy protection_packages_admin_manage on public.protection_packages for all to authenticated using (public.is_aman_admin()) with check (public.is_aman_admin());
create policy company_task_settings_admin_only on public.company_task_settings for all to authenticated using (public.is_aman_admin()) with check (public.is_aman_admin());
create policy protection_operations_read_owner_or_admin on public.protection_operations for select to authenticated using (customer_id=auth.uid() or public.is_aman_admin());
alter table public.point_transactions drop constraint if exists point_transactions_source_type_check;
alter table public.point_transactions add constraint point_transactions_source_type_check check(source_type in ('purchase','subscription','protection_operation','adjustment','migration'));

-- Subscriber is a derived classification, not a client-editable account flag.
create or replace view public.customer_subscriber_status with (security_invoker=true) as
select c.user_id, exists(select 1 from public.purchase_requests r where r.customer_id=c.user_id and r.status='approved') as is_subscriber
from public.customer_profiles c;


create view public.customer_point_balances with (security_invoker=true) as
select customer_id,
  coalesce(sum(case when entry_type='credit' then points else -points end),0)::bigint as available_points
from public.point_transactions group by customer_id;

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.subscriptions(id) on delete restrict,
  customer_id uuid not null references public.customer_profiles(user_id) on delete restrict,
  number_id uuid not null references public.customer_numbers(id) on delete restrict,
  company_id uuid not null references public.companies(id) on delete restrict,
  due_at timestamptz not null,
  status public.task_status not null default 'planned',
  expense_amount numeric(14,2) not null check (expense_amount>0),
  currency char(3) not null default 'YER',
  executed_at timestamptz,
  executed_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  check ((status='executed' and executed_at is not null) or (status<>'executed' and executed_at is null))
);
create index tasks_queue_idx on public.tasks(status,due_at);

create table public.finance_entries (
  id uuid primary key default gen_random_uuid(),
  kind public.finance_kind not null,
  amount numeric(14,2) not null check (amount>0),
  currency char(3) not null default 'YER',
  source_type text not null check (source_type in ('purchase','task','manual','reversal')),
  source_id uuid,
  reversal_of_entry_id uuid references public.finance_entries(id) on delete restrict,
  customer_id uuid references public.customer_profiles(user_id) on delete restrict,
  description text not null,
  created_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  check ((source_type='reversal' and reversal_of_entry_id is not null) or (source_type<>'reversal' and reversal_of_entry_id is null))
);
create unique index finance_source_once_idx on public.finance_entries(source_type,source_id,kind) where source_id is not null and source_type in ('purchase','task');
create index finance_created_idx on public.finance_entries(created_at desc);
create unique index finance_one_reversal_per_entry_idx on public.finance_entries(reversal_of_entry_id) where reversal_of_entry_id is not null;

create table public.customer_notifications (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customer_profiles(user_id) on delete restrict,
  title text not null,
  body text not null,
  delivery_status text not null default 'queued' check (delivery_status in ('queued','delivered','failed','read')),
  channel text not null default 'in_app',
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create table public.admin_notification_settings (
  kind text primary key check (kind in ('purchase_status','task_updates','subscription_expiring')),
  enabled boolean not null default true,
  updated_by uuid references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now()
);

insert into public.admin_notification_settings(kind,enabled) values
  ('purchase_status',true),('task_updates',true),('subscription_expiring',true)
on conflict(kind) do nothing;

create table public.system_content (
  key text primary key check (key in ('terms','privacy','contact')),
  body text not null,
  updated_by uuid references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now()
);

create table public.idempotency_keys (
  actor_id uuid not null references auth.users(id) on delete restrict,
  key text not null,
  operation text not null,
  result_entity_id uuid,
  created_at timestamptz not null default now(),
  primary key(actor_id,key)
);

create table public.audit_events (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete restrict,
  event_type text not null,
  entity_type text not null,
  entity_id uuid,
  outcome text not null check (outcome in ('success','rejected','failed')),
  before_values jsonb,
  after_values jsonb,
  safe_summary text not null,
  created_at timestamptz not null default now()
);
create index audit_events_entity_idx on public.audit_events(entity_type,entity_id,created_at desc);

-- Never trust a client-side role or client-computed balance. Sensitive writes run as RPC.
alter table public.customer_profiles enable row level security;
alter table public.admin_roles enable row level security;
alter table public.companies enable row level security;
alter table public.points_packages enable row level security;
alter table public.payment_methods enable row level security;
alter table public.customer_numbers enable row level security;
alter table public.purchase_requests enable row level security;
alter table public.subscriptions enable row level security;
alter table public.point_transactions enable row level security;
alter table public.tasks enable row level security;
alter table public.finance_entries enable row level security;
alter table public.customer_notifications enable row level security;
alter table public.admin_notification_settings enable row level security;
alter table public.system_content enable row level security;
alter table public.idempotency_keys enable row level security;
alter table public.audit_events enable row level security;

create policy profiles_read_self_or_admin on public.customer_profiles for select to authenticated using (user_id=auth.uid() or public.is_aman_admin());
create policy admin_role_read_self_or_admin on public.admin_roles for select to authenticated using (user_id=auth.uid() or public.is_aman_admin());
create policy companies_read_active on public.companies for select to authenticated using (is_active or public.is_aman_admin());
create policy companies_admin_all on public.companies for all to authenticated using (public.is_aman_admin()) with check (public.is_aman_admin());
create policy packages_read_available on public.points_packages for select to authenticated using (is_available or public.is_aman_admin());
create policy packages_admin_all on public.points_packages for all to authenticated using (public.is_aman_admin()) with check (public.is_aman_admin());
create policy payment_methods_read_available on public.payment_methods for select to authenticated using (is_available or public.is_aman_admin());
create policy payment_methods_admin_all on public.payment_methods for all to authenticated using (public.is_aman_admin()) with check (public.is_aman_admin());
create policy numbers_read_owner_or_admin on public.customer_numbers for select to authenticated using (public.is_aman_admin() or exists(select 1 from public.number_customer_links l where l.number_id=id and l.customer_id=auth.uid()));
create policy requests_read_owner_or_admin on public.purchase_requests for select to authenticated using (customer_id=auth.uid() or public.is_aman_admin());
create policy subscriptions_read_owner_or_admin on public.subscriptions for select to authenticated using (customer_id=auth.uid() or public.is_aman_admin());
create policy points_read_owner_or_admin on public.point_transactions for select to authenticated using (customer_id=auth.uid() or public.is_aman_admin());
create policy tasks_read_owner_or_admin on public.tasks for select to authenticated using (customer_id=auth.uid() or public.is_aman_admin());
create policy finance_admin_read on public.finance_entries for select to authenticated using (public.is_aman_admin());
create policy notices_read_owner_or_admin on public.customer_notifications for select to authenticated using (customer_id=auth.uid() or public.is_aman_admin());
create policy settings_admin_only on public.admin_notification_settings for all to authenticated using (public.is_aman_admin()) with check (public.is_aman_admin());
create policy content_read on public.system_content for select to authenticated using (true);
create policy content_admin_update on public.system_content for all to authenticated using (public.is_aman_admin()) with check (public.is_aman_admin());
create policy audit_admin_read on public.audit_events for select to authenticated using (public.is_aman_admin());

-- Customer-owned number registration: company is inferred from the longest active prefix.
create or replace function public.add_customer_number(p_number text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare digits text; co public.companies%rowtype; new_id uuid;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  digits := regexp_replace(translate(coalesce(p_number,''),'٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹','01234567890123456789'),'[^0-9]','','g');
  if digits = '' then raise exception 'invalid_number'; end if;
  select c.* into co from public.companies c
   where c.is_active and exists(select 1 from unnest(c.prefixes) p where digits like p || '%')
   order by (select max(length(p)) from unnest(c.prefixes) p where digits like p || '%') desc
   limit 1;
  if not found then raise exception 'company_prefix_not_found'; end if;
  if not (char_length(digits) = any(co.number_lengths)) then raise exception 'invalid_number_length'; end if;
  select id into new_id from public.customer_numbers where phone_e164_or_national=digits for update;
  if new_id is null then
    insert into public.customer_numbers(customer_id,company_id,phone_e164_or_national)
     values(null,co.id,digits) returning id into new_id;
  elsif not exists(select 1 from public.customer_numbers where id=new_id and company_id=co.id) then
    raise exception 'number_company_conflict';
  end if;
  insert into public.number_customer_links(number_id,customer_id) values(new_id,auth.uid()) on conflict do nothing;
  if not found then raise exception 'number_already_linked_to_account'; end if;
  insert into public.audit_events(actor_id,event_type,entity_type,entity_id,outcome,safe_summary)
   values(auth.uid(),'number_added','customer_number',new_id,'success','إضافة رقم للعميل دون إنشاء اشتراك');
  return new_id;
exception when unique_violation then raise exception 'number_already_registered';
end; $$;

-- Manager adds a number for a selected customer; no subscription or points are created.
create or replace function public.admin_add_customer_number(p_customer_id uuid,p_number text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare digits text; co public.companies%rowtype; new_id uuid;
begin
  if not public.is_aman_admin() then raise exception 'admin_required'; end if;
  if not exists(select 1 from public.customer_profiles where user_id=p_customer_id) then raise exception 'customer_not_found'; end if;
  digits := regexp_replace(translate(coalesce(p_number,''),'٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹','01234567890123456789'),'[^0-9]','','g');
  if digits = '' then raise exception 'invalid_number'; end if;
  select c.* into co from public.companies c
   where c.is_active and exists(select 1 from unnest(c.prefixes) p where digits like p || '%')
   order by (select max(length(p)) from unnest(c.prefixes) p where digits like p || '%') desc
   limit 1;
  if not found then raise exception 'company_prefix_not_found'; end if;
  if not (char_length(digits) = any(co.number_lengths)) then raise exception 'invalid_number_length'; end if;
  select id into new_id from public.customer_numbers where phone_e164_or_national=digits for update;
  if new_id is null then
    insert into public.customer_numbers(customer_id,company_id,phone_e164_or_national)
     values(null,co.id,digits) returning id into new_id;
  elsif not exists(select 1 from public.customer_numbers where id=new_id and company_id=co.id) then
    raise exception 'number_company_conflict';
  end if;
  insert into public.number_customer_links(number_id,customer_id) values(new_id,p_customer_id) on conflict do nothing;
  if not found then raise exception 'number_already_linked_to_customer'; end if;
  insert into public.audit_events(actor_id,event_type,entity_type,entity_id,outcome,safe_summary)
   values(auth.uid(),'admin_number_added','customer_number',new_id,'success','إضافة رقم للعميل من الإدارة دون إنشاء اشتراك');
  return new_id;
exception when unique_violation then raise exception 'number_already_registered';
end; $$;

-- Purchase creation stores immutable package/payment snapshots; no points or income until admin approval.
create or replace function public.create_points_purchase(p_package_id uuid,p_payment_method_id uuid,p_payment_reference text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare p public.points_packages%rowtype; m public.payment_methods%rowtype; new_id uuid; ref text;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  ref := nullif(trim(p_payment_reference),'');
  if ref is null then raise exception 'payment_reference_required'; end if;
  select * into p from public.points_packages where id=p_package_id and is_available;
  if not found then raise exception 'package_unavailable'; end if;
  select * into m from public.payment_methods where id=p_payment_method_id and is_available;
  if not found then raise exception 'payment_method_unavailable'; end if;
  insert into public.purchase_requests(customer_id,package_id,package_snapshot,payment_method_id,payment_method_snapshot,payment_reference)
  values(auth.uid(),p.id,jsonb_build_object('name',p.name,'points',p.points,'price',p.price_amount,'currency',p.currency),m.id,jsonb_build_object('name',m.name,'summary',m.summary,'instructions',m.instructions),ref)
  returning id into new_id;
  insert into public.audit_events(actor_id,event_type,entity_type,entity_id,outcome,safe_summary)
   values(auth.uid(),'purchase_requested','purchase_request',new_id,'success','إنشاء طلب شراء نقاط معلق');
  return new_id;
exception when unique_violation then raise exception 'payment_reference_already_used';
end; $$;

-- A customer may mark only their own notification as read; they cannot edit its contents.
create or replace function public.mark_aman_notification_read(p_notification_id uuid)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare updated_id uuid;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  update public.customer_notifications set read_at=coalesce(read_at,now()),delivery_status=case when delivery_status='delivered' then 'read' else delivery_status end
   where id=p_notification_id and customer_id=auth.uid() returning id into updated_id;
  if updated_id is null then raise exception 'notification_not_found'; end if;
  insert into public.audit_events(actor_id,event_type,entity_type,entity_id,outcome,safe_summary)
   values(auth.uid(),'notification_read','customer_notification',updated_id,'success','قراءة إشعار');
  return updated_id;
end; $$;

-- Manager-only manual financial entry. It does not touch the point ledger.
create or replace function public.add_manual_finance_entry(p_kind public.finance_kind,p_amount numeric,p_currency char(3),p_description text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare new_id uuid; desc_text text;
begin
  if not public.is_aman_admin() then raise exception 'admin_required'; end if;
  desc_text := nullif(trim(p_description),'');
  if p_amount is null or p_amount <= 0 or desc_text is null then raise exception 'invalid_finance_entry'; end if;
  insert into public.finance_entries(kind,amount,currency,source_type,source_id,description,created_by)
   values(p_kind,p_amount,coalesce(nullif(trim(p_currency::text),''),'YER'),'manual',null,desc_text,auth.uid()) returning id into new_id;
  insert into public.audit_events(actor_id,event_type,entity_type,entity_id,outcome,safe_summary)
   values(auth.uid(),'manual_finance_entry_created','finance_entry',new_id,'success','إضافة قيد مالي يدوي');
  return new_id;
end; $$;

-- RPC sketch: requests, point ledger, finance and status commit together in one PostgreSQL transaction.
create or replace function public.review_points_purchase(p_request_id uuid,p_decision public.purchase_status,p_note text default null)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.purchase_requests%rowtype; tx_id uuid; points_value integer; price_value numeric;
begin
  if not public.is_aman_admin() then raise exception 'admin_required'; end if;
  if p_decision not in ('approved','rejected') then raise exception 'invalid_decision'; end if;
  select * into r from public.purchase_requests where id=p_request_id for update;
  if not found or r.status<>'pending' then raise exception 'request_not_pending'; end if;
  points_value := (r.package_snapshot->>'points')::integer;
  price_value := (r.package_snapshot->>'price')::numeric;
  update public.purchase_requests set status=p_decision,reviewed_by=auth.uid(),reviewed_at=now(),review_note=nullif(trim(p_note),'') where id=r.id;
  if p_decision='approved' then
    insert into public.point_transactions(customer_id,entry_type,points,source_type,source_id,description)
      values(r.customer_id,'credit',points_value,'purchase',r.id,'اعتماد طلب نقاط '||r.id::text) returning id into tx_id;
    insert into public.finance_entries(kind,amount,currency,source_type,source_id,customer_id,description,created_by)
      values('revenue',price_value,coalesce(r.package_snapshot->>'currency','YER'),'purchase',r.id,r.customer_id,'إيراد طلب شراء نقاط '||r.id::text,auth.uid());
  end if;
  insert into public.audit_events(actor_id,event_type,entity_type,entity_id,outcome,safe_summary)
    values(auth.uid(),'purchase_'||p_decision::text,'purchase_request',r.id,'success','مراجعة طلب شراء نقاط');
  return r.id;
end; $$;

-- RPC sketch: ensure the caller owns the number, lock the profile, compute points, and write all records atomically.
create or replace function public.create_customer_subscription(p_number_id uuid,p_days integer,p_idempotency_key text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare n public.customer_numbers%rowtype; co public.companies%rowtype; prev public.subscriptions%rowtype; new_id uuid; bal bigint; cost integer; start_time timestamptz; end_time timestamptz; next_due timestamptz;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  if nullif(trim(p_idempotency_key),'') is null then raise exception 'idempotency_key_required'; end if;
  perform 1 from public.customer_profiles where user_id=auth.uid() for update;
  select * into n from public.customer_numbers where id=p_number_id and exists(select 1 from public.number_customer_links l where l.number_id=customer_numbers.id and l.customer_id=auth.uid()) for update;
  if not found then raise exception 'number_not_owned'; end if;
  select * into co from public.companies where id=n.company_id and is_active for share;
  if not found or p_days<>all(co.allowed_durations_days) or co.daily_rate_points<=0 then raise exception 'invalid_company_or_duration'; end if;
  cost := p_days*co.daily_rate_points;
  insert into public.idempotency_keys(actor_id,key,operation) values(auth.uid(),p_idempotency_key,'create_subscription') on conflict do nothing;
  if not found then raise exception 'duplicate_confirmation'; end if;
  select coalesce(sum(case when entry_type='credit' then points else -points end),0) into bal from public.point_transactions where customer_id=auth.uid();
  if bal<cost then raise exception 'insufficient_points'; end if;
  select * into prev from public.subscriptions where number_id=n.id and ends_at>now() and status='active' order by ends_at desc limit 1 for update;
  start_time := case when found then prev.starts_at else now() end;
  end_time := (case when found then prev.ends_at else now() end) + make_interval(days=>p_days);
  if found then update public.subscriptions set status='superseded' where id=prev.id; end if;
  insert into public.subscriptions(customer_id,number_id,company_id,status,starts_at,ends_at,days_added,daily_rate_points_snapshot,points_cost,previous_subscription_id)
    values(auth.uid(),n.id,co.id,'active',start_time,end_time,p_days,co.daily_rate_points,cost,case when prev.id is null then null else prev.id end) returning id into new_id;
  insert into public.point_transactions(customer_id,entry_type,points,source_type,source_id,description)
    values(auth.uid(),'debit',cost,'subscription',new_id,'تفعيل/تمديد اشتراك الرقم '||n.phone_e164_or_national);
  next_due := now()+make_interval(days=>co.task_interval_days);
  if next_due<=end_time then insert into public.tasks(subscription_id,customer_id,number_id,company_id,due_at,expense_amount,currency)
    values(new_id,auth.uid(),n.id,co.id,next_due,co.task_expense_amount,co.currency); end if;
  update public.idempotency_keys set result_entity_id=new_id where actor_id=auth.uid() and key=p_idempotency_key;
  insert into public.audit_events(actor_id,event_type,entity_type,entity_id,outcome,safe_summary)
    values(auth.uid(),'subscription_created','subscription',new_id,'success','تفعيل/تمديد اشتراك');
  return new_id;
end; $$;

-- RPC sketch: only due planned tasks can be executed; unique finance index prevents duplicate expense.
create or replace function public.execute_aman_task(p_task_id uuid)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare t public.tasks%rowtype; co public.companies%rowtype; sub public.subscriptions%rowtype; next_due timestamptz;
begin
  if not public.is_aman_admin() then raise exception 'admin_required'; end if;
  select * into t from public.tasks where id=p_task_id for update;
  if not found or t.status<>'planned' or t.due_at>now() then raise exception 'task_not_due'; end if;
  update public.tasks set status='executed',executed_at=now(),executed_by=auth.uid() where id=t.id;
  insert into public.finance_entries(kind,amount,currency,source_type,source_id,customer_id,description,created_by)
    values('expense',t.expense_amount,t.currency,'task',t.id,t.customer_id,'مصروف تنفيذ مهمة '||t.id::text,auth.uid());
  select * into co from public.companies where id=t.company_id;
  select * into sub from public.subscriptions where id=t.subscription_id;
  next_due := now()+make_interval(days=>co.task_interval_days);
  if sub.ends_at>now() and next_due<=sub.ends_at then insert into public.tasks(subscription_id,customer_id,number_id,company_id,due_at,expense_amount,currency)
    values(sub.id,sub.customer_id,sub.number_id,co.id,next_due,co.task_expense_amount,co.currency); end if;
  insert into public.audit_events(actor_id,event_type,entity_type,entity_id,outcome,safe_summary)
    values(auth.uid(),'task_executed','task',t.id,'success','تنفيذ مهمة وتسجيل المصروف');
  return t.id;
end; $$;

-- Reverse an erroneous financial entry without deleting or overwriting history.
-- One reversal per original entry; the amount is equal and kind is opposite.
create or replace function public.reverse_finance_entry(p_entry_id uuid,p_reason text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare original public.finance_entries%rowtype; new_id uuid; reason_text text;
begin
  if not public.is_aman_admin() then raise exception 'admin_required'; end if;
  reason_text := nullif(trim(p_reason),'');
  if reason_text is null then raise exception 'reversal_reason_required'; end if;
  select * into original from public.finance_entries where id=p_entry_id for update;
  if not found then raise exception 'finance_entry_not_found'; end if;
  if original.source_type='reversal' or original.reversal_of_entry_id is not null then raise exception 'cannot_reverse_reversal'; end if;
  insert into public.finance_entries(kind,amount,currency,source_type,source_id,reversal_of_entry_id,customer_id,description,created_by)
  values(case when original.kind='revenue' then 'expense'::public.finance_kind else 'revenue'::public.finance_kind end,
         original.amount,original.currency,'reversal',original.id,original.id,original.customer_id,
         'عكس القيد '||original.id::text||': '||reason_text,auth.uid())
  returning id into new_id;
  insert into public.audit_events(actor_id,event_type,entity_type,entity_id,outcome,safe_summary)
   values(auth.uid(),'finance_entry_reversed','finance_entry',new_id,'success','إنشاء قيد عكسي مع الاحتفاظ بالقيد الأصلي');
  return new_id;
exception when unique_violation then raise exception 'finance_entry_already_reversed';
end; $$;

-- Remaining hardening checklist before deployment:
-- 1. Verify all grants/RPC execution privileges below on the target Supabase version; never put service_role keys in clients.
-- 2. Add cross-table ownership constraints/triggers and validate company prefix overlaps at the database boundary.
-- 3. Define private storage policies and retention for any future proof-of-payment files.
-- 4. Review SECURITY DEFINER ownership/search_path and provision the first admin outside public signup.
-- 5. Test concurrent calls, rollback, RLS from anon/customer/admin roles, migrations, backup and restore in a staging project.


-- Explicit grants and RPC exposure. RLS is not a substitute for SQL privileges.
grant usage on schema public to authenticated;
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on function public.handle_new_aman_user() from public, anon, authenticated;
revoke execute on function public.is_aman_admin() from public, anon;
revoke execute on function public.add_customer_number(text) from public, anon;
revoke execute on function public.admin_add_customer_number(uuid,text) from public, anon;
revoke execute on function public.create_points_purchase(uuid,uuid,text) from public, anon;
revoke execute on function public.add_manual_finance_entry(public.finance_kind,numeric,char,text) from public, anon;
revoke execute on function public.review_points_purchase(uuid,public.purchase_status,text) from public, anon;
revoke execute on function public.create_customer_subscription(uuid,integer,text) from public, anon;
revoke execute on function public.execute_aman_task(uuid) from public, anon;
revoke execute on function public.mark_aman_notification_read(uuid) from public, anon;
revoke execute on function public.reverse_finance_entry(uuid,text) from public, anon;
grant execute on function public.is_aman_admin() to authenticated;
grant execute on function public.add_customer_number(text) to authenticated;
grant execute on function public.admin_add_customer_number(uuid,text) to authenticated;
grant execute on function public.create_points_purchase(uuid,uuid,text) to authenticated;
grant execute on function public.add_manual_finance_entry(public.finance_kind,numeric,char,text) to authenticated;
grant execute on function public.review_points_purchase(uuid,public.purchase_status,text) to authenticated;
grant execute on function public.create_customer_subscription(uuid,integer,text) to authenticated;
grant execute on function public.execute_aman_task(uuid) to authenticated;
grant execute on function public.mark_aman_notification_read(uuid) to authenticated;
grant execute on function public.reverse_finance_entry(uuid,text) to authenticated;
grant select on public.customer_profiles, public.admin_roles, public.companies, public.points_packages, public.payment_methods,
  public.customer_numbers, public.purchase_requests, public.subscriptions, public.point_transactions, public.tasks,
  public.finance_entries, public.customer_notifications, public.admin_notification_settings, public.system_content, public.audit_events
  to authenticated;
grant insert,update,delete on public.companies, public.points_packages, public.payment_methods, public.admin_notification_settings, public.system_content to authenticated;
grant select on public.customer_point_balances to authenticated;
