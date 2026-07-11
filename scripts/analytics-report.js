#!/usr/bin/env node
// Weekly analytics report: GA4 + Search Console → Claude AI analysis → Supabase
// Run: node scripts/analytics-report.js
// Cron: 0 8 * * 1 (every Monday 8:00)

try {
  require('dotenv').config({ path: '/opt/shift-sync/.env' })
} catch {
  try {
    const fs = require('node:fs')
    const envText = fs.readFileSync('/opt/shift-sync/.env', 'utf8')
    for (const line of envText.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue
      const index = trimmed.indexOf('=')
      const key = trimmed.slice(0, index).trim()
      const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, '')
      if (key && process.env[key] === undefined) process.env[key] = value
    }
  } catch {
    // Local checks can still import pure helper functions without production env.
  }
}

const Anthropic = require('@anthropic-ai/sdk')
const { createClient } = require('@supabase/supabase-js')

const DRY_RUN = process.argv.includes('--dry-run') || process.env.DRY_RUN === '1'

const GA4_PROPERTIES = [
  { id: '391961329', name: 'M性感 錦糸町', brand: 'M', area: '錦糸町', site_id: 'mka_kinshicho' },
  { id: '392280400', name: 'M性感 西船橋', brand: 'M', area: '西船橋', site_id: 'mka_funabashi' },
  { id: '383731131', name: 'M性感 千葉',   brand: 'M', area: '千葉',   site_id: 'mka_chiba' },
  { id: '383648097', name: 'M性感 成田',   brand: 'M', area: '成田',   site_id: 'mka_narita' },
]

const SC_SITES = [
  { url: 'https://www.m-kairaku.com/', name: 'M性感' },
]

const M_STORE_PAGES = [
  { siteUrl: 'https://www.m-kairaku.com/', siteName: 'M性感', area: '錦糸町', storeName: 'M性感 錦糸町', path: '/kinshicho/', includePath: '/kinshicho/' },
  { siteUrl: 'https://www.m-kairaku.com/', siteName: 'M性感', area: '西船橋', storeName: 'M性感 西船橋', path: '/', includePath: '/', excludePaths: ['/chiba/', '/narita/', '/kinshicho/'] },
  { siteUrl: 'https://www.m-kairaku.com/', siteName: 'M性感', area: '千葉', storeName: 'M性感 千葉', path: '/chiba/', includePath: '/chiba/' },
  { siteUrl: 'https://www.m-kairaku.com/', siteName: 'M性感', area: '成田', storeName: 'M性感 成田', path: '/narita/', includePath: '/narita/' },
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

// ④ キャスト別プロフィールPV（?gid=個別キャストID込み）
async function fetchGA4CastProfiles(propertyId, accessToken, startDate, endDate) {
  return ga4Report(propertyId, accessToken, {
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: 'pagePathPlusQueryString' }],
    metrics: [{ name: 'screenPageViews' }],
    dimensionFilter: {
      filter: { fieldName: 'pagePathPlusQueryString', stringFilter: { matchType: 'CONTAINS', value: '/profile/?gid=' } },
    },
    orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
    limit: 200,
  })
}

