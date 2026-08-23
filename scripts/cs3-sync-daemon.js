#!/usr/bin/env node
/**
 * CS3Alice 予約同期デーモン
 * 使い方: node scripts/cs3-sync-daemon.js
 *
 * 機能:
 *   - 3分ごとに自動同期
 *   - KIJツールの「予約取得」ボタン押下でも即時同期
 *
 * 【重要】CS3Aliceにアクセスできるネットワーク（店舗またはVPN）で実行すること
 */

'use strict'

// .env 自動ロード（Mac: app/.env.local、VPS: shift-sync/.env）
const fs = require('fs'), path = require('path')
const { spawn } = require('child_process')
const ENV_PATHS = [
  path.resolve(__dirname, '../.env.local'), // Mac: app/.env.local
  path.resolve(__dirname, '../.env'),        // VPS: shift-sync/.env
]
function loadEnvLine(line) {
  const m = line.match(/^([^#=]+)=(.*)$/)
  if (m && !process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '')
}
for (const p of ENV_PATHS) {
  if (fs.existsSync(p)) fs.readFileSync(p, 'utf8').split('\n').forEach(loadEnvLine)
}
// デーモン専用CS3アカウント G（2026-08-21追加、2026-08-21に命名をCS3_DAEMON_*から
// 他アカウントと同じ文字ベース命名(CS3_ID_G/CS3_PASS_G)へ統一）。常時稼働のこのデーモンが
// A account(CS3_ID、10分ごとのrun-sync.shと共用)にフォールバックしているとセッションを
// 奪い合うため、専用のCS3_ID_G/CS3_PASS_Gがあれば最優先で使う。
if (process.env.CS3_ID_G && process.env.CS3_PASS_G) {
  process.env.CS3_LOGIN_ID = process.env.CS3_ID_G
  process.env.CS3_PASSWORD = process.env.CS3_PASS_G
}
// VPS env var aliases (CS3_ID/CS3_PASS → CS3_LOGIN_ID/CS3_PASSWORD)
if (!process.env.CS3_LOGIN_ID && process.env.CS3_ID) process.env.CS3_LOGIN_ID = process.env.CS3_ID
if (!process.env.CS3_PASSWORD && process.env.CS3_PASS) process.env.CS3_PASSWORD = process.env.CS3_PASS

const { createClient } = require('@supabase/supabase-js')
const { request: httpsReq } = require('https')

function requiredEnv(name) {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required`)
  return value
}

// ───────── 設定 ─────────
const CONFIG = {
  loginId:      requiredEnv('CS3_LOGIN_ID'),
  password:     requiredEnv('CS3_PASSWORD'),
  supabaseUrl:  requiredEnv('NEXT_PUBLIC_SUPABASE_URL'),
  supabaseKey:  requiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
  cs3IntervalMs: 3 * 60 * 1000,  // 予約: 3分
}
// ─────────────────────────

const CS3_HOST = '2nd.cs3-alice7.com'
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const SHOP_TO_STORE = {
  '111701': 7, '111702': 5, '111703': 6, '111704': 8,
}
// 各shop code から書き込まれうる store_id（M: storeId-4, E: storeId）
const SHOP_TO_STORE_IDS = {
  '111701': [3, 7],
  '111702': [1, 5],
  '111703': [2, 6],
  '111704': [4, 8],
}
const SHOP_NAMES = {
  '111701': '西船橋', '111702': '成田', '111703': '千葉', '111704': '錦糸町',
}

const supabase = createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey)

// ─── HTTP ヘルパー（cs3-sync.jsと同じ） ─────────────────────────

const CS3_TIMEOUT_MS = 20000

function httpsPost(hostname, path, body, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const buf = Buffer.from(body)
    const req = httpsReq({
      hostname, path, method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': buf.length,
        'User-Agent': USER_AGENT,
        ...extraHeaders,
      },
    }, res => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        const cookies = (res.headers['set-cookie'] ?? []).map(c => c.split(';')[0].trim())
        resolve({ status: res.statusCode, cookies, body: data, headers: res.headers })
      })
    })
    req.setTimeout(CS3_TIMEOUT_MS, () => req.destroy(new Error(`CS3 POST タイムアウト: ${path}`)))
    req.on('error', reject)
    req.write(buf)
    req.end()
  })
}

function httpsPostJson(hostname, path, payload, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload)
    const buf = Buffer.from(body)
    const req = httpsReq({
      hostname, path, method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': buf.length,
        'User-Agent': USER_AGENT,
        ...extraHeaders,
      },
    }, res => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => resolve({ status: res.statusCode, body: data }))
    })
    req.setTimeout(CS3_TIMEOUT_MS, () => req.destroy(new Error(`HTTPS POST タイムアウト: ${hostname}${path}`)))
    req.on('error', reject)
    req.write(buf)
    req.end()
  })
}

function httpsGet(hostname, path, cookieStr) {
  return new Promise((resolve, reject) => {
    const req = httpsReq({
      hostname, path, method: 'GET',
      headers: { Cookie: cookieStr, 'User-Agent': USER_AGENT },
    }, res => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => resolve({ status: res.statusCode, body: data }))
    })
    req.setTimeout(CS3_TIMEOUT_MS, () => req.destroy(new Error(`CS3 GET タイムアウト: ${path}`)))
    req.on('error', reject)
    req.end()
  })
}

function formatHHMM(value) {
  if (value == null) return '--:--'
  return String(value).padStart(4, '0').replace(/^(\d{2})(\d{2})$/, '$1:$2')
}

function buildReservationLineMessage(entry, section) {
  const lines = [
    '【新しい予約が入りました】',
    `日時: ${entry.date} ${formatHHMM(entry.time)}-${formatHHMM(entry.checkoutTime)}`,
    `店舗: ${section}`,
    `コース: ${entry.courseDuration}分`,
  ]
  if (entry.nominationType) lines.push(`指名: ${entry.nominationType}`)
  if (entry.area) lines.push(`エリア: ${entry.area}`)
  if (entry.hotel) lines.push(`場所: ${entry.hotel}`)
  lines.push('詳細は管理画面で確認してください。')
  return lines.join('\n')
}

async function markReservationLineSkipped(entry, staffId, reason, error) {
  const { data: existing } = await supabase
    .from('cs3_reservation_line_notifications')
    .select('status, line_sent_at')
    .eq('cs3_id', entry.cs3Id)
    .maybeSingle()
  if (existing?.line_sent_at || existing?.status === 'sent') return

  await supabase.from('cs3_reservation_line_notifications').upsert({
    cs3_id: entry.cs3Id,
    staff_id: staffId,
    status: 'skipped',
    skipped_reason: reason,
    error: error ?? null,
    attempted_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'cs3_id' })
}

async function sendLineMessage(lineUserId, message) {
  const token = process.env.LINE_MESSAGING_ACCESS_TOKEN
  if (!token) return false

  const res = await httpsPostJson('api.line.me', '/v2/bot/message/push', {
    to: lineUserId,
    messages: [{ type: 'text', text: message }],
  }, { Authorization: `Bearer ${token}` })

  if (res.status < 200 || res.status >= 300) {
    console.error(`[${ts()}] [LINE] push failed ${res.status}: ${res.body}`)
    return false
  }
  return true
}

async function notifyReservationLine(entry, staffId, reservationId, section) {
  const { data: existing } = await supabase
    .from('cs3_reservation_line_notifications')
    .select('status, line_sent_at')
    .eq('cs3_id', entry.cs3Id)
    .maybeSingle()

  if (existing?.line_sent_at || existing?.status === 'sent') return 'duplicate'

  const message = buildReservationLineMessage(entry, section)
  const attemptedAt = new Date().toISOString()
  await supabase.from('cs3_reservation_line_notifications').upsert({
    cs3_id: entry.cs3Id,
    reservation_id: reservationId,
    staff_id: staffId,
    status: 'pending',
    skipped_reason: null,
    message,
    error: null,
    attempted_at: attemptedAt,
    updated_at: attemptedAt,
  }, { onConflict: 'cs3_id' })

  const { data: role } = await supabase
    .from('user_roles')
    .select('line_user_id')
    .eq('staff_id', staffId)
    .eq('role', 'cast')
    .maybeSingle()

  if (!role?.line_user_id) {
    await markReservationLineSkipped(entry, staffId, 'no_line_id')
    return 'no_line_id'
  }

  const ok = await sendLineMessage(role.line_user_id, message).catch(error => {
    console.error(`[${ts()}] [LINE] push failed: ${error.message}`)
    return false
  })
  const finishedAt = new Date().toISOString()
  await supabase.from('cs3_reservation_line_notifications').update({
    status: ok ? 'sent' : 'failed',
    skipped_reason: null,
    error: ok ? null : 'line_push_failed',
    line_sent_at: ok ? finishedAt : null,
    attempted_at: finishedAt,
    updated_at: finishedAt,
  }).eq('cs3_id', entry.cs3Id)

  return ok ? 'sent' : 'failed'
}

// Vercel経由を廃止し、Supabaseに直接書き込む（Vercel 10秒タイムアウト回避）
async function upsertReservationsToSupabase(entries, successfulShops) {
  const { data: allStaff } = await supabase.from('staff').select('id, name')
  const nameToId = new Map((allStaff ?? []).map(s => [s.name, s.id]))

  // 既存CS3予約を一括取得（今日以降）。store_id も取得して削除を店舗単位に限定する
  const today = new Date().toISOString().split('T')[0]
  const { data: existingRows } = await supabase
    .from('reservations').select('id, notes, store_id')
    .like('notes', 'CS3:%').gte('date', today)
  const existingMap = new Map((existingRows ?? []).map(r => [r.notes, r.id]))

  // 成功した店舗の store_id のみ削除候補にする（失敗店舗の予約は絶対に消さない）
  const safeStoreIds = new Set(
    [...successfulShops].flatMap(code => SHOP_TO_STORE_IDS[code] ?? [])
  )

  const toInsert = [], toUpdate = []
  let skipped = 0
  let lineSent = 0, lineSkipped = 0, lineDuplicate = 0, lineFailed = 0
  const syncedKeys = []

  for (const entry of entries) {
    const staffId = nameToId.get(entry.castName) ?? null
    if (!staffId) {
      skipped++
      await markReservationLineSkipped(entry, null, 'staff_name_unmatched', entry.castName)
      continue
    }

    const isM = /^[MＭ]/.test(entry.nominationType ?? '')
    const section = isM ? 'M' : 'E'
    const notesKey = `CS3:${entry.cs3Id}`
    syncedKeys.push(notesKey)

    const payload = {
      store_id: isM ? entry.storeId - 4 : entry.storeId,
      date: entry.date, section,
      time: entry.time, checkout_time: entry.checkoutTime,
      customer_name: entry.customerName, phone: entry.phone,
      area: entry.area, hotel: entry.hotel, room_number: entry.roomNumber,
      staff_id: staffId, nomination_type: entry.nominationType,
      course_duration: entry.courseDuration, media: entry.media,
      total_amount: entry.totalAmount,
      nude: entry.nude ?? false,
      option1: entry.playOptions?.[0] ?? null,
      option2: entry.playOptions?.[1] ?? null,
      option3: entry.playOptions?.[2] ?? null,
      option4: entry.playOptions?.[3] ?? null,
      option5: entry.playOptions?.[4] ?? null,
      option6: entry.playOptions?.[5] ?? null,
      extension: entry.extensionFee ?? 0,
      discount: entry.discountAmount ?? 0,
      cs3_cast_fee: entry.castFeeCs3 ?? null,
      status: entry.status,
      notes: notesKey,
    }

    const existingId = existingMap.get(notesKey)
    if (existingId) toUpdate.push({ id: existingId, payload })
    else {
      toInsert.push({
        entry,
        staffId,
        section,
        payload: { ...payload, confirmed: false, communicated: false, arrival_confirmed: false, checked: false },
      })
    }
  }

  // 並列 update + 一括 insert
  let insertedRows = []
  await Promise.all([
    ...toUpdate.map(({ id, payload }) =>
      supabase.from('reservations').update(payload).eq('id', id)
    ),
    toInsert.length > 0
      ? supabase.from('reservations').insert(toInsert.map(item => item.payload)).select('id, notes')
        .then(({ data, error }) => {
          if (error) throw error
          insertedRows = data ?? []
        })
      : Promise.resolve(),
  ])

  const insertedIdByNotes = new Map(insertedRows.map(r => [r.notes, r.id]))
  for (const item of toInsert) {
    const reservationId = insertedIdByNotes.get(item.payload.notes)
    if (!reservationId) continue
    if (item.payload.status === 'cancelled') { lineSkipped++; continue }
    const result = await notifyReservationLine(item.entry, item.staffId, reservationId, item.section)
    if (result === 'sent') lineSent++
    else if (result === 'duplicate') lineDuplicate++
    else if (result === 'failed') lineFailed++
    else lineSkipped++
  }

  // CS3Aliceから消えたレコードを削除（成功した店舗の store_id に限定）
  const toDelete = (existingRows ?? [])
    .filter(r => safeStoreIds.has(r.store_id) && !syncedKeys.includes(r.notes ?? ''))
    .map(r => r.id)
  if (toDelete.length > 0) {
    await supabase.from('reservations').delete().in('id', toDelete)
  }

  return { synced: toUpdate.length + toInsert.length, skipped, deleted: toDelete.length, lineSent, lineSkipped, lineDuplicate, lineFailed }
}

async function loginForShop(shopCode) {
  const body = new URLSearchParams({
    method: 'login', shop: shopCode,
    user: CONFIG.loginId, password: CONFIG.password,
  }).toString()
  const res = await httpsPost(CS3_HOST, '/group/7175_iyashi/login.php', body)
  if (res.status !== 302 || res.cookies.length === 0) {
    throw new Error(`ログイン失敗 shop=${shopCode} (status=${res.status})`)
  }
  return res.cookies.join('; ')
}

// CS3 play フィールド → nude / option[] に変換
const OP_KEYWORD_MAP = [
  { keyword: '聖',          value: '聖水' },
  { keyword: 'ロープ',      value: 'ロープ' },
  { keyword: 'パンティ',    value: '私物パンティ' },
  { keyword: 'ストッキング', value: 'ストッキング' },
  { keyword: 'Ｐ浣',        value: 'プラスチック浣腸' }, // 略称を先に判定
  { keyword: '浣腸',        value: 'プラスチック浣腸' },
  { keyword: 'コスプレ',    value: 'コスプレ' },
]
function parsePlay(playText) {
  const nude = /Ｎ/.test(playText) // 全角Ｎ = ヌード
  const seen = new Set()
  const options = OP_KEYWORD_MAP
    .filter(m => playText.includes(m.keyword) && !seen.has(m.value) && seen.add(m.value))
    .map(m => m.value)
  return { nude, options }
}

// CS3 discount フィールド → 割引金額（整数）に変換
// 「-数字」形式のみ有効（「激割80以上」等のキャンペーン名は0扱い）
function parseDiscountAmount(discountText) {
  if (!discountText) return 0
  const m = discountText.match(/[-－](\d[\d,]*)/)
  return m ? parseInt(m[1].replace(/,/g, '')) : 0
}

function extractTdText(html, cls) {
  const re = new RegExp(`<td[^>]*class="[^"]*\\b${cls}\\b[^"]*"[^>]*>([\\s\\S]*?)<\\/td>`)
  const m = html.match(re)
  if (!m) return ''
  return m[1].replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
}

function parseDatetime(str) {
  const m = str.match(/(\d{1,2}):(\d{2})～(\d{1,2}):(\d{2})/)
  if (!m) return null
  const sh = +m[1], sm = +m[2], eh = +m[3], em = +m[4]
  const startMin = sh * 60 + sm
  let endMin = eh * 60 + em
  if (endMin <= startMin) endMin += 24 * 60
  return { time: sh * 100 + sm, checkoutTime: eh * 100 + em, courseDuration: endMin - startMin }
}

function normalizePhone(value) {
  const digits = String(value ?? '').replace(/\D/g, '')
  return digits.length >= 7 ? digits : null
}

function reservationCheckoutIso(entry) {
  if (!entry.date || entry.time == null || entry.checkoutTime == null) return null
  const m = entry.date.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  const y = Number(m[1]), month = Number(m[2]), d = Number(m[3])
  const startHour = Math.floor(entry.time / 100)
  const startMinute = entry.time % 100
  const endHour = Math.floor(entry.checkoutTime / 100)
  const endMinute = entry.checkoutTime % 100
  const startMinutes = startHour * 60 + startMinute
  const endMinutes = endHour * 60 + endMinute
  const dayOffset = endMinutes <= startMinutes ? 1 : 0
  const utcMs = Date.UTC(y, month - 1, d + dayOffset, endHour - 9, endMinute, 0)
  const visitedAt = new Date(utcMs)
  if (Number.isNaN(visitedAt.getTime()) || visitedAt.getTime() > Date.now()) return null
  return visitedAt.toISOString()
}

async function upsertCustomerVisitRecency(entries) {
  const latestByPhone = new Map()
  let skippedInvalid = 0
  let skippedFuture = 0

  for (const entry of entries) {
    const phone = normalizePhone(entry.phone)
    if (!phone) { skippedInvalid++; continue }

    const lastVisitedAt = reservationCheckoutIso(entry)
    if (!lastVisitedAt) { skippedFuture++; continue }

    const existing = latestByPhone.get(phone)
    if (!existing || lastVisitedAt > existing.last_visited_at) {
      latestByPhone.set(phone, { phone, last_visited_at: lastVisitedAt })
    }
  }

  const candidates = [...latestByPhone.values()]
  if (candidates.length === 0) {
    return { upserted: 0, skippedInvalid, skippedFuture, skippedOlder: 0 }
  }

  const { data: existingRows, error: fetchError } = await supabase
    .from('customer_visit_recency')
    .select('phone, last_visited_at, visit_count')
    .in('phone', candidates.map(c => c.phone))
  if (fetchError) throw fetchError

  const existingByPhone = new Map((existingRows ?? []).map(r => [r.phone, r]))
  const now = new Date().toISOString()
  let skippedOlder = 0
  const rows = []

  for (const candidate of candidates) {
    const existing = existingByPhone.get(candidate.phone)
    if (existing && candidate.last_visited_at <= existing.last_visited_at) {
      skippedOlder++
      continue
    }
    rows.push({
      phone: candidate.phone,
      last_visited_at: candidate.last_visited_at,
      visit_count: existing ? Number(existing.visit_count ?? 0) + 1 : 1,
      last_seen_at: now,
      updated_at: now,
    })
  }

  if (rows.length === 0) {
    return { upserted: 0, skippedInvalid, skippedFuture, skippedOlder }
  }

  const { error: upsertError } = await supabase
    .from('customer_visit_recency')
    .upsert(rows, { onConflict: 'phone' })
  if (upsertError) throw upsertError

  return { upserted: rows.length, skippedInvalid, skippedFuture, skippedOlder }
}

function parseReservations(html) {
  const entries = []
  const rowRe = /<tr[^>]+class="[^"]*reservation_section[^"]*"([^>]*?)>([\s\S]*?)<\/tr>/g
  let rm
  while ((rm = rowRe.exec(html)) !== null) {
    const attrs = rm[1], rowHtml = rm[2]
    const getAttr = name => { const a = attrs.match(new RegExp(`\\b${name}="([^"]*)"`, 'i')); return a ? a[1] : '' }
    const cs3Id = getAttr('hid'), shopCode = getAttr('shop'), date = getAttr('date')
    if (!cs3Id || !shopCode || !date) continue
    const storeId = SHOP_TO_STORE[shopCode]
    if (!storeId) continue
    // CS3側でキャンセル済みの予約はreservation_list_value_typeが「キャンセル」になる。
    // 行自体はCS3側でhistory扱いで残り続ける。以前はここで除外していたため
    // キャンセルの履歴が一切残らなかった。KPI集計でキャンセル数を出すため、
    // 除外せずstatus='cancelled'として保存する（既存の同期delete判定にも
    // 引っかからなくなり、行として残り続ける）。
    const typeText = extractTdText(rowHtml, 'reservation_list_value_type')
    const status = typeText.includes('キャンセル') ? 'cancelled' : 'confirmed'
    const datetimeStr = extractTdText(rowHtml, 'reservation_list_value_datetime')
    const times = parseDatetime(datetimeStr)
    if (!times) continue
    const castName = extractTdText(rowHtml, 'reservation_list_value_cast')
    if (!castName) continue
    const courseStr = extractTdText(rowHtml, 'reservation_list_value_course')
    const salesRaw = extractTdText(rowHtml, 'reservation_list_value_sales')
    const phoneRaw = extractTdText(rowHtml, 'reservation_list_value_phone')
    const phoneMatch = phoneRaw.match(/[\d-]{7,}/)
    const playRaw = extractTdText(rowHtml, 'reservation_list_value_play')
    const discountRaw = extractTdText(rowHtml, 'reservation_list_value_discount')
    const { nude, options: playOptions } = parsePlay(playRaw)
    const baseCourse = parseInt(courseStr)
    const extMin = baseCourse > 0 ? Math.max(0, times.courseDuration - baseCourse) : 0
    const extensionFee = (extMin > 0 && extMin % 10 === 0) ? (extMin / 10) * 3000 : 0
    // fee_pre=暫定委託費(キャスト取り分)、fee=確定値があれば優先
    const feeActual = parseInt(extractTdText(rowHtml, 'reservation_list_value_fee').replace(/[^\d]/g, '')) || 0
    const feePre    = parseInt(extractTdText(rowHtml, 'reservation_list_value_fee_pre').replace(/[^\d]/g, '')) || 0
    const castFeeCs3 = feeActual > 0 ? feeActual : (feePre > 0 ? feePre : null)
    entries.push({
      cs3Id, storeId, date, status,
      time: times.time, checkoutTime: times.checkoutTime,
      courseDuration: baseCourse || times.courseDuration,
      castName,
      customerName: extractTdText(rowHtml, 'reservation_list_value_customersname') || null,
      phone: phoneMatch ? phoneMatch[0] : null,
      area: extractTdText(rowHtml, 'reservation_list_value_area') || null,
      hotel: extractTdText(rowHtml, 'reservation_list_value_location') || null,
      roomNumber: extractTdText(rowHtml, 'reservation_list_value_room_number') || null,
      nominationType: extractTdText(rowHtml, 'reservation_list_value_nominate') || null,
      media: extractTdText(rowHtml, 'reservation_list_value_media') || null,
      totalAmount: parseInt(salesRaw.replace(/[^\d]/g, '')) || 0,
      nude,
      playOptions,
      extensionFee,
      discountAmount: parseDiscountAmount(discountRaw),
      castFeeCs3,
    })
  }
  return entries
}

