-- 予約投稿用カラム追加
alter table photo_diaries add column if not exists scheduled_at timestamptz;

-- RLSポリシー更新：公開済み OR 予約時刻を過ぎたものを誰でも閲覧可
drop policy if exists "public_read_published_diaries" on photo_diaries;
create policy "public_read_published_diaries" on photo_diaries
  for select using (
    published = true
    or (scheduled_at is not null and scheduled_at <= now())
  );

-- 画像ポリシーも同様に更新
drop policy if exists "public_read_diary_images" on photo_diary_images;
create policy "public_read_diary_images" on photo_diary_images
  for select using (
    exists (
      select 1 from photo_diaries
      where id = diary_id
        and (published = true or (scheduled_at is not null and scheduled_at <= now()))
    )
  );
