begin;
create table public.crm_project_executions (
 id uuid primary key,
 user_id uuid not null references auth.users(id), snapshot_id uuid not null references public.crm_snapshots(id),
 company_id text not null, deal_id text not null, org_id text not null,
 system text not null check(system in ('serp','reports')),
 status text not null check(status in ('draft','dispatching','accepted','running','completed','partial','preserved','failed','uncertain')),
 parameters jsonb not null, command jsonb not null, proof text not null, assignee jsonb not null, reason text not null,
 approved_at timestamptz, approved_by text, result jsonb,
 expires_at timestamptz not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index crm_project_execution_owner on public.crm_project_executions(user_id,company_id,deal_id,created_at desc);
-- Across users and snapshots, the same deal cannot receive two concurrent commands.
create unique index crm_project_execution_active on public.crm_project_executions(company_id,deal_id,system) where status in ('dispatching','accepted','running','uncertain');
alter table public.crm_project_executions enable row level security;
revoke all on public.crm_project_executions from public,anon,authenticated;
grant select,insert,update on public.crm_project_executions to service_role;
commit;
