-- publish_rules に onboarding_submission_id カラムを追加
-- 85スクリプトが「onboarding由来の行のみ」を自動有効化対象にするため

ALTER TABLE publish_rules
  ADD COLUMN IF NOT EXISTS onboarding_submission_id bigint REFERENCES onboarding_submissions(id);

COMMENT ON COLUMN publish_rules.onboarding_submission_id IS '新規キャスト自動登録由来の行であることを示す。NOT NULLの行のみ85スクリプトの自動有効化対象。';

-- 既存行バックフィル（cs3_cast_idが一致する承認済みonboardingを紐付け）
UPDATE publish_rules pr
SET onboarding_submission_id = os.id
FROM onboarding_submissions os
JOIN staff s ON s.id = os.staff_id
WHERE pr.cs3_cast_id = s.cs3_cast_id
  AND os.status = 'approved'
  AND pr.onboarding_submission_id IS NULL;
