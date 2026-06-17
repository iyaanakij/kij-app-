import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const ALLOWED_ACTIONS = new Set([
  'cs3_relogin_a',
  'cs3_relogin_b',
  'cs3_relogin_c',
  'health_check_now',
])

export async function GET(_request: NextRequest) {
  const { data, error } = await adminSupabase
    .from('system_action_jobs')
    .select('id, action, status, requested_at, started_at, finished_at, result, error')
    .order('requested_at', { ascending: false })
    .limit(20)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ jobs: data })
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { action } = body as { action?: string }

  if (!action || !ALLOWED_ACTIONS.has(action)) {
    return NextResponse.json({ error: '不正なアクションです' }, { status: 400 })
  }

  // 直近2分以内に同じactionのpending/runningジョブがあればクールダウン
  const since = new Date(Date.now() - 2 * 60 * 1000).toISOString()
  const { data: existing } = await adminSupabase
    .from('system_action_jobs')
    .select('id')
    .eq('action', action)
    .in('status', ['pending', 'running'])
    .gte('requested_at', since)
    .limit(1)

  if (existing && existing.length > 0) {
    return NextResponse.json(
      { error: '同じ処理が実行中または待機中です。しばらく待ってから再試行してください。' },
      { status: 429 }
    )
  }

  const { data, error } = await adminSupabase
    .from('system_action_jobs')
    .insert({ action, status: 'pending', requested_by: 'dashboard' })
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, job_id: data.id })
}
