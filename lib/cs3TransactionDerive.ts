// daily_report_transactions（CS3デイリーレポート行明細）の course_label/nomination_label から
// ブランド(M性感倶楽部/癒したくて)・指名種別(本指名/写真指名)を判定する共通ロジック。
// 経営KPIダッシュボード②③④・キャストランキングの本指名ユニーク数集計で共用。
// 実データ検証(2026-08-27、docs/kpi-dashboard.md参照)でほぼ全行を判定できることを確認済み。
// 判定できない行(「女性保証」等の非サービス枠)はnullを返す。

export function deriveBrand(courseLabel: string | null, nominationLabel: string | null): 'M' | 'Y' | null {
  if (courseLabel) {
    if (/^[MＭ]/.test(courseLabel)) return 'M'
    if (courseLabel.startsWith('エステ')) return 'Y'
  }
  if (nominationLabel) {
    if (nominationLabel.startsWith('Ｍ')) return 'M'
    if (nominationLabel.startsWith('Ｅ')) return 'Y'
  }
  return null
}

// nomination_labelから写真指名/本指名を判定（「Ｍ写」「NEW 写」等→写真、「本100」「Ｍ本120」等→本指名）
export function deriveNominationKind(nominationLabel: string | null): 'photo' | 'regular' | null {
  if (!nominationLabel) return null
  if (nominationLabel.includes('写')) return 'photo'
  if (nominationLabel.includes('本')) return 'regular'
  return null
}
