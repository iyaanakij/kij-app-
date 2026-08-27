# Cast Tenure (在籍期間データ)

> このファイルは `data/cast-tenure.json` / `data/cast-tenure-summary.json` の局所README。
> プロジェクト全体の入口は `../docs/summary.md`。

4店舗（成田・千葉・西船橋・錦糸町）の女性キャスト在籍履歴（入店日〜最終出勤日）を集計したスナップショット。2014〜2026年のExcelシフト表（Google Drive「(1)女性シフト」フォルダ）とKIJアプリ本体Supabase（`shifts`/`staff`、2026年6月以降）を統合した2ソースパイプラインの出力。

**個人が特定できるデータ（源氏名・在籍期間）を含むため、社内(`/admin/cast-tenure`、要ログイン)以外で公開・共有しないこと。** 元々claude.ai Artifactでリンク共有していたが、Googleにインデックスされるリスクを避けるため2026-08-27にこの管理画面ページへ移設した。

## 生成元

正本は `~/Desktop/KIJ/女性シフト在籍分析/`（このappリポジトリの外、gitリポジトリでもない）。

- `shift_report_all_stores.json` → このディレクトリへ `cast-tenure.json` としてコピー
- `summary_data.json` → このディレクトリへ `cast-tenure-summary.json` としてコピー

再集計フロー・スクリプトの詳細は `[[project_cast_history_audit]]`（Claudeメモリ）を参照。再集計後は上記2ファイルを手動で再コピーし、このリポジトリへcommit・pushする（自動連携なし）。

## cast-tenure.json のレコード形式

```json
{
  "stores": "西船橋",
  "name": "伊橋まこと",
  "entry_date": "2018-04-01",
  "entry_precision": "master",
  "last_shift_date": "2020-03-01",
  "n_sightings": 42,
  "source": "master+shift",
  "conflict_note": "",
  "status": "退店済み",
  "tenure_days": 700,
  "tenure_bucket": "3年以内"
}
```

- `stores`: 関与した全店舗を`／`区切りで併記（例: `成田／千葉`）
- `entry_precision`: `master`（名簿記載）/ `exact`・`exact_first_seen`（シフト表の初出勤日で代用）/ `staff_db_join_date`（KIJアプリstaffテーブルのjoin_date）/ `unknown`
- `status`: `在籍中(直近シフトあり)` / `退店済み` / `出勤実績なし(入店記録のみ)`
- `conflict_note`: 空文字以外の場合、入店日と出勤記録の整合性に要確認点がある（34件）

## cast-tenure-summary.json

サマリータブ（KPI・在籍期間区分別分布・入店年別トレンド・店舗別実人数・退店の月別季節性・在籍中/退店済み比較）の集計済み数値。集計ロジックは`[[project_cast_history_audit]]`「統合Artifactのサマリー集計ロジック」節を参照。
