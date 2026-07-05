-- store_targets: エリア別（M店+E店合算）の日次目標本数
-- area_id は lib/types.ts の AREAS と対応（1=成田 / 2=千葉 / 3=西船橋 / 4=錦糸町）
-- 月間目標本数・目標売上・残り本数/残り売上は /targets ページ側で daily_target_count と unit_price から算出する

CREATE TABLE IF NOT EXISTS store_targets (
  area_id            int PRIMARY KEY,
  daily_target_count numeric,
  unit_price         numeric NOT NULL DEFAULT 9000,
  updated_at         timestamptz NOT NULL DEFAULT now()
);

INSERT INTO store_targets (area_id, daily_target_count) VALUES
  (1, 17.5), -- 成田
  (2, 13.9), -- 千葉
  (3, 12.2), -- 西船橋
  (4, 11.1)  -- 錦糸町
ON CONFLICT (area_id) DO NOTHING;

-- このプロジェクトは新規テーブルにRLSがデフォルト有効化される設定のため、
-- /targets 画面（anon key）から読み書きできるようポリシーを明示する。
ALTER TABLE store_targets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow all store_targets" ON store_targets;
CREATE POLICY "allow all store_targets" ON store_targets
  FOR ALL USING (true) WITH CHECK (true);
