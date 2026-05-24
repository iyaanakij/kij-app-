import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/server-auth'

const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  const authErr = await requireAuth(request)
  if (authErr) return authErr.error
  const id = Number(request.nextUrl.searchParams.get('id'))
  const year = Number(request.nextUrl.searchParams.get('year'))
  const month = Number(request.nextUrl.searchParams.get('month'))

  if (!id) {
    if (!year || !month || month < 1 || month > 12) {
      return NextResponse.json({ error: 'id または year/month が必要です' }, { status: 400 })
    }
    const { data: job, error } = await adminSupabase
      .from('performance_batch_jobs')
      .select('*')
      .eq('year', year)
      .eq('month', month)
      .eq('status', 'done')
      .order('completed_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ job })
  }

  const { data: job, error } = await adminSupabase
    .from('performance_batch_jobs')
    .select('*')
    .eq('id', id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ job })
}
