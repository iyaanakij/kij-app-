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

// --- GA4 helpers ---
async function ga4Report(propertyId, accessToken, body) {
  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  )
  const data = await res.json()
  if (data.error) { console.warn(`GA4 ${propertyId}:`, data.error.message); return null }
  return data
}

// ① セッション/PV/直帰率/滞在時間（日別）
async function fetchGA4Main(propertyId, accessToken, startDate, endDate) {
  return ga4Report(propertyId, accessToken, {
    dateRanges: [{ startDate, endDate }],
    metrics: [
      { name: 'sessions' },
      { name: 'activeUsers' },
      { name: 'screenPageViews' },
      { name: 'bounceRate' },
      { name: 'averageSessionDuration' },
    ],
    dimensions: [{ name: 'date' }],
  })
}

// ② 流入チャネル別セッション数
async function fetchGA4Channels(propertyId, accessToken, startDate, endDate) {
  return ga4Report(propertyId, accessToken, {
    dateRanges: [{ startDate, endDate }],
    metrics: [{ name: 'sessions' }],
    dimensions: [{ name: 'sessionDefaultChannelGroup' }],
    orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
    limit: 8,
  })
}

// ③ phone_click / reservation_click 件数
async function fetchGA4Events(propertyId, accessToken, startDate, endDate) {
  return ga4Report(propertyId, accessToken, {
    dateRanges: [{ startDate, endDate }],
    metrics: [{ name: 'eventCount' }],
    dimensions: [{ name: 'eventName' }],
    dimensionFilter: {
      filter: {
        fieldName: 'eventName',
        inListFilter: { values: ['phone_click', 'reservation_click', 'request_click', 'survey_click'] },
      },
    },
  })
}

// --- Search Console API ---
async function fetchSC(siteUrl, accessToken, body) {
  const res = await fetch(
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, dataState: 'final' }),
    }
  )
  const data = await res.json()
  if (data.error) { console.warn(`SC ${siteUrl}:`, data.error.message); return null }
  return data
}

// --- Date helpers ---
function getDateRange() {
  const end = new Date()
  end.setDate(end.getDate() - 1)
  const start = new Date(end)
  start.setDate(start.getDate() - 6)
  return { startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) }
}

function getPrevDateRange() {
  const { startDate, endDate } = getDateRange()
  const s = new Date(startDate), e = new Date(endDate)
  s.setDate(s.getDate() - 7); e.setDate(e.getDate() - 7)
  return { startDate: s.toISOString().slice(0, 10), endDate: e.toISOString().slice(0, 10) }
}

// --- Summarizers ---
function summarizeMain(data) {
  if (!data?.rows) return { sessions: 0, users: 0, pageviews: 0, bounceRate: 0, avgDuration: 0 }
  let sessions = 0, users = 0, pageviews = 0, brSum = 0, durSum = 0
  for (const row of data.rows) {
    const [s, u, pv, br, dur] = row.metricValues.map(m => parseFloat(m.value))
    sessions += s; users += u; pageviews += pv; brSum += br; durSum += dur
  }
  const n = data.rows.length
  return {
    sessions: Math.round(sessions),
    users: Math.round(users),
    pageviews: Math.round(pageviews),
    bounceRate: n > 0 ? Math.round(brSum / n * 100) : 0,
    avgDuration: n > 0 ? Math.round(durSum / n) : 0,
  }
}

function summarizeChannels(data) {
  if (!data?.rows) return {}
  const result = {}
  for (const row of data.rows) {
    const channel = row.dimensionValues[0].value
    result[channel] = Math.round(parseFloat(row.metricValues[0].value))
  }
  return result
}

function summarizeEvents(data) {
  if (!data?.rows) return { phone_click: 0, reservation_click: 0, request_click: 0, survey_click: 0 }
  const result = { phone_click: 0, reservation_click: 0, request_click: 0, survey_click: 0 }
  for (const row of data.rows) {
    const name = row.dimensionValues[0].value
    if (name in result) result[name] = Math.round(parseFloat(row.metricValues[0].value))
  }
  return result
}

