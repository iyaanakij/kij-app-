#!/usr/bin/env node
// Export GA4 + Search Console summaries as CSV tables for Looker Studio / Sheets.
// Run: node scripts/export-looker-studio-csv.js

const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')

try {
  require('dotenv').config({ path: '/opt/shift-sync/.env' })
} catch {
  try {
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
    // Local syntax checks do not need production env.
  }
}

const OUTPUT_DIR = path.join(__dirname, '..', 'data', 'looker-studio')
const GSC_SITE_URL = 'https://www.m-kairaku.com/'
const CONTENT_MONITORING_START_MONTH = '2026-04'
const PHONE_CLICK_NOISY_START = '2026-05-20'
const PHONE_CLICK_NOISY_END = '2026-07-31'

const STORES = [
  { id: '391961329', brand: 'M性感', area: '錦糸町', store: 'M性感 錦糸町', path: '/kinshicho/', includePath: '/kinshicho/' },
  { id: '392280400', brand: 'M性感', area: '西船橋', store: 'M性感 西船橋', path: '/', includePath: '/', excludePaths: ['/chiba/', '/narita/', '/kinshicho/'] },
  { id: '383731131', brand: 'M性感', area: '千葉', store: 'M性感 千葉', path: '/chiba/', includePath: '/chiba/' },
  { id: '383648097', brand: 'M性感', area: '成田', store: 'M性感 成田', path: '/narita/', includePath: '/narita/' },
]

const GROUP_PAGES = [
  {
    id: '532587954',
    measurement_id: 'G-9K1YBY4Q6F',
    brand: '快楽M性感グループ',
    area: 'グループLP',
    store: '快楽M性感グループ /group/discount/',
    path: '/group/discount/',
    includePath: '/group/discount/',
  },
]

const QUERY_EXCLUDE_WORDS = [
  '成田',
  '千葉',
  '西船橋',
  '船橋',
  '錦糸町',
  '快楽',
  'かいらく',
  'kairaku',
  'm-kairaku',
  'm性感',
  'ｍ性感',
  'M性感',
  '性感倶楽部',
  '性感俱楽部',
  '性感クラブ',
]

const CONTENT_THEMES = [
  {
    group: 'initial_4',
    theme: '顔面騎乗',
    slug: 'ganmenkijou',
    published_at: '2026-04-08',
    paths: {
      錦糸町: '/kinshicho/2015/10/22/ganmenkijou/',
      西船橋: '/ganmenkijou/',
      千葉: '/chiba/ganmenkijou/',
      成田: '/narita/ganmenkijou/',
    },
  },
  {
    group: 'initial_4',
    theme: 'ドライオーガズム',
    slug: 'dry_orgasm',
    published_at: '2026-04-12',
    paths: {
      錦糸町: '/kinshicho/2015/10/22/dry_orgasm/',
      西船橋: '/dry_orgasm/',
      千葉: '/chiba/dry_orgasm/',
      成田: '/narita/dry_orgasm/',
    },
  },
  {
    group: 'initial_4',
    theme: '男の潮吹き',
    slug: 'shiofuki',
    published_at: '2026-04-14',
    paths: {
      錦糸町: '/kinshicho/2015/10/22/shiofuki/',
      西船橋: '/shiofuki/',
      千葉: '/chiba/shiofuki/',
      成田: '/narita/shiofuki/',
    },
  },
  {
    group: 'initial_4',
    theme: 'パンスト亀頭責め',
    slug: 'panst_m',
    published_at: '2026-04-14',
    paths: {
      錦糸町: '/kinshicho/2015/10/22/panst_m/',
      西船橋: '/panst_m/',
      千葉: '/chiba/panst_m/',
      成田: '/narita/panst_m/',
    },
  },
  {
    group: 'new_4',
    theme: 'エネマグラ',
    slug: 'enema',
    published_at: '2026-07-11',
    paths: {
      錦糸町: '/kinshicho/2015/10/22/enema/',
      西船橋: '/enema-2/',
      千葉: '/chiba/enema/',
      成田: '/narita/enema/',
    },
  },
  {
    group: 'new_4',
    theme: '前立腺マッサージ',
    slug: 'zenritsusen_m',
    published_at: '2026-07-11',
    paths: {
      錦糸町: '/kinshicho/2015/10/22/zenritsusen_m/',
      西船橋: '/zenritsusen_m/',
      千葉: '/chiba/zenritsusen_m/',
      成田: '/narita/zenritsusen_m/',
    },
  },
  {
    group: 'new_4',
    theme: 'パウダー性感',
    slug: 'powder_m',
    published_at: '2026-07-11',
    paths: {
      錦糸町: '/kinshicho/2015/10/22/powder_m/',
      西船橋: '/powder_m/',
      千葉: '/chiba/powder_m/',
      成田: '/narita/powder_m/',
    },
  },
  {
    group: 'new_4',
    theme: '拘束プレイ',
    slug: 'kousoku_m',
    published_at: '2026-07-11',
    paths: {
      錦糸町: '/kinshicho/2015/10/22/kousoku_m/',
      西船橋: '/kousoku_m/',
      千葉: '/chiba/kousoku_m/',
      成田: '/narita/kousoku_m/',
    },
  },
]

