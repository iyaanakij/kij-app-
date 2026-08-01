import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// VPSワーカー（92/93番）と同じJST基準の「当日」判定。DBやVercelのUTCタイムゾーンに依存させない。
function todayJST(): string {
  const jst = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }))
  const y = jst.getFullYear()
  const m = String(jst.getMonth() + 1).padStart(2, '0')
  const d = String(jst.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

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
  const date = request.nextUrl.searchParams.get('date')
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

  // date指定時は該当日のジョブのみを「直近の反映」として表示する（未指定時は従来通り全体の最新1件）
  let latestJobQuery = adminSupabase
    .from('manual_freetext_jobs')
    .select('id, freetext_value, status, result, error_message, venrey_status, venrey_result, venrey_error_message, target_date, created_at, updated_at')
    .eq('cs3_cast_id', staff.cs3_cast_id)
  if (date) latestJobQuery = latestJobQuery.eq('target_date', date)
  const { data: latestJob } = await latestJobQuery
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return NextResponse.json({ staff, targets, venrey_targets: venreyTargets, latest_job: latestJob ?? null })
}

// CP4側77番スクリプトの「終了60分以内→ご予約満了」と同じ文言。この値ならVenrey側は接客中ではなく受付終了にする
const GOYO_TEXT = 'ご予約満了'

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { staff_id, hhmm, fully_booked, date } = body as { staff_id?: number; hhmm?: string; fully_booked?: boolean; date?: string }
  if (!staff_id) return NextResponse.json({ error: 'staff_id は必須です' }, { status: 400 })
  if (!fully_booked && !hhmm) return NextResponse.json({ error: 'hhmm は必須です' }, { status: 400 })
  if (date !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'date の形式が不正です' }, { status: 400 })
  }

  const freetextValue = fully_booked ? GOYO_TEXT : formatFreetextValue(hhmm!)
  if (!freetextValue) return NextResponse.json({ error: '時刻の形式が不正です' }, { status: 400 })

  const today = todayJST()
  // date未指定 or 当日指定 = 従来通りの当日リアルタイム更新（CP4 + Venrey）。
  // 翌日以降を明示指定した場合のみCP4（HP）だけを対象にし、Venreyは当日しか編集できないためskipped扱いにする。
  const isFutureDate = !!date && date !== today
  if (date && date < today) {
    return NextResponse.json({ error: '過去日は指定できません' }, { status: 400 })
  }
  const targetDate = date ?? today

  const { data: staff, error: staffErr } = await adminSupabase
    .from('staff')
    .select('id, name, cs3_cast_id')
    .eq('id', staff_id)
    .single()
  if (staffErr || !staff) return NextResponse.json({ error: 'スタッフが見つかりません' }, { status: 404 })
  if (!staff.cs3_cast_id) return NextResponse.json({ error: 'CS3未連携のためCP4配信対象を特定できません' }, { status: 400 })

  const targets = await fetchTargets(staff.cs3_cast_id)
  const venreyTargets = isFutureDate ? [] : await fetchVenreyTargets(staff.cs3_cast_id)
  if (targets.length === 0 && venreyTargets.length === 0) {
    return NextResponse.json({
      error: isFutureDate
        ? 'CP4配信が有効な店舗がありません（publish_rules未設定）'
        : 'CP4/Venreyとも配信が有効な店舗がありません（publish_rules未設定）',
    }, { status: 400 })
  }

  // 直近1分以内に同キャスト・同日付の pending/running ジョブ（CP4 or Venrey）があればクールダウン（連打防止）
  const since = new Date(Date.now() - 60 * 1000).toISOString()
  const { data: existing } = await adminSupabase
    .from('manual_freetext_jobs')
    .select('id')
    .eq('cs3_cast_id', staff.cs3_cast_id)
    .eq('target_date', targetDate)
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
      // 翌日以降はVenreyが対応不可のため最初からskippedにし、93番ワーカー（venrey_status=pending専用）には触らせない
      venrey_status: isFutureDate ? 'skipped' : 'pending',
      target_date: targetDate,
      requested_by: 'operations',
    })
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, job_id: data.id, freetext_value: freetextValue, target_count: targets.length, venrey_target_count: venreyTargets.length })
}