// ─── 同期メイン処理 ────────────────────────────────────────────

let syncing = false

const SYNC_TIMEOUT_MS = 180000 // 4店舗×(login+GET)×20s = max 160s

async function runSync(trigger = 'auto') {
  if (syncing) {
    console.log(`[${ts()}] ⚠ 同期中のためスキップ`)
    return
  }
  syncing = true
  console.log(`[${ts()}] 🔄 同期開始 (${trigger})`)

  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('同期タイムアウト（180秒）')), SYNC_TIMEOUT_MS)
  )

  try {
    await Promise.race([syncWork(), timeout])
  } catch (err) {
    console.error(`[${ts()}] ❌ エラー:`, err.message)
    // syncing を先に解除してから非同期ブロードキャスト（httpSend()がハングしても影響しない）
    syncing = false
    supabase.channel('cs3-sync').httpSend('sync-error', { error: err.message }).catch(() => {})
    return
  }
  syncing = false
}

async function syncWork() {
  const allEntries = []
  const successfulShops = new Set()
  for (const shopCode of Object.keys(SHOP_TO_STORE)) {
    process.stdout.write(`  ${SHOP_NAMES[shopCode]} ... `)
    try {
      const cookie = await loginForShop(shopCode)
      const { status, body: html } = await httpsGet(CS3_HOST, '/group/7175_iyashi/schedule.reservation.php', cookie)
      if (status !== 200) throw new Error(`取得失敗 shop=${shopCode} (${status})`)
      const entries = parseReservations(html)
      process.stdout.write(`${entries.length}件\n`)
      allEntries.push(...entries)
      successfulShops.add(shopCode)
    } catch (err) {
      process.stdout.write(`❌ ${err.message}\n`)
    }
  }
  if (successfulShops.size === 0) throw new Error('全店舗でCS3取得失敗')

  const seen = new Set()
  const entries = allEntries.filter(e => { if (seen.has(e.cs3Id)) return false; seen.add(e.cs3Id); return true })

  const r = await upsertReservationsToSupabase(entries, successfulShops)
  // キャンセルは実際の来店ではないため、来店履歴(customer_visit_recency)には反映しない
  const confirmedEntries = entries.filter(e => e.status !== 'cancelled')
  const recency = await upsertCustomerVisitRecency(confirmedEntries).catch(error => {
    console.error(`[${ts()}] ⚠ customer_visit_recency 更新失敗: ${error.message}`)
    return { upserted: 0, skippedInvalid: 0, skippedFuture: 0, skippedOlder: 0, error: error.message }
  })
  console.log(`[${ts()}] ✅ 完了 — 登録:${r.synced} スキップ:${r.skipped} 削除:${r.deleted} LINE送信:${r.lineSent} LINE未送信:${r.lineSkipped} LINE重複:${r.lineDuplicate} LINE失敗:${r.lineFailed} recency更新:${recency.upserted}`)

  await supabase.channel('cs3-sync').httpSend('sync-done', {
    synced: r.synced,
    skipped: r.skipped,
    deleted: r.deleted,
    lineSent: r.lineSent,
    lineSkipped: r.lineSkipped,
    lineDuplicate: r.lineDuplicate,
    lineFailed: r.lineFailed,
    recencyUpserted: recency.upserted,
    recencySkippedInvalid: recency.skippedInvalid,
    recencySkippedFuture: recency.skippedFuture,
    recencySkippedOlder: recency.skippedOlder,
    recencyError: recency.error,
    at: new Date().toISOString(),
  }).catch(() => {})
}

function ts() {
  return new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

// ─── メイン ────────────────────────────────────────────────────

// 月次CS3成績バッチは /ranking 集計ボタン（手動）に移行済み（2026-05-05）
// 自動実行は廃止。performance_batch_jobs テーブル + VPS script 96 で管理する。

async function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(' KIJ 同期デーモン 起動')
  console.log(` 予約: ${CONFIG.cs3IntervalMs / 60000}分ごと`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  // 予約同期トリガー
  supabase.channel('cs3-sync')
    .on('broadcast', { event: 'sync-request' }, () => {
      console.log(`[${ts()}] 📲 予約取得ボタン受信`)
      runSync('manual')
    })
    .subscribe(status => {
      if (status === 'SUBSCRIBED') console.log(`[${ts()}] 🟢 Realtime接続完了`)
    })

  // 起動時に即時実行
  await runSync('startup')

  // 定期自動同期
  setInterval(() => {
    runSync('auto')
  }, CONFIG.cs3IntervalMs)
}

main().catch(err => {
  console.error('起動失敗:', err.message)
  process.exit(1)
})