const CONTENT_PAGES = CONTENT_THEMES.flatMap(theme =>
  STORES.map(store => ({
    ...theme,
    brand: store.brand,
    area: store.area,
    store: store.store,
    propertyId: store.id,
    path: theme.paths[store.area],
    page: `https://www.m-kairaku.com${theme.paths[store.area]}`,
  }))
)

function argValue(name) {
  const prefix = `--${name}=`
  const match = process.argv.find(arg => arg.startsWith(prefix))
  return match ? match.slice(prefix.length) : null
}

function toJSTDateStr(utcDate) {
  return new Date(utcDate.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function defaultGa4Range() {
  const endDate = addDays(toJSTDateStr(new Date()), -1)
  return { startDate: addDays(endDate, -6), endDate }
}

function defaultSearchConsoleRange() {
  const endDate = addDays(toJSTDateStr(new Date()), -3)
  return { startDate: addDays(endDate, -6), endDate }
}

function previousRange(range) {
  return { startDate: addDays(range.startDate, -7), endDate: addDays(range.endDate, -7) }
}

function monthRange(month) {
  const startDate = `${month}-01`
  const d = new Date(startDate + 'T12:00:00Z')
  d.setUTCMonth(d.getUTCMonth() + 1)
  d.setUTCDate(0)
  return { month, startDate, endDate: d.toISOString().slice(0, 10) }
}

function addMonths(month, count) {
  const d = new Date(`${month}-01T12:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() + count)
  return d.toISOString().slice(0, 7)
}

function contentMonths(scEndDate) {
  const start = argValue('content-start-month') || CONTENT_MONITORING_START_MONTH
  const end = argValue('content-end-month') || scEndDate.slice(0, 7)
  const months = []
  for (let month = start; month <= end; month = addMonths(month, 1)) {
    months.push(monthRange(month))
  }
  return months
}

async function getAccessToken() {
  const key = loadServiceAccountKey()
  const tokenUri = key.token_uri || 'https://oauth2.googleapis.com/token'
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'RS256', typ: 'JWT' }
  const claim = {
    iss: key.client_email,
    scope: 'https://www.googleapis.com/auth/analytics.readonly https://www.googleapis.com/auth/webmasters.readonly',
    aud: tokenUri,
    exp: now + 3600,
    iat: now,
  }
  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claim))}`
  const signature = crypto.sign('RSA-SHA256', Buffer.from(unsigned), key.private_key)
    .toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  const jwt = `${unsigned}.${signature}`

  const res = await fetch(tokenUri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })
  const data = await res.json()
  if (!data.access_token) throw new Error(`Token error: ${JSON.stringify(data)}`)
  return data.access_token
}

function loadServiceAccountKey() {
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    return JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON)
  }
  const defaultKeyPath = path.join(process.env.HOME || '', 'Desktop', 'KIJ', 'secrets', 'ga4-service-account.json')
  const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH || defaultKeyPath
  if (keyPath && fs.existsSync(keyPath)) {
    return JSON.parse(fs.readFileSync(keyPath, 'utf8'))
  }
  throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON または GOOGLE_SERVICE_ACCOUNT_KEY_PATH が必要です')
}

