import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { AREAS } from '@/lib/types'
import type { NormalizedOnboardingData } from '@/lib/types'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json() as { mode: 'create' | 'link'; staff_id?: number }

  const { data: sub, error: subErr } = await sb
    .from('onboarding_submissions')
    .select('*')
    .eq('id', id)
    .single()

  if (subErr || !sub) return NextResponse.json({ error: '案件が見つかりません' }, { status: 404 })
  if (sub.status !== 'submitted') {
    return NextResponse.json({ error: `承認できるのはsubmitted状態のみです（現在: ${sub.status}）` }, { status: 400 })
  }

  const nd = sub.normalized_data as NormalizedOnboardingData | null
  if (!nd?.stage_name) {
    return NextResponse.json({ error: '源氏名が設定されていません' }, { status: 400 })
  }

  const area = AREAS.find(a => a.id === sub.area_id)
  if (!area) return NextResponse.json({ error: '無効なarea_idです' }, { status: 400 })

  const storeIds = sub.brand === 'M' ? [area.storeIds[0]] : [area.storeIds[1]]
  const now = new Date().toISOString()

  // ─── 既存staffへの紐付け ───
  if (body.mode === 'link') {
    if (!body.staff_id) {
      return NextResponse.json({ error: 'staff_idが必要です' }, { status: 400 })
    }

    const { data: existingStaff, error: staffCheckErr } = await sb
      .from('staff')
      .select('id, name')
      .eq('id', body.staff_id)
      .single()

    if (staffCheckErr || !existingStaff) {
      return NextResponse.json({ error: '指定されたstaffが見つかりません' }, { status: 400 })
    }

    await sb.from('staff_stores').upsert(
      storeIds.map(sid => ({ staff_id: body.staff_id, store_id: sid })),
      { onConflict: 'staff_id,store_id' }
    )

    await sb.from('onboarding_jobs').insert({
      submission_id: sub.id,
      job_type: 'link_existing_staff',
      status: 'succeeded',
      result: { staff_id: body.staff_id, staff_name: existingStaff.name },
      updated_at: now,
    })

    await sb.from('onboarding_submissions').update({
      status: 'approved',
      approved_at: now,
      staff_id: body.staff_id,
    }).eq('id', id)

    return NextResponse.json({ ok: true, staff_id: body.staff_id, mode: 'link' })
  }

  // ─── 新規staff作成 ───
  const { data: newStaff, error: staffErr } = await sb
    .from('staff')
    .insert({ name: nd.stage_name, join_date: nd.join_date ?? null, notes: 'オンボーディングで作成' })
    .select('id')
    .single()

  if (staffErr || !newStaff) {
    return NextResponse.json({ error: `staff作成失敗: ${staffErr?.message}` }, { status: 500 })
  }

  await sb.from('staff_stores').upsert(
    storeIds.map(sid => ({ staff_id: newStaff.id, store_id: sid })),
    { onConflict: 'staff_id,store_id' }
  )

  // 外部登録ジョブは積まない（Step 3 で staff詳細から手動実行）
  await sb.from('onboarding_jobs').insert([
    {
      submission_id: sub.id,
      job_type: 'create_staff',
      status: 'succeeded',
      result: { staff_id: newStaff.id },
      updated_at: now,
    },
    { submission_id: sub.id, job_type: 'create_women_info',   status: 'needs_manual', updated_at: now },
    { submission_id: sub.id, job_type: 'create_publish_rule', status: 'needs_manual', updated_at: now },
  ])

  await sb.from('onboarding_submissions').update({
    status: 'approved',
    approved_at: now,
    staff_id: newStaff.id,
  }).eq('id', id)

  return NextResponse.json({ ok: true, staff_id: newStaff.id, mode: 'create' })
}
