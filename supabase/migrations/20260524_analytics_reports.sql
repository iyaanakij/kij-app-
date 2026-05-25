create table if not exists analytics_reports (
  id          bigint generated always as identity primary key,
  report_date date        not null,
  report_type text        not null default 'weekly',
  summary     text        not null,
  raw_data    jsonb       not null default '{}',
  created_at  timestamptz not null default now()
);

create index if not exists analytics_reports_report_date_idx
  on analytics_reports (report_date desc);

-- upsert用のユニーク制約（同一日付・同一タイプの重複insert防止）
alter table analytics_reports
  add constraint analytics_reports_date_type_unique
  unique (report_date, report_type);

alter table analytics_reports enable row level security;

-- insert/update/delete は service_role（VPS script）のみ（RLSをバイパス）。
-- ※ 暫定: anon も読める設定。会社PCログイン運用整備後に authenticated/staff 限定へ絞る。
create policy "anon can read analytics_reports"
  on analytics_reports for select
  to anon, authenticated
  using (true);
