import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_SESSION_COOKIE, isValidSessionCookie } from '@/lib/admin-session'

// 認証ゲートの対象外（公開ページ）。前方一致で判定。
const PUBLIC_PREFIXES = [
  '/cast',
  '/photodiary',
  '/chat',
  '/diary',
  '/feed.xml',
  '/admin/login',
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

  const loginUrl = new URL('/admin/login', request.url)
  loginUrl.searchParams.set('next', pathname + search)
  return NextResponse.redirect(loginUrl)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api).*)'],
}
