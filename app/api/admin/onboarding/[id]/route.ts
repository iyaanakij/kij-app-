import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const [subRes, jobsRes] = await Promise.all([
    sb.from('onboarding_submissions').select('*').eq('id', id).single(),
    sb.from('onboarding_jobs').select('*').eq('submission_id', id).order('created_at'),
  ])

  if (subRes.error) return NextResponse.json({ error: subRes.error.message }, { status: 404 })
  return NextResponse.json({ submission: subRes.data, jobs: jobsRes.data ?? [] })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json() as { normalized_data?: unknown; admin_notes?: string }

  const update: Record<string, unknown> = {}
  if (body.normalized_data !== undefined) update.normalized_data = body.normalized_data
  if (body.admin_notes !== undefined) update.admin_notes = body.admin_notes

  const { error } = await sb.from('onboarding_submissions').update(update).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