function base64url(input) {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function ga4Report(propertyId, accessToken, body) {
  const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (data.error) throw new Error(`GA4 ${propertyId}: ${data.error.message}`)
  return data
}

async function searchConsoleReport(accessToken, body) {
  const res = await fetch(
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(GSC_SITE_URL)}/searchAnalytics/query`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, dataState: 'final' }),
    }
  )
  const data = await res.json()
  if (data.error) throw new Error(`Search Console: ${data.error.message}`)
  return data
}

async function fetchGa4Main(propertyId, accessToken, startDate, endDate) {
  return ga4Report(propertyId, accessToken, {
    dateRanges: [{ startDate, endDate }],
    metrics: [
      { name: 'sessions' },
      { name: 'activeUsers' },
      { name: 'screenPageViews' },
      { name: 'engagementRate' },
      { name: 'bounceRate' },
    ],
  })
}

async function fetchGa4Events(propertyId, accessToken, startDate, endDate) {
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

async function fetchGa4GroupEvents(propertyId, accessToken, startDate, endDate) {
  return ga4Report(propertyId, accessToken, {
    dateRanges: [{ startDate, endDate }],
    metrics: [{ name: 'eventCount' }],
    dimensions: [{ name: 'eventName' }],
    dimensionFilter: {
      filter: {
        fieldName: 'eventName',
        inListFilter: { values: ['phone_click', 'reservation_click'] },
      },
    },
  })
}

async function fetchGa4ContentPages(propertyId, accessToken, startDate, endDate) {
  return ga4Report(propertyId, accessToken, {
    dateRanges: [{ startDate, endDate }],
    metrics: [{ name: 'screenPageViews' }, { name: 'activeUsers' }],
    dimensions: [{ name: 'pagePathPlusQueryString' }],
    orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
    limit: 10000,
  })
}

async function fetchGa4ContentEvents(propertyId, accessToken, startDate, endDate) {
  return ga4Report(propertyId, accessToken, {
    dateRanges: [{ startDate, endDate }],
    metrics: [{ name: 'eventCount' }],
    dimensions: [{ name: 'pagePathPlusQueryString' }, { name: 'eventName' }],
    dimensionFilter: {
      filter: {
        fieldName: 'eventName',
        inListFilter: { values: ['phone_click', 'reservation_click', 'request_click', 'survey_click'] },
      },
    },
    orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
    limit: 10000,
  })
}

function summarizeGa4Main(data) {
  const values = data?.rows?.[0]?.metricValues?.map(metric => Number(metric.value)) || []
  return {
    sessions: Math.round(values[0] || 0),
    users: Math.round(values[1] || 0),
    views: Math.round(values[2] || 0),
    engagement_rate: round1((values[3] || 0) * 100),
    bounce_rate: round1((values[4] || 0) * 100),
  }
}

function summarizeGa4Events(data) {
  const result = { phone_click: 0, reservation_click: 0, request_click: 0, survey_click: 0 }
  for (const row of data?.rows || []) {
    const eventName = row.dimensionValues[0].value
    if (eventName in result) result[eventName] = Math.round(Number(row.metricValues[0].value) || 0)
  }
  return result
}

function summarizeGscRows(rows) {
  let clicks = 0
  let impressions = 0
  let positionWeighted = 0
  for (const row of rows || []) {
    clicks += row.clicks || 0
    impressions += row.impressions || 0
    positionWeighted += (row.position || 0) * (row.impressions || 0)
  }
  return {
    clicks,
    impressions,
    ctr: impressions ? round2(clicks / impressions * 100) : 0,
    average_position: impressions ? round2(positionWeighted / impressions) : 0,
  }
}

function rowToGsc(row, dimensions) {
  const data = {}
  dimensions.forEach((dimension, index) => {
    data[dimension] = row.keys[index]
  })
  return {
    ...data,
    clicks: row.clicks || 0,
    impressions: row.impressions || 0,
    ctr: round2((row.ctr || 0) * 100),
    average_position: round2(row.position || 0),
  }
}

function pageFilter(store) {
  const pageUrlContains = `https://www.m-kairaku.com${store.includePath}`
  return {
    dimensionFilterGroups: [{
      filters: [
        { dimension: 'page', operator: 'contains', expression: pageUrlContains },
        ...(store.excludePaths || []).map(storePath => ({
          dimension: 'page',
          operator: 'notContains',
          expression: `https://www.m-kairaku.com${storePath}`,
        })),
      ],
    }],
  }
}

function exactPageFilter(page) {
  return {
    dimensionFilterGroups: [{
      filters: [
        { dimension: 'page', operator: 'equals', expression: page },
      ],
    }],
  }
}

function normalizeGa4Path(value) {
  const withoutOrigin = String(value || '').replace(/^https?:\/\/www\.m-kairaku\.com/i, '')
  const pathOnly = withoutOrigin.split('?')[0].split('#')[0]
  return pathOnly.endsWith('/') ? pathOnly : `${pathOnly}/`
}

function emptyGa4PageStats() {
  return {
    pageviews: 0,
    active_users: 0,
    phone_click: 0,
    reservation_click: 0,
    request_click: 0,
    survey_click: 0,
  }
}

function isPhoneClickNoisy(area, startDate, endDate) {
  if (!['千葉', '成田'].includes(area)) return 'FALSE'
  return startDate <= PHONE_CLICK_NOISY_END && endDate >= PHONE_CLICK_NOISY_START ? 'TRUE' : 'FALSE'
}

function contentMeasurementPhase(contentPage, month) {
  if (contentPage.group !== 'new_4') return 'comparable'
  const publishedMonth = contentPage.published_at.slice(0, 7)
  if (month < publishedMonth) return 'pre_rework'
  if (month === publishedMonth) return 'launch_partial_month'
  return 'post_rework'
}

function isComparableToPrev(contentPage, month) {
  if (contentPage.group !== 'new_4') return 'TRUE'
  return month > contentPage.published_at.slice(0, 7) ? 'TRUE' : 'FALSE'
}

function isNonBrandQuery(query) {
  const normalized = String(query || '').toLowerCase()
  return !QUERY_EXCLUDE_WORDS.some(word => normalized.includes(word.toLowerCase()))
}

function pct(value, total) {
  return total ? round2(value / total * 100) : 0
}

function diff(curr, prev) {
  return round2((curr || 0) - (prev || 0))
}

function diffPct(curr, prev) {
  return prev ? round2(((curr || 0) - prev) / prev * 100) : ''
}

function round1(value) {
  return Math.round(value * 10) / 10
}

function round2(value) {
  return Math.round(value * 100) / 100
}

function csvValue(value) {
  if (value === null || value === undefined) return ''
  const text = String(value)
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function writeCsv(fileName, rows, columns) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true })
  const csv = [
    columns.join(','),
    ...rows.map(row => columns.map(column => csvValue(row[column])).join(',')),
  ].join('\n') + '\n'
  const outputPath = path.join(OUTPUT_DIR, fileName)
  fs.writeFileSync(outputPath, csv)
  console.log(`${outputPath} (${rows.length} rows)`)
}

