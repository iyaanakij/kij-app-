create table system_action_jobs (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  status text not null check (status in ('pending', 'running', 'succeeded', 'failed', 'skipped')) default 'pending',
  requested_by text,
  requested_at timestamptz default now(),
  started_at timestamptz,
  finished_at timestamptz,
  result jsonb,
  error text
);

create index system_action_jobs_requested_at_idx on system_action_jobs (requested_at desc);
create index system_action_jobs_status_idx on system_action_jobs (status, requested_at desc);

alter table system_action_jobs enable row level security;
-- service_role のみ操作可（API経由のみ）
