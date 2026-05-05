-- /ranking 集計ボタン用ジョブキュー
-- VPS worker (script 96) が pending を検知して CS3_ACCOUNT=D で script 95 を実行する
create table if not exists performance_batch_jobs (
  id             bigserial primary key,
  year           int  not null,
  month          int  not null,
  status         text not null default 'pending',
  message        text,
  requested_at   timestamptz not null default now(),
  started_at     timestamptz,
  completed_at   timestamptz,
  attempt_count  int  not null default 0,
  requested_by   text,
  worker_id      text,
  constraint performance_batch_jobs_status_check
    check (status in ('pending', 'running', 'done', 'error'))
);

create index if not exists performance_batch_jobs_status_requested_idx
  on performance_batch_jobs (status, requested_at);

create index if not exists performance_batch_jobs_year_month_idx
  on performance_batch_jobs (year, month);

-- RLS 有効化済み（Supabase ダッシュボードで "Run and enable RLS" を実行済み）
-- API ルート・VPS worker は service_role_key を使用するため RLS をバイパスする
