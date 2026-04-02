import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const STORE_ATTEND_URLS: { storeId: number; url: string }[] = [
  { storeId: 1, url: 'https://www.cityheaven.net/chiba/A1204/A120401/narita-kairaku/attend/' },
  { storeId: 2, url: 'https://www.cityheaven.net/chiba/A1201/A120101/m-kairaku/attend/' },
  { storeId: 3, url: 'https://www.cityheaven.net/chiba/A1202/A120201/anappu_nishi/attend/' },
  { storeId: 4, url: 'https://www.cityheaven.net/tokyo/A1313/A131301/m-kairaku/attend/' },
  { storeId: 5, url: 'https://www.cityheaven.net/chiba/A1204/A120401/aromaseikan/attend/' },
  { storeId: 6, url: 'https://www.cityheaven.net/chiba/A1201/A120101/iyashitakutechiba/attend/' },
  { storeId: 7, url: 'https://www.cityheaven.net/chiba/A1202/A120201/iyashitakute/attend/' },
  { storeId: 8, url: 'https://www.cityheaven.net/tokyo/A1313/A131301/iyashitakute/attend/' },
]

const FETCH_OPTS: RequestInit = {
  cache: 'no-store',
  headers: {
    'User-Agent': 'Mozilla/5.0 (compatible)',
    'Cookie': 'nenrei=y',
  },
}

interface ShiftEntry {
  name: string
  storeId: number
  date: string
  start: number
  end: number
}

