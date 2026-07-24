-- CP4フリーテキスト手動一括反映（manual_freetext_jobs）にVenrey対応を追加。
-- CP4とVenreyは別々のVPSワーカー・別ロック（cp4-state.lock / run-sync.lock）で独立して処理するため、
-- 既存のstatus/resultを流用せず専用カラムを追加して読み書き競合を避ける。
alter table manual_freetext_jobs
  add column venrey_status text not null default 'pending' check (venrey_status in ('pending', 'running', 'done', 'error', 'skipped')),
  add column venrey_result jsonb,
  add column venrey_error_message text;

create index manual_freetext_jobs_venrey_status_idx on manual_freetext_jobs (venrey_status, created_at);
