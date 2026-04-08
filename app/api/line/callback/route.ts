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

  // ── LINEでログイン（共通処理） ──────────────────────────────────
  if (state === 'login' || state === 'login_diary') {
    const loginErrorUrl = state === 'login_diary'
      ? `${appUrl}/photodiary/login?error=line_not_linked`
      : `${appUrl}/cast/login?error=line_not_linked`
    const sessionErrorUrl = state === 'login_diary'
      ? `${appUrl}/photodiary/login?error=session_failed`
      : `${appUrl}/cast/login?error=session_failed`
    const authRedirectPath = state === 'login_diary' ? '/photodiary/auth' : '/cast/auth'

    const { data: userRole } = await adminSupabase
      .from('user_roles')
      .select('id')
      .eq('line_user_id', lineUserId)
      .single()

    if (!userRole) {
      return NextResponse.redirect(loginErrorUrl)
    }

    const { data: { user } } = await adminSupabase.auth.admin.getUserById(userRole.id)
    if (!user?.email) {
      return NextResponse.redirect(sessionErrorUrl)
    }

    const { data: linkData, error: linkError } = await adminSupabase.auth.admin.generateLink({
      type: 'magiclink',
      email: user.email,
    })
    if (linkError || !linkData?.properties?.hashed_token) {
      return NextResponse.redirect(sessionErrorUrl)
    }

    return NextResponse.redirect(`${appUrl}${authRedirectPath}?hash=${linkData.properties.hashed_token}`)
  }

  // ── LINE新規登録 ────────────────────────────────────────
  if (state?.startsWith('register:') || state?.startsWith('register_diary:')) {
    const isDiary = state.startsWith('register_diary:')
    const prefix = isDiary ? 'register_diary:' : 'register:'
    const registerErrorUrl = isDiary ? `${appUrl}/photodiary/register?error=register_failed` : `${appUrl}/cast/register?error=register_failed`
    const alreadyRegisteredUrl = isDiary ? `${appUrl}/photodiary/register?error=already_registered` : `${appUrl}/cast/register?error=already_registered`
    const authRedirectPath = isDiary ? '/photodiary/auth' : '/cast/auth'

    const staffId = parseInt(state.slice(prefix.length))
    if (!staffId) return NextResponse.redirect(registerErrorUrl)

    // すでにLINE IDが登録済みか確認
    const { data: existing } = await adminSupabase
      .from('user_roles')
      .select('id')
      .eq('line_user_id', lineUserId)
      .maybeSingle()
    if (existing) {
      return NextResponse.redirect(alreadyRegisteredUrl)
    }

    // Supabaseユーザーを作成（LINE専用の内部メールを使用）
    const dummyEmail = `line_${lineUserId}@kij-line.internal`
    const dummyPassword = crypto.randomUUID()
    const { data: newUser, error: createError } = await adminSupabase.auth.admin.createUser({
      email: dummyEmail,
      password: dummyPassword,
      email_confirm: true,
    })
    if (createError || !newUser.user) {
      console.error('[LINE register] createUser error:', createError)
      return NextResponse.redirect(registerErrorUrl)
    }

    await adminSupabase.from('user_roles').insert({
      id: newUser.user.id,
      role: 'cast',
      staff_id: staffId,
      line_user_id: lineUserId,
    })

    // マジックリンクでログイン
    const { data: linkData, error: linkError } = await adminSupabase.auth.admin.generateLink({
      type: 'magiclink',
      email: dummyEmail,
    })
    if (linkError || !linkData?.properties?.hashed_token) {
      return NextResponse.redirect(registerErrorUrl)
    }
    return NextResponse.redirect(`${appUrl}${authRedirectPath}?hash=${linkData.properties.hashed_token}`)
  }

  // ── LINE連携（既存ログイン済みユーザーがLINEを紐付け）─────────
  if (state?.startsWith('link:')) {
    const nonce = state.slice(5)
    const sessionCookie = req.cookies.get('line_link_session')?.value
    if (!sessionCookie) {
      return NextResponse.redirect(`${appUrl}/cast/shift?error=link_expired`)
    }
    const colonIdx = sessionCookie.indexOf(':')
    const storedNonce = sessionCookie.slice(0, colonIdx)
    const currentUserId = sessionCookie.slice(colonIdx + 1)
    if (storedNonce !== nonce || !currentUserId) {
      return NextResponse.redirect(`${appUrl}/cast/shift?error=link_invalid`)
    }
    await adminSupabase
      .from('user_roles')
      .update({ line_user_id: lineUserId })
      .eq('id', currentUserId)
    const res = NextResponse.redirect(`${appUrl}/cast/shift?line_linked=1`)
    res.cookies.delete('line_link_session')
    return res
  }

  return NextResponse.redirect(`${appUrl}/cast/login`)
}
