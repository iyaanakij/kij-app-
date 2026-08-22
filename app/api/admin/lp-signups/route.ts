import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

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
