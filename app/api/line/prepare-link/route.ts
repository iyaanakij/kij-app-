import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { data: { user } } = await adminSupabase.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const nonce = crypto.randomUUID()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL!

  const lineUrl = 'https://access.line.me/oauth2/v2.1/authorize?' +
    new URLSearchParams({
      response_type: 'code',
      client_id: process.env.LINE_LOGIN_CHANNEL_ID!,
      redirect_uri: `${appUrl}/api/line/callback`,
      state: `link:${nonce}`,
      scope: 'profile openid',
    }).toString()

  const res = NextResponse.json({ url: lineUrl })
  // nonce:userId をHttpOnlyクッキーに保存（5分間有効）
  res.cookies.set('line_link_session', `${nonce}:${user.id}`, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 300,
    path: '/',
    secure: process.env.NODE_ENV === 'production',
  })
  return res
}
