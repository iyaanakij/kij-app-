import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state') // 'login' | 'link'
  const appUrl = process.env.NEXT_PUBLIC_APP_URL!

  if (!code) {
    return NextResponse.redirect(`${appUrl}/cast/login?error=line_cancelled`)
  }

  // LINEのアクセストークンを取得
  const tokenRes = await fetch('https://api.line.me/oauth2/v2.1/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: `${appUrl}/api/line/callback`,
      client_id: process.env.LINE_LOGIN_CHANNEL_ID!,
      client_secret: process.env.LINE_LOGIN_CHANNEL_SECRET!,
    }),
  })
  const tokenData = await tokenRes.json()
  if (!tokenData.access_token) {
    return NextResponse.redirect(`${appUrl}/cast/login?error=line_failed`)
  }

  // LINEプロフィール取得（userId）
  const profileRes = await fetch('https://api.line.me/v2/profile', {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  })
  const profile = await profileRes.json()
  const lineUserId: string = profile.userId

  const adminSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // ── LINEでログイン ──────────────────────────────────
  if (state === 'login') {
    const { data: userRole } = await adminSupabase
      .from('user_roles')
      .select('id')
      .eq('line_user_id', lineUserId)
      .single()

    if (!userRole) {
      return NextResponse.redirect(`${appUrl}/cast/login?error=line_not_linked`)
    }

    // ユーザーのメールアドレスを取得してマジックリンクを生成
    const { data: { user } } = await adminSupabase.auth.admin.getUserById(userRole.id)
    if (!user?.email) {
      return NextResponse.redirect(`${appUrl}/cast/login?error=session_failed`)
    }

    const { data: linkData, error: linkError } = await adminSupabase.auth.admin.generateLink({
      type: 'magiclink',
      email: user.email,
      options: { redirectTo: `${appUrl}/cast/shift` },
    })
    if (linkError || !linkData?.properties?.action_link) {
      return NextResponse.redirect(`${appUrl}/cast/login?error=session_failed`)
    }

    return NextResponse.redirect(linkData.properties.action_link)
  }

  // ── LINE連携（既存ログイン済みユーザーがLINEを紐付け）─────────
  if (state === 'link') {
    // cookieからSupabaseセッションを読んで現在のユーザーを特定
    const cookieName = `sb-tiwxvbbevzsmaxbarpwc-auth-token`
    const rawCookie = req.cookies.get(cookieName)?.value
    let currentUserId: string | null = null
    if (rawCookie) {
      try {
        const parsed = JSON.parse(rawCookie)
        const token = Array.isArray(parsed) ? parsed[0] : parsed.access_token
        const { data } = await adminSupabase.auth.getUser(token)
        currentUserId = data.user?.id ?? null
      } catch {}
    }
    if (!currentUserId) {
      return NextResponse.redirect(`${appUrl}/cast/login?error=not_logged_in`)
    }
    await adminSupabase
      .from('user_roles')
      .update({ line_user_id: lineUserId })
      .eq('id', currentUserId)

    return NextResponse.redirect(`${appUrl}/cast/shift?line_linked=1`)
  }

  return NextResponse.redirect(`${appUrl}/cast/login`)
}
