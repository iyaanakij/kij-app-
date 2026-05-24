#!/usr/bin/env node
// Weekly analytics report: GA4 + Search Console → Claude AI analysis → Supabase
// Run: node scripts/analytics-report.js
// Cron: 0 8 * * 1 (every Monday 8:00)

require('dotenv').config({ path: '/opt/shift-sync/.env' })

const Anthropic = require('@anthropic-ai/sdk')
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const GA4_PROPERTIES = [
  { id: '391961329', name: 'M性感 錦糸町', brand: 'M', area: '錦糸町' },
  { id: '392280400', name: 'M性感 西船橋', brand: 'M', area: '西船橋' },
  { id: '383731131', name: 'M性感 千葉',   brand: 'M', area: '千葉' },
  { id: '383648097', name: 'M性感 成田',   brand: 'M', area: '成田' },
  { id: '360032995', name: '癒したくて 西船橋', brand: 'Y', area: '西船橋' },
  { id: '386688858', name: '癒したくて 千葉',   brand: 'Y', area: '千葉' },
  { id: '360018630', name: '癒したくて 成田',   brand: 'Y', area: '成田' },
  { id: '360022378', name: '癒したくて 錦糸町', brand: 'Y', area: '錦糸町' },
]

const SC_SITES = [
  { url: 'https://www.m-kairaku.com/', name: 'M性感' },
  { url: 'https://www.iyashitakute.com/', name: '癒したくて' },
]

// --- OAuth2 ---
async function getAccessToken() {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
      grant_type:    'refresh_token',
    }),
  })
  const data = await res.json()
  if (!data.access_token) throw new Error(`Token error: ${JSON.stringify(data)}`)
  return data.access_token
}

// --- GA4 Data API ---
async function fetchGA4(propertyId, accessToken, startDate, endDate) {
  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        dateRanges: [{ startDate, endDate }],
        metrics: [
          { name: 'sessions' },
          { name: 'activeUsers' },
          { name: 'screenPageViews' },
          { name: 'bounceRate' },
          { name: 'averageSessionDuration' },
          { name: 'eventCount' },
        ],
        dimensions: [{ name: 'date' }],
        orderBys: [{ dimension: { dimensionName: 'date' } }],
      }),
    }
  )
  const data = await res.json()
  if (data.error) {
    console.warn(`GA4 ${propertyId} error:`, data.error.message)
    return null
  }
  return data
}

// Search Console API
async function fetchSearchConsole(siteUrl, accessToken, startDate, endDate) {
  const res = await fetch(
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        startDate,
        endDate,
        dimensions: ['query'],
        rowLimit: 20,
        dataState: 'final',
      }),
    }
  )
  const data = await res.json()
  if (data.error) {
    console.warn(`SC ${siteUrl} error:`, data.error.message)
    return null
  }
  return data
}

async function fetchSearchConsoleSummary(siteUrl, accessToken, startDate, endDate) {
  const res = await fetch(
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        startDate,
        endDate,
        dimensions: ['date'],
        rowLimit: 7,
        dataState: 'final',
      }),
    }
  )
  const data = await res.json()
  if (data.error) return null
  return data
}

// --- Date helpers ---
function getDateRange(weeksAgo = 1) {
  const end = new Date()
  end.setDate(end.getDate() - 1) // yesterday
  const start = new Date(end)
  start.setDate(start.getDate() - (7 * weeksAgo - 1))
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate:   end.toISOString().slice(0, 10),
  }
}

function getPrevDateRange(weeksAgo = 1) {
  const { startDate, endDate } = getDateRange(weeksAgo)
  const s = new Date(startDate), e = new Date(endDate)
  s.setDate(s.getDate() - 7)
  e.setDate(e.getDate() - 7)
  return {
    startDate: s.toISOString().slice(0, 10),
    endDate:   e.toISOString().slice(0, 10),
  }
}

// GA4レスポンスから合計を集計
function summarizeGA4(data) {
  if (!data || !data.rows) return { sessions: 0, users: 0, pageviews: 0, bounceRate: 0, avgDuration: 0, events: 0 }
  let sessions = 0, users = 0, pageviews = 0, bounceRateSum = 0, durationSum = 0, events = 0
  for (const row of data.rows) {
    const [s, u, pv, br, dur, ev] = row.metricValues.map(m => parseFloat(m.value))
    sessions += s; users += u; pageviews += pv
    bounceRateSum += br; durationSum += dur; events += ev
  }
  const n = data.rows.length
  return {
    sessions: Math.round(sessions),
    users: Math.round(users),
    pageviews: Math.round(pageviews),
    bounceRate: n > 0 ? Math.round(bounceRateSum / n * 100) : 0,
    avgDuration: n > 0 ? Math.round(durationSum / n) : 0,
    events: Math.round(events),
  }
}