// ⑤ プロフィールページ（gid問わず集計）へのサイト内遷移元
async function fetchGA4ProfileReferrers(propertyId, accessToken, startDate, endDate) {
  return ga4Report(propertyId, accessToken, {
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: 'pagePath' }, { name: 'pageReferrer' }],
    metrics: [{ name: 'screenPageViews' }],
    dimensionFilter: {
      filter: { fieldName: 'pagePath', stringFilter: { matchType: 'CONTAINS', value: 'profile' } },
    },
    orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
    limit: 50,
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

// gid（5桁ゼロ埋め）ごとのPV合計。同一gidが複数行にまたがる場合は合算する
function summarizeCastProfiles(data) {
  const rows = data?.rows || []
  const viewsByGid = {}
  for (const r of rows) {
    const path = r.dimensionValues[0].value
    const match = path.match(/gid=(\d+)/)
    if (!match) continue
    const gid = match[1]
    const views = Number(r.metricValues[0].value)
    viewsByGid[gid] = (viewsByGid[gid] || 0) + views
  }
  return viewsByGid
}

const REFERRER_CATEGORY_LABELS = {
  store_top: 'TOPページ',
  cast_list: 'キャスト一覧',
  schedule: '出勤スケジュール',
  profile_to_profile: '他プロフィールから回遊',
  direct_or_app: '直接・アプリ内ブラウザ',
  external: '外部サイト・検索',
  other_internal: 'その他サイト内',
}

function categorizeReferrer(referrer) {
  if (!referrer) return 'direct_or_app'
  if (!referrer.includes('m-kairaku.com')) return 'external'
  let path
  try { path = new URL(referrer).pathname } catch { return 'external' }
  if (path.includes('/profile/')) return 'profile_to_profile'
  if (path.includes('/schedule/')) return 'schedule'
  if (path.includes('/cast/')) return 'cast_list'
  if (path.endsWith('/top/')) return 'store_top'
  return 'other_internal'
}

// プロフィールページ（gid問わず集計）への遷移元をカテゴリ別に集計
function summarizeProfileReferrers(data) {
  const rows = data?.rows || []
  const totals = {}
  let totalViews = 0
  for (const r of rows) {
    const referrer = r.dimensionValues[1].value
    const views = Number(r.metricValues[0].value)
    const category = categorizeReferrer(referrer)
    totals[category] = (totals[category] || 0) + views
    totalViews += views
  }
  return Object.entries(totals)
    .map(([category, views]) => ({
      category,
      label: REFERRER_CATEGORY_LABELS[category] || category,
      views,
      share: totalViews > 0 ? round1(views / totalViews * 100) : 0,
    }))
    .sort((a, b) => b.views - a.views)
}

// publish_rules: cp4_gid（GA4の?gidと同一形式） → cast_name のマップを site_id ごとに構築
async function fetchCastNameMap(supabaseClient) {
  const { data, error } = await supabaseClient
    .from('publish_rules')
    .select('site_id, cp4_gid, cast_name')
    .not('cp4_gid', 'is', null)
    .not('cast_name', 'is', null)
  if (error) { console.warn('publish_rules取得エラー:', error.message); return {} }
  const map = {}
  for (const row of data) {
    if (!map[row.site_id]) map[row.site_id] = {}
    map[row.site_id][row.cp4_gid] = row.cast_name
  }
  return map
}

function summarizeSCRows(rows) {
  return summarizeSC({ rows })
}

function round1(value) {
  return Math.round(value * 10) / 10
}

function percentDiff(curr, prev) {
  if (!prev) return null
  return round1((curr - prev) / prev * 100)
}

function absDiff(curr, prev) {
  return round1(curr - prev)
}

function primaryChannel(channels) {
  const entries = Object.entries(channels || {}).sort((a, b) => b[1] - a[1])
  if (!entries.length) return { name: 'なし', sessions: 0, share: 0 }
  const total = entries.reduce((sum, [, sessions]) => sum + sessions, 0)
  const [name, sessions] = entries[0]
  return { name, sessions, share: total > 0 ? round1(sessions / total * 100) : 0 }
}

function buildStoreInsights(ga4Results) {
  return Object.entries(ga4Results).map(([storeName, data]) => {
    const current = data.current
    const previous = data.previous
    const sessionsDiffPct = percentDiff(current.sessions, previous.sessions)
    const phoneCvrDiff = absDiff(current.phone_cvr, previous.phone_cvr)
    const reservationCvrDiff = absDiff(current.reservation_cvr, previous.reservation_cvr)
    const phoneClicksDiffPct = percentDiff(current.phone_click, previous.phone_click)
    const reservationClicksDiffPct = percentDiff(current.reservation_click, previous.reservation_click)
    const channel = primaryChannel(current.channels)

    const alerts = []
    if (sessionsDiffPct !== null && sessionsDiffPct <= -15) alerts.push('sessions_drop')
    if (sessionsDiffPct !== null && sessionsDiffPct >= 10 && reservationCvrDiff <= -0.5) alerts.push('traffic_up_cvr_down')
    if (phoneCvrDiff <= -1) alerts.push('phone_cvr_drop')
    if (reservationCvrDiff <= -0.5) alerts.push('reservation_cvr_drop')
    if (current.phone_cvr >= current.reservation_cvr * 2 && current.phone_click >= 10) alerts.push('phone_heavy')
    if (current.reservation_cvr >= current.phone_cvr * 1.5 && current.reservation_click >= 10) alerts.push('web_reservation_heavy')
    if (channel.name === 'Direct' && channel.share >= 75) alerts.push('direct_heavy')

    let priority = 'C'
    if (
      alerts.includes('traffic_up_cvr_down') ||
      alerts.includes('phone_cvr_drop') ||
      alerts.includes('reservation_cvr_drop') ||
      (sessionsDiffPct !== null && sessionsDiffPct <= -25) ||
      (phoneClicksDiffPct !== null && phoneClicksDiffPct <= -30) ||
      (reservationClicksDiffPct !== null && reservationClicksDiffPct <= -30)
    ) {
      priority = 'A'
    } else if (alerts.length > 0 || (sessionsDiffPct !== null && Math.abs(sessionsDiffPct) >= 15)) {
      priority = 'B'
    }

    const issueLabels = {
      sessions_drop: 'セッション減少',
      traffic_up_cvr_down: '流入増・予約CVR低下',
      phone_cvr_drop: '電話CVR低下',
      reservation_cvr_drop: 'WEB予約CVR低下',
      phone_heavy: '電話偏重',
      web_reservation_heavy: 'WEB予約偏重',
      direct_heavy: 'Direct偏重',
    }

    const mainIssue = alerts.length
      ? alerts.map(a => issueLabels[a]).join(' / ')
      : '大きな異常なし'

    let recommendedAction = '継続観測'
    if (alerts.includes('traffic_up_cvr_down') || alerts.includes('reservation_cvr_drop')) {
      recommendedAction = '予約ボタン導線、ファーストビュー、WEB予約リンクの動作を確認'
    } else if (alerts.includes('phone_cvr_drop')) {
      recommendedAction = '電話ボタンの表示位置、営業時間表記、スマホ導線を確認'
    } else if (alerts.includes('sessions_drop')) {
      recommendedAction = 'Organic SearchとReferralの減少元を確認'
    } else if (alerts.includes('phone_heavy')) {
      recommendedAction = '予約方法データと照合し、電話偏重が媒体特性か導線問題か確認'
    } else if (alerts.includes('direct_heavy')) {
      recommendedAction = 'UTM未設定流入や外部埋め込みノイズの有無を確認'
    }

    return {
      store_name: storeName,
      priority,
      alerts,
      sessions: current.sessions,
      sessions_diff_pct: sessionsDiffPct,
      phone_click: current.phone_click,
      phone_click_diff_pct: phoneClicksDiffPct,
      reservation_click: current.reservation_click,
      reservation_click_diff_pct: reservationClicksDiffPct,
      phone_cvr: current.phone_cvr,
      phone_cvr_diff: phoneCvrDiff,
      reservation_cvr: current.reservation_cvr,
      reservation_cvr_diff: reservationCvrDiff,
      request_cvr: current.request_cvr,
      request_cvr_diff: absDiff(current.request_cvr, previous.request_cvr),
      primary_channel: channel,
      main_issue: mainIssue,
      recommended_action: recommendedAction,
    }
  }).sort((a, b) => {
    const rank = { A: 0, B: 1, C: 2 }
    return rank[a.priority] - rank[b.priority] || Math.abs(b.sessions_diff_pct || 0) - Math.abs(a.sessions_diff_pct || 0)
  })
}

function classifySeoOpportunity(siteName, query) {
  const isLowCtr = query.impressions >= 300 && query.ctr < 5
  const isReachableRank = query.impressions >= 100 && query.position >= 8 && query.position <= 20
  const isFalling = typeof query.clicks_diff === 'number' && query.clicks_diff <= -5
  const isImproving = typeof query.position_diff === 'number' && query.position_diff <= -2

  if (!isLowCtr && !isReachableRank && !isFalling && !isImproving) return null

  let issueType = 'growth_candidate'
  let priority = 'C'
  let recommendedAction = '関連ページの本文追記または内部リンク追加を検討'
  let expectedImpact = '検索流入の底上げ'

  if (isLowCtr && isReachableRank) {
    issueType = 'high_impression_low_ctr_reachable_rank'
    priority = 'A'
    recommendedAction = 'title/descriptionを改善し、本文上部に検索意図へ直接答える見出しを追加'
    expectedImpact = 'CTR改善と順位上昇'
  } else if (isLowCtr) {
    issueType = 'high_impression_low_ctr'
    priority = 'A'
    recommendedAction = 'title/descriptionの訴求を強め、検索語を自然に含める'
    expectedImpact = 'CTR改善'
  } else if (isReachableRank) {
    issueType = 'reachable_rank'
    priority = 'B'
    recommendedAction = '該当テーマの本文追記、FAQ追加、関連記事からの内部リンクを追加'
    expectedImpact = '8〜20位圏の順位改善'
  } else if (isFalling) {
    issueType = 'click_drop'
    priority = 'B'
    recommendedAction = '順位低下・CTR低下・対象ページの内容ズレを切り分ける'
    expectedImpact = 'クリック減少の原因特定'
  } else if (isImproving) {
    issueType = 'rising_query'
    priority = 'C'
    recommendedAction = '伸びている検索語に合わせて関連見出しを補強'
    expectedImpact = '伸長クエリの取り込み'
  }

  return {
    priority,
    site: siteName,
    query: query.query,
    issue_type: issueType,
    clicks: query.clicks,
    impressions: query.impressions,
    ctr: query.ctr,
    position: query.position,
    clicks_diff: query.clicks_diff ?? null,
    impressions_diff: query.impressions_diff ?? null,
    ctr_diff: query.ctr_diff ?? null,
    position_diff: query.position_diff ?? null,
    recommended_action: recommendedAction,
    expected_impact: expectedImpact,
  }
}

function buildSeoOpportunities(scResults) {
  const opportunities = []
  for (const [siteName, siteData] of Object.entries(scResults)) {
    for (const query of siteData.current.topQueries || []) {
      const opportunity = classifySeoOpportunity(siteName, query)
      if (opportunity) opportunities.push(opportunity)
    }
  }

  const rank = { A: 0, B: 1, C: 2 }
  return opportunities.sort((a, b) => (
    rank[a.priority] - rank[b.priority] ||
    b.impressions - a.impressions ||
    a.position - b.position
  )).slice(0, 20)
}

function normalizeQuery(query) {
  return String(query || '').toLowerCase().replace(/\s+/g, ' ').trim()
}

function classifySearchIntent(query, area) {
  const q = normalizeQuery(query)
  const hasArea = q.includes(area.toLowerCase())
  const hasBrand = /快楽|かいらく|kairaku|m-kairaku|m性感倶楽部|m性感俱楽部|m性感クラブ|エム性感クラブ/.test(q)
  const hasService = /m性感|性感|メンズエステ|メンエス|風俗|回春|マッサージ|出張|デリヘル|エステ/.test(q)

  if (hasBrand) return 'brand'
  if (hasArea && hasService) return 'area_service'
  if (hasArea) return 'area_general'
  if (hasService) return 'service'
  return 'other'
}

function intentLabel(intent) {
  const labels = {
    brand: '指名系',
    area_service: 'エリア業種系',
    area_general: 'エリア一般',
    service: '業種系',
    area_play: 'エリア×プレイ',
    play_desire: 'プレイ/欲求',
    beginner_need: '初心者/比較',
    other: 'その他',
  }
  return labels[intent] || intent
}

function classifyGrowthIntent(query, area) {
  const q = normalizeQuery(query)
  const hasArea = q.includes(area.toLowerCase()) || /千葉|成田|西船橋|船橋|錦糸町|東京|千葉県/.test(q)
  const hasPlay = /m男|前立腺|乳首|寸止め|焦らし|ドライオーガズム|言葉責め|女性.*責め|責められたい|責めて|女王様|痴女|手コキ|射精管理|アナル|密着|性感マッサージ/.test(q)
  const hasBeginnerNeed = /初めて|初心者|おすすめ|口コミ|体験|どんな|とは|痛い|怖い|料金|コース|選び方/.test(q)

  if (hasPlay && hasArea) return 'area_play'
  if (hasPlay) return 'play_desire'
  if (hasBeginnerNeed && !/快楽|かいらく|kairaku|m-kairaku/.test(q)) return 'beginner_need'
  return null
}

function buildGrowthQueryOpportunities(pageResults) {
  const opportunities = []
  for (const pageData of pageResults) {
    const rows = pageData.current?.rows || []
    for (const row of rows) {
      const intent = classifyGrowthIntent(row.query, pageData.area)
      if (!intent) continue

      const impressionsDiffPct = typeof row.prev_impressions === 'number'
        ? percentDiff(row.impressions, row.prev_impressions)
        : null
      const isReachableRank = row.position >= 5 && row.position <= 25
      const isLowCtr = row.impressions >= 20 && row.ctr < 8
      const isAreaPlay = intent === 'area_play'

      let priority = 'C'
      let recommendedAction = '関連する見出し・本文・FAQを追加し、店舗ページから導線を作る'
      if (isAreaPlay && (isReachableRank || row.impressions >= 20)) {
        priority = 'A'
        recommendedAction = '店舗ページ本文上部またはFAQに、エリアとプレイ内容を自然に含む回答を追加'
      } else if (isReachableRank || isLowCtr || intent === 'play_desire') {
        priority = 'B'
        recommendedAction = 'プレイ紹介/FAQを補強し、対応店舗・対応コースへの内部リンクを追加'
      }

      opportunities.push({
        priority,
        intent,
        label: intentLabel(intent),
        site: pageData.siteName,
        area: pageData.area,
        store_name: pageData.storeName,
        path: pageData.path,
        page: row.page,
        query: row.query,
        clicks: row.clicks,
        impressions: row.impressions,
        ctr: row.ctr,
        position: row.position,
        clicks_diff: row.clicks_diff ?? null,
        impressions_diff: row.impressions_diff ?? null,
        impressions_diff_pct: impressionsDiffPct,
        ctr_diff: row.ctr_diff ?? null,
        position_diff: row.position_diff ?? null,
        recommended_action: recommendedAction,
        expected_impact: isAreaPlay ? '来店可能性の高い非指名検索の獲得' : '店名未認知層の検索流入拡張',
      })
    }
  }

  const rank = { A: 0, B: 1, C: 2 }
  return opportunities
    .sort((a, b) => (
      rank[a.priority] - rank[b.priority] ||
      b.impressions - a.impressions ||
      a.position - b.position
    ))
    .slice(0, 20)
}

function diffPageQueryRow(row, prevRow) {
  const base = {
    page: row.keys[0],
    query: row.keys[1],
    clicks: row.clicks,
    impressions: row.impressions,
    ctr: Math.round(row.ctr * 1000) / 10,
    position: Math.round(row.position * 10) / 10,
  }
  if (!prevRow) return base
  return {
    ...base,
    prev_clicks: prevRow.clicks,
    prev_impressions: prevRow.impressions,
    prev_ctr: Math.round(prevRow.ctr * 1000) / 10,
    prev_position: Math.round(prevRow.position * 10) / 10,
    clicks_diff: row.clicks - prevRow.clicks,
    impressions_diff: row.impressions - prevRow.impressions,
    ctr_diff: Math.round((row.ctr - prevRow.ctr) * 1000) / 10,
    position_diff: Math.round((row.position - prevRow.position) * 10) / 10,
  }
}

function pageQueryKey(row) {
  return `${row.page}|${normalizeQuery(row.query)}`
}

function buildQueryDrops(currentRows, previousRows, area) {
  const currentMap = {}
  for (const row of currentRows) {
    currentMap[pageQueryKey(row)] = row
  }

  const lostQueries = []
  for (const prev of previousRows) {
    if (prev.impressions < 20) continue
    const current = currentMap[pageQueryKey(prev)]
    if (current) continue
    lostQueries.push({
      type: 'lost',
      intent: classifySearchIntent(prev.query, area),
      label: intentLabel(classifySearchIntent(prev.query, area)),
      page: prev.page,
      query: prev.query,
      clicks: 0,
      impressions: 0,
      ctr: 0,
      position: 0,
      prev_clicks: prev.clicks,
      prev_impressions: prev.impressions,
      prev_ctr: prev.ctr,
      prev_position: prev.position,
      clicks_diff: -prev.clicks,
      impressions_diff: -prev.impressions,
      impressions_diff_pct: -100,
    })
  }

  const decliningQueries = currentRows
    .filter(row => (
      typeof row.prev_impressions === 'number' &&
      row.prev_impressions >= 20 &&
      typeof row.impressions_diff === 'number' &&
      row.impressions_diff <= -20
    ))
    .map(row => ({
      type: 'declining',
      intent: classifySearchIntent(row.query, area),
      label: intentLabel(classifySearchIntent(row.query, area)),
      ...row,
      impressions_diff_pct: percentDiff(row.impressions, row.prev_impressions),
    }))
    .filter(row => row.impressions_diff_pct !== null && row.impressions_diff_pct <= -30)

  return [...lostQueries, ...decliningQueries]
    .sort((a, b) => Math.abs(b.impressions_diff || 0) - Math.abs(a.impressions_diff || 0))
    .slice(0, 10)
}

function buildPageSeoInsights(pageResults) {
  const insights = []
  for (const pageData of pageResults) {
    const currentRows = pageData.current?.rows || []
    const previousRows = pageData.previous?.rows || []
    const currentSummary = summarizeSCRows(currentRows)
    const previousSummary = summarizeSCRows(previousRows)
    const impressionsDiffPct = percentDiff(currentSummary.impressions, previousSummary.impressions)
    const clicksDiffPct = percentDiff(currentSummary.clicks, previousSummary.clicks)
    const ctrDiff = absDiff(currentSummary.ctr, previousSummary.ctr)
    const positionDiff = absDiff(currentSummary.position, previousSummary.position)
    const queryDrops = buildQueryDrops(currentRows, previousRows, pageData.area)

    const grouped = {}
    for (const row of currentRows) {
      const intent = classifySearchIntent(row.query, pageData.area)
      if (!grouped[intent]) {
        grouped[intent] = { intent, label: intentLabel(intent), clicks: 0, impressions: 0, queries: [] }
      }
      grouped[intent].clicks += row.clicks
      grouped[intent].impressions += row.impressions
      grouped[intent].queries.push(row)
    }

    const queryGroups = Object.values(grouped)
      .map(group => ({
        ...group,
        share: currentSummary.impressions > 0 ? round1(group.impressions / currentSummary.impressions * 100) : 0,
        queries: group.queries.sort((a, b) => b.impressions - a.impressions).slice(0, 5),
      }))
      .sort((a, b) => b.impressions - a.impressions)

    const signals = []
    if (impressionsDiffPct !== null && impressionsDiffPct <= -15 && ctrDiff > 0.5) {
      signals.push('impressions_down_ctr_up')
    }
    if (impressionsDiffPct !== null && impressionsDiffPct <= -20) signals.push('page_impressions_drop')
    if (clicksDiffPct !== null && clicksDiffPct <= -20) signals.push('page_clicks_drop')
    if (positionDiff >= 2) signals.push('page_rank_drop')
    if (queryDrops.some(row => row.intent === 'area_service' || row.intent === 'area_general')) {
      signals.push('nonbrand_query_drop')
    }

    const brand = queryGroups.find(group => group.intent === 'brand')
    if ((brand?.share || 0) >= 45 && queryGroups.length > 1) signals.push('brand_heavy')

    let priority = 'C'
    if (
      signals.includes('page_impressions_drop') ||
      signals.includes('page_clicks_drop') ||
      signals.includes('page_rank_drop') ||
      signals.includes('nonbrand_query_drop')
    ) {
      priority = 'A'
    } else if (signals.includes('impressions_down_ctr_up') || signals.includes('brand_heavy')) {
      priority = 'B'
    }

    let mainIssue = '大きな異常なし'
    let recommendedAction = '継続観測'
    if (signals.includes('impressions_down_ctr_up')) {
      mainIssue = '表示減・CTR上昇。濃い検索に偏り、新規系露出が減っている可能性'
      recommendedAction = '非指名のエリア業種クエリを確認し、店舗トップ本文・FAQ・内部リンクを補強'
    } else if (signals.includes('nonbrand_query_drop')) {
      mainIssue = '非指名系クエリの表示回数が大きく減少'
      recommendedAction = '減少クエリに対応する見出し・本文・FAQを店舗トップまたは関連ページへ追加'
    } else if (signals.includes('page_impressions_drop')) {
      mainIssue = '店舗ページ配下の表示回数が大きく減少'
      recommendedAction = '表示減クエリと対象ページを確認し、title/description・本文上部・出勤導線を見直す'
    } else if (signals.includes('page_clicks_drop')) {
      mainIssue = '店舗ページ配下のクリックが大きく減少'
      recommendedAction = '順位低下・CTR低下・競合訴求変化のどれかを切り分ける'
    } else if (signals.includes('page_rank_drop')) {
      mainIssue = '店舗ページ配下の平均順位が悪化'
      recommendedAction = '上位クエリの検索意図に合わせて見出しと内部リンクを補強'
    } else if (signals.includes('brand_heavy')) {
      mainIssue = '指名系クエリ比率が高く、新規系検索の厚みが弱い可能性'
      recommendedAction = 'エリア業種系クエリに対応する本文・FAQ・関連ページリンクを追加'
    }

    insights.push({
      priority,
      site: pageData.siteName,
      area: pageData.area,
      store_name: pageData.storeName,
      path: pageData.path,
      summary: currentSummary,
      previous_summary: previousSummary,
      clicks_diff_pct: clicksDiffPct,
      impressions_diff_pct: impressionsDiffPct,
      ctr_diff: ctrDiff,
      position_diff: positionDiff,
      signals,
      query_groups: queryGroups,
      top_queries: currentRows.slice(0, 10),
      query_drops: queryDrops,
      main_issue: mainIssue,
      recommended_action: recommendedAction,
    })
  }

  const rank = { A: 0, B: 1, C: 2 }
  return insights.sort((a, b) => (
    rank[a.priority] - rank[b.priority] ||
    Math.abs(b.impressions_diff_pct || 0) - Math.abs(a.impressions_diff_pct || 0)
  ))
}

function buildMarketingInsights(ga4Results, scResults, pageSeoResults = []) {
  const storeInsights = buildStoreInsights(ga4Results)
  const seoOpportunities = buildSeoOpportunities(scResults)
  const pageSeoInsights = buildPageSeoInsights(pageSeoResults)
  const growthQueryOpportunities = buildGrowthQueryOpportunities(pageSeoResults)
  const alerts = [
    ...storeInsights
      .filter(store => store.priority !== 'C')
      .map(store => ({
        priority: store.priority,
        category: 'store',
        target: store.store_name,
        reason: store.main_issue,
        action: store.recommended_action,
      })),
    ...seoOpportunities
      .filter(item => item.priority !== 'C')
      .map(item => ({
        priority: item.priority,
        category: 'seo',
        target: `${item.site}: ${item.query}`,
        reason: `${item.issue_type} / 表示${item.impressions}・CTR${item.ctr}%・順位${item.position}`,
        action: item.recommended_action,
      })),
    ...pageSeoInsights
      .filter(item => item.priority !== 'C')
      .map(item => ({
        priority: item.priority,
        category: 'page_seo',
        target: `${item.store_name}: ${item.path}`,
        reason: `${item.main_issue} / 表示${item.summary.impressions}・CTR${item.summary.ctr}%・順位${item.summary.position}`,
        action: item.query_drops?.length
          ? `${item.recommended_action}。優先確認クエリ: ${item.query_drops.slice(0, 3).map(row => row.query).join(' / ')}`
          : item.recommended_action,
      })),
    ...growthQueryOpportunities
      .filter(item => item.priority !== 'C')
      .map(item => ({
        priority: item.priority,
        category: 'growth_query',
        target: `${item.store_name}: ${item.query}`,
        reason: `${item.label} / 表示${item.impressions}・CTR${item.ctr}%・順位${item.position}`,
        action: item.recommended_action,
      })),
  ]

  const rank = { A: 0, B: 1, C: 2 }
  const actionItems = alerts
    .sort((a, b) => rank[a.priority] - rank[b.priority])
    .slice(0, 10)
    .map(item => ({
      ...item,
      owner: item.category === 'store' ? '店舗運用' : 'SEO/マーケ',
      expected_impact: item.category === 'store' ? 'CVR改善・計測精度改善' : '検索流入・CTR改善',
    }))

  return {
    storeInsights,
    seoOpportunities,
    pageSeoInsights,
    growthQueryOpportunities,
    castInsights: [],
    actionItems,
    alerts,
  }
}

function requireEnv(names) {
  const missing = names.filter(name => !process.env[name])
  if (missing.length > 0) throw new Error(`Missing env: ${missing.join(', ')}`)
}

// --- Main ---
async function main() {
  console.log('[analytics-report] 開始:', new Date().toLocaleString('ja-JP'))

  requireEnv([
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'GOOGLE_REFRESH_TOKEN',
  ])

  const token = await getAccessToken()
  const { startDate, endDate } = getDateRange()
  const { startDate: prevStart, endDate: prevEnd } = getPrevDateRange()
  const { startDate: scStartDate, endDate: scEndDate } = getSearchConsoleDateRange()
  const { startDate: scPrevStartDate, endDate: scPrevEndDate } = getPrevSearchConsoleDateRange()

  console.log(`GA4: ${startDate} 〜 ${endDate} / 前週: ${prevStart} 〜 ${prevEnd}`)
  console.log(`SC : ${scStartDate} 〜 ${scEndDate} / 前週: ${scPrevStartDate} 〜 ${scPrevEndDate}`)

  // publish_rules から cp4_gid → cast_name マップを取得（キャスト別PVの表示名解決用）
  let supabase = null
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  }
  const castNameMap = supabase ? await fetchCastNameMap(supabase) : {}

  // GA4 M性感4店舗 × 3種レポート × 今週+前週 = 並列取得
  const ga4Results = {}
  const castAccessByName = {}
  const profileReferrersByName = {}
  await Promise.all(GA4_PROPERTIES.map(async prop => {
    const [mainCurr, mainPrev, chCurr, chPrev, evCurr, evPrev, castCurr, castPrev, refCurr] = await Promise.all([
      fetchGA4Main(prop.id, token, startDate, endDate),
      fetchGA4Main(prop.id, token, prevStart, prevEnd),
      fetchGA4Channels(prop.id, token, startDate, endDate),
      fetchGA4Channels(prop.id, token, prevStart, prevEnd),
      fetchGA4Events(prop.id, token, startDate, endDate),
      fetchGA4Events(prop.id, token, prevStart, prevEnd),
      fetchGA4CastProfiles(prop.id, token, startDate, endDate),
      fetchGA4CastProfiles(prop.id, token, prevStart, prevEnd),
      fetchGA4ProfileReferrers(prop.id, token, startDate, endDate),
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

    // キャスト別プロフィールPV（gid → cast_name はpublish_rulesから解決。未登録キャストはcast_name: null）
    const currViewsByGid = summarizeCastProfiles(castCurr)
    const prevViewsByGid = summarizeCastProfiles(castPrev)
    const nameMap = castNameMap[prop.site_id] || {}
    const allGids = new Set([...Object.keys(currViewsByGid), ...Object.keys(prevViewsByGid)])
    const casts = [...allGids].map(gid => {
      const views = currViewsByGid[gid] || 0
      const prevViews = prevViewsByGid[gid] || 0
      return {
        gid,
        cast_name: nameMap[gid] || null,
        views,
        prev_views: prevViews,
        views_diff_pct: percentDiff(views, prevViews),
      }
    }).sort((a, b) => b.views - a.views)
    castAccessByName[prop.name] = { store_name: prop.name, area: prop.area, casts }

    // プロフィールページへのサイト内遷移元内訳
    profileReferrersByName[prop.name] = {
      store_name: prop.name,
      area: prop.area,
      breakdown: summarizeProfileReferrers(refCurr),
    }

    process.stdout.write('.')
  }))
  console.log(' GA4完了')

  const castAccess = GA4_PROPERTIES.map(p => castAccessByName[p.name])
  const profileReferrers = GA4_PROPERTIES.map(p => profileReferrersByName[p.name])

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

  // Search Console 店舗ページ深掘り（page + query）
  const pageSeoResults = []
  await Promise.all(M_STORE_PAGES.map(async page => {
    const pageUrlContains = `https://www.m-kairaku.com${page.includePath}`
    const excludeFilters = (page.excludePaths || []).map(path => ({
      dimension: 'page',
      operator: 'notContains',
      expression: `https://www.m-kairaku.com${path}`,
    }))
    const body = {
      dimensions: ['page', 'query'],
      rowLimit: 250,
      dimensionFilterGroups: [{
        filters: [
          {
            dimension: 'page',
            operator: 'contains',
            expression: pageUrlContains,
          },
          ...excludeFilters,
        ],
      }],
    }
    const [current, previous] = await Promise.all([
      fetchSC(page.siteUrl, token, { ...body, startDate: scStartDate, endDate: scEndDate }),
      fetchSC(page.siteUrl, token, { ...body, startDate: scPrevStartDate, endDate: scPrevEndDate }),
    ])

    const prevMap = {}
    for (const r of (previous?.rows || [])) {
      prevMap[`${r.keys[0]}|${r.keys[1]}`] = r
    }

    pageSeoResults.push({
      ...page,
      current: {
        rows: (current?.rows || []).map(r => diffPageQueryRow(r, prevMap[`${r.keys[0]}|${r.keys[1]}`])),
      },
      previous: {
        rows: (previous?.rows || []).map(r => ({
          page: r.keys[0],
          query: r.keys[1],
          clicks: r.clicks,
          impressions: r.impressions,
          ctr: Math.round(r.ctr * 1000) / 10,
          position: Math.round(r.position * 10) / 10,
        })),
      },
    })
    process.stdout.write('.')
  }))
  console.log(' 店舗SEO完了')

  const marketing = buildMarketingInsights(ga4Results, scResults, pageSeoResults)

  if (DRY_RUN) {
    console.log('--- DRY RUN: castAccess / profileReferrers プレビュー ---')
    console.log(JSON.stringify({ castAccess, profileReferrers }, null, 2).slice(0, 4000))
    console.log('--- DRY RUN: raw_data 構造プレビュー (先頭6000文字) ---')
    console.log(JSON.stringify({ ga4: ga4Results, searchConsole: scResults, pageSeo: pageSeoResults, marketing }, null, 2).slice(0, 6000))
    console.log('\n[analytics-report] DRY RUN 完了 ✓（Claude呼び出し・Supabase保存スキップ）')
    return
  }

  requireEnv([
    'ANTHROPIC_API_KEY',
    'NEXT_PUBLIC_SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
  ])

  // Claudeには機械判定済みのmarketingを中心に渡す。page+queryの全行は長くなるため渡さない。
  const promptData = {
    ga4: ga4Results,
    searchConsole: scResults,
    marketing,
    pageSeoSummary: pageSeoResults.map(page => ({
      siteName: page.siteName,
      area: page.area,
      storeName: page.storeName,
      path: page.path,
      currentRows: page.current.rows.length,
      previousRows: page.previous.rows.length,
    })),
  }
  const dataText = JSON.stringify(promptData, null, 2)

  const prompt = `あなたは風俗店グループ「快楽M性感倶楽部」のウェブマーケティングアナリストです。
以下はGA4・Search Consoleデータです。

【集計期間】
- GA4: ${startDate}〜${endDate}（昨日まで7日間）
- Search Console: ${scStartDate}〜${scEndDate}（データ反映遅延を避けるため3日遅れで集計）
- ※ GA4とSearch Consoleは集計期間が異なるため直接比較しないこと。

【データ構造の説明】
- GA4: current（今週）/ previous（前週）形式。M性感4店舗分。
- searchConsole: current（今週）/ previous（前週）形式。M性感サイト分。
- marketing.storeInsights: GA4から機械判定した店舗別アラート。priority A/B/C、alerts、recommended_action を含む。
- marketing.seoOpportunities: Search Consoleから機械抽出したSEO改善候補。priority A/B/C、issue_type、recommended_action を含む。
- marketing.pageSeoInsights: 店舗ページ配下の page+query 分析。表示減・CTR上昇、指名系偏重、順位悪化を検知する。
- marketing.pageSeoInsights[].query_drops: 前週から消えた、または表示が大きく減ったクエリ。初期運用ではこの範囲を重点確認する。
- marketing.growthQueryOpportunities: 指名系・表記揺れ中心の上位クエリとは別に、プレイ内容・欲求・初心者/比較系の非指名検索を抽出した成長候補。
- marketing.actionItems: 店舗・SEOの優先アクション候補。ここを必ずレポートに反映すること。
- phone_cvr = 電話クリック数 ÷ セッション数（%）
- reservation_cvr = WEB予約クリック数 ÷ セッション数（%）
- request_cvr = 出勤リクエストクリック数 ÷ セッション数（%）（指名したいキャストへの出勤依頼）
- survey_cvr = アンケートクリック数 ÷ セッション数（%）
- channels = 流入チャネル別セッション数（Organic Search / Direct / Referral 等）
- searchConsole.current.topQueries の position_diff はマイナスが順位改善、clicks_diff はプラスが増加。

${dataText}

以下の構成で日本語レポートを作成してください。単なる数字報告ではなく、来週のマーケ施策を決めるための判断材料として書くこと。

## 📊 週次ウェブ解析レポート（${startDate} 〜 ${endDate}）

### 1. 今週の重要変化（3〜5行）
- M性感4店舗の総セッション・総電話クリック・総WEB予約クリック・総出勤リクエストと前週比
- marketing.actionItems の優先度A/Bを踏まえた特筆事項

### 2. 今週優先すべき店舗
marketing.storeInsights を参照し、priority A/Bの店舗を優先して書くこと。
- 店舗名
- priority
- main_issue
- recommended_action
- 根拠となる数字（セッション、phone_cvr、reservation_cvr、前週比）

### 3. CVR分析（重要）
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

### 4. 流入チャネル分析
- M性感全体でのオーガニック/直接/参照の割合
- 特定店舗で流入構造が偏っている場合は指摘

### 5. 店舗別ハイライト
- 伸びた店舗・落ちた店舗を具体的数字で（前週比±15%以上を強調）

### 6. SEO改善候補（Search Console）
searchConsole.current.summary と searchConsole.previous.summary の実データを使って前週比を計算すること（推測禁止）。
- M性感の clicks / impressions / ctr / position と前週比
- topQueries から注目クエリ（clicks_diff が大きい、または position_diff がマイナスで改善）
- marketing.seoOpportunities のpriority A/Bを優先し、表示回数が多くCTRが低いクエリ、8〜20位で伸ばせるクエリを具体的に挙げる
- 各候補に recommended_action を添える

### 7. 店舗ページ別SEO深掘り
marketing.pageSeoInsights を使い、priority A/Bの店舗ページを優先して書くこと。
- 表示回数、クリック、CTR、平均順位の前週比
- query_groups から指名系/エリア業種系/その他の偏り
- query_drops がある場合は、減少クエリ名と減少幅を具体的に挙げる
- 「表示減・CTR上昇」は新規自然流入減・指名流入偏重の疑いとして扱う
- recommended_action を添える

### 8. 非指名・欲求検索の成長候補
marketing.growthQueryOpportunities を使い、priority A/Bを優先して書くこと。
- 店舗名、クエリ、分類、表示回数、CTR、順位
- エリア×プレイ内容を最優先し、本文・FAQ・内部リンクのどれを足すべきか提案
- 純粋な「エリア + M性感」の表記揺れはここでは成長候補として扱わない

### 9. 来週の改善アクション（優先度順）
marketing.actionItems から優先度A/Bを中心に最大5件。各項目は以下の形式:
- 優先度 / 領域 / 対象
- 理由
- 実行内容
- 期待効果

簡潔かつ実用的に。数字は必ず前週比を添えること。前週データが存在しない場合は「前週データなし」と明記し推測しないこと。`

  console.log('Claude分析中...')
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2500,
    messages: [{ role: 'user', content: prompt }],
  })
  const summary = message.content[0].text
  console.log('Claude分析完了')

  if (!supabase) {
    supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )
  }
  const { error } = await supabase.from('analytics_reports').upsert(
    {
      report_date: endDate,
      report_type: 'weekly',
      summary,
      raw_data: {
        ga4: ga4Results,
        searchConsole: scResults,
        pageSeo: pageSeoResults,
        marketing,
        castAccess,
        profileReferrers,
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

if (require.main === module) {
  main().catch(err => {
    console.error('[analytics-report] エラー:', err)
    process.exit(1)
  })
}

module.exports = {
  buildMarketingInsights,
  buildPageSeoInsights,
  buildSeoOpportunities,
  buildStoreInsights,
  classifySearchIntent,
  classifySeoOpportunity,
}
