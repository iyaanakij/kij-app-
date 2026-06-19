import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { AREAS } from '@/lib/types'
import type { NormalizedOnboardingData } from '@/lib/types'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const ROW_MEMO_PREFIX = '__KIJ_WOMEN_INFO_ROW__'
const WOMEN_INFO_DATE = '2000-01-02'

const NG_OPTION_TO_FIELD: Record<string, string> = {
  '聖水': 'field_10',
  '私物パンティ': 'field_11',
  'ロープ拘束': 'field_12',
  '3P': 'field_16',
  '自宅出張': 'field_18',
  'ビジネスホテル': 'field_19',
  'レンタルルーム': 'field_20',
  '外国人客': 'field_21',
}

function buildWomenInfoValues(nd: NormalizedOnboardingData): Record<string, string> {
  const values: Record<string, string> = {
    field_1: nd.stage_name ?? '',
    field_2: nd.join_date ?? '',
    field_4: nd.contact_method ?? '',
    field_7: nd.request_ok === false ? '対応不可' : nd.request_ok === true ? '可能' : '',
    field_9: nd.tattoo ?? '',
    field_17: nd.ng_area ?? '',
  }
  for (const [opt, field] of Object.entries(NG_OPTION_TO_FIELD)) {
    values[field] = nd.ng_options?.includes(opt) ? 'NG' : ''
  }
  return values
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

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

  const mStoreId = area.storeIds[0]
  const eStoreId = area.storeIds[1]
  const storeIds = sub.brand === 'M' ? [mStoreId] : [eStoreId]

  // 1. staff作成
  const { data: newStaff, error: staffErr } = await sb
    .from('staff')
    .insert({ name: nd.stage_name, join_date: nd.join_date ?? null, notes: 'オンボーディングで作成' })
    .select('id')
    .single()

  if (staffErr || !newStaff) {
    return NextResponse.json({ error: `staff作成失敗: ${staffErr?.message}` }, { status: 500 })
  }

  // 2. staff_stores作成
  await sb.from('staff_stores').insert(storeIds.map(sid => ({ staff_id: newStaff.id, store_id: sid })))

  // 3. 女性情報（board_annotations）作成
  const values = buildWomenInfoValues(nd)
  const memo = `${ROW_MEMO_PREFIX}${JSON.stringify({ sortOrder: 1, status: 'active', values })}`
  const { data: annotation, error: annoErr } = await sb
    .from('board_annotations')
    .insert({ staff_id: null, date: WOMEN_INFO_DATE, start_time: 0, end_time: 0, color: 'gray', memo, store_id: mStoreId })
    .select('id')
    .single()

  // 4. onboarding_jobsを一括登録
  const now = new Date().toISOString()
  await sb.from('onboarding_jobs').insert([
    {
      submission_id: sub.id,
      job_type: 'create_staff',
      status: staffErr ? 'failed' : 'succeeded',
      result: { staff_id: newStaff.id },
      updated_at: now,
    },
    {
      submission_id: sub.id,
      job_type: 'create_women_info',
      status: annoErr ? 'failed' : 'succeeded',
      result: annoErr ? null : { annotation_id: annotation?.id },
      error_message: annoErr?.message ?? null,
      updated_at: now,
    },
    { submission_id: sub.id, job_type: 'create_publish_rule', status: 'needs_manual', updated_at: now },
    { submission_id: sub.id, job_type: 'create_cp4_profile',  status: 'needs_manual', updated_at: now },
    { submission_id: sub.id, job_type: 'create_venrey_cast',  status: 'needs_manual', updated_at: now },
  ])

  // 5. submission更新
  await sb.from('onboarding_submissions').update({
    status: 'approved',
    approved_at: now,
    staff_id: newStaff.id,
  }).eq('id', id)

  return NextResponse.json({ ok: true, staff_id: newStaff.id })
}
