begin;
create table public.crm_preparation_workflows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id text not null,
  deal_id text not null,
  revision integer not null default 0 check(revision >= 0),
  state jsonb not null default '{}' check(jsonb_typeof(state) = 'object'),
  updated_at timestamptz not null default now(),
  unique(user_id,company_id,deal_id)
);
-- Same owner/account boundary as extracted CRM data. A responsible person is
-- a CRM assignee, not an access grant to private snapshots or email contents.
alter table public.crm_preparation_workflows enable row level security;
revoke all on public.crm_preparation_workflows from public,anon,authenticated;
grant select,insert,update on public.crm_preparation_workflows to service_role;
commit;