async function buildStoreSummary(accessToken, ga4Range, scRange) {
  const ga4Previous = previousRange(ga4Range)
  const scPrevious = previousRange(scRange)
  const rows = []

  for (const store of STORES) {
    const [ga4Main, ga4Events, prevGa4Main, prevGa4Events, scCurrent, scPrev] = await Promise.all([
      fetchGa4Main(store.id, accessToken, ga4Range.startDate, ga4Range.endDate),
      fetchGa4Events(store.id, accessToken, ga4Range.startDate, ga4Range.endDate),
      fetchGa4Main(store.id, accessToken, ga4Previous.startDate, ga4Previous.endDate),
      fetchGa4Events(store.id, accessToken, ga4Previous.startDate, ga4Previous.endDate),
      searchConsoleReport(accessToken, {
        ...pageFilter(store),
        dimensions: ['page'],
        rowLimit: 250,
        startDate: scRange.startDate,
        endDate: scRange.endDate,
      }),
      searchConsoleReport(accessToken, {
        ...pageFilter(store),
        dimensions: ['page'],
        rowLimit: 250,
        startDate: scPrevious.startDate,
        endDate: scPrevious.endDate,
      }),
    ])

    const ga4 = { ...summarizeGa4Main(ga4Main), ...summarizeGa4Events(ga4Events) }
    const prevGa4 = { ...summarizeGa4Main(prevGa4Main), ...summarizeGa4Events(prevGa4Events) }
    const gsc = summarizeGscRows(scCurrent.rows)
    const prevGsc = summarizeGscRows(scPrev.rows)

    rows.push({
      report_type: 'weekly_store_summary',
      brand: store.brand,
      area: store.area,
      store: store.store,
      ga4_start_date: ga4Range.startDate,
      ga4_end_date: ga4Range.endDate,
      sc_start_date: scRange.startDate,
      sc_end_date: scRange.endDate,
      sessions: ga4.sessions,
      sessions_prev: prevGa4.sessions,
      sessions_diff_pct: diffPct(ga4.sessions, prevGa4.sessions),
      users: ga4.users,
      users_prev: prevGa4.users,
      users_diff_pct: diffPct(ga4.users, prevGa4.users),
      views: ga4.views,
      engagement_rate: ga4.engagement_rate,
      phone_click: ga4.phone_click,
      phone_click_prev: prevGa4.phone_click,
      phone_click_diff_pct: diffPct(ga4.phone_click, prevGa4.phone_click),
      phone_cvr: pct(ga4.phone_click, ga4.sessions),
      reservation_click: ga4.reservation_click,
      reservation_click_prev: prevGa4.reservation_click,
      reservation_click_diff_pct: diffPct(ga4.reservation_click, prevGa4.reservation_click),
      reservation_cvr: pct(ga4.reservation_click, ga4.sessions),
      request_click: ga4.request_click,
      request_cvr: pct(ga4.request_click, ga4.sessions),
      survey_click: ga4.survey_click,
      survey_cvr: pct(ga4.survey_click, ga4.sessions),
      sc_clicks: gsc.clicks,
      sc_clicks_prev: prevGsc.clicks,
      sc_clicks_diff_pct: diffPct(gsc.clicks, prevGsc.clicks),
      sc_impressions: gsc.impressions,
      sc_impressions_prev: prevGsc.impressions,
      sc_impressions_diff_pct: diffPct(gsc.impressions, prevGsc.impressions),
      sc_ctr: gsc.ctr,
      sc_ctr_diff: diff(gsc.ctr, prevGsc.ctr),
      sc_average_position: gsc.average_position,
      sc_average_position_diff: diff(gsc.average_position, prevGsc.average_position),
    })
    process.stdout.write('.')
  }
  console.log(' store summary')
  return rows
}

