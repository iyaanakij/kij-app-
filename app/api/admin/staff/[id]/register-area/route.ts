import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { AREAS } from '@/lib/types'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const staffId = parseInt(id, 10)
  if (isNaN(staffId)) return NextResponse.json({ error: 'invalid id' }, { status: 400 })

  const { source_submission_id, target_area_id } = await request.json() as {
    source_submission_id: number
    target_area_id: number
  }

  const area = AREAS.find(a => a.id === target_area_id)
  if (!area) return NextResponse.json({ error: '無効なarea_idです' }, { status: 400 })

  const { data: src, error: srcErr } = await sb
    .from('onboarding_submissions')
    .select('brand, normalized_data')
    .eq('id', source_submission_id)
    .eq('staff_id', staffId)
    .single()

  if (srcErr || !src) return NextResponse.json({ error: '元アンケートが見つかりません' }, { status: 404 })

  // 同ブランド×同エリアの重複チェック
  const { data: existing } = await sb
    .from('onboarding_submissions')
    .select('id')
    .eq('staff_id', staffId)
    .eq('brand', src.brand)
    .eq('area_id', target_area_id)

  if (existing && existing.length > 0) {
    return NextResponse.json({ error: 'すでにこのエリアに登録済みです' }, { status: 409 })
  }

  const now = new Date().toISOString()
  const storeId = src.brand === 'M' ? area.storeIds[0] : area.storeIds[1]

  const { data: newSub, error: insertErr } = await sb
    .from('onboarding_submissions')
    .insert({
      staff_id: staffId,
      brand: src.brand,
      area_id: target_area_id,
      normalized_data: src.normalized_data,
      status: 'approved',
      approved_at: now,
    })
    .select('id')
    .single()

  if (insertErr || !newSub) {
    return NextResponse.json({ error: `submission作成失敗: ${insertErr?.message}` }, { status: 500 })
  }

  await sb.from('staff_stores').upsert(
    [{ staff_id: staffId, store_id: storeId }],
    { onConflict: 'staff_id,store_id' }
  )

  await sb.from('onboarding_jobs').insert([
    { submission_id: newSub.id, job_type: 'create_cp4_profile',  status: 'pending', updated_at: now },
    { submission_id: newSub.id, job_type: 'create_venrey_cast',  status: 'pending', updated_at: now },
  ])

  return NextResponse.json({ ok: true, new_submission_id: newSub.id })
}
