create table system_health_logs (
  id serial primary key,
  checked_at timestamptz not null default now(),
  status text not null check (status in ('OK', 'WARN', 'CRIT')),
  checks jsonb not null,
  created_at timestamptz default now()
);

create index system_health_logs_checked_at_idx on system_health_logs (checked_at desc);

alter table system_health_logs enable row level security;

-- staff のみ参照可能
create policy "staff_read_health_logs" on system_health_logs
  for select using (
    exists (select 1 from user_roles where id = auth.uid() and role = 'staff')
  );

-- service_role のみ INSERT 可能（RLS bypass）
