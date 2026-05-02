-- CS3 cast_analyzer 月次成績テーブル
-- 本指名数・写メ指名数をCS3から正確に取得して保存
create table if not exists cs3_cast_performance (
  id          bigserial primary key,
  shop_id     text not null,        -- '111701' / '111702' / '111703' / '111704'
  cast_name   text not null,        -- CS3上のキャスト名
  year        int not null,
  month       int not null,
  staff_id    int references staff(id),  -- Supabase staff.id（名前マッチで埋める）
  -- M系（水着M性感）
  m_shashin   int not null default 0,   -- Ｍ写(件)
  m_free      int not null default 0,   -- Ｍフリー(件)
  m_hon_total int not null default 0,   -- Ｍ本xx(件) 合計
  m_total     int not null default 0,   -- m_shashin + m_free + m_hon_total
  -- E系（エステ・Venrey）
  e_shashin   int not null default 0,   -- Ｅ写(件)
  e_free      int not null default 0,   -- Ｅフリー(件)
  e_hon_total int not null default 0,   -- Ｅ本xx(件) 合計
  e_total     int not null default 0,   -- e_shashin + e_free + e_hon_total
  fetched_at  timestamptz not null default now(),
  unique(shop_id, year, month, cast_name)
);

-- インデックス（month/shop_id での絞り込みに使用）
create index if not exists cs3_cast_performance_lookup
  on cs3_cast_performance(shop_id, year, month);
create index if not exists cs3_cast_performance_staff
  on cs3_cast_performance(staff_id);
