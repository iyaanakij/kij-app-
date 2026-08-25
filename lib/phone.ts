// 電話番号の正規化ユーティリティ
// mail_customer_directory / customer_visit_recency の phone 列は
// shift-sync/scripts/102-cs3-mail-customer-directory-sync.js の normalizePhone()
// と同じく「数字のみ・国内表記（先頭0付き）」で保存されている（E.164ではない）。
// 新規マイページアプリはSupabase AuthのPhone認証でE.164形式(+819012345678)を扱うため、
// CS3側データと突合する際はここで国内表記へ変換する。

export function toDomesticJpPhone(raw: string): string {
  const digits = String(raw ?? '').replace(/\D/g, '')
  if (digits.startsWith('81') && digits.length >= 10 && digits.length <= 12) {
    return '0' + digits.slice(2)
  }
  return digits
}
