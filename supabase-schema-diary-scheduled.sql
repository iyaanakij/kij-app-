-- 予約投稿用カラム追加
alter table photo_diaries add column scheduled_at timestamptz;
