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
  role text not null check (role in ('admin','finance','operations','support')),
  created_at timestamptz not null default now()
);

create or replace function public.is_aman_admin()
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from public.admin_roles r where r.user_id=auth.uid() and r.role in ('admin','finance','operations','support'));
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
  customer_id uuid references public.customer_profiles(user_id) on delete restrict,
  description text not null,
  created_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);
create unique index finance_source_once_idx on public.finance_entries(source_type,source_id,kind) where source_id is not null and source_type in ('purchase','task');
create index finance_created_idx on public.finance_entries(created_at desc);

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
create policy companies_read_active on public.companies for select to authenticated using (is_active or public.is_aman_admin());
create policy companies_admin_all on public.companies for all to authenticated using (public.is_aman_admin()) with check (public.is_aman_admin());
create policy packages_read_available on public.points_packages for select to authenticated using (is_available or public.is_aman_admin());
create policy packages_admin_all on public.points_packages for all to authenticated using (public.is_aman_admin()) with check (public.is_aman_admin());
create policy payment_methods_read_available on public.payment_methods for select to authenticated using (is_available or public.is_aman_admin());
create policy payment_methods_admin_all on public.payment_methods for all to authenticated using (public.is_aman_admin()) with check (public.is_aman_admin());
create policy numbers_read_owner_or_admin on public.customer_numbers for select to authenticated using (customer_id=auth.uid() or public.is_aman_admin());
create policy requests_read_owner_or_admin on public.purchase_requests for select to authenticated using (customer_id=auth.uid() or public.is_aman_admin());
create policy subscriptions_read_owner_or_admin on public.subscriptions for select to authenticated using (customer_id=auth.uid() or public.is_aman_admin());
create policy points_read_owner_or_finance on public.point_transactions for select to authenticated using (customer_id=auth.uid() or public.is_aman_admin());
create policy tasks_read_owner_or_operations on public.tasks for select to authenticated using (customer_id=auth.uid() or public.is_aman_admin());
create policy finance_admin_read on public.finance_entries for select to authenticated using (public.is_aman_admin());
create policy notices_read_owner_or_admin on public.customer_notifications for select to authenticated using (customer_id=auth.uid() or public.is_aman_admin());
create policy notice_read_update_self on public.customer_notifications for update to authenticated using (customer_id=auth.uid()) with check (customer_id=auth.uid());
create policy settings_admin_only on public.admin_notification_settings for all to authenticated using (public.is_aman_admin()) with check (public.is_aman_admin());
create policy content_read on public.system_content for select to authenticated using (true);
create policy content_admin_update on public.system_content for all to authenticated using (public.is_aman_admin()) with check (public.is_aman_admin());
create policy audit_admin_read on public.audit_events for select to authenticated using (public.is_aman_admin());

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
    update public.customer_profiles set is_subscriber=true where user_id=r.customer_id;
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
  perform 1 from public.customer_profiles where user_id=auth.uid() for update;
  select * into n from public.customer_numbers where id=p_number_id and customer_id=auth.uid() for update;
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

-- Production hardening checklist before deployment:
-- 1. Revoke direct INSERT/UPDATE/DELETE on point_transactions, subscriptions, finance_entries, tasks, and purchase review tables.
-- 2. Grant narrowly scoped EXECUTE on reviewed RPC functions; use Supabase Auth and server-side role claims.
-- 3. Decide whether customer INSERT on purchase_requests is allowed directly or only through an RPC validating snapshots.
-- 4. Add cross-table ownership constraints/triggers, rate-overlap validation, request proof storage policies, and audit retention.
-- 5. Review SECURITY DEFINER ownership/search_path, policies for support vs finance roles, and proof-of-payment privacy.
-- 6. Test concurrent calls, rollback, RLS from anon/customer/admin roles, migrations, backup and restore in a staging project.