function parseDisplayDate(month: string, day: string): string {
  const now = new Date()
  const m = parseInt(month)
  const d = parseInt(day)
  let year = now.getFullYear()
  // 年末年始対応: 表示月が現在月より小さければ翌年
  if (m < now.getMonth() + 1) year++
  return `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

async function fetchStoreSchedule(url: string, storeId: number): Promise<ShiftEntry[]> {
  const res = await fetch(url, FETCH_OPTS)
  const html = await res.text()
  const entries: ShiftEntry[] = []

  // キャストごとに <div id="shukkin_list"> ブロックで分割
  const blocks = html.split(/<div[^>]*id="shukkin_list"/)
  blocks.shift()

  for (const block of blocks) {
    // キャスト名: <th class="topbox"><a>名前</a>
    const nameMatch = block.match(/<th[^>]*class="topbox"[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>/)
    if (!nameMatch) continue
    const name = nameMatch[1].trim()

    // 日付ヘッダー: <th class="week">4/1(水)</th>
    const dates: string[] = []
    const dateRe = /<th[^>]*class="week"[^>]*>(?:\s*<[^>]+>)*\s*(\d+)\/(\d+)\(/g
    let dm
    while ((dm = dateRe.exec(block)) !== null) {
      dates.push(parseDisplayDate(dm[1], dm[2]))
    }
    if (dates.length === 0) continue

    // 時間セル: <td width="110">HH:MM<br />-<br />HH:MM</td>
    const timeRe = /<td[^>]+width=["']?110["']?[^>]*>([\s\S]*?)<\/td>/g
    let tm
    let idx = 0
    while ((tm = timeRe.exec(block)) !== null && idx < dates.length) {
      const content = tm[1]
      const timeMatch = content.match(/(\d{1,2}):(\d{2})[\s\S]*?(\d{1,2}):(\d{2})/)
      if (timeMatch) {
        const start = parseInt(timeMatch[1]) + parseInt(timeMatch[2]) / 60
        let end = parseInt(timeMatch[3]) + parseInt(timeMatch[4]) / 60
        if (end < start) end += 24 // 翌日終了
        entries.push({ name, storeId, date: dates[idx], start, end })
      }
      idx++
    }
  }

  return entries
}

// デーモンから受け取ったエントリをSupabaseに書き込む（一括処理版）
async function upsertShiftEntries(entries: ShiftEntry[]) {
  const { data: allStaff } = await supabase.from('staff').select('id, name')
  const nameToId = new Map((allStaff ?? []).map(s => [s.name, s.id]))

  type Payload = {
    staff_id: number; store_id: number; date: string;
    start_time: number; end_time: number; status: 'normal'; notes: string
  }
  const payloads: Payload[] = []
  let skipped = 0

  for (const entry of entries) {
    const staffId = nameToId.get(entry.name)
    if (!staffId) { skipped++; continue }
    payloads.push({
      staff_id: staffId, store_id: entry.storeId, date: entry.date,
      start_time: entry.start, end_time: entry.end,
      status: 'normal', notes: 'HP同期',
    })
  }

  if (payloads.length === 0) return { synced: 0, skipped, deleted: 0 }

  // store_id ごとに対象日付をまとめる
  const datesByStore = new Map<number, Set<string>>()
  for (const p of payloads) {
    if (!datesByStore.has(p.store_id)) datesByStore.set(p.store_id, new Set())
    datesByStore.get(p.store_id)!.add(p.date)
  }

  // 既存HP同期シフトを一括カウント（削除数算出用）→ 一括削除 → 一括INSERT
  // 622クエリ → ~17クエリ（並列）に削減
  const [existingCounts] = await Promise.all([
    Promise.all(
      [...datesByStore.entries()].map(async ([storeId, dates]) => {
        const { count } = await supabase.from('shifts')
          .select('id', { count: 'exact', head: true })
          .eq('store_id', storeId).in('date', [...dates]).eq('notes', 'HP同期')
        return count ?? 0
      })
    ),
  ])
  const existingTotal = existingCounts.reduce((a, b) => a + b, 0)
  const deleted = Math.max(0, existingTotal - payloads.length)

  // 対象日付の既存HP同期シフトを一括削除（並列）
  await Promise.all(
    [...datesByStore.entries()].map(([storeId, dates]) =>
      supabase.from('shifts').delete()
        .eq('store_id', storeId).in('date', [...dates]).eq('notes', 'HP同期')
    )
  )

  // 全件一括INSERT
  const { error } = await supabase.from('shifts').insert(payloads)
  if (error) throw new Error(error.message)

  return { synced: payloads.length, skipped, deleted }
}

export async function runShiftSync() {
  await supabase.from('stores').upsert([
    { id: 5, name: '成田（癒し）' },
    { id: 6, name: '千葉（癒し）' },
    { id: 7, name: '西船橋（癒し）' },
    { id: 8, name: '錦糸町（癒し）' },
  ], { onConflict: 'id', ignoreDuplicates: true })

  const { data: allStaff } = await supabase.from('staff').select('id, name')
  const nameToId = new Map((allStaff ?? []).map(s => [s.name, s.id]))

  const results: Record<number, { perDay: Record<string, { synced: number; skipped: number; noTime: number; deleted: number }> }> = {}

  for (const { storeId, url } of STORE_ATTEND_URLS) {
    results[storeId] = { perDay: {} }

    const entries = await fetchStoreSchedule(url, storeId)

    // 日付ごとにグループ化
    const byDate = new Map<string, ShiftEntry[]>()
    for (const entry of entries) {
      const list = byDate.get(entry.date) ?? []
      list.push(entry)
      byDate.set(entry.date, list)
    }

    for (const [date, dayEntries] of byDate) {
      let synced = 0, skipped = 0, deleted = 0
      const syncedStaffIds: number[] = []

      for (const entry of dayEntries) {
        const staffId = nameToId.get(entry.name)
        if (!staffId) { skipped++; continue }

        const payload = {
          staff_id: staffId,
          store_id: storeId,
          date,
          start_time: entry.start,
          end_time: entry.end,
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
        syncedStaffIds.push(staffId)
        synced++
      }

      // HP同期シフトのうち今回HPに掲載されていないものを削除
      const deleteQuery = supabase
        .from('shifts')
        .delete({ count: 'exact' })
        .eq('store_id', storeId)
        .eq('date', date)
        .eq('notes', 'HP同期')

      const { count } = syncedStaffIds.length > 0
        ? await deleteQuery.not('staff_id', 'in', `(${syncedStaffIds.join(',')})`)
        : await deleteQuery
      deleted = count ?? 0

      results[storeId].perDay[date] = { synced, skipped, noTime: 0, deleted }
    }
  }

  return results
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))

    // ローカルデーモンからエントリを受け取った場合はCity Heaven fetchをスキップ
    if (body?.entries && Array.isArray(body.entries)) {
      const auth = request.headers.get('authorization') ?? ''
      if (auth !== `Bearer ${process.env.SYNC_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      const result = await upsertShiftEntries(body.entries as ShiftEntry[])
      return NextResponse.json({ success: true, ...result })
    }

    // City Heavenから直接フェッチ（ローカル実行時のみ動作）
    const results = await runShiftSync()
    return NextResponse.json({ success: true, results })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
