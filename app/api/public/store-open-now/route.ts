import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { corsHeaders } from '@/lib/publicCors'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Vercel は UTC なので +9h → JST。営業日は 7:00 JST 切り替え（today-staff APIと同じ定義）
function businessDateAndDecimalHour(): { date: string; nowDecimal: number } {
  const jst = new Date(Date.now() + 9 * 60 * 60 * 1000)
  const hour = jst.getUTCHours() + jst.getUTCMinutes() / 60
  const businessDay = new Date(jst)
  let nowDecimal = hour
  if (hour < 7) {
    businessDay.setUTCDate(businessDay.getUTCDate() - 1)
    nowDecimal = hour + 24
  }
  return { date: businessDay.toISOString().slice(0, 10), nowDecimal }
}

export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get('origin')
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) })
}

export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  const headers = corsHeaders(origin)
  const { searchParams } = new URL(req.url)

  const storeIds = (searchParams.get('store_ids') ?? '')
    .split(',')
    .map(s => parseInt(s.trim(), 10))
    .filter(n => Number.isInteger(n) && n > 0)

  if (storeIds.length === 0) {
    return NextResponse.json({ error: 'store_ids is required' }, { status: 400, headers })
  }

  const { date, nowDecimal } = businessDateAndDecimalHour()

  const { data: shifts, error } = await supabase
    .from('shifts')
    .select('start_time, end_time')
    .in('store_id', storeIds)
    .eq('date', date)
    .eq('status', 'normal')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers })
  }

  const open = (shifts ?? []).some(
    (s: { start_time: number; end_time: number }) => s.start_time <= nowDecimal && nowDecimal < s.end_time
  )

  return NextResponse.json(
    { open },
    {
      headers: {
        ...headers,
        // 出退勤の切り替わりに追従できるよう短めにキャッシュ
        'Cache-Control': 'public, max-age=60, stale-while-revalidate=30',
      },
    }
  )
}
