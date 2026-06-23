-- staff と CS3 キャストIDの明示リンク。
-- nullable: CS3未確認・手入力・退店済みなどを残せるようにする。
-- unique where not null: 1つのCS3キャストIDが複数staffへ紐付く事故を防ぐ。

ALTER TABLE staff
  ADD COLUMN IF NOT EXISTS cs3_cast_id text;

CREATE UNIQUE INDEX IF NOT EXISTS staff_cs3_cast_id_unique
  ON staff (cs3_cast_id)
  WHERE cs3_cast_id IS NOT NULL;

