import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const STORE_BASES: { storeId: number; base: string }[] = [
  // 快楽M性感倶楽部
  { storeId: 1, base: 'https://www.m-kairaku.com/narita' },
  { storeId: 2, base: 'https://www.m-kairaku.com/chiba' },
  { storeId: 3, base: 'https://www.m-kairaku.com' },
  { storeId: 4, base: 'https://www.m-kairaku.com/kinshicho' },
  // 癒したくて
  { storeId: 5, base: 'https://www.iyashitakute.com/narita' },
  { storeId: 6, base: 'https://www.iyashitakute.com/chiba' },
  { storeId: 7, base: 'https://www.iyashitakute.com/funabashi' },
  { storeId: 8, base: 'https://www.iyashitakute.com/kinshicho' },
]

const DAYS_TO_SYNC = 7

interface CastSchedule {
  name: string
  start: number | null
  end: number | null
}

// set_timeline JS から [{index, start, end}] を抽出
function parseTimelines(html: string): Map<number, { start: number; end: number }> {
  const map = new Map<number, { start: number; end: number }>()
  const re = /set_timeline\s*\(\s*\{[^}]*start\s*:\s*'(\d{4}\/\d{2}\/\d{2}) (\d{2}):(\d{2}):\d{2}',\s*end\s*:\s*'(\d{4}\/\d{2}\/\d{2}) (\d{2}):(\d{2}):\d{2}'/g
  // インデックスを取る
  const reIdx = /ul\.timeline:eq\((\d+)\)/g
  const indices: number[] = []
  let m
  while ((m = reIdx.exec(html)) !== null) indices.push(parseInt(m[1]))

  const times: { start: number; end: number; startDate: string; endDate: string }[] = []
  while ((m = re.exec(html)) !== null) {
    const startDate = m[1]
    const endDate = m[4]
    const start = parseInt(m[2]) + parseInt(m[3]) / 60
    let end = parseInt(m[5]) + parseInt(m[6]) / 60
    if (endDate > startDate) end += 24  // 翌日終了
    times.push({ start, end, startDate, endDate })
  }

  for (let i = 0; i < indices.length && i < times.length; i++) {
    map.set(indices[i], { start: times[i].start, end: times[i].end })
  }
  return map
}

// 今日からN日分のUnixタイムスタンプ（JST 0:00）を生成
function getDayTimestamps(days: number): { date: string; dt: number }[] {
  const results = []
  // JST = UTC+9
  const now = new Date()
  for (let i = 0; i < days; i++) {
    const d = new Date(now)
    d.setDate(d.getDate() + i)
    // JST 0:00 のUnixタイムスタンプ
    const jstMidnight = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - 9 * 3600 * 1000
    const dt = Math.floor(jstMidnight / 1000)
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    results.push({ date: dateStr, dt })
  }
  return results
}

async function fetchDaySchedule(base: string, dt: number): Promise<{ date: string; casts: CastSchedule[] }> {
  // 今日はトップページ、未来日はpaged URL
  const url = `${base}/schedule/1/?dt=${dt}`
  const res = await fetch(url, { cache: 'no-store' })
  const html = await res.text()

  // 日付確認
  const dateMatch = html.match(/(\d{4})\/(\d{2})\/(\d{2})[^の]*の出勤スケジュール/)
  const date = dateMatch
    ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`
    : ''
  if (!date) return { date: '', casts: [] }

  // set_timeline から時間取得（インデックス順）
  const timelineMap = parseTimelines(html)

  // cast_thumb_column ブロックを順番に取得
  const casts: CastSchedule[] = []
  const liPattern = /<li[^>]*class="cast_thumb_column"[^>]*>([\s\S]*?)<\/li>/g
  let match
  let idx = 0
  while ((match = liPattern.exec(html)) !== null) {
    const block = match[1]
    const nameMatch = block.match(/<div[^>]*class="cast_name"[^>]*>([\s\S]*?)<\/div>/)
    if (!nameMatch) { idx++; continue }
    const nameRaw = nameMatch[1].replace(/<[^>]+>/g, '').trim()
    const nameOnly = nameRaw.match(/^(.+?)\(/)
    const name = (nameOnly ? nameOnly[1] : nameRaw).trim()
    if (!name) { idx++; continue }

    const times = timelineMap.get(idx) ?? null
    casts.push({ name, start: times?.start ?? null, end: times?.end ?? null })
    idx++
  }

  return { date, casts }
}

export async function runShiftSync() {
  // 癒したくて store_id 5-8 が存在しない場合は自動追加
  await supabase.from('stores').upsert([
    { id: 5, name: '成田（癒し）' },
    { id: 6, name: '千葉（癒し）' },
    { id: 7, name: '西船橋（癒し）' },
    { id: 8, name: '錦糸町（癒し）' },
  ], { onConflict: 'id', ignoreDuplicates: true })

  const days = getDayTimestamps(DAYS_TO_SYNC)
  const { data: allStaff } = await supabase.from('staff').select('id, name')
  const nameToId = new Map((allStaff ?? []).map(s => [s.name, s.id]))

  // 結果: storeId -> date -> {synced, skipped, noTime}
  const results: Record<number, { perDay: Record<string, { synced: number; skipped: number; noTime: number }> }> = {}

  for (const { storeId, base } of STORE_BASES) {
    results[storeId] = { perDay: {} }

    // 7日分を並列取得
    const daySchedules = await Promise.all(
      days.map(({ dt }) => fetchDaySchedule(base, dt))
    )

    for (const { date, casts } of daySchedules) {
      if (!date) continue
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

        const { data: existing } = await supabase
          .from('shifts').select('id')
          .eq('staff_id', staffId).eq('store_id', storeId).eq('date', date)
          .maybeSingle()

        if (existing?.id) {
          await supabase.from('shifts').update(payload).eq('id', existing.id)
        } else {
          await supabase.from('shifts').insert(payload)
        }
        synced++
      }

      results[storeId].perDay[date] = { synced, skipped, noTime }
    }
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
