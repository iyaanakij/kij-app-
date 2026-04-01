#!/usr/bin/env node
/**
 * City Heaven シフト同期スクリプト（GitHub Actions用）
 * 環境変数:
 *   SYNC_SECRET  - /api/shift-sync 認証トークン
 *   KIJ_API_URL  - https://kij-app.vercel.app/api/shift-sync（省略可）
 */
'use strict'

const { request } = require('https')

const API_URL = process.env.KIJ_API_URL || 'https://kij-app.vercel.app/api/shift-sync'
const SYNC_SECRET = process.env.SYNC_SECRET
if (!SYNC_SECRET) { console.error('❌ SYNC_SECRET が設定されていません'); process.exit(1) }

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

const STORES = [
  { storeId: 1, url: 'https://www.cityheaven.net/chiba/A1204/A120401/narita-kairaku/attend/' },
  { storeId: 2, url: 'https://www.cityheaven.net/chiba/A1201/A120101/m-kairaku/attend/' },
  { storeId: 3, url: 'https://www.cityheaven.net/chiba/A1202/A120201/anappu_nishi/attend/' },
  { storeId: 4, url: 'https://www.cityheaven.net/tokyo/A1313/A131301/m-kairaku/attend/' },
  { storeId: 5, url: 'https://www.cityheaven.net/chiba/A1204/A120401/aromaseikan/attend/' },
  { storeId: 6, url: 'https://www.cityheaven.net/chiba/A1201/A120101/iyashitakutechiba/attend/' },
  { storeId: 7, url: 'https://www.cityheaven.net/chiba/A1202/A120201/iyashitakute/attend/' },
  { storeId: 8, url: 'https://www.cityheaven.net/tokyo/A1313/A131301/iyashitakute/attend/' },
]

function get(urlStr, redirects = 5) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr)
    const req = request({
      hostname: u.hostname,
      path: u.pathname + (u.search || ''),
      method: 'GET',
      headers: { Cookie: 'nenrei=y', 'User-Agent': USER_AGENT },
    }, res => {
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location && redirects > 0) {
        return get(new URL(res.headers.location, urlStr).toString(), redirects - 1).then(resolve, reject)
      }
      let data = ''
      res.on('data', c => { data += c })
      res.on('end', () => resolve({ status: res.statusCode, body: data }))
    })
    req.on('error', reject)
    req.end()
  })
}

function parseDate(month, day) {
  const now = new Date()
  const m = parseInt(month), d = parseInt(day)
  let year = now.getFullYear()
  if (m < now.getMonth() + 1) year++
  return `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function parseStore(html, storeId) {
  const entries = []
  const blocks = html.split(/<div[^>]*id="shukkin_list"/)
  blocks.shift()
  for (const block of blocks) {
    const nm = block.match(/<th[^>]*class="topbox"[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>/)
    if (!nm) continue
    const name = nm[1].trim()
    const dates = []
    const dr = /<th[^>]*class="week"[^>]*>(?:\s*<[^>]+>)*\s*(\d+)\/(\d+)\(/g
    let dm
    while ((dm = dr.exec(block)) !== null) dates.push(parseDate(dm[1], dm[2]))
    if (!dates.length) continue
    const tr = /<td[^>]+width=["']?110["']?[^>]*>([\s\S]*?)<\/td>/g
    let tm, idx = 0
    while ((tm = tr.exec(block)) !== null && idx < dates.length) {
      const t = tm[1].match(/(\d{1,2}):(\d{2})[\s\S]*?(\d{1,2}):(\d{2})/)
      if (t) {
        const start = +t[1] + +t[2] / 60
        let end = +t[3] + +t[4] / 60
        if (end < start) end += 24
        entries.push({ name, storeId, date: dates[idx], start, end })
      }
      idx++
    }
  }
  return entries
}

function postJson(url, body, token) {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const buf = Buffer.from(JSON.stringify(body))
    const req = request({
      hostname: u.hostname,
      path: u.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': buf.length,
        'Authorization': `Bearer ${token}`,
      },
    }, res => {
      let data = ''
      res.on('data', c => { data += c })
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }) }
        catch { resolve({ status: res.statusCode, body: data }) }
      })
    })
    req.on('error', reject)
    req.write(buf)
    req.end()
  })
}

async function main() {
  console.log('── City Heaven シフト同期開始 ──')
  const allEntries = []
  for (const { storeId, url } of STORES) {
    process.stdout.write(`  store${storeId} ... `)
    try {
      const { status, body } = await get(url)
      if (status !== 200) { console.log(`SKIP (HTTP ${status})`); continue }
      const entries = parseStore(body, storeId)
      console.log(`${entries.length}件`)
      allEntries.push(...entries)
    } catch (e) {
      console.log(`ERROR: ${e.message}`)
    }
  }

  if (allEntries.length === 0) {
    console.error('❌ シフトデータが1件も取得できませんでした')
    process.exit(1)
  }

  console.log(`合計 ${allEntries.length} 件をアップロード中...`)
  const result = await postJson(API_URL, { entries: allEntries }, SYNC_SECRET)
  if (result.status !== 200) {
    console.error(`❌ アップロード失敗 (HTTP ${result.status}):`, result.body)
    process.exit(1)
  }
  const r = result.body
  console.log(`✅ 完了 — 登録:${r.synced} スキップ:${r.skipped} 削除:${r.deleted}`)
}

main().catch(e => { console.error('❌', e.message); process.exit(1) })
