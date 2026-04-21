-- publish_rules: CS3 (cast_id, source_shop_id) × 掲載先 site_id の配信ルール
-- source_shop_id: 111701=西船橋 / 111702=成田 / 111703=千葉 / 111704=錦糸町
-- site_id: iya_narita / mka_narita / iya_chiba / mka_chiba /
--          iya_funabashi / mka_funabashi / iya_kinshicho / mka_kinshicho

CREATE TABLE IF NOT EXISTS publish_rules (
  cs3_cast_id    text NOT NULL,
  source_shop_id text NOT NULL,
  site_id        text NOT NULL,
  enabled        boolean NOT NULL DEFAULT false,
  cp4_gid        text,
  venrey_cast_id text,
  cast_name      text,
  updated_at     timestamptz DEFAULT now(),
  PRIMARY KEY (cs3_cast_id, source_shop_id, site_id)
);

CREATE INDEX IF NOT EXISTS publish_rules_enabled_idx
  ON publish_rules (enabled)
  WHERE enabled = true;
