-- バニラ店長ブログ投稿の予約日をUIから選べるようにする。
-- NULL = 従来通りワーカー側で「直近の金曜（band時未到来なら今日）」を自動算出。
-- 値ありの場合はその日付 + 各アカウント固定のband時刻で予約投稿する。
alter table vanilla_blog_jobs
  add column target_date date;