async function buildGroupPageSummary(accessToken, ga4Range, scRange) {
  const ga4Previous = previousRange(ga4Range)
  const scPrevious = previousRange(scRange)
  const rows = []

  for (const page of GROUP_PAGES) {
    const [ga4Main, ga4Events, prevGa4Main, prevGa4Events, scCurrent, scPrev] = await Promise.all([
      fetchGa4Main(page.id, accessToken, ga4Range.startDate, ga4Range.endDate),
      fetchGa4GroupEvents(page.id, accessToken, ga4Range.startDate, ga4Range.endDate),
      fetchGa4Main(page.id, accessToken, ga4Previous.startDate, ga4Previous.endDate),
      fetchGa4GroupEvents(page.id, accessToken, ga4Previous.startDate, ga4Previous.endDate),
      searchConsoleReport(accessToken, {
        ...pageFilter(page),
        dimensions: ['page'],
        rowLimit: 50,
        startDate: scRange.startDate,
        endDate: scRange.endDate,
      }),
      searchConsoleReport(accessToken, {
        ...pageFilter(page),
        dimensions: ['page'],
        rowLimit: 50,
        startDate: scPrevious.startDate,
        endDate: scPrevious.endDate,
      }),
    ])

    const ga4 = { ...summarizeGa4Main(ga4Main), ...summarizeGa4Events(ga4Events) }
    const prevGa4 = { ...summarizeGa4Main(prevGa4Main), ...summarizeGa4Events(prevGa4Events) }
    const gsc = summarizeGscRows(scCurrent.rows)
    const prevGsc = summarizeGscRows(scPrev.rows)

    rows.push({
      report_type: 'weekly_group_page_summary',
      brand: page.brand,
      area: page.area,
      store: page.store,
      ga4_start_date: ga4Range.startDate,
      ga4_end_date: ga4Range.endDate,
      sc_start_date: scRange.startDate,
      sc_end_date: scRange.endDate,
      sessions: ga4.sessions,
      sessions_prev: prevGa4.sessions,
      sessions_diff_pct: diffPct(ga4.sessions, prevGa4.sessions),
      users: ga4.users,
      users_prev: prevGa4.users,
      users_diff_pct: diffPct(ga4.users, prevGa4.users),
      views: ga4.views,
      engagement_rate: ga4.engagement_rate,
      phone_click: ga4.phone_click,
      phone_click_prev: prevGa4.phone_click,
      phone_click_diff_pct: diffPct(ga4.phone_click, prevGa4.phone_click),
      phone_cvr: pct(ga4.phone_click, ga4.sessions),
      reservation_click: ga4.reservation_click,
      reservation_click_prev: prevGa4.reservation_click,
      reservation_click_diff_pct: diffPct(ga4.reservation_click, prevGa4.reservation_click),
      reservation_cvr: pct(ga4.reservation_click, ga4.sessions),
      request_click: 0,
      request_cvr: 0,
      survey_click: 0,
      survey_cvr: 0,
      sc_clicks: gsc.clicks,
      sc_clicks_prev: prevGsc.clicks,
      sc_clicks_diff_pct: diffPct(gsc.clicks, prevGsc.clicks),
      sc_impressions: gsc.impressions,
      sc_impressions_prev: prevGsc.impressions,
      sc_impressions_diff_pct: diffPct(gsc.impressions, prevGsc.impressions),
      sc_ctr: gsc.ctr,
      sc_ctr_diff: diff(gsc.ctr, prevGsc.ctr),
      sc_average_position: gsc.average_position,
      sc_average_position_diff: diff(gsc.average_position, prevGsc.average_position),
    })
    process.stdout.write('g')
  }
  console.log(' group page summary')
  return rows
}

async function buildPageSeo(accessToken, scRange) {
  const rows = []
  for (const store of STORES) {
    const data = await searchConsoleReport(accessToken, {
      ...pageFilter(store),
      dimensions: ['page'],
      rowLimit: 250,
      startDate: scRange.startDate,
      endDate: scRange.endDate,
    })
    for (const row of data.rows || []) {
      const gsc = rowToGsc(row, ['page'])
      rows.push({
        report_type: 'weekly_page_seo',
        brand: store.brand,
        area: store.area,
        store: store.store,
        sc_start_date: scRange.startDate,
        sc_end_date: scRange.endDate,
        page: gsc.page,
        clicks: gsc.clicks,
        impressions: gsc.impressions,
        ctr: gsc.ctr,
        average_position: gsc.average_position,
      })
    }
    process.stdout.write('.')
  }
  console.log(' page seo')
  return rows
}

