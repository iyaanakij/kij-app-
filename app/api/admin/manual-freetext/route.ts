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
  return data ?? []
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
    return NextResponse.json({ staff, targets: [], latest_job: null, error: 'CS3未連携のためCP4配信対象を特定できません' })
  }

  const targets = await fetchTargets(staff.cs3_cast_id).catch(e => { throw e })

  const { data: latestJob } = await adminSupabase
    .from('manual_freetext_jobs')
    .select('id, freetext_value, status, result, error_message, created_at, updated_at')
    .eq('cs3_cast_id', staff.cs3_cast_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return NextResponse.json({ staff, targets, latest_job: latestJob ?? null })
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

  const targets = await fetchTargets(staff.cs3_cast_id)
  if (targets.length === 0) {
    return NextResponse.json({ error: 'CP4配信が有効な店舗がありません（publish_rules未設定）' }, { status: 400 })
  }

  // 直近1分以内に同キャストの pending/running ジョブがあればクールダウン（連打防止）
  const since = new Date(Date.now() - 60 * 1000).toISOString()
  const { data: existing } = await adminSupabase
    .from('manual_freetext_jobs')
    .select('id')
    .eq('cs3_cast_id', staff.cs3_cast_id)
    .in('status', ['pending', 'running'])
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
  return NextResponse.json({ ok: true, job_id: data.id, freetext_value: freetextValue, target_count: targets.length })
}
