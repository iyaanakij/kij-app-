-- 経営KPIダッシュボード ②キャスト比較・③曜日時間帯分析・④女性×曜日向け。
-- CS3デイリーレポート(report.details.php)の集計結果パネル下にある行レベル明細テーブル
-- (table#id_table-historylist)を店舗×日付でスナップショットする。
-- 各行はCS3の`history`属性値（予約/成約単位のユニークID）をそのままPKに使う。
-- area_id/dateはstore_daily_kpiと同じ規約（lib/types.tsのAREAS）。
create table daily_report_transactions (
  history_id bigint primary key,
  area_id integer not null,
  date date not null,
  shop_name text,
  data_type text,             -- 成約/予約/キャンセル/チェンジ/その他
  reservation_method text,    -- 予約方法（実データは行によって部分的に入っている）
  used_at timestamptz,        -- 利用日時
  cast_name text,
  course_label text,
  course_price integer,
  nomination_label text,
  nomination_price integer,
  area_label text,
  area_surcharge integer,
  location_label text,
  location_surcharge integer,
  payment_method text,
  revenue integer,
  committee_fee integer,
  store_profit integer,       -- 店落（=売上-委託費、CS3側計算値）
  customer_id text,
  customer_number_of_use text, -- "0（3)" 形式のまま保持（現在ショップ／グループ全体）
  customer_first_used_at timestamptz,
  customer_last_used_at timestamptz,
  fetched_at timestamptz not null default now()
);

create index daily_report_transactions_area_date_idx on daily_report_transactions (area_id, date);
create index daily_report_transactions_cast_idx on daily_report_transactions (cast_name);
