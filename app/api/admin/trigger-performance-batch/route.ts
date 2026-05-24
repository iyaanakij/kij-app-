import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/server-auth'

const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  const authErr = await requireAuth(request)
  if (authErr) return authErr.error
  const body = await request.json()
  const year  = Number(body.year)
  const month = Number(body.month)

  if (!year || !month || month < 1 || month > 12) {
    return NextResponse.json({ error: 'year/month が不正です' }, { status: 400 })
  }

  // 同じ年月の pending / running があれば既存ジョブを返す
  const { data: existing, error: existErr } = await adminSupabase
    .from('performance_batch_jobs')
    .select('*')
    .eq('year', year)
    .eq('month', month)
    .in('status', ['pending', 'running'])
    .order('requested_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existErr) return NextResponse.json({ error: existErr.message }, { status: 500 })
  if (existing) return NextResponse.json({ job: existing })

  const { data: job, error: insertErr } = await adminSupabase
    .from('performance_batch_jobs')
    .insert({ year, month, status: 'pending' })
    .select()
    .single()

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })
  return NextResponse.json({ job })
}
