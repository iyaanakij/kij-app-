-- store_daily_actuals: エリア別・日別の実績本数スナップショット
-- reservations テーブルは当日+未来分のみ保持し、過去日はCS3同期の delete ロジックで
-- 消えてしまうため、消える前に日次件数をここへ保存しておく。
-- /targets ページの月次実績（今月ここまでの本数・売上）はこのテーブルの積み上げ + 当日分のreservationsライブ件数で算出する。
-- 2026-07-06 の運用開始以前の日付は遡って復元できない。

CREATE TABLE IF NOT EXISTS store_daily_actuals (
  area_id    int NOT NULL,
  date       date NOT NULL,
  count      int NOT NULL,
  unit_price numeric NOT NULL DEFAULT 9000,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (area_id, date)
);

CREATE INDEX IF NOT EXISTS store_daily_actuals_date_idx ON store_daily_actuals (date);

-- 書き込みはVPS（service_role_key）のみだが、/targets 画面（anon key）からの
-- 読み取りができるようポリシーを明示する。
ALTER TABLE store_daily_actuals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow all store_daily_actuals" ON store_daily_actuals;
CREATE POLICY "allow all store_daily_actuals" ON store_daily_actuals
  FOR ALL USING (true) WITH CHECK (true);
