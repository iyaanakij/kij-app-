// スタッフ向け共有パスワードのセッションCookie発行・検証
// Edge runtime (middleware) でも動くよう Web Crypto のみを使用（Buffer非依存）

export const ADMIN_SESSION_COOKIE = 'kij_admin_session'
const MAX_AGE_SEC = 60 * 60 * 24 * 30 // 30日

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

async function hmacHex(secret: string, data: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data))
  return toHex(sig)
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export async function createSessionCookieValue(): Promise<{ value: string; maxAge: number }> {
  const secret = requireSecret()
  const expiry = Math.floor(Date.now() / 1000) + MAX_AGE_SEC
  const sig = await hmacHex(secret, String(expiry))
  return { value: `${expiry}.${sig}`, maxAge: MAX_AGE_SEC }
}

export async function isValidSessionCookie(cookieValue: string | undefined | null): Promise<boolean> {
  if (!cookieValue) return false
  const [expiryStr, sig] = cookieValue.split('.')
  if (!expiryStr || !sig) return false
  const expiry = Number(expiryStr)
  if (!Number.isFinite(expiry) || expiry < Math.floor(Date.now() / 1000)) return false
  const secret = requireSecret()
  const expectedSig = await hmacHex(secret, expiryStr)
  return timingSafeEqual(sig, expectedSig)
}

function requireSecret(): string {
  const secret = process.env.ADMIN_SESSION_SECRET
  if (!secret) throw new Error('ADMIN_SESSION_SECRET is required')
  return secret
}

export { MAX_AGE_SEC as ADMIN_SESSION_MAX_AGE_SEC }