function summarizeSC(data) {
  if (!data?.rows) return { clicks: 0, impressions: 0, ctr: 0, position: 0 }
  let clicks = 0, impressions = 0, ctrSum = 0, posSum = 0
  for (const r of data.rows) {
    clicks += r.clicks; impressions += r.impressions; ctrSum += r.ctr; posSum += r.position
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
  const { startDate, endDate } = getDateRange()
  const { startDate: prevStart, endDate: prevEnd } = getPrevDateRange()

  console.log(`対象期間: ${startDate} 〜 ${endDate} (前週: ${prevStart} 〜 ${prevEnd})`)

  // GA4 全8店舗 × 3種レポート × 今週+前週 = 並列取得
  const ga4Results = {}
  await Promise.all(GA4_PROPERTIES.map(async prop => {
    const [mainCurr, mainPrev, chCurr, chPrev, evCurr, evPrev] = await Promise.all([
      fetchGA4Main(prop.id, token, startDate, endDate),
      fetchGA4Main(prop.id, token, prevStart, prevEnd),
      fetchGA4Channels(prop.id, token, startDate, endDate),
      fetchGA4Channels(prop.id, token, prevStart, prevEnd),
      fetchGA4Events(prop.id, token, startDate, endDate),
      fetchGA4Events(prop.id, token, prevStart, prevEnd),
    ])
    const currMain = summarizeMain(mainCurr)
    const currEvents = summarizeEvents(evCurr)
    const prevMain = summarizeMain(mainPrev)
    const prevEvents = summarizeEvents(evPrev)

    ga4Results[prop.name] = {
      current: {
        ...currMain,
        channels: summarizeChannels(chCurr),
        phone_click: currEvents.phone_click,
        reservation_click: currEvents.reservation_click,
        request_click: currEvents.request_click,
        survey_click: currEvents.survey_click,
        phone_cvr: currMain.sessions > 0 ? Math.round(currEvents.phone_click / currMain.sessions * 1000) / 10 : 0,
        reservation_cvr: currMain.sessions > 0 ? Math.round(currEvents.reservation_click / currMain.sessions * 1000) / 10 : 0,
      },
      previous: {
        ...prevMain,
        channels: summarizeChannels(chPrev),
        phone_click: prevEvents.phone_click,
        reservation_click: prevEvents.reservation_click,
        request_click: prevEvents.request_click,
        survey_click: prevEvents.survey_click,
        phone_cvr: prevMain.sessions > 0 ? Math.round(prevEvents.phone_click / prevMain.sessions * 1000) / 10 : 0,
        reservation_cvr: prevMain.sessions > 0 ? Math.round(prevEvents.reservation_click / prevMain.sessions * 1000) / 10 : 0,
      },
    }
    process.stdout.write('.')
  }))
  console.log(' GA4完了')

  // Search Console
  const scResults = {}
  await Promise.all(SC_SITES.map(async site => {
    const [queries, summary] = await Promise.all([
      fetchSC(site.url, token, { dimensions: ['query'], rowLimit: 20, startDate, endDate }),
      fetchSC(site.url, token, { dimensions: ['date'], rowLimit: 7, startDate, endDate }),
    ])
    scResults[site.name] = {
      summary: summarizeSC(summary),
      topQueries: (queries?.rows || []).slice(0, 10).map(r => ({
        query: r.keys[0],
        clicks: r.clicks,
        impressions: r.impressions,
        ctr: Math.round(r.ctr * 1000) / 10,
        position: Math.round(r.position * 10) / 10,
      })),
    }
    process.stdout.write('.')
  }))
  console.log(' SC完了')

  // Claude分析
  const dataText = JSON.stringify({ ga4: ga4Results, searchConsole: scResults }, null, 2)

  const prompt = `あなたは風俗店グループ「快楽M性感倶楽部」と「癒したくて」のウェブマーケティングアナリストです。
以下は先週（${startDate}〜${endDate}）のGA4・Search Consoleデータです。前週比も含まれています。

- phone_cvr = 電話クリック数 ÷ セッション数（%）
- reservation_cvr = WEB予約クリック数 ÷ セッション数（%）
- request_click = LINE・問い合わせ系クリック数
- survey_click = アンケート系クリック数
- channels = 流入チャネル別セッション数（Organic Search / Direct / Referral 等）

${dataText}

以下の構成で日本語レポートを作成してください：

## 📊 週次ウェブ解析レポート（${startDate} 〜 ${endDate}）

### 1. 全体サマリー（3〜5行）
- 全8店舗の総セッション・総電話クリック・総WEB予約クリックと前週比
- 特筆すべき変化

### 2. CVR分析（重要）
- 店舗別の phone_cvr と reservation_cvr を比較
- CVRが高い/低い店舗を具体的数字で指摘
- 前週比での改善・悪化

### 3. 流入チャネル分析
- M性感・癒したくて全体でのオーガニック/直接/参照の割合
- 特定店舗で流入構造が偏っている場合は指摘

### 4. 店舗別ハイライト
- 伸びた店舗・落ちた店舗を具体的数字で（前週比±15%以上を強調）

### 5. 検索パフォーマンス（Search Console）
- 流入クエリTop5と改善余地のあるキーワード

### 6. 来週の改善アクション（優先度順に3つ）
- CVR・流入・コンテンツ観点から具体的なアクション

簡潔かつ実用的に。数字は必ず前週比を添えること。`

  console.log('Claude分析中...')
  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2500,
    messages: [{ role: 'user', content: prompt }],
  })
  const summary = message.content[0].text
  console.log('Claude分析完了')

  const { error } = await supabase.from('analytics_reports').insert({
    report_date: endDate,
    report_type: 'weekly',
    summary,
    raw_data: { ga4: ga4Results, searchConsole: scResults, period: { startDate, endDate } },
  })

  if (error) { console.error('Supabase保存エラー:', error); process.exit(1) }

  console.log('[analytics-report] 完了 ✓')
  console.log('--- レポートプレビュー ---')
  console.log(summary.slice(0, 600) + '...')
}

main().catch(err => {
  console.error('[analytics-report] エラー:', err)
  process.exit(1)
})
