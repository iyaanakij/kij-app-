import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// CP4既存値・77番スクリプトと同じ形式（全角コロン＋全角チルダ）で統一する。
// これにより、実時刻が追いつくまでは77番の「未来時刻→スキップ」ロジックがそのまま手動値を保護する。
function formatFreetextValue(hhmm: string): string | null {
  const m = hhmm.match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return null
  const h = Number(m[1])
  const mm = Number(m[2])
  if (h < 0 || h > 29 || mm < 0 || mm > 59) return null
  return `${String(h).padStart(2, '0')}：${String(mm).padStart(2, '0')}～`
}

async function fetchTargets(cs3CastId: string) {
  const { data, error } = await adminSupabase
    .from('publish_rules')
    .select('site_id, source_shop_id, cp4_gid, cast_name')
    .eq('cs3_cast_id', cs3CastId)
    .eq('enabled', true)
    .not('cp4_gid', 'is', null)
    .order('site_id')
  if (error) throw new Error(error.message)
  // publish_rules は (cs3_cast_id, source_shop_id, site_id) がPKのため、
  // 同じ site_id が source_shop_id の数だけ重複する。site_id単位で去重する。
  const bySiteId = new Map<string, NonNullable<typeof data>[number]>()
  for (const row of data ?? []) {
    if (!bySiteId.has(row.site_id)) bySiteId.set(row.site_id, row)
  }
  return [...bySiteId.values()]
}

// site_id → Venreyアカウント名（93-manual-freetext-venrey-worker.js と同じ体系）
const SITE_TO_VENREY_ACCOUNT_NAME: Record<string, string> = {
  iya_narita: '癒したくて 成田',
  iya_chiba: '癒したくて 成田',
  iya_funabashi: '癒したくて 錦糸町',
  iya_kinshicho: '癒したくて 錦糸町',
  mka_narita: '快楽M性感倶楽部 成田',
  mka_chiba: '快楽M性感倶楽部 成田',
  mka_funabashi: '快楽M性感倶楽部 錦糸町',
  mka_kinshicho: '快楽M性感倶楽部 錦糸町',
}

async function fetchVenreyTargets(cs3CastId: string) {
  const { data, error } = await adminSupabase
    .from('publish_rules')
    .select('site_id, venrey_cast_id')
    .eq('cs3_cast_id', cs3CastId)
    .eq('enabled', true)
    .not('venrey_cast_id', 'is', null)
  if (error) throw new Error(error.message)
  const byAccount = new Map<string, string>()
  for (const row of data ?? []) {
    const accountName = SITE_TO_VENREY_ACCOUNT_NAME[row.site_id]
    if (!accountName || byAccount.has(accountName)) continue
    byAccount.set(accountName, row.venrey_cast_id!)
  }
  return [...byAccount.entries()].map(([accountName, venreyCastId]) => ({ accountName, venreyCastId }))
}

export async function GET(request: NextRequest) {
  const staffId = request.nextUrl.searchParams.get('staff_id')
  if (!staffId) return NextResponse.json({ error: 'staff_id is required' }, { status: 400 })

  const { data: staff, error: staffErr } = await adminSupabase
    .from('staff')
    .select('id, name, cs3_cast_id')
    .eq('id', Number(staffId))
    .single()
  if (staffErr || !staff) return NextResponse.json({ error: 'スタッフが見つかりません' }, { status: 404 })
  if (!staff.cs3_cast_id) {
    return NextResponse.json({ staff, targets: [], venrey_targets: [], latest_job: null, error: 'CS3未連携のため配信対象を特定できません' })
  }

  const [targets, venreyTargets] = await Promise.all([
    fetchTargets(staff.cs3_cast_id),
    fetchVenreyTargets(staff.cs3_cast_id),
  ])

  const { data: latestJob } = await adminSupabase
    .from('manual_freetext_jobs')
    .select('id, freetext_value, status, result, error_message, venrey_status, venrey_result, venrey_error_message, created_at, updated_at')
    .eq('cs3_cast_id', staff.cs3_cast_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return NextResponse.json({ staff, targets, venrey_targets: venreyTargets, latest_job: latestJob ?? null })
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { staff_id, hhmm } = body as { staff_id?: number; hhmm?: string }
  if (!staff_id || !hhmm) return NextResponse.json({ error: 'staff_id / hhmm は必須です' }, { status: 400 })

  const freetextValue = formatFreetextValue(hhmm)
  if (!freetextValue) return NextResponse.json({ error: '時刻の形式が不正です' }, { status: 400 })

  const { data: staff, error: staffErr } = await adminSupabase
    .from('staff')
    .select('id, name, cs3_cast_id')
    .eq('id', staff_id)
    .single()
  if (staffErr || !staff) return NextResponse.json({ error: 'スタッフが見つかりません' }, { status: 404 })
  if (!staff.cs3_cast_id) return NextResponse.json({ error: 'CS3未連携のためCP4配信対象を特定できません' }, { status: 400 })

  const [targets, venreyTargets] = await Promise.all([
    fetchTargets(staff.cs3_cast_id),
    fetchVenreyTargets(staff.cs3_cast_id),
  ])
  if (targets.length === 0 && venreyTargets.length === 0) {
    return NextResponse.json({ error: 'CP4/Venreyとも配信が有効な店舗がありません（publish_rules未設定）' }, { status: 400 })
  }

  // 直近1分以内に同キャストの pending/running ジョブ（CP4 or Venrey）があればクールダウン（連打防止）
  const since = new Date(Date.now() - 60 * 1000).toISOString()
  const { data: existing } = await adminSupabase
    .from('manual_freetext_jobs')
    .select('id')
    .eq('cs3_cast_id', staff.cs3_cast_id)
    .or('status.in.(pending,running),venrey_status.in.(pending,running)')
    .gte('created_at', since)
    .limit(1)
  if (existing && existing.length > 0) {
    return NextResponse.json({ error: '直前の反映がまだ処理中です。少し待ってから再試行してください。' }, { status: 429 })
  }

  const { data, error } = await adminSupabase
    .from('manual_freetext_jobs')
    .insert({
      staff_id: staff.id,
      cs3_cast_id: staff.cs3_cast_id,
      cast_name: staff.name,
      freetext_value: freetextValue,
      status: 'pending',
      requested_by: 'operations',
    })
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, job_id: data.id, freetext_value: freetextValue, target_count: targets.length, venrey_target_count: venreyTargets.length })
}
