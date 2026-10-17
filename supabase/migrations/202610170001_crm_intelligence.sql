begin;

create table public.crm_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  company_id text not null,
  crm_user_id text not null,
  encrypted_token text not null,
  updated_at timestamptz not null default now()
);
create table public.crm_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id text not null,
  deal_id text not null,
  title text not null,
  status text not null default 'collecting' check(status in ('collecting','complete','partial','cancelled')),
  schema_version integer not null default 2,
  pending jsonb not null default '[]',
  seen_tasks jsonb not null default '[]',
  completed_tasks integer not null default 0,
  last_resource text,
  gaps jsonb not null default '[]',
  metrics jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  lease_id uuid,
  lease_until timestamptz
);
create index crm_snapshots_owner on public.crm_snapshots(user_id, company_id, started_at desc);
create table public.crm_raw_pages (
  snapshot_id uuid not null references public.crm_snapshots(id) on delete cascade,
  task_key text not null,
  kind text not null,
  request jsonb not null,
  payload jsonb,
  failure jsonb,
  fetched_at timestamptz not null default now(),
  primary key(snapshot_id, task_key)
);
create table public.crm_answers (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references public.crm_snapshots(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  mode text not null,
  question text not null,
  answer jsonb not null,
  model text not null,
  prompt_version text not null,
  usage jsonb not null,
  context_manifest jsonb not null,
  elapsed_ms integer not null,
  created_at timestamptz not null default now()
);
create index crm_answers_snapshot on public.crm_answers(snapshot_id, created_at desc);
create table public.crm_usage_limits (
  subject text not null, scope text not null, bucket bigint not null,
  used integer not null, expires_at timestamptz not null,
  primary key(subject, scope, bucket)
);
-- No browser role can access CRM material directly. The server rechecks Pipedrive
-- permission for the deal on every read/write before using the service role.
alter table public.crm_connections enable row level security;
alter table public.crm_snapshots enable row level security;
alter table public.crm_raw_pages enable row level security;
alter table public.crm_answers enable row level security;
alter table public.crm_usage_limits enable row level security;
revoke all on public.crm_connections, public.crm_snapshots, public.crm_raw_pages, public.crm_answers, public.crm_usage_limits from public, anon, authenticated;
grant all on public.crm_connections, public.crm_snapshots, public.crm_usage_limits to service_role;
grant select,insert,delete on public.crm_raw_pages,public.crm_answers to service_role;

create function public.crm_consume_limit(p_subject text, p_scope text, p_maximum integer, p_seconds integer)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare count_used integer; current_bucket bigint;
begin
  if p_maximum < 1 or p_seconds < 1 then return false; end if;
  current_bucket := floor(extract(epoch from now()) / p_seconds);
  insert into crm_usage_limits(subject,scope,bucket,used,expires_at)
    values(p_subject,p_scope,current_bucket,1,now()+make_interval(secs=>p_seconds*2))
    on conflict(subject,scope,bucket) do update set used=crm_usage_limits.used+1
      where crm_usage_limits.used < p_maximum returning used into count_used;
  return count_used is not null;
end $$;
create function public.crm_claim_snapshot(p_id uuid, p_user uuid, p_lease uuid)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update crm_snapshots set lease_id=p_lease,lease_until=now()+interval '120 seconds'
    where id=p_id and user_id=p_user and status='collecting' and (lease_until is null or lease_until < now());
  return found;
end $$;
-- Only trusted backend calls these functions; authenticated SQL clients cannot
-- spoof another user's budget or seize a job's lease.
revoke all on function public.crm_consume_limit(text,text,integer,integer) from public, anon, authenticated;
revoke all on function public.crm_claim_snapshot(uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.crm_consume_limit(text,text,integer,integer) to service_role;
grant execute on function public.crm_claim_snapshot(uuid,uuid,uuid) to service_role;

insert into storage.buckets(id,name,public,file_size_limit)
  values('crm-originals','crm-originals',false,20971520)
  on conflict(id) do update set public=false,file_size_limit=20971520;
-- No authenticated storage policies: file access is authorized by the backend.
-- Legacy rows have no reliable owner; quarantine them instead of guessing access.
do $$ begin
  if to_regclass('public.deal_analyses') is not null then
    execute 'alter table public.deal_analyses enable row level security';
    execute 'revoke all on public.deal_analyses from public, anon, authenticated';
  end if;
end $$;
commit;
