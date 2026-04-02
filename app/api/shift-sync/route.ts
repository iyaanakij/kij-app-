import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// シフト同期アーキテクチャ:
//   取得: ローカルデーモン(scripts/cs3-sync-daemon.js)が公式HP(/schedule/)から7日分を取得
//   書込: デーモンがSupabaseに直接upsert（Vercelを経由しない）
//   起動: Mac launchd 自動起動 / /shift ページのHP同期ボタン(Supabase Realtime経由)
//
// このエンドポイントはデーモンがHTTP経由でエントリを送信してくる場合のフォールバック。
// 現在はデーモンがSupabaseに直書きしているため通常は呼ばれない。

interface ShiftEntry {
  name: string
  storeId: number
  date: string
  start: number
  end: number
}

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

  // (staff_id, date) 単位で重複排除
  const deduped = new Map<string, Payload>()
  for (const p of payloads) deduped.set(`${p.staff_id}:${p.date}`, p)
  const uniquePayloads = [...deduped.values()]

  const datesByStore = new Map<number, Set<string>>()
  for (const p of uniquePayloads) {
    if (!datesByStore.has(p.store_id)) datesByStore.set(p.store_id, new Set())
    datesByStore.get(p.store_id)!.add(p.date)
  }

  const existingCounts = await Promise.all(
    [...datesByStore.entries()].map(async ([storeId, dates]) => {
      const { count } = await supabase.from('shifts')
        .select('id', { count: 'exact', head: true })
        .eq('store_id', storeId).in('date', [...dates]).eq('notes', 'HP同期')
      return count ?? 0
    })
  )
  const deleted = Math.max(0, existingCounts.reduce((a, b) => a + b, 0) - uniquePayloads.length)

  await Promise.all(
    [...datesByStore.entries()].map(([storeId, dates]) =>
      supabase.from('shifts').delete()
        .eq('store_id', storeId).in('date', [...dates]).eq('notes', 'HP同期')
    )
  )

  const { error } = await supabase.from('shifts').insert(uniquePayloads)
  if (error) throw new Error(error.message)

  return { synced: uniquePayloads.length, skipped, deleted }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))

    if (body?.entries && Array.isArray(body.entries)) {
      const auth = request.headers.get('authorization') ?? ''
      if (auth !== `Bearer ${process.env.SYNC_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      const result = await upsertShiftEntries(body.entries as ShiftEntry[])
      return NextResponse.json({ success: true, ...result })
    }

    return NextResponse.json(
      { error: 'シフト取得はローカルデーモンが担当します。entries を送信してください。' },
      { status: 400 }
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
