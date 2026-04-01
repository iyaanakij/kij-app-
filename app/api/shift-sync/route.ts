import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const STORE_SCHEDULE_URLS: { storeId: number; url: string }[] = [
  { storeId: 1, url: 'https://www.m-kairaku.com/narita/schedule/' },
  { storeId: 2, url: 'https://www.m-kairaku.com/chiba/schedule/' },
  { storeId: 3, url: 'https://www.m-kairaku.com/schedule/' },
  { storeId: 4, url: 'https://www.m-kairaku.com/kinshicho/schedule/' },
]

interface CastSchedule {
  name: string
  start: number | null
  end: number | null
}

// HH:MM～(翌 )HH:MM を小数時刻に変換
function parseTimeRange(timeStr: string): { start: number; end: number } | null {
  const m = timeStr.match(/(\d{1,2}):(\d{2})～(?:翌\s*)?(\d{1,2}):(\d{2})/)
  if (!m) return null
  const start = parseInt(m[1]) + parseInt(m[2]) / 60
  let end = parseInt(m[3]) + parseInt(m[4]) / 60
  if (timeStr.includes('翌')) end += 24
  else if (end <= start) end += 24  // 日跨ぎ（翌表記なし）
  return { start, end }
}

// スケジュールページから日付と出勤キャストを取得
async function fetchSchedule(url: string): Promise<{ date: string; casts: CastSchedule[] }> {
  const res = await fetch(url, { cache: 'no-store' })
  const html = await res.text()

  // ページの日付を抽出 (例: 2026/04/01(水)の出勤スケジュール)
  const dateMatch = html.match(/(\d{4})\/(\d{2})\/(\d{2})[^の]*の出勤スケジュール/)
  const date = dateMatch
    ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`
    : new Date().toISOString().slice(0, 10)

  const casts: CastSchedule[] = []

  // cast_thumb_column ブロックを順番に取得
  const liPattern = /<li[^>]*class="cast_thumb_column"[^>]*>([\s\S]*?)<\/li>/g
  let match
  while ((match = liPattern.exec(html)) !== null) {
    const block = match[1]

    // 名前
    const nameMatch = block.match(/<div[^>]*class="cast_name"[^>]*>([\s\S]*?)<\/div>/)
    if (!nameMatch) continue
    const nameRaw = nameMatch[1].replace(/<[^>]+>/g, '').trim()
    const nameOnly = nameRaw.match(/^(.+?)\(/)
    // 名前の後ろに年齢がない場合もそのまま使用
    const name = (nameOnly ? nameOnly[1] : nameRaw).trim()
    if (!name) continue

    // 出勤時間
    const timeMatch = block.match(/<div[^>]*class="cast_time"[^>]*>([\s\S]*?)<\/div>/)
    let start: number | null = null
    let end: number | null = null
    if (timeMatch) {
      const timeText = timeMatch[1].replace(/<[^>]+>/g, ' ').trim()
      const parsed = parseTimeRange(timeText)
      if (parsed) { start = parsed.start; end = parsed.end }
    }

    casts.push({ name, start, end })
  }

  return { date, casts }
}

export async function runShiftSync() {
  // 全店舗のスケジュールを並列取得
  const storeSchedules = await Promise.all(
    STORE_SCHEDULE_URLS.map(async ({ storeId, url }) => {
      const { date, casts } = await fetchSchedule(url)
      return { storeId, date, casts }
    })
  )

  // staffテーブルから全スタッフ取得
  const { data: allStaff } = await supabase.from('staff').select('id, name')
  const nameToId = new Map((allStaff ?? []).map(s => [s.name, s.id]))

  const results: Record<number, { date: string; synced: number; skipped: number; noTime: number }> = {}

  for (const { storeId, date, casts } of storeSchedules) {
    let synced = 0, skipped = 0, noTime = 0

    for (const cast of casts) {
      const staffId = nameToId.get(cast.name)
      if (!staffId) { skipped++; continue }

      if (cast.start === null || cast.end === null) { noTime++; continue }

      const payload = {
        staff_id: staffId,
        store_id: storeId,
        date,
        start_time: cast.start,
        end_time: cast.end,
        status: 'normal' as const,
        notes: 'HP同期',
      }

      // 既存シフトがあればupdate、なければinsert
      const { data: existing } = await supabase
        .from('shifts')
        .select('id')
        .eq('staff_id', staffId)
        .eq('store_id', storeId)
        .eq('date', date)
        .maybeSingle()

      if (existing?.id) {
        await supabase.from('shifts').update(payload).eq('id', existing.id)
      } else {
        await supabase.from('shifts').insert(payload)
      }
      synced++
    }

    results[storeId] = { date, synced, skipped, noTime }
  }

  return results
}

export async function POST() {
  try {
    const results = await runShiftSync()
    return NextResponse.json({ success: true, results })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
