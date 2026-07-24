-- 予約発生時の一時的な手動調整（CP4フリーテキスト欄）を、同時掲載中の全site_idへ一括反映するためのジョブキュー。
-- KIJ側（Vercel）でジョブを作成し、VPS側ワーカーがpublish_rulesから対象サイトを解決してCP4へ書き込む。
create table manual_freetext_jobs (
  id bigserial primary key,
  staff_id bigint references staff(id) on delete set null,
  cs3_cast_id text not null,
  cast_name text,
  freetext_value text not null,
  status text not null default 'pending' check (status in ('pending', 'running', 'done', 'error')),
  requested_by text,
  result jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index manual_freetext_jobs_status_idx on manual_freetext_jobs (status, created_at);
create index manual_freetext_jobs_cs3_cast_id_idx on manual_freetext_jobs (cs3_cast_id, created_at desc);

alter table manual_freetext_jobs enable row level security;
-- service_role のみ操作可（API・VPSワーカー経由のみ。他ジョブテーブルと同方針）
