-- 真の「当日欠勤」検出用（2026-09-01追加）。
-- CS3の当日欠勤ステータスは運用上使われておらず、休みの場合はシフト行ごと削除されている実態のため、
-- 「対象日=今日のCS3承認シフトが、25-cs3-approved-to-shifts.js の同期サイクル中に消えたこと」を
-- 同期スクリプト側で検知して記録する。予約キャンセル理由ベースの daily_report_transactions とは別軸。
-- 詳細設計は docs/shift-sync.md「当日欠勤イベント検出」節を参照。
create table cast_absence_events (
  id bigserial primary key,
  staff_id bigint not null references staff(id),
  store_id integer not null,
  date date not null,
  detected_at timestamptz not null default now(),
  source text not null default 'shift_disappeared',
  unique (staff_id, date)
);

create index cast_absence_events_date_idx on cast_absence_events (date);

ALTER TABLE cast_absence_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow all cast_absence_events" ON cast_absence_events;
CREATE POLICY "allow all cast_absence_events" ON cast_absence_events
  FOR ALL USING (true) WITH CHECK (true);
