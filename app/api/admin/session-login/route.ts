import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_SESSION_COOKIE, createSessionCookieValue } from '@/lib/admin-session'

export async function POST(request: NextRequest) {
  const { password } = await request.json().catch(() => ({ password: '' }))
  const correct = process.env.ADMIN_PORTAL_PASSWORD

  if (!correct) {
    return NextResponse.json({ error: 'サーバー側にADMIN_PORTAL_PASSWORDが未設定です' }, { status: 500 })
  }
  if (typeof password !== 'string' || password !== correct) {
    return NextResponse.json({ error: 'パスワードが正しくありません' }, { status: 401 })
  }

  const { value, maxAge } = await createSessionCookieValue()
  const res = NextResponse.json({ ok: true })
  res.cookies.set(ADMIN_SESSION_COOKIE, value, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge,
  })
  return res
}
