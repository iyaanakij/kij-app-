import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { request as httpsRequest } from 'node:https'
import { IncomingMessage } from 'node:http'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const CS3_BASE = 'https://2nd.cs3-alice7.com/group/7175_iyashi'
const CS3_HOST = '2nd.cs3-alice7.com'
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

// CS3Alice shopid → KIJ store_id (iyashi group)
const SHOP_TO_STORE: Record<string, number> = {
  '111701': 7,  // 西船橋E
  '111702': 5,  // 成田E
  '111703': 6,  // 千葉E
  '111704': 8,  // 錦糸町E
}

// node:https を使ってSet-Cookieを確実に取得（fetch + redirect:manualはVercelでheadersが空になる）
function httpsPost(path: string, body: string): Promise<{ cookies: string[]; statusCode: number }> {
  return new Promise((resolve, reject) => {
    const req = httpsRequest({
      hostname: CS3_HOST,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
        'User-Agent': USER_AGENT,
      },
    }, (res: IncomingMessage) => {
      res.resume() // drain body
      const raw = res.headers['set-cookie'] ?? []
      const cookies = (Array.isArray(raw) ? raw : [raw]).map(c => c.split(';')[0].trim())
      resolve({ cookies, statusCode: res.statusCode ?? 0 })
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

async function getSessionCookie(): Promise<string> {
  const body = new URLSearchParams({
    method: 'login',
    shop: '111701',
    user: process.env.CS3_LOGIN_ID ?? '',
    password: process.env.CS3_PASSWORD ?? '',
  }).toString()

  const { cookies, statusCode } = await httpsPost('/group/7175_iyashi/login.php', body)
  if (statusCode !== 302 || cookies.length === 0) {
    throw new Error(`CS3Aliceログイン失敗 (status: ${statusCode}, cookies: ${cookies.length}, sample: ${cookies[0] ?? 'none'})`)
  }
  return cookies.join('; ')
}

function extractTdText(html: string, cls: string): string {
  const re = new RegExp(`<td[^>]*class="[^"]*\\b${cls}\\b[^"]*"[^>]*>([\\s\\S]*?)<\\/td>`)
  const m = html.match(re)
  if (!m) return ''
  return m[1]
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// "2026年04月01日(水) 11:20～13:00" → { time: 1120, checkoutTime: 1300, courseDuration: 100 }
function parseDatetime(str: string): { time: number; checkoutTime: number; courseDuration: number } | null {
  const m = str.match(/(\d{1,2}):(\d{2})～(\d{1,2}):(\d{2})/)
  if (!m) return null
  const sh = parseInt(m[1]), sm = parseInt(m[2])
  const eh = parseInt(m[3]), em = parseInt(m[4])
  const startMin = sh * 60 + sm
  let endMin = eh * 60 + em
  if (endMin <= startMin) endMin += 24 * 60
  return {
    time: sh * 100 + sm,
    checkoutTime: eh * 100 + em,
    courseDuration: endMin - startMin,
  }
}

function parseAmount(str: string): number {
  return parseInt(str.replace(/[^\d]/g, '')) || 0
}

interface CS3Entry {
  cs3Id: string
  storeId: number
  date: string
  time: number
  checkoutTime: number
  courseDuration: number
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

function parseReservations(html: string): CS3Entry[] {
  const entries: CS3Entry[] = []
  const rowRe = /<tr[^>]+class="[^"]*reservation_section[^"]*"([^>]*?)>([\s\S]*?)<\/tr>/g
  let rm

  while ((rm = rowRe.exec(html)) !== null) {
    const attrs = rm[1]
    const rowHtml = rm[2]

    const getAttr = (name: string) => {
      const am = attrs.match(new RegExp(`\\b${name}="([^"]*)"`, 'i'))
      return am ? am[1] : ''
    }

    const cs3Id = getAttr('hid')
    const shopCode = getAttr('shop')
    const date = getAttr('date')
    if (!cs3Id || !shopCode || !date) continue

    const storeId = SHOP_TO_STORE[shopCode]
    if (!storeId) continue

    const datetimeStr = extractTdText(rowHtml, 'reservation_list_value_datetime')
    const times = parseDatetime(datetimeStr)
    if (!times) continue

    const courseStr = extractTdText(rowHtml, 'reservation_list_value_course')
    const courseDuration = parseInt(courseStr) || times.courseDuration

    const castName = extractTdText(rowHtml, 'reservation_list_value_cast')
    if (!castName) continue

    const customerRaw = extractTdText(rowHtml, 'reservation_list_value_customersname')
    const customerName = customerRaw || null

    const phoneRaw = extractTdText(rowHtml, 'reservation_list_value_phone')
    const phone = phoneRaw.match(/[\d-]{7,}/)?.[0] ?? null

    const area = extractTdText(rowHtml, 'reservation_list_value_area') || null
    const hotel = extractTdText(rowHtml, 'reservation_list_value_location') || null
    const roomNumber = extractTdText(rowHtml, 'reservation_list_value_room_number') || null
    const nominationType = extractTdText(rowHtml, 'reservation_list_value_nominate') || null
    const media = extractTdText(rowHtml, 'reservation_list_value_media') || null
    const totalAmount = parseAmount(extractTdText(rowHtml, 'reservation_list_value_sales'))

    entries.push({
      cs3Id, storeId, date,
      time: times.time,
      checkoutTime: times.checkoutTime,
      courseDuration,
      castName, customerName, phone, area, hotel, roomNumber, nominationType, media, totalAmount,
    })
  }

  return entries
}

export async function runCS3ReservationSync() {
  const cookie = await getSessionCookie()
  if (!cookie) throw new Error('CS3Aliceへのログインに失敗しました')

  const res = await fetch(`${CS3_BASE}/schedule.reservation.php`, {
    headers: { Cookie: cookie, 'User-Agent': USER_AGENT },
  })
  if (!res.ok) throw new Error(`予約ページ取得失敗: ${res.status}`)
  const html = await res.text()

  const entries = parseReservations(html)

  const { data: allStaff } = await supabase.from('staff').select('id, name')
  const nameToId = new Map((allStaff ?? []).map(s => [s.name, s.id]))

  let synced = 0, skipped = 0

  for (const entry of entries) {
    const staffId = nameToId.get(entry.castName) ?? null
    if (!staffId) { skipped++; continue }

    const notesKey = `CS3:${entry.cs3Id}`

    const payload = {
      store_id: entry.storeId,
      date: entry.date,
      section: 'E' as const,
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

  // CS3同期レコードのうち今回取得できなかったもの（キャンセル等）を削除
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

export async function POST() {
  try {
    const result = await runCS3ReservationSync()
    return NextResponse.json({ success: true, ...result })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
