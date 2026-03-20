-- ================================================
-- 写メ日記システム スキーマ
-- ================================================

-- 写メ日記
create table photo_diaries (
  id serial primary key,
  staff_id integer references staff(id) on delete cascade not null,
  title text,
  body text,
  thumbnail_image_id integer, -- サムネイル（後でFK追加）
  published boolean default false,
  published_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 日記画像
create table photo_diary_images (
  id serial primary key,
  diary_id integer references photo_diaries(id) on delete cascade not null,
  storage_path text not null,
  sort_order integer default 0,
  created_at timestamptz default now()
);

-- サムネイルFK（循環参照を避けるため後から追加）
alter table photo_diaries
  add constraint fk_thumbnail
  foreign key (thumbnail_image_id)
  references photo_diary_images(id) on delete set null;

-- ================================================
-- RLS有効化
-- ================================================
alter table photo_diaries enable row level security;
alter table photo_diary_images enable row level security;

-- 公開日記は誰でも閲覧可
create policy "public_read_published_diaries" on photo_diaries
  for select using (published = true);

-- キャストは自分の日記を全操作可（下書き含む）
create policy "cast_manage_own_diaries" on photo_diaries
  for all using (
    staff_id = (select staff_id from user_roles where id = auth.uid() and role = 'cast')
  );

-- 公開日記の画像は誰でも閲覧可
create policy "public_read_diary_images" on photo_diary_images
  for select using (
    exists (select 1 from photo_diaries where id = diary_id and published = true)
  );

-- キャストは自分の日記の画像を全操作可
create policy "cast_manage_own_diary_images" on photo_diary_images
  for all using (
    exists (
      select 1 from photo_diaries d
      join user_roles ur on ur.staff_id = d.staff_id
      where d.id = diary_id
        and ur.id = auth.uid()
        and ur.role = 'cast'
    )
  );

-- ================================================
-- updated_at 自動更新トリガー
-- ================================================
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger photo_diaries_updated_at
  before update on photo_diaries
  for each row execute function update_updated_at();

-- ================================================
-- Supabase ダッシュボードで手動設定が必要:
-- Storage > New bucket > 名前: "diary-images" > Public: ON
-- ================================================
