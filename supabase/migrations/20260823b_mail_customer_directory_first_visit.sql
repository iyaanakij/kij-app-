-- 経営KPIダッシュボード向けに「新規客/リピーター」を正確に判定できるようにするため、
-- CS3の真の初回来店日(firstusedate)を保存する列を追加する。
-- 102-cs3-mail-customer-directory-sync.js は以前からCS3画面のfirstusedate列を
-- スクレイピングしていたが、toDirectoryRows()で読み捨てていた。
-- customer_visit_recency.visit_countは二重更新経路(cs3-sync-daemon.jsとこの102番)が
-- 競合し合っており過去のある時点の新規/リピーター判定には使えないため、
-- 予約日とfirst_visited_atを比較する方式に切り替える土台として追加する。
alter table mail_customer_directory
  add column first_visited_at timestamptz;