async function buildQueries(accessToken, scRange) {
  const allRows = []
  const nonBrandRows = []
  for (const store of STORES) {
    const data = await searchConsoleReport(accessToken, {
      ...pageFilter(store),
      dimensions: ['query'],
      rowLimit: 250,
      startDate: scRange.startDate,
      endDate: scRange.endDate,
    })
    for (const row of data.rows || []) {
      const gsc = rowToGsc(row, ['query'])
      const output = {
        report_type: 'weekly_query',
        brand: store.brand,
        area: store.area,
        store: store.store,
        sc_start_date: scRange.startDate,
        sc_end_date: scRange.endDate,
        query: gsc.query,
        clicks: gsc.clicks,
        impressions: gsc.impressions,
        ctr: gsc.ctr,
        average_position: gsc.average_position,
        is_nonbrand: isNonBrandQuery(gsc.query) ? 'TRUE' : 'FALSE',
      }
      allRows.push(output)
      if (output.is_nonbrand === 'TRUE') {
        nonBrandRows.push({ ...output, report_type: 'weekly_nonbrand_query' })
      }
    }
    process.stdout.write('.')
  }
  console.log(' queries')
  return { allRows, nonBrandRows }
}

async function buildGa4ContentStats(accessToken, months) {
  const stats = new Map()
  for (const range of months) {
    for (const store of STORES) {
      const [pages, events] = await Promise.all([
        fetchGa4ContentPages(store.id, accessToken, range.startDate, range.endDate),
        fetchGa4ContentEvents(store.id, accessToken, range.startDate, range.endDate),
      ])

      for (const row of pages.rows || []) {
        const ga4Path = normalizeGa4Path(row.dimensionValues[0].value)
        const key = `${range.month}|${store.area}|${ga4Path}`
        const current = stats.get(key) || emptyGa4PageStats()
        current.pageviews += Math.round(Number(row.metricValues[0].value) || 0)
        current.active_users += Math.round(Number(row.metricValues[1].value) || 0)
        stats.set(key, current)
      }

      for (const row of events.rows || []) {
        const ga4Path = normalizeGa4Path(row.dimensionValues[0].value)
        const eventName = row.dimensionValues[1].value
        const key = `${range.month}|${store.area}|${ga4Path}`
        const current = stats.get(key) || emptyGa4PageStats()
        if (eventName in current) {
          current[eventName] += Math.round(Number(row.metricValues[0].value) || 0)
        }
        stats.set(key, current)
      }
      process.stdout.write('.')
    }
  }
  console.log(' content ga4')
  return stats
}

