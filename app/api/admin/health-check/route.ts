import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const hours = Math.min(Number(searchParams.get('hours') || 24), 168)

  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()

  const { data, error } = await adminSupabase
    .from('system_health_logs')
    .select('id, checked_at, status, checks')
    .gte('checked_at', since)
    .order('checked_at', { ascending: false })
    .limit(200)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ logs: data })
}
