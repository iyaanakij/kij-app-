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

-- 手動作成済みテーブルへの冪等カラム追加
alter table performance_batch_jobs add column if not exists started_at     timestamptz;
alter table performance_batch_jobs add column if not exists completed_at   timestamptz;
alter table performance_batch_jobs add column if not exists attempt_count  int not null default 0;
alter table performance_batch_jobs add column if not exists requested_by   text;
alter table performance_batch_jobs add column if not exists worker_id      text;

create index if not exists performance_batch_jobs_status_requested_idx
  on performance_batch_jobs (status, requested_at);

create index if not exists performance_batch_jobs_year_month_idx
  on performance_batch_jobs (year, month);

-- RLS: API ルート・VPS worker は service_role_key を使用するため RLS をバイパスする
alter table performance_batch_jobs enable row level security;
