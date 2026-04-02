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
  shiftApiUrl: (process.env.KIJ_API_URL || 'https://kij-app.vercel.app').replace('/api/cs3-reservation-sync','') + '/api/shift-sync',
  syncSecret: process.env.SYNC_SECRET     || 'ca4b78eb-ceee-4d8d-a626-de224da569af',
  supabaseUrl:    process.env.NEXT_PUBLIC_SUPABASE_URL    || 'https://tiwxvbbevzsmaxbarpwc.supabase.co',
  supabaseKey:    process.env.SUPABASE_SERVICE_ROLE_KEY,
  cs3IntervalMs:   3 * 60 * 1000,  // 予約: 3分
  shiftIntervalMs: 30 * 60 * 1000, // シフト: 30分
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

// ─── シフト同期（City Heaven） ──────────────────────────────────

const STORE_ATTEND_URLS = [
  { storeId: 1, url: 'https://www.cityheaven.net/chiba/A1204/A120401/narita-kairaku/attend/' },
  { storeId: 2, url: 'https://www.cityheaven.net/chiba/A1201/A120101/m-kairaku/attend/' },
  { storeId: 3, url: 'https://www.cityheaven.net/chiba/A1202/A120201/anappu_nishi/attend/' },
  { storeId: 4, url: 'https://www.cityheaven.net/tokyo/A1313/A131301/m-kairaku/attend/' },
  { storeId: 5, url: 'https://www.cityheaven.net/chiba/A1204/A120401/aromaseikan/attend/' },
  { storeId: 6, url: 'https://www.cityheaven.net/chiba/A1201/A120101/iyashitakutechiba/attend/' },
  { storeId: 7, url: 'https://www.cityheaven.net/chiba/A1202/A120201/iyashitakute/attend/' },
  { storeId: 8, url: 'https://www.cityheaven.net/tokyo/A1313/A131301/iyashitakute/attend/' },
]

function httpsGetUrl(urlStr) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr)
    const req = httpsReq({
      hostname: u.hostname, path: u.pathname + u.search, method: 'GET',
      headers: { Cookie: 'nenrei=y', 'User-Agent': USER_AGENT },
    }, res => {
      let data = ''
      res.on('data', c => data += c)
      res.on('end', () => resolve({ status: res.statusCode, body: data }))
    })
    req.on('error', reject)
    req.end()
  })
}

function parseDisplayDate(month, day) {
  const now = new Date()
  const m = parseInt(month), d = parseInt(day)
  let year = now.getFullYear()
  if (m < now.getMonth() + 1) year++
  return `${year}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`
}

async function fetchShiftStore(storeId, url) {
  const { status, body: html } = await httpsGetUrl(url)
  if (status !== 200) throw new Error(`City Heaven取得失敗 storeId=${storeId} (${status})`)
  const entries = []
  const blocks = html.split(/<div[^>]*id="shukkin_list"/)
  blocks.shift()
  for (const block of blocks) {
    const nameMatch = block.match(/<th[^>]*class="topbox"[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>/)
    if (!nameMatch) continue
    const name = nameMatch[1].trim()
    const dates = []
    const dateRe = /<th[^>]*class="week"[^>]*>(?:\s*<[^>]+>)*\s*(\d+)\/(\d+)\(/g
    let dm
    while ((dm = dateRe.exec(block)) !== null) dates.push(parseDisplayDate(dm[1], dm[2]))
    if (dates.length === 0) continue
    const timeRe = /<td[^>]+width=["']?110["']?[^>]*>([\s\S]*?)<\/td>/g
    let tm, idx = 0
    while ((tm = timeRe.exec(block)) !== null && idx < dates.length) {
      const timeMatch = tm[1].match(/(\d{1,2}):(\d{2})[\s\S]*?(\d{1,2}):(\d{2})/)
      if (timeMatch) {
        const start = parseInt(timeMatch[1]) + parseInt(timeMatch[2]) / 60
        let end = parseInt(timeMatch[3]) + parseInt(timeMatch[4]) / 60
        if (end < start) end += 24
        entries.push({ name, storeId, date: dates[idx], start, end })
      }
      idx++
    }
  }
  return entries
}

function uploadShiftEntries(entries) {
  return new Promise((resolve, reject) => {
    const url = new URL(CONFIG.shiftApiUrl)
    const payload = Buffer.from(JSON.stringify({ entries }))
    const req = httpsReq({
      hostname: url.hostname, path: url.pathname, method: 'POST',
      headers: {
        'Content-Type': 'application/json', 'Content-Length': payload.length,
        'Authorization': `Bearer ${CONFIG.syncSecret}`,
      },
    }, res => {
      let data = ''
      res.on('data', c => data += c)
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }) }
        catch { resolve({ status: res.statusCode, body: data }) }
      })
    })
    req.setTimeout(30000, () => { req.destroy(new Error('uploadShiftEntries タイムアウト（30秒）')) })
    req.on('error', reject)
    req.write(payload)
    req.end()
  })
}

let shiftSyncing = false

async function runShiftSync(trigger = 'auto') {
  if (shiftSyncing) return
  shiftSyncing = true
  console.log(`[${ts()}] 📅 シフト同期開始 (${trigger})`)
  try {
    const allEntries = []
    for (const { storeId, url } of STORE_ATTEND_URLS) {
      process.stdout.write(`  store${storeId} ... `)
      const entries = await fetchShiftStore(storeId, url)
      process.stdout.write(`${entries.length}件\n`)
      allEntries.push(...entries)
    }
    const result = await uploadShiftEntries(allEntries)
    if (result.status !== 200) throw new Error(`アップロード失敗 (${result.status})`)
    const r = result.body
    console.log(`[${ts()}] ✅ シフト完了 — 登録:${r.synced} スキップ:${r.skipped} 削除:${r.deleted}`)
    await supabase.channel('shift-sync').send({
      type: 'broadcast', event: 'shift-sync-done',
      payload: { synced: r.synced, skipped: r.skipped, deleted: r.deleted },
    })
  } catch (err) {
    console.error(`[${ts()}] ❌ シフトエラー:`, err.message)
    await supabase.channel('shift-sync').send({
      type: 'broadcast', event: 'shift-sync-error', payload: { error: err.message },
    })
  } finally {
    shiftSyncing = false
  }
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
  console.log(' KIJ 同期デーモン 起動')
  console.log(` 予約: ${CONFIG.cs3IntervalMs / 60000}分ごと / シフト: ${CONFIG.shiftIntervalMs / 60000}分ごと`)
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

  // シフト同期トリガー
  supabase.channel('shift-sync')
    .on('broadcast', { event: 'shift-sync-request' }, () => {
      console.log(`[${ts()}] 📲 HP同期ボタン受信`)
      runShiftSync('manual')
    })
    .subscribe()

  // 起動時に即時実行
  await runSync('startup')
  await runShiftSync('startup')

  // 定期自動同期
  setInterval(() => runSync('auto'), CONFIG.cs3IntervalMs)
  setInterval(() => runShiftSync('auto'), CONFIG.shiftIntervalMs)
}

main().catch(err => {
  console.error('起動失敗:', err.message)
  process.exit(1)
})
