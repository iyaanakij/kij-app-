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
  const syncedKeys = []

  for (const entry of entries) {
    const staffId = nameToId.get(entry.castName) ?? null
    if (!staffId) { skipped++; continue }

    const isM = /^[MＭ]/.test(entry.nominationType ?? '')
    const notesKey = `CS3:${entry.cs3Id}`
    syncedKeys.push(notesKey)

    const payload = {
      store_id: isM ? entry.storeId - 4 : entry.storeId,
      date: entry.date, section: isM ? 'M' : 'E',
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
      confirmed: true, communicated: false,
      arrival_confirmed: false, checked: false, notes: notesKey,
    }

    const existingId = existingMap.get(notesKey)
    if (existingId) toUpdate.push({ id: existingId, payload })
    else toInsert.push(payload)
  }

  // 並列 update + 一括 insert
  await Promise.all([
    ...toUpdate.map(({ id, payload }) =>
      supabase.from('reservations').update(payload).eq('id', id)
    ),
    toInsert.length > 0
      ? supabase.from('reservations').insert(toInsert)
      : Promise.resolve(),
  ])

  // CS3Aliceから消えたレコードを削除（成功した店舗の store_id に限定）
  const toDelete = (existingRows ?? [])
    .filter(r => safeStoreIds.has(r.store_id) && !syncedKeys.includes(r.notes ?? ''))
    .map(r => r.id)
  if (toDelete.length > 0) {
    await supabase.from('reservations').delete().in('id', toDelete)
  }

  return { synced: toUpdate.length + toInsert.length, skipped, deleted: toDelete.length }
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
    entries.push({
      cs3Id, storeId, date,
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
    // syncing を先に解除してから非同期ブロードキャスト（send()がハングしても影響しない）
    syncing = false
    supabase.channel('cs3-sync').send({
      type: 'broadcast', event: 'sync-error',
      payload: { error: err.message },
    }).catch(() => {})
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
  console.log(`[${ts()}] ✅ 完了 — 登録:${r.synced} スキップ:${r.skipped} 削除:${r.deleted}`)

  await supabase.channel('cs3-sync').send({
    type: 'broadcast', event: 'sync-done',
    payload: { synced: r.synced, skipped: r.skipped, deleted: r.deleted, at: new Date().toISOString() },
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
