// 顧客向けマイページアプリ（別Vercelプロジェクト）からのサーバー間呼び出し認証。
// CUSTOMER_PORTAL_API_SECRET は SYNC_SECRET 等の既存シークレットと共用しないこと。
// （docs/infra.md: 汎用シークレット名の使い回しが原因で意図しないアカウント混線を招いた実例あり）

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export function isAuthorizedCustomerPortalRequest(request: Request): boolean {
  const secret = process.env.CUSTOMER_PORTAL_API_SECRET
  if (!secret) return false
  const header = request.headers.get('authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!token) return false
  return timingSafeEqual(token, secret)
}