function summarizeSC(data) {
  if (!data || !data.rows) return { clicks: 0, impressions: 0, ctr: 0, position: 0 }
  let clicks = 0, impressions = 0, ctrSum = 0, posSum = 0
  for (const r of data.rows) {
    clicks += r.clicks; impressions += r.impressions
    ctrSum += r.ctr; posSum += r.position
  }
  const n = data.rows.length
  return {
    clicks, impressions,
    ctr: n > 0 ? Math.round(ctrSum / n * 1000) / 10 : 0,
    position: n > 0 ? Math.round(posSum / n * 10) / 10 : 0,
  }
}

// --- Main ---
async function main() {
  console.log('[analytics-report] 開始:', new Date().toLocaleString('ja-JP'))

  const token = await getAccessToken()
  const { startDate, endDate } = getDateRange(1)
  const { startDate: prevStart, endDate: prevEnd } = getPrevDateRange(1)

  console.log(`対象期間: ${startDate} 〜 ${endDate} (前週比: ${prevStart} 〜 ${prevEnd})`)

  // GA4 データ取得
  const ga4Results = {}
  for (const prop of GA4_PROPERTIES) {
    const [curr, prev] = await Promise.all([
      fetchGA4(prop.id, token, startDate, endDate),
      fetchGA4(prop.id, token, prevStart, prevEnd),
    ])
    ga4Results[prop.name] = {
      current: summarizeGA4(curr),
      previous: summarizeGA4(prev),
    }
    process.stdout.write('.')
  }
  console.log(' GA4完了')

  // Search Console データ取得
  const scResults = {}
  for (const site of SC_SITES) {
    const [queries, summary] = await Promise.all([
      fetchSearchConsole(site.url, token, startDate, endDate),
      fetchSearchConsoleSummary(site.url, token, startDate, endDate),
    ])
    const topQueries = (queries?.rows || []).slice(0, 10).map(r => ({
      query: r.keys[0],
      clicks: r.clicks,
      impressions: r.impressions,
      ctr: Math.round(r.ctr * 1000) / 10,
      position: Math.round(r.position * 10) / 10,
    }))
    scResults[site.name] = {
      summary: summarizeSC(summary),
      topQueries,
    }
    process.stdout.write('.')
  }
  console.log(' SC完了')

  // Claude分析
  const dataText = JSON.stringify({ ga4: ga4Results, searchConsole: scResults }, null, 2)

  const prompt = `あなたは風俗店グループ「快楽M性感倶楽部」と「癒したくて」のウェブマーケティングアナリストです。
以下は先週（${startDate}〜${endDate}）のGA4・Search Consoleデータです。前週比も含まれています。

${dataText}

以下の観点で日本語でレポートを作成してください：

## 📊 週次ウェブ解析レポート（${startDate} 〜 ${endDate}）

### 1. 全体サマリー（3〜5行）
- 全8店舗の総セッション数と前週比
- 特筆すべき変化

### 2. 店舗別ハイライト
- 伸びた店舗・落ちた店舗を具体的数字で
- 前週比±20%以上の変化があれば強調

### 3. 検索パフォーマンス（Search Console）
- M性感・癒したくての流入クエリTop5
- CTR・順位で改善余地のあるキーワード

### 4. 異常検知
- 急激な変動（±30%以上）
- 直帰率の異常値

### 5. 来週の改善アクション（優先度順に3つ）
- 具体的で実行可能なアクション

簡潔かつ実用的に。数字は必ず前週比を添えること。`

  console.log('Claude分析中...')
  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }],
  })
  const summary = message.content[0].text
  console.log('Claude分析完了')

  // Supabase保存
  const { error } = await supabase.from('analytics_reports').insert({
    report_date: endDate,
    report_type: 'weekly',
    summary,
    raw_data: { ga4: ga4Results, searchConsole: scResults, period: { startDate, endDate } },
  })

  if (error) {
    console.error('Supabase保存エラー:', error)
    process.exit(1)
  }

  console.log('[analytics-report] 完了 ✓')
  console.log('--- レポートプレビュー ---')
  console.log(summary.slice(0, 500) + '...')
}

main().catch(err => {
  console.error('[analytics-report] エラー:', err)
  process.exit(1)
})
