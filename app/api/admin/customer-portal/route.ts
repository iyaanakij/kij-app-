// 顧客向けマイページアプリ（別Supabaseプロジェクト）の予約リクエスト・クーポンを
// kij-app管理画面（共有パスワードCookie配下、middleware.tsでゲート済み）から確認・操作するAPI。
import { NextRequest, NextResponse } from 'next/server'
import { getCustomerPortalSupabase } from '@/lib/customerPortalSupabase'
import { errorMessage } from '@/lib/errors'

export async function GET(request: NextRequest) {
  const sb = getCustomerPortalSupabase()
  if (!sb) return NextResponse.json({ error: 'customer_portal_not_configured' }, { status: 503 })

  const limit = Math.min(Number(request.nextUrl.searchParams.get('limit') ?? '100'), 300)

  const [requestsRes, couponsRes] = await Promise.all([
    sb
      .from('customer_reservation_requests')
      .select('id, customer_id, desired_date, desired_time_range, area, brand, cast_preference, course_preference, notes, status, staff_response_note, created_at')
      .order('created_at', { ascending: false })
      .limit(limit),
    sb
      .from('customer_coupons')
      .select('id, customer_id, code, title, discount_type, discount_value, status, issued_at, redeemed_at, expires_at')
      .order('issued_at', { ascending: false })
      .limit(limit),
  ])

  if (requestsRes.error) return NextResponse.json({ error: requestsRes.error.message }, { status: 500 })
  if (couponsRes.error) return NextResponse.json({ error: couponsRes.error.message }, { status: 500 })

  return NextResponse.json({ requests: requestsRes.data ?? [], coupons: couponsRes.data ?? [] })
}

export async function POST(request: NextRequest) {
  const sb = getCustomerPortalSupabase()
  if (!sb) return NextResponse.json({ error: 'customer_portal_not_configured' }, { status: 503 })

  try {
    const body = await request.json() as {
      action?: 'update_request_status' | 'redeem_coupon'
      request_id?: number
      status?: 'confirmed' | 'declined'
      staff_response_note?: string
      coupon_code?: string
    }

    if (body.action === 'update_request_status') {
      if (!body.request_id || !body.status) {
        return NextResponse.json({ error: 'missing_params' }, { status: 400 })
      }
      const { error } = await sb
        .from('customer_reservation_requests')
        .update({
          status: body.status,
          staff_response_note: body.staff_response_note ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', body.request_id)
      if (error) throw error
      return NextResponse.json({ ok: true })
    }

    if (body.action === 'redeem_coupon') {
      const code = body.coupon_code?.trim().toUpperCase()
      if (!code) return NextResponse.json({ error: 'missing_coupon_code' }, { status: 400 })

      const { data: coupon, error: lookupError } = await sb
        .from('customer_coupons')
        .select('id, status')
        .eq('code', code)
        .maybeSingle()
      if (lookupError) throw lookupError
      if (!coupon) return NextResponse.json({ error: 'コードが見つかりません' }, { status: 404 })
      if (coupon.status === 'redeemed') {
        return NextResponse.json({ error: 'このクーポンは使用済みです' }, { status: 409 })
      }

      const { error: updateError } = await sb
        .from('customer_coupons')
        .update({ status: 'redeemed', redeemed_at: new Date().toISOString() })
        .eq('id', coupon.id)
      if (updateError) throw updateError
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'unknown_action' }, { status: 400 })
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 })
  }
}
