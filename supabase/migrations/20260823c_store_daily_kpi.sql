-- 経営KPIダッシュボード Phase 1: CS3「デイリーレポート」(report.details.php) の
-- 集計結果パネル(id="data_copy")を店舗×日付で日次スナップショットするテーブル。
-- 0-c調査で判明した通り、この画面はCS3が既に計算済みの店落ち・新規/リピーター・
-- 入電数(CTI自動記録)・キャンセル数を1画面で提供しており、当プロジェクトの
-- reservations同期(当日+近未来のみ保持)を経由せずに正確な日次値を取得できる。
-- area_idはlib/types.tsのAREAS(1=成田/2=千葉/3=西船橋/4=錦糸町)と対応
-- (store_daily_actualsと同じ規約)。
create table store_daily_kpi (
  area_id integer not null,
  date date not null,
  close_count integer,          -- 成約
  reserve_count integer,        -- 予約
  cancel_count integer,         -- キャンセル
  change_count integer,         -- チェンジ
  other_count integer,          -- その他
  revenue_total integer,        -- 売上
  revenue_unit_price integer,   -- 売上単価
  committee_fee_total integer,  -- 委託費
  committee_fee_unit_price integer,
  committee_fee_count integer,
  store_profit_total integer,       -- 店落(=売上-委託費、CS3側計算値)
  store_profit_unit_price integer,
  expenses integer,             -- 経費
  income_and_expenditure integer, -- 収支
  contracts_all_count integer,    -- 成約件数(全て)
  contracts_all_customers integer, -- 成約件数(ユニーク顧客数)
  new_customers integer,          -- 新規（現在ショップでの初回利用日ベース、CS3側計算値）
  repeat_customers integer,       -- リピーター
  cash_amount integer,
  card_amount integer,
  collection_done integer,        -- 料金回収(回収済)。ショップ設定によりnull
  collection_pending integer,     -- 料金回収(未回収)。ショップ設定によりnull
  inbound_calls_total integer,    -- 入電(全て、CTI自動記録)
  inbound_calls_unique integer,   -- 入電(ユニーク)
  fetched_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (area_id, date)
);
