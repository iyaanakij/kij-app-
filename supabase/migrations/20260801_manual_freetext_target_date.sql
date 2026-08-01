-- 稼働ボード（/operations）の翌日以降の日付からもCP4 HPリアルタイム更新を行えるようにするため、
-- ジョブがどの日付のCP4スケジュールセルを対象にするかを記録する列を追加する。
-- NULL = 当日（従来通りワーカー側でJST当日を都度算出）。翌日以降のジョブのみ明示的に日付を持つ。
-- Venreyは当日のみ対応のため、target_dateがNULLでない（=翌日以降の）ジョブはAPI側でvenrey_status='skipped'を挿入時に設定する。
alter table manual_freetext_jobs
  add column target_date date;

create index manual_freetext_jobs_target_date_idx on manual_freetext_jobs (target_date, created_at desc);
