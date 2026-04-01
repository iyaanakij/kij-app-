#!/usr/bin/env node
/**
 * CS3Alice → KIJ 予約同期スクリプト
 * 使い方: node cs3-sync.js
 * 必要環境: Node.js 18 以上
 *
 * 【重要】このスクリプトは店舗ネットワーク（またはCS3Aliceにアクセスできる端末）で実行してください
 * VPS・Vercel等のデータセンターIPからは CS3Alice がアクセスをブロックします
 */

'use strict'
const { request: httpsReq } = require('https')

// ───────── 設定 ─────────
const CONFIG = {
  loginId:    process.env.CS3_LOGIN_ID    || 'kto',
  password:   process.env.CS3_PASSWORD    || '0519',
  apiUrl:     process.env.KIJ_API_URL     || 'https://kij-app.vercel.app/api/cs3-reservation-sync',
  syncSecret: process.env.SYNC_SECRET     || 'ca4b78eb-ceee-4d8d-a626-de224da569af',
}
// ─────────────────────────

const CS3_HOST = '2nd.cs3-alice7.com'
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

// CS3Alice shopid → KIJ store_id
const SHOP_TO_STORE = {
  '111701': 7,  // 西船橋E
  '111702': 5,  // 成田E
  '111703': 6,  // 千葉E
  '111704': 8,  // 錦糸町E
}

// ─── HTTP ヘルパー ───────────────────────────────────────────────

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

// ─── CS3Alice ログイン ────────────────────────────────────────────

async function loginForShop(shopCode) {
  const body = new URLSearchParams({
    method: 'login', shop: shopCode,
    user: CONFIG.loginId, password: CONFIG.password,
  }).toString()

  const res = await httpsPost(CS3_HOST, '/group/7175_iyashi/login.php', body)
  if (res.status !== 302 || res.cookies.length === 0) {
    throw new Error(`ログイン失敗 shop=${shopCode} (status=${res.status}, location=${res.headers.location})`)
  }
  return res.cookies.join('; ')
}

// ─── HTML パーサー ───────────────────────────────────────────────

function extractTdText(html, cls) {
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
    const courseDuration = parseInt(courseStr) || times.courseDuration
    const phoneRaw = extractTdText(rowHtml, 'reservation_list_value_phone')
    const phoneMatch = phoneRaw.match(/[\d-]{7,}/)
    const salesRaw = extractTdText(rowHtml, 'reservation_list_value_sales')
    entries.push({
      cs3Id, storeId, date,
      time: times.time, checkoutTime: times.checkoutTime, courseDuration,
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

// ─── KIJ API へアップロード ──────────────────────────────────────

function uploadEntries(entries) {
  return new Promise((resolve, reject) => {
    const url = new URL(CONFIG.apiUrl)
    const payload = Buffer.from(JSON.stringify({ entries }))
    const req = httpsReq({
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
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

// 全店舗の名前マップ
const SHOP_NAMES = {
  '111701': '西船橋',
  '111702': '成田',
  '111703': '千葉',
  '111704': '錦糸町',
}

// ─── メイン ────────────────────────────────────────────────────

async function main() {
  console.log('CS3Alice 予約同期を開始します（全4店舗）...')

  const allEntries = []
  const shops = Object.keys(SHOP_TO_STORE)

  for (const shopCode of shops) {
    const shopName = SHOP_NAMES[shopCode]
    process.stdout.write(`  ${shopName} ログイン中... `)
    const cookie = await loginForShop(shopCode)
    process.stdout.write('✓  取得中... ')

    const { status, body: html } = await httpsGet(CS3_HOST, '/group/7175_iyashi/schedule.reservation.php', cookie)
    if (status !== 200) throw new Error(`予約ページ取得失敗 shop=${shopCode} (status=${status})`)

    const entries = parseReservations(html)
    console.log(`✓ ${entries.length}件`)
    allEntries.push(...entries)
  }

  // cs3Id の重複除去（複数ショップで同じ予約が見えた場合に備えて）
  const seen = new Set()
  const entries = allEntries.filter(e => { if (seen.has(e.cs3Id)) return false; seen.add(e.cs3Id); return true })
  console.log(`  合計: ${entries.length} 件（重複除去後）`)

  console.log('  KIJ アプリに同期中...')
  const result = await uploadEntries(entries)
  if (result.status !== 200) throw new Error(`アップロード失敗 (status=${result.status}): ${JSON.stringify(result.body)}`)
  const r = result.body
  console.log(`  ✓ 同期完了 — 登録: ${r.synced}, スキップ: ${r.skipped}, 削除: ${r.deleted}`)
  console.log('\n同期が完了しました。')
}

main().catch(err => {
  console.error('\n[エラー]', err.message)
  process.exit(1)
})
