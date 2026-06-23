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

  // submitted状態のときだけ同名staff候補を返す
  let staffCandidates: Array<{ id: number; name: string; store_ids: number[] }> = []
  if (subRes.data?.status === 'submitted') {
    const stageName = (subRes.data.normalized_data as Record<string, unknown> | null)?.stage_name as string | undefined
    if (stageName) {
      const { data: candidates } = await sb
        .from('staff')
        .select('id, name, staff_stores(store_id)')
        .ilike('name', `%${stageName}%`)
        .limit(5)
      staffCandidates = (candidates ?? []).map((s: { id: number; name: string; staff_stores: Array<{ store_id: number }> }) => ({
        id: s.id,
        name: s.name,
        store_ids: s.staff_stores.map(ss => ss.store_id),
      }))
    }
  }

  return NextResponse.json({ submission: subRes.data, jobs: jobsRes.data ?? [], staffCandidates })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  // jobs を先に削除してから submission を削除（外部キー制約対応）
  await sb.from('onboarding_jobs').delete().eq('submission_id', id)
  const { error } = await sb.from('onboarding_submissions').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json() as {
    normalized_data?: unknown
    admin_notes?: string
    cp4_gid?: string
    venrey_cast_id?: string
  }

  const update: Record<string, unknown> = {}
  if (body.normalized_data !== undefined) update.normalized_data = body.normalized_data
  if (body.admin_notes !== undefined) update.admin_notes = body.admin_notes
  if (body.cp4_gid !== undefined) update.cp4_gid = body.cp4_gid || null
  if (body.venrey_cast_id !== undefined) update.venrey_cast_id = body.venrey_cast_id || null

  const { error } = await sb.from('onboarding_submissions').update(update).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
