import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_SESSION_COOKIE, isValidSessionCookie } from '@/lib/admin-session'

// 認証ゲートの対象外（公開ページ・公開API）。前方一致で判定。
const PUBLIC_PREFIXES = [
  '/cast',
  '/photodiary',
  '/chat',
  '/diary',
  '/feed.xml',
  '/admin/login',
  // ログイン/ログアウトAPI自体はCookie無しで叩けないと詰む
  '/api/admin/session-login',
  '/api/admin/session-logout',
]

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some(p => pathname === p || pathname.startsWith(p + '/') || pathname.startsWith(p))
}

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl

  if (isPublicPath(pathname)) return NextResponse.next()

  const cookie = request.cookies.get(ADMIN_SESSION_COOKIE)?.value
  const valid = await isValidSessionCookie(cookie)
  if (valid) return NextResponse.next()

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const loginUrl = new URL('/admin/login', request.url)
  loginUrl.searchParams.set('next', pathname + search)
  return NextResponse.redirect(loginUrl)
}

export const config = {
  // /api/admin/* と /api/staff-dedup（呼び出し元コードが存在しない旧管理系エンドポイント。
  // 未認証POSTでstaffレコードのマージ/削除が可能なため同様にゲート対象へ）はゲート対象に含める。
  // /api/cast, /api/photodiary, /api/chat 等の顧客・キャスト向け公開APIは除外したままにする。
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/(?!admin|staff-dedup)).*)'],
}
