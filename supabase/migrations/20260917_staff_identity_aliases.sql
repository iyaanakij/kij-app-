-- Supabase SQL Editorで実行してください
-- staff_identity_aliases: 同一人物が特定店舗だけ別名(源氏名)で稼働する場合のエイリアス管理
-- 例: 西住しおり(cs3_cast_id=3351)が千葉店だけ「桜庭まな」名義で稼働する場合
create table if not exists staff_identity_aliases (
  id           bigserial primary key,
  staff_id     bigint not null references staff(id) on delete cascade,
  alias_name   text not null,
  shop_id      text,        -- CS3 shop_id (111701/111702/111703/111704)。NULLなら全店舗対象
  cs3_cast_id  text,        -- 別名義がCS3上で別のcast_idを持つ場合のみ設定。同一cast_id運用ならNULLのままでよい
  notes        text,
  created_at   timestamptz not null default now()
);

-- 別cast_idを持つ場合、1つのcast_idが複数staffへ紐付く事故を防ぐ
create unique index if not exists staff_identity_aliases_cs3_cast_id_unique
  on staff_identity_aliases (cs3_cast_id)
  where cs3_cast_id is not null;

create index if not exists staff_identity_aliases_lookup
  on staff_identity_aliases (alias_name, shop_id);

create index if not exists staff_identity_aliases_staff_id
  on staff_identity_aliases (staff_id);
