/**
 * CS3Alice予約データ受け取りエンドポイント
 * ローカルの cs3-sync.js スクリプトからのみ呼ばれる
 * Vercel から直接 CS3Alice を叩くと IP ブロックされるため、
 * スクレイピングはローカルスクリプト側で行う
 */
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export interface CS3Entry {
  cs3Id: string
  storeId: number
  date: string
  time: number          // HHMM (例: 1120 = 11:20)
  checkoutTime: number  // HHMM
  courseDuration: number // 分
  castName: string
  customerName: string | null
  phone: string | null
  area: string | null
  hotel: string | null
  roomNumber: string | null
  nominationType: string | null
  media: string | null
  totalAmount: number
}

async function upsertEntries(entries: CS3Entry[]) {
  const { data: allStaff } = await supabase.from('staff').select('id, name')
  const nameToId = new Map((allStaff ?? []).map(s => [s.name, s.id]))

  let synced = 0, skipped = 0

  for (const entry of entries) {
    const staffId = nameToId.get(entry.castName) ?? null
    if (!staffId) { skipped++; continue }

    const notesKey = `CS3:${entry.cs3Id}`
    // nomination_typeの先頭がM/Ｍ（全角）ならM性感俱楽部、それ以外はE（癒したくて）
    // CS3AliceのstoreIdはE店(5-8)固定なのでM判定時はE店ID-4でM店IDに変換
    const isM = /^[MＭ]/.test(entry.nominationType ?? '')
    const section: 'M' | 'E' = isM ? 'M' : 'E'
    const storeId = isM ? entry.storeId - 4 : entry.storeId
    const payload = {
      store_id: storeId,
      date: entry.date,
      section,
      time: entry.time,
      checkout_time: entry.checkoutTime,
      customer_name: entry.customerName,
      phone: entry.phone,
      area: entry.area,
      hotel: entry.hotel,
      room_number: entry.roomNumber,
      staff_id: staffId,
      nomination_type: entry.nominationType,
      course_duration: entry.courseDuration,
      media: entry.media,
      total_amount: entry.totalAmount,
      confirmed: true,
      communicated: false,
      nude: false,
      arrival_confirmed: false,
      checked: false,
      notes: notesKey,
    }

    const { data: existing } = await supabase
      .from('reservations').select('id')
      .eq('notes', notesKey)
      .maybeSingle()

    if (existing?.id) {
      await supabase.from('reservations').update(payload).eq('id', existing.id)
    } else {
      await supabase.from('reservations').insert(payload)
    }
    synced++
  }

  // キャンセル等でCS3Aliceから消えたレコードを削除
  const today = new Date().toISOString().split('T')[0]
  const syncedKeys = entries.map(e => `CS3:${e.cs3Id}`)
  const { data: existingCS3 } = await supabase
    .from('reservations').select('id, notes')
    .like('notes', 'CS3:%')
    .gte('date', today)

  const toDelete = (existingCS3 ?? [])
    .filter(r => !syncedKeys.includes(r.notes ?? ''))
    .map(r => r.id)

  if (toDelete.length > 0) {
    await supabase.from('reservations').delete().in('id', toDelete)
  }

  return { synced, skipped, total: entries.length, deleted: toDelete.length }
}

export async function POST(request: Request) {
  try {
    const auth = request.headers.get('authorization') ?? ''
    if (auth !== `Bearer ${process.env.SYNC_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const entries: CS3Entry[] = body.entries ?? []
    if (!Array.isArray(entries)) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    }

    const result = await upsertEntries(entries)
    return NextResponse.json({ success: true, ...result })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
