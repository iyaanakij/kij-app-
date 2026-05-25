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

const DRY_RUN = process.argv.includes('--dry-run') || process.env.DRY_RUN === '1'

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

// ① セッション/PV/直帰率/滞在時間（週次集計・date dimensionなし）
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

// --- Date helpers (JST固定) ---
function toJSTDateStr(utcDate) {
  return new Date(utcDate.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function getDateRange() {
  const end = addDays(toJSTDateStr(new Date()), -1)
  const start = addDays(end, -6)
  return { startDate: start, endDate: end }
}

function getPrevDateRange() {
  const { startDate, endDate } = getDateRange()
  return { startDate: addDays(startDate, -7), endDate: addDays(endDate, -7) }
}

// Search Console用: データ反映遅延を避けるため endDate = 今日 -3日
function getSearchConsoleDateRange() {
  const end = addDays(toJSTDateStr(new Date()), -3)
  const start = addDays(end, -6)
  return { startDate: start, endDate: end }
}

function getPrevSearchConsoleDateRange() {
  const { startDate, endDate } = getSearchConsoleDateRange()
  return { startDate: addDays(startDate, -7), endDate: addDays(endDate, -7) }
}

// --- Summarizers ---
function summarizeMain(data) {
  if (!data?.rows?.[0]) return { sessions: 0, users: 0, pageviews: 0, bounceRate: 0, avgDuration: 0 }
  const [s, u, pv, br, dur] = data.rows[0].metricValues.map(m => parseFloat(m.value))
  return {
    sessions: Math.round(s),
    users: Math.round(u),
    pageviews: Math.round(pv),
    bounceRate: Math.round(br * 100),
    avgDuration: Math.round(dur),
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
  let clicks = 0, impressions = 0, posWeightedSum = 0
  for (const r of data.rows) {
    clicks += r.clicks
    impressions += r.impressions
    posWeightedSum += r.position * r.impressions
  }
  return {
    clicks,
    impressions,
    ctr: impressions > 0 ? Math.round(clicks / impressions * 1000) / 10 : 0,
    position: impressions > 0 ? Math.round(posWeightedSum / impressions * 10) / 10 : 0,
  }
}

// --- Main ---
async function main() {
  console.log('[analytics-report] 開始:', new Date().toLocaleString('ja-JP'))

  const token = await getAccessToken()
  const { startDate, endDate } = getDateRange()
  const { startDate: prevStart, endDate: prevEnd } = getPrevDateRange()
  const { startDate: scStartDate, endDate: scEndDate } = getSearchConsoleDateRange()
  const { startDate: scPrevStartDate, endDate: scPrevEndDate } = getPrevSearchConsoleDateRange()

  console.log(`GA4: ${startDate} 〜 ${endDate} / 前週: ${prevStart} 〜 ${prevEnd}`)
  console.log(`SC : ${scStartDate} 〜 ${scEndDate} / 前週: ${scPrevStartDate} 〜 ${scPrevEndDate}`)

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

    const calcCVR = (count, sessions) => sessions > 0 ? Math.round(count / sessions * 1000) / 10 : 0
    ga4Results[prop.name] = {
      current: {
        ...currMain,
        channels: summarizeChannels(chCurr),
        phone_click: currEvents.phone_click,
        reservation_click: currEvents.reservation_click,
        request_click: currEvents.request_click,
        survey_click: currEvents.survey_click,
        phone_cvr: calcCVR(currEvents.phone_click, currMain.sessions),
        reservation_cvr: calcCVR(currEvents.reservation_click, currMain.sessions),
        request_cvr: calcCVR(currEvents.request_click, currMain.sessions),
        survey_cvr: calcCVR(currEvents.survey_click, currMain.sessions),
      },
      previous: {
        ...prevMain,
        channels: summarizeChannels(chPrev),
        phone_click: prevEvents.phone_click,
        reservation_click: prevEvents.reservation_click,
        request_click: prevEvents.request_click,
        survey_click: prevEvents.survey_click,
        phone_cvr: calcCVR(prevEvents.phone_click, prevMain.sessions),
        reservation_cvr: calcCVR(prevEvents.reservation_click, prevMain.sessions),
        request_cvr: calcCVR(prevEvents.request_click, prevMain.sessions),
        survey_cvr: calcCVR(prevEvents.survey_click, prevMain.sessions),
      },
    }
    process.stdout.write('.')
  }))
  console.log(' GA4完了')

  // Search Console（current + previous + クエリ差分）
  const scResults = {}
  await Promise.all(SC_SITES.map(async site => {
    const [queries, summary, prevQueries, prevSummary] = await Promise.all([
      fetchSC(site.url, token, { dimensions: ['query'], rowLimit: 20, startDate: scStartDate, endDate: scEndDate }),
      fetchSC(site.url, token, { dimensions: ['date'], rowLimit: 7, startDate: scStartDate, endDate: scEndDate }),
      fetchSC(site.url, token, { dimensions: ['query'], rowLimit: 20, startDate: scPrevStartDate, endDate: scPrevEndDate }),
      fetchSC(site.url, token, { dimensions: ['date'], rowLimit: 7, startDate: scPrevStartDate, endDate: scPrevEndDate }),
    ])

    const prevQueryMap = {}
    for (const r of (prevQueries?.rows || [])) {
      prevQueryMap[r.keys[0]] = r
    }

    scResults[site.name] = {
      current: {
        summary: summarizeSC(summary),
        topQueries: (queries?.rows || []).map(r => {
          const q = r.keys[0]
          const base = {
            query: q,
            clicks: r.clicks,
            impressions: r.impressions,
            ctr: Math.round(r.ctr * 1000) / 10,
            position: Math.round(r.position * 10) / 10,
          }
          const prev = prevQueryMap[q]
          if (!prev) return base
          return {
            ...base,
            prev_clicks: prev.clicks,
            prev_impressions: prev.impressions,
            prev_ctr: Math.round(prev.ctr * 1000) / 10,
            prev_position: Math.round(prev.position * 10) / 10,
            clicks_diff: r.clicks - prev.clicks,
            impressions_diff: r.impressions - prev.impressions,
            ctr_diff: Math.round((r.ctr - prev.ctr) * 1000) / 10,
            position_diff: Math.round((r.position - prev.position) * 10) / 10,
          }
        }),
      },
      previous: {
        summary: summarizeSC(prevSummary),
        topQueries: (prevQueries?.rows || []).map(r => ({
          query: r.keys[0],
          clicks: r.clicks,
          impressions: r.impressions,
          ctr: Math.round(r.ctr * 1000) / 10,
          position: Math.round(r.position * 10) / 10,
        })),
      },
    }
    process.stdout.write('.')
  }))
  console.log(' SC完了')

  if (DRY_RUN) {
    console.log('--- DRY RUN: raw_data 構造プレビュー (先頭6000文字) ---')
    console.log(JSON.stringify({ ga4: ga4Results, searchConsole: scResults }, null, 2).slice(0, 6000))
    console.log('\n[analytics-report] DRY RUN 完了 ✓（Claude呼び出し・Supabase保存スキップ）')
    return
  }

  // Claude分析
  const dataText = JSON.stringify({ ga4: ga4Results, searchConsole: scResults }, null, 2)

  const prompt = `あなたは風俗店グループ「快楽M性感倶楽部」と「癒したくて」のウェブマーケティングアナリストです。
以下はGA4・Search Consoleデータです。

【集計期間】
- GA4: ${startDate}〜${endDate}（昨日まで7日間）
- Search Console: ${scStartDate}〜${scEndDate}（データ反映遅延を避けるため3日遅れで集計）
- ※ GA4とSearch Consoleは集計期間が異なるため直接比較しないこと。

【重要: 癒したくてのデータについて】
癒したくて（iyashitakute.com）の4店舗は、外部サイトによる出勤ページのiframe埋め込みにより
GA4セッション数に大量のノイズが混入している。実態は以下の通り：
- Direct チャネルが90%以上を占め、エンゲージメント率が約1〜2%（本物のユーザーなら20%以上になる）
- 有効な潜在顧客アクセスは Referral + Organic Search の合計のみ（全体の数%）
- CVR（%）はセッション数が汚染されているため信頼できない
- 評価には phone_click / reservation_click の**絶対数**を使うこと
- セッション数・直帰率・CVR(%)で癒したくてとM性感を直接比較しないこと
- M性感のセッション数は信頼できる（Organic Search 約50%・エンゲージ率約80%の正常な構造）

【データ構造の説明】
- GA4: current（今週）/ previous（前週）形式。8店舗分。
- searchConsole: current（今週）/ previous（前週）形式。M性感・癒したくて 2サイト分。
- phone_cvr = 電話クリック数 ÷ セッション数（%）
- reservation_cvr = WEB予約クリック数 ÷ セッション数（%）
- request_cvr = 出勤リクエストクリック数 ÷ セッション数（%）（指名したいキャストへの出勤依頼）
- survey_cvr = アンケートクリック数 ÷ セッション数（%）
- channels = 流入チャネル別セッション数（Organic Search / Direct / Referral 等）
- searchConsole.current.topQueries の position_diff はマイナスが順位改善、clicks_diff はプラスが増加。

${dataText}

以下の構成で日本語レポートを作成してください：

## 📊 週次ウェブ解析レポート（${startDate} 〜 ${endDate}）

### 1. 全体サマリー（3〜5行）
- 全8店舗の総セッション・総電話クリック・総WEB予約クリック・総出勤リクエストと前週比
- 特筆すべき変化

### 2. CVR分析（重要）
4種CVRすべてを店舗ごとに比較すること:
- phone_cvr（電話クリックCVR）
- reservation_cvr（WEB予約クリックCVR）
- request_cvr（出勤リクエストCVR）
- survey_cvr（アンケートCVR）

見るべき観点:
- CVRが高い/低い店舗を具体的数字で指摘（前週比も添えること）
- 電話偏重（phone_cvr >> reservation_cvr）の店舗
- WEB予約偏重（reservation_cvr が高い）の店舗
- request_cvr が他店舗より高い/低い店舗（指名文化の差）

### 3. 流入チャネル分析
- M性感・癒したくて全体でのオーガニック/直接/参照の割合
- 特定店舗で流入構造が偏っている場合は指摘

### 4. 店舗別ハイライト
- 伸びた店舗・落ちた店舗を具体的数字で（前週比±15%以上を強調）

### 5. 検索パフォーマンス（Search Console）
searchConsole.current.summary と searchConsole.previous.summary の実データを使って前週比を計算すること（推測禁止）。
- M性感・癒したくて それぞれの clicks / impressions / ctr / position と前週比
- topQueries から注目クエリ（clicks_diff が大きい、または position_diff がマイナスで改善）
- 表示回数が多くCTRが低いクエリ（title/description改善候補）
- 掲載順位が8〜20位で伸ばせるクエリ

### 6. 来週の改善アクション（優先度順に3つ）
- CVR・流入・コンテンツ・検索の観点から具体的なアクション

簡潔かつ実用的に。数字は必ず前週比を添えること。前週データが存在しない場合は「前週データなし」と明記し推測しないこと。`

  console.log('Claude分析中...')
  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2500,
    messages: [{ role: 'user', content: prompt }],
  })
  const summary = message.content[0].text
  console.log('Claude分析完了')

  const { error } = await supabase.from('analytics_reports').upsert(
    {
      report_date: endDate,
      report_type: 'weekly',
      summary,
      raw_data: {
        ga4: ga4Results,
        searchConsole: scResults,
        period: {
          ga4: { startDate, endDate },
          searchConsole: { startDate: scStartDate, endDate: scEndDate },
          previous: {
            ga4: { startDate: prevStart, endDate: prevEnd },
            searchConsole: { startDate: scPrevStartDate, endDate: scPrevEndDate },
          },
        },
      },
    },
    { onConflict: 'report_date,report_type' }
  )

  if (error) { console.error('Supabase保存エラー:', error); process.exit(1) }

  console.log('[analytics-report] 完了 ✓')
  console.log('--- レポートプレビュー ---')
  console.log(summary.slice(0, 600) + '...')
}

main().catch(err => {
  console.error('[analytics-report] エラー:', err)
  process.exit(1)
})
