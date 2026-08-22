import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { errorMessage } from '@/lib/errors'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  const limit = Math.min(Number(request.nextUrl.searchParams.get('limit') ?? '50'), 200)

  const { data, error } = await sb
    .from('lp_discount_signups')
    .select('id, email, coupon_code, confirmation_sent_at, confirmation_error, matched_phone, matched_at, created_at')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ signups: data ?? [] })
}

type SignupMatchRow = { id: number; email: string; matched_phone: string | null }

export async function POST(request: NextRequest) {
  const body = await request.json() as {
    action?: 'redeem'
    coupon_code?: string
    phone?: string
  }

  try {
    if (body.action === 'redeem') {
      const couponCode = body.coupon_code?.trim().toUpperCase()
      const phone = body.phone?.trim()
      if (!couponCode || !phone) {
        return NextResponse.json({ error: 'クーポンコードと電話番号を入力してください' }, { status: 400 })
      }

      const { data: signup, error: signupError } = await sb
        .from('lp_discount_signups')
        .select('id, email, matched_phone')
        .eq('coupon_code', couponCode)
        .maybeSingle()
      if (signupError) throw signupError
      if (!signup) return NextResponse.json({ error: 'コードが見つかりません' }, { status: 404 })

      const row = signup as SignupMatchRow
      const previouslyMatchedPhone = row.matched_phone && row.matched_phone !== phone ? row.matched_phone : null
      const now = new Date().toISOString()

      const { error: updateSignupError } = await sb
        .from('lp_discount_signups')
        .update({ matched_phone: phone, matched_at: now, updated_at: now })
        .eq('id', row.id)
      if (updateSignupError) throw updateSignupError

      const { data: existingDirectory, error: directoryLookupError } = await sb
        .from('mail_customer_directory')
        .select('phone')
        .eq('phone', phone)
        .maybeSingle()
      if (directoryLookupError) throw directoryLookupError

      if (existingDirectory) {
        const { error: directoryUpdateError } = await sb
          .from('mail_customer_directory')
          .update({ email: row.email, updated_at: now })
          .eq('phone', phone)
        if (directoryUpdateError) throw directoryUpdateError
      } else {
        const { error: directoryInsertError } = await sb
          .from('mail_customer_directory')
          .insert({ phone, email: row.email })
        if (directoryInsertError) throw directoryInsertError
      }

      return NextResponse.json({ ok: true, email: row.email, phone, previously_matched_phone: previouslyMatchedPhone })
    }

    return NextResponse.json({ error: 'unknown action' }, { status: 400 })
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 })
  }
}
