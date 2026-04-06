-- 写メ日記転送先テーブル
CREATE TABLE IF NOT EXISTS staff_diary_delivery_targets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  staff_id INT REFERENCES staff(id) ON DELETE CASCADE,
  media_name TEXT NOT NULL,
  delivery_type TEXT NOT NULL DEFAULT 'email',
  destination TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 送信ログテーブル
CREATE TABLE IF NOT EXISTS diary_delivery_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  diary_id INT REFERENCES photo_diaries(id) ON DELETE CASCADE,
  target_id UUID REFERENCES staff_diary_delivery_targets(id),
  status TEXT NOT NULL,
  error_message TEXT,
  sent_at TIMESTAMPTZ DEFAULT now()
);

-- 既存データの補正（delivery_type / enabled が null の場合）
UPDATE staff_diary_delivery_targets SET delivery_type = 'email' WHERE delivery_type IS NULL;
UPDATE staff_diary_delivery_targets SET enabled = true WHERE enabled IS NULL;