async function buildContentPageMonthly(accessToken, months, ga4Stats) {
  const rows = []
  for (const range of months) {
    for (const contentPage of CONTENT_PAGES) {
      const data = await searchConsoleReport(accessToken, {
        ...exactPageFilter(contentPage.page),
        dimensions: ['page'],
        rowLimit: 1,
        startDate: range.startDate,
        endDate: range.endDate,
      })
      const gsc = summarizeGscRows(data.rows)
      const ga4 = ga4Stats.get(`${range.month}|${contentPage.area}|${contentPage.path}`) || emptyGa4PageStats()
      const phoneClickIsNoisy = isPhoneClickNoisy(contentPage.area, range.startDate, range.endDate)
      rows.push({
        report_type: 'content_page_monthly',
        period_month: range.month,
        start_date: range.startDate,
        end_date: range.endDate,
        brand: contentPage.brand,
        area: contentPage.area,
        store: contentPage.store,
        theme_group: contentPage.group,
        theme: contentPage.theme,
        slug: contentPage.slug,
        published_at: contentPage.published_at,
        measurement_phase: contentMeasurementPhase(contentPage, range.month),
        is_comparable_to_prev: isComparableToPrev(contentPage, range.month),
        page_path: contentPage.path,
        page: contentPage.page,
        gsc_clicks: gsc.clicks,
        gsc_impressions: gsc.impressions,
        gsc_ctr: gsc.ctr,
        gsc_average_position: gsc.average_position,
        ga4_pageviews: ga4.pageviews,
        ga4_active_users: ga4.active_users,
        ga4_phone_click: ga4.phone_click,
        ga4_reservation_click: ga4.reservation_click,
        ga4_request_click: ga4.request_click,
        ga4_survey_click: ga4.survey_click,
        ga4_cta_click: ga4.phone_click + ga4.reservation_click + ga4.request_click + ga4.survey_click,
        phone_click_is_noisy: phoneClickIsNoisy,
        phone_click_note: phoneClickIsNoisy === 'TRUE'
          ? '千葉・成田は2026-05-20〜2026-07-31のphone_clickが二重発火影響あり'
          : '',
      })
      process.stdout.write('.')
    }
  }
  console.log(' content page monthly')

  const byKey = new Map(rows.map(row => [`${row.period_month}|${row.area}|${row.slug}`, row]))
  return rows.map(row => {
    const prev = byKey.get(`${addMonths(row.period_month, -1)}|${row.area}|${row.slug}`)
    return {
      ...row,
      gsc_clicks_prev: prev?.gsc_clicks ?? '',
      gsc_clicks_diff: prev ? diff(row.gsc_clicks, prev.gsc_clicks) : '',
      gsc_clicks_diff_pct: prev ? diffPct(row.gsc_clicks, prev.gsc_clicks) : '',
      gsc_impressions_prev: prev?.gsc_impressions ?? '',
      gsc_impressions_diff: prev ? diff(row.gsc_impressions, prev.gsc_impressions) : '',
      gsc_impressions_diff_pct: prev ? diffPct(row.gsc_impressions, prev.gsc_impressions) : '',
      gsc_ctr_prev: prev?.gsc_ctr ?? '',
      gsc_ctr_diff: prev ? diff(row.gsc_ctr, prev.gsc_ctr) : '',
      gsc_average_position_prev: prev?.gsc_average_position ?? '',
      gsc_average_position_diff: prev ? diff(row.gsc_average_position, prev.gsc_average_position) : '',
      ga4_pageviews_prev: prev?.ga4_pageviews ?? '',
      ga4_pageviews_diff: prev ? diff(row.ga4_pageviews, prev.ga4_pageviews) : '',
      ga4_pageviews_diff_pct: prev ? diffPct(row.ga4_pageviews, prev.ga4_pageviews) : '',
      ga4_phone_click_prev: prev?.ga4_phone_click ?? '',
      ga4_phone_click_diff: prev ? diff(row.ga4_phone_click, prev.ga4_phone_click) : '',
      ga4_phone_click_diff_pct: prev ? diffPct(row.ga4_phone_click, prev.ga4_phone_click) : '',
      ga4_reservation_click_prev: prev?.ga4_reservation_click ?? '',
      ga4_reservation_click_diff: prev ? diff(row.ga4_reservation_click, prev.ga4_reservation_click) : '',
      ga4_reservation_click_diff_pct: prev ? diffPct(row.ga4_reservation_click, prev.ga4_reservation_click) : '',
    }
  })
}

async function buildContentQueryMonthly(accessToken, months) {
  const rows = []
  for (const range of months) {
    for (const contentPage of CONTENT_PAGES) {
      const data = await searchConsoleReport(accessToken, {
        ...exactPageFilter(contentPage.page),
        dimensions: ['query'],
        rowLimit: 50,
        startDate: range.startDate,
        endDate: range.endDate,
      })
      for (const row of data.rows || []) {
        const gsc = rowToGsc(row, ['query'])
        rows.push({
          report_type: 'content_query_monthly',
          period_month: range.month,
          start_date: range.startDate,
          end_date: range.endDate,
          brand: contentPage.brand,
          area: contentPage.area,
          store: contentPage.store,
          theme_group: contentPage.group,
          theme: contentPage.theme,
          slug: contentPage.slug,
          published_at: contentPage.published_at,
          measurement_phase: contentMeasurementPhase(contentPage, range.month),
          is_comparable_to_prev: isComparableToPrev(contentPage, range.month),
          page_path: contentPage.path,
          page: contentPage.page,
          query: gsc.query,
          is_nonbrand: isNonBrandQuery(gsc.query) ? 'TRUE' : 'FALSE',
          clicks: gsc.clicks,
          impressions: gsc.impressions,
          ctr: gsc.ctr,
          average_position: gsc.average_position,
        })
      }
      process.stdout.write('.')
    }
  }
  console.log(' content query monthly')
  return rows
}

