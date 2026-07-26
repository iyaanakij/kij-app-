-- store_sales_goals: エリア別（M店+E店合算）の月間売上目標（円）
-- area_id は lib/types.ts の AREAS と対応（1=成田 / 2=千葉 / 3=西船橋 / 4=錦糸町）
-- 損益分岐ライン（store_targets）とは独立した、別軸の売上目標
-- 実績売上は /sales-goal ページ側で reservations / store_daily_actuals と store_targets.unit_price から算出する

CREATE TABLE IF NOT EXISTS store_sales_goals (
  area_id           int PRIMARY KEY,
  monthly_goal_yen  numeric,
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE store_sales_goals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow all store_sales_goals" ON store_sales_goals;
CREATE POLICY "allow all store_sales_goals" ON store_sales_goals
  FOR ALL USING (true) WITH CHECK (true);
