-- store_daily_kpi / daily_report_transactions は104番スクレイパー(service_role_key)
-- のみが書き込むが、経営KPIダッシュボード画面（anon key）からの読み取りができるよう
-- store_daily_actuals（20260706_store_daily_actuals.sql）と同じ方針でRLSポリシーを追加する。
ALTER TABLE store_daily_kpi ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow all store_daily_kpi" ON store_daily_kpi;
CREATE POLICY "allow all store_daily_kpi" ON store_daily_kpi
  FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE daily_report_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow all daily_report_transactions" ON daily_report_transactions;
CREATE POLICY "allow all daily_report_transactions" ON daily_report_transactions
  FOR ALL USING (true) WITH CHECK (true);