async function main() {
  const ga4Range = {
    startDate: argValue('ga4-start') || defaultGa4Range().startDate,
    endDate: argValue('ga4-end') || defaultGa4Range().endDate,
  }
  const scRange = {
    startDate: argValue('sc-start') || defaultSearchConsoleRange().startDate,
    endDate: argValue('sc-end') || defaultSearchConsoleRange().endDate,
  }
  const months = contentMonths(scRange.endDate)

  console.log(`[looker-csv] GA4 ${ga4Range.startDate}..${ga4Range.endDate}`)
  console.log(`[looker-csv] GSC ${scRange.startDate}..${scRange.endDate}`)
  console.log(`[looker-csv] content months ${months[0].month}..${months[months.length - 1].month}`)

  const accessToken = await getAccessToken()
  const [storeSummaryRows, groupPageSummary, pageSeo, queryTables, ga4ContentStats] = await Promise.all([
    buildStoreSummary(accessToken, ga4Range, scRange),
    buildGroupPageSummary(accessToken, ga4Range, scRange),
    buildPageSeo(accessToken, scRange),
    buildQueries(accessToken, scRange),
    buildGa4ContentStats(accessToken, months),
  ])
  const storeSummary = [...storeSummaryRows, ...groupPageSummary]
  const [contentPageMonthly, contentQueryMonthly] = await Promise.all([
    buildContentPageMonthly(accessToken, months, ga4ContentStats),
    buildContentQueryMonthly(accessToken, months),
  ])

  writeCsv('weekly_store_summary.csv', storeSummary, [
    'report_type',
    'brand',
    'area',
    'store',
    'ga4_start_date',
    'ga4_end_date',
    'sc_start_date',
    'sc_end_date',
    'sessions',
    'sessions_prev',
    'sessions_diff_pct',
    'users',
    'users_prev',
    'users_diff_pct',
    'views',
    'engagement_rate',
    'phone_click',
    'phone_click_prev',
    'phone_click_diff_pct',
    'phone_cvr',
    'reservation_click',
    'reservation_click_prev',
    'reservation_click_diff_pct',
    'reservation_cvr',
    'request_click',
    'request_cvr',
    'survey_click',
    'survey_cvr',
    'sc_clicks',
    'sc_clicks_prev',
    'sc_clicks_diff_pct',
    'sc_impressions',
    'sc_impressions_prev',
    'sc_impressions_diff_pct',
    'sc_ctr',
    'sc_ctr_diff',
    'sc_average_position',
    'sc_average_position_diff',
  ])

  writeCsv('weekly_page_seo.csv', pageSeo, [
    'report_type',
    'brand',
    'area',
    'store',
    'sc_start_date',
    'sc_end_date',
    'page',
    'clicks',
    'impressions',
    'ctr',
    'average_position',
  ])

  const queryColumns = [
    'report_type',
    'brand',
    'area',
    'store',
    'sc_start_date',
    'sc_end_date',
    'query',
    'clicks',
    'impressions',
    'ctr',
    'average_position',
    'is_nonbrand',
  ]
  writeCsv('weekly_query.csv', queryTables.allRows, queryColumns)
  writeCsv('weekly_nonbrand_query.csv', queryTables.nonBrandRows, queryColumns)

  writeCsv('content_page_monthly.csv', contentPageMonthly, [
    'report_type',
    'period_month',
    'start_date',
    'end_date',
    'brand',
    'area',
    'store',
    'theme_group',
    'theme',
    'slug',
    'published_at',
    'measurement_phase',
    'is_comparable_to_prev',
    'page_path',
    'page',
    'gsc_clicks',
    'gsc_clicks_prev',
    'gsc_clicks_diff',
    'gsc_clicks_diff_pct',
    'gsc_impressions',
    'gsc_impressions_prev',
    'gsc_impressions_diff',
    'gsc_impressions_diff_pct',
    'gsc_ctr',
    'gsc_ctr_prev',
    'gsc_ctr_diff',
    'gsc_average_position',
    'gsc_average_position_prev',
    'gsc_average_position_diff',
    'ga4_pageviews',
    'ga4_pageviews_prev',
    'ga4_pageviews_diff',
    'ga4_pageviews_diff_pct',
    'ga4_active_users',
    'ga4_phone_click',
    'ga4_phone_click_prev',
    'ga4_phone_click_diff',
    'ga4_phone_click_diff_pct',
    'ga4_reservation_click',
    'ga4_reservation_click_prev',
    'ga4_reservation_click_diff',
    'ga4_reservation_click_diff_pct',
    'ga4_request_click',
    'ga4_survey_click',
    'ga4_cta_click',
    'phone_click_is_noisy',
    'phone_click_note',
  ])

  writeCsv('content_query_monthly.csv', contentQueryMonthly, [
    'report_type',
    'period_month',
    'start_date',
    'end_date',
    'brand',
    'area',
    'store',
    'theme_group',
    'theme',
    'slug',
    'published_at',
    'measurement_phase',
    'is_comparable_to_prev',
    'page_path',
    'page',
    'query',
    'is_nonbrand',
    'clicks',
    'impressions',
    'ctr',
    'average_position',
  ])
}

if (require.main === module) {
  main().catch(error => {
    console.error('[looker-csv] error:', error)
    process.exit(1)
  })
}
