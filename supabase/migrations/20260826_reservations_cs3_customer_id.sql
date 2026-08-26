-- 顧客向けマイページアプリ（別リポジトリ ~/Desktop/customer-portal）で「未来の確定予約」を
-- 表示するため、reservationsにCS3顧客ID（customers.edit.php?id=101179 と同じID）を追加する。
-- 型は mail_customer_directory.cs3_customer_id（text）に合わせる。
-- 既存行はCS3側で保存済みの過去予約のため値は取得できず、次回以降の同期分から入る（NULL許容）。
-- app/scripts/cs3-sync-daemon.js の parseReservations() が
-- reservation_list_value_customersid のtdから抽出して書き込む。
alter table reservations
  add column cs3_customer_id text;

-- マイページアプリ側APIは cs3_customer_id × status='confirmed' × date>=今日 で検索する。
create index reservations_cs3_customer_id_idx
  on reservations (cs3_customer_id)
  where cs3_customer_id is not null;
