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

// .env.local を自動ロード
const fs = require('fs'), path = require('path')
const envPath = path.resolve(__dirname, '../.env.local')
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m && !process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '')
  })
}

const { createClient } = require('@supabase/supabase-js')
const { request: httpsReq } = require('https')

// ───────── 設定 ─────────
const CONFIG = {
  loginId:    process.env.CS3_LOGIN_ID    || 'kto',
  password:   process.env.CS3_PASSWORD    || '0519',
  apiUrl:     process.env.KIJ_API_URL     || 'https://kij-app.vercel.app/api/cs3-reservation-sync',
  syncSecret: process.env.SYNC_SECRET     || 'ca4b78eb-ceee-4d8d-a626-de224da569af',
  supabaseUrl:    process.env.NEXT_PUBLIC_SUPABASE_URL    || 'https://tiwxvbbevzsmaxbarpwc.supabase.co',
  supabaseKey:    process.env.SUPABASE_SERVICE_ROLE_KEY,
  autoIntervalMs: 3 * 60 * 1000, // 3分
}
// ─────────────────────────

const CS3_HOST = '2nd.cs3-alice7.com'
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const SHOP_TO_STORE = {
  '111701': 7, '111702': 5, '111703': 6, '111704': 8,
}
const SHOP_NAMES = {
  '111701': '西船橋', '111702': '成田', '111703': '千葉', '111704': '錦糸町',
}

const supabase = createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey)

// ─── HTTP ヘルパー（cs3-sync.jsと同じ） ─────────────────────────

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
    req.on('error', reject)
    req.end()
  })
}

function uploadEntries(entries) {
  return new Promise((resolve, reject) => {
    const url = new URL(CONFIG.apiUrl)
    const payload = Buffer.from(JSON.stringify({ entries }))
    const req = httpsReq({
      hostname: url.hostname, path: url.pathname, method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': payload.length,
        'Authorization': `Bearer ${CONFIG.syncSecret}`,
      },
    }, res => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }) }
        catch { resolve({ status: res.statusCode, body: data }) }
      })
    })
    req.on('error', reject)
    req.write(payload)
    req.end()
  })
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
    entries.push({
      cs3Id, storeId, date,
      time: times.time, checkoutTime: times.checkoutTime,
      courseDuration: parseInt(courseStr) || times.courseDuration,
      castName,
      customerName: extractTdText(rowHtml, 'reservation_list_value_customersname') || null,
      phone: phoneMatch ? phoneMatch[0] : null,
      area: extractTdText(rowHtml, 'reservation_list_value_area') || null,
      hotel: extractTdText(rowHtml, 'reservation_list_value_location') || null,
      roomNumber: extractTdText(rowHtml, 'reservation_list_value_room_number') || null,
      nominationType: extractTdText(rowHtml, 'reservation_list_value_nominate') || null,
      media: extractTdText(rowHtml, 'reservation_list_value_media') || null,
      totalAmount: parseInt(salesRaw.replace(/[^\d]/g, '')) || 0,
    })
  }
  return entries
}

// ─── 同期メイン処理 ────────────────────────────────────────────

let syncing = false

async function runSync(trigger = 'auto') {
  if (syncing) {
    console.log(`[${ts()}] ⚠ 同期中のためスキップ`)
    return
  }
  syncing = true
  console.log(`[${ts()}] 🔄 同期開始 (${trigger})`)

  try {
    const allEntries = []
    for (const shopCode of Object.keys(SHOP_TO_STORE)) {
      process.stdout.write(`  ${SHOP_NAMES[shopCode]} ... `)
      const cookie = await loginForShop(shopCode)
      const { status, body: html } = await httpsGet(CS3_HOST, '/group/7175_iyashi/schedule.reservation.php', cookie)
      if (status !== 200) throw new Error(`取得失敗 shop=${shopCode} (${status})`)
      const entries = parseReservations(html)
      process.stdout.write(`${entries.length}件\n`)
      allEntries.push(...entries)
    }

    const seen = new Set()
    const entries = allEntries.filter(e => { if (seen.has(e.cs3Id)) return false; seen.add(e.cs3Id); return true })

    const result = await uploadEntries(entries)
    if (result.status !== 200) throw new Error(`アップロード失敗 (${result.status})`)
    const r = result.body
    console.log(`[${ts()}] ✅ 完了 — 登録:${r.synced} スキップ:${r.skipped} 削除:${r.deleted}`)

    // 完了をSupabaseにブロードキャスト（UIに結果を返す）
    await supabase.channel('cs3-sync').send({
      type: 'broadcast', event: 'sync-done',
      payload: { synced: r.synced, skipped: r.skipped, deleted: r.deleted, at: new Date().toISOString() },
    })
  } catch (err) {
    console.error(`[${ts()}] ❌ エラー:`, err.message)
    await supabase.channel('cs3-sync').send({
      type: 'broadcast', event: 'sync-error',
      payload: { error: err.message },
    })
  } finally {
    syncing = false
  }
}

function ts() {
  return new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

// ─── メイン ────────────────────────────────────────────────────

async function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(' CS3Alice 予約同期デーモン 起動')
  console.log(` 自動同期間隔: ${CONFIG.autoIntervalMs / 60000}分`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  // Supabase Realtimeでボタントリガーを受信
  supabase.channel('cs3-sync')
    .on('broadcast', { event: 'sync-request' }, () => {
      console.log(`[${ts()}] 📲 ボタンからトリガー受信`)
      runSync('manual')
    })
    .subscribe(status => {
      if (status === 'SUBSCRIBED') console.log(`[${ts()}] 🟢 Realtime接続完了`)
    })

  // 起動時に即時同期
  await runSync('startup')

  // 3分ごとに自動同期
  setInterval(() => runSync('auto'), CONFIG.autoIntervalMs)
}

main().catch(err => {
  console.error('起動失敗:', err.message)
  process.exit(1)
})
