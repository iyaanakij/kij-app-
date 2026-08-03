'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface PeriodRange {
  startDate: string
  endDate: string
}

interface SearchSummary {
  clicks: number
  impressions: number
  ctr: number
  position: number
}

interface SearchConsoleSite {
  current: { summary: SearchSummary }
  previous: { summary: SearchSummary }
}

interface Ga4SummaryTotals {
  sessions: number
  phone_click: number
  reservation_click: number
  request_click: number
  survey_click: number
}

interface Ga4SummaryAggregate {
  store_count: number
  current: Ga4SummaryTotals
  previous: Ga4SummaryTotals
  sessions_diff_pct: number | null
  phone_click_diff_pct: number | null
  reservation_click_diff_pct: number | null
  request_click_diff_pct: number | null
  survey_click_diff_pct: number | null
}

type MeasurementPhase = 'comparable' | 'pre_rework' | 'launch_partial_month' | 'post_rework'

interface ContentSeoRow {
  period_month: string
  theme_group: string
  theme: string
  area: string
  store_name?: string
  gsc_clicks: number
  gsc_impressions: number
  gsc_ctr: number
  gsc_average_position: number
  ga4_pageviews: number
  ga4_phone_click: number
  ga4_reservation_click: number
  measurement_phase: MeasurementPhase
  phone_click_is_noisy: boolean
}

interface AlertItem {
  priority: Priority
  category: string
  target: string
  reason: string
  action: string
}

interface Report {
  id: number
  report_date: string
  report_type: string
  summary: string
  raw_data: {
    period?: {
      ga4?: PeriodRange
      searchConsole?: PeriodRange
      previous?: { ga4?: PeriodRange; searchConsole?: PeriodRange }
      rolling28?: {
        ga4?: PeriodRange
        searchConsole?: PeriodRange
        previous?: { ga4?: PeriodRange; searchConsole?: PeriodRange }
      }
      // 旧形式互換
      startDate?: string
      endDate?: string
    }
    ga4?: Record<string, { current: GA4Summary; previous: GA4Summary; rolling28?: { current: GA4Summary; previous: GA4Summary } }>
    ga4Summary?: Ga4SummaryAggregate
    searchConsole?: Record<string, SearchConsoleSite>
    marketing?: MarketingData
    castAccess?: CastAccessStore[]
    profileReferrers?: ProfileReferrerStore[]
    // 未統合（次フェーズでraw_dataに保存予定。詳細はdocs/analytics.md参照）
    contentSeo?: ContentSeoRow[]
  }
  created_at: string
}

interface CastReferrerBreakdownItem {
  category: string
  label: string
  views: number
}

interface CastRolling28 {
  views: number
  prev_views: number | null
  views_diff_pct: number | null
  users: number
  prev_users: number | null
  users_diff_pct: number | null
  // 2026-07-12以降生成のレポートのみ保持（それ以前の過去レポートには存在しない）
  views_per_user?: number | null
  listing_views?: number
  listing_views_share?: number
  cta_clicks?: number
  cta_cvr?: number
}

interface CastAccessItem {
  gid: string
  cast_name: string | null
  views: number
  prev_views: number | null
  views_diff_pct: number | null
  users: number
  prev_users: number | null
  users_diff_pct: number | null
  views_per_user: number | null
  listing_views: number
  listing_views_share: number
  referrer_breakdown: CastReferrerBreakdownItem[]
  phone_click: number
  reservation_click: number
  request_click: number
  survey_click: number
  cta_clicks: number
  cta_cvr: number
  rolling28: CastRolling28
}

// 表示モード: isolated=隔離7日間の前週比 / rolling28=直近28日の移動窓（1週間分スライド）比較
type ComparisonMode = 'isolated' | 'rolling28'

interface CastAccessStore {
  store_name: string
  area: string
  casts: CastAccessItem[]
}

interface ReferrerBreakdownItem {
  category: string
  label: string
  views: number
  share: number
}

interface ProfileReferrerStore {
  store_name: string
  area: string
  breakdown: ReferrerBreakdownItem[]
}

interface GA4Summary {
  sessions: number
  users: number
  pageviews: number
  bounceRate: number
  avgDuration: number
  events: number
  channels?: Record<string, number>
  phone_click?: number
  reservation_click?: number
  request_click?: number
  survey_click?: number
  phone_cvr?: number
  reservation_cvr?: number
  request_cvr?: number
  survey_cvr?: number
}

interface MarketingData {
  storeInsights?: StoreInsight[]
  seoOpportunities?: SeoOpportunity[]
  pageSeoInsights?: PageSeoInsight[]
  growthQueryOpportunities?: GrowthQueryOpportunity[]
  actionItems?: ActionItem[]
  alerts?: AlertItem[]
}

interface StoreInsight {
  store_name: string
  priority: Priority
  alerts: string[]
  sessions: number
  sessions_diff_pct: number | null
  phone_click: number
  phone_click_diff_pct: number | null
  reservation_click: number
  reservation_click_diff_pct: number | null
  phone_cvr: number
  phone_cvr_diff: number
  reservation_cvr: number
  reservation_cvr_diff: number
  request_cvr: number
  request_cvr_diff: number
  primary_channel?: { name: string; sessions: number; share: number }
  main_issue: string
  recommended_action: string
}

interface SeoOpportunity {
  priority: Priority
  site: string
  query: string
  issue_type: string
  clicks: number
  impressions: number
  ctr: number
  position: number
  clicks_diff: number | null
  impressions_diff: number | null
  ctr_diff: number | null
  position_diff: number | null
  recommended_action: string
  expected_impact: string
}

interface GrowthQueryOpportunity {
  priority: Priority
  intent: string
  label: string
  site: string
  area: string
  store_name: string
  path: string
  page: string
  query: string
  clicks: number
  impressions: number
  ctr: number
  position: number
  clicks_diff: number | null
  impressions_diff: number | null
  impressions_diff_pct: number | null
  ctr_diff: number | null
  position_diff: number | null
  recommended_action: string
  expected_impact: string
}

interface PageSeoInsight {
  priority: Priority
  site: string
  area: string
  store_name: string
  path: string
  summary: SearchSummary
  previous_summary: SearchSummary
  clicks_diff_pct: number | null
  impressions_diff_pct: number | null
  ctr_diff: number | null
  position_diff: number | null
  signals: string[]
  query_groups: QueryGroup[]
  top_queries: PageQuery[]
  query_drops?: QueryDrop[]
  main_issue: string
  recommended_action: string
}

interface QueryGroup {
  intent: string
  label: string
  clicks: number
  impressions: number
  share: number
  queries: PageQuery[]
}

interface PageQuery {
  page: string
  query: string
  clicks: number
  impressions: number
  ctr: number
  position: number
  clicks_diff?: number | null
  impressions_diff?: number | null
  ctr_diff?: number | null
  position_diff?: number | null
}

interface QueryDrop extends PageQuery {
  type: 'lost' | 'declining'
  intent: string
  label: string
  prev_clicks?: number
  prev_impressions?: number
  prev_ctr?: number
  prev_position?: number
  impressions_diff_pct?: number | null
}

interface ActionItem {
  priority: Priority
  category: string
  target: string
  reason: string
  action: string
  owner: string
  expected_impact: string
}

type Priority = 'A' | 'B' | 'C'
type TabId = 'weekly' | 'stores' | 'seo' | 'contentSeo' | 'log'

function formatDate(d: string) {
  return d.replace(/-/g, '/').slice(2)
}

function pctChange(curr: number, prev: number) {
  if (!prev) return null
  const p = Math.round((curr - prev) / prev * 100)
  return p
}

function weightedCvr(clicks: number, sessions: number) {
  if (!sessions) return 0
  return Math.round(clicks / sessions * 1000) / 10
}

function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  return aStart <= bEnd && bStart <= aEnd
}

// 千葉・成田のphone_click二重発火バグ影響期間（2026-07-31修正・詳細はdocs/analytics.md）
const NOISY_PHONE_CLICK_WINDOW = { start: '2026-05-20', end: '2026-07-31' }
const NOISY_PHONE_CLICK_STORE_KEYWORDS = ['千葉', '成田']

function isNoisyPhoneClickWindow(range?: PeriodRange | null) {
  if (!range) return false
  return rangesOverlap(range.startDate, range.endDate, NOISY_PHONE_CLICK_WINDOW.start, NOISY_PHONE_CLICK_WINDOW.end)
}

function isNoisyStore(storeName: string) {
  return NOISY_PHONE_CLICK_STORE_KEYWORDS.some(k => storeName.includes(k))
}

interface GoogleUpdatePeriod {
  label: string
  startDate: string
  endDate: string
  note?: string
}

// 手動メンテナンス。既知のGoogleコアアップデート等の期間を確認したら追記する（現状は登録なし）。
const GOOGLE_UPDATE_PERIODS: GoogleUpdatePeriod[] = []

function activeGoogleUpdatePeriods(range?: PeriodRange | null) {
  if (!range) return []
  return GOOGLE_UPDATE_PERIODS.filter(p => rangesOverlap(range.startDate, range.endDate, p.startDate, p.endDate))
}

function buildWeeklyConclusion(params: {
  ga4Summary?: Ga4SummaryAggregate
  scCurrent?: SearchSummary
  scPrevious?: SearchSummary
  alertCount: number
  noisy: boolean
}): string[] {
  const { ga4Summary, scCurrent, scPrevious, alertCount, noisy } = params
  const lines: string[] = []

  if (ga4Summary) {
    const sessDiff = ga4Summary.sessions_diff_pct
    lines.push(
      `M性感4店舗合計セッション ${ga4Summary.current.sessions.toLocaleString()}件（前週比${sessDiff === null || sessDiff === undefined ? '不明' : `${sessDiff >= 0 ? '+' : ''}${sessDiff}%`}）。GA4電話CTA ${ga4Summary.current.phone_click.toLocaleString()}件・GA4 WEB予約CTA ${ga4Summary.current.reservation_click.toLocaleString()}件${noisy ? '（千葉・成田は二重発火バグ影響期間のため参考値）' : ''}。`
    )
  } else {
    lines.push('M性感4店舗合計データを取得できませんでした。')
  }

  if (scCurrent) {
    const clicksDiff = scPrevious ? pctChange(scCurrent.clicks, scPrevious.clicks) : null
    const imprDiff = scPrevious ? pctChange(scCurrent.impressions, scPrevious.impressions) : null
    lines.push(
      `GSCクリック ${scCurrent.clicks.toLocaleString()}件（${clicksDiff === null ? '前週比不明' : `${clicksDiff >= 0 ? '+' : ''}${clicksDiff}%`}）・GSC表示回数 ${scCurrent.impressions.toLocaleString()}件（${imprDiff === null ? '前週比不明' : `${imprDiff >= 0 ? '+' : ''}${imprDiff}%`}）・GSC平均順位 ${scCurrent.position}。`
    )
  } else {
    lines.push('Search Consoleサマリーを取得できませんでした。')
  }

  lines.push(
    alertCount > 0
      ? `優先度A/Bの重要アラートが${alertCount}件検出されています。詳細は店舗KPI・SEOタブを確認してください。`
      : '優先度A/Bの重要アラートは検出されていません。'
  )

  return lines
}

function trafficQualityNote(impressionsDiffPct: number | null | undefined, ctrDiff: number | null | undefined) {
  if (impressionsDiffPct != null && impressionsDiffPct < 0 && ctrDiff != null && ctrDiff > 0) {
    return '表示減・CTR上昇（質改善の可能性。断定はしない）'
  }
  return null
}

function ComparisonModeToggle({ mode, onChange }: { mode: ComparisonMode; onChange: (m: ComparisonMode) => void }) {
  return (
    <div className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded border bg-white p-0.5 text-xs">
      <button
        type="button"
        onClick={() => onChange('isolated')}
        className={`rounded px-2 py-1 ${mode === 'isolated' ? 'bg-gray-900 text-white' : 'text-gray-500'}`}
      >
        隔離7日間
      </button>
      <button
        type="button"
        onClick={() => onChange('rolling28')}
        className={`rounded px-2 py-1 ${mode === 'rolling28' ? 'bg-gray-900 text-white' : 'text-gray-500'}`}
      >
        28日ローリング
      </button>
    </div>
  )
}

function SignedValue({ value, suffix = '', invert = false }: { value: number | null | undefined; suffix?: string; invert?: boolean }) {
  if (value === null || value === undefined) return <span className="text-gray-400">-</span>
  const better = invert ? value <= 0 : value >= 0
  const color = better ? 'text-green-600' : 'text-red-500'
  return <span className={color}>{value >= 0 ? '+' : ''}{value}{suffix}</span>
}

function PriorityBadge({ priority }: { priority: Priority }) {
  const classes = {
    A: 'border-red-200 bg-red-50 text-red-700',
    B: 'border-amber-200 bg-amber-50 text-amber-700',
    C: 'border-gray-200 bg-gray-50 text-gray-600',
  }
  return (
    <span className={`inline-flex h-6 min-w-6 items-center justify-center rounded border px-2 text-xs font-semibold ${classes[priority]}`}>
      {priority}
    </span>
  )
}

function CategoryLabel({ category }: { category: string }) {
  const label = category === 'seo'
    ? 'SEO'
    : category === 'page_seo'
      ? '店舗SEO'
      : category === 'growth_query'
        ? '成長検索'
        : category === 'store'
          ? '店舗'
          : category
  return <span className="text-xs text-gray-500">{label}</span>
}

function KpiCard({ label, value, diffPct, note }: { label: string; value: string; diffPct?: number | null; note?: string }) {
  return (
    <div className="rounded border bg-white p-3">
      <div className="mb-1 truncate text-xs text-gray-500">{label}</div>
      <div className="text-lg font-bold text-gray-900">{value}</div>
      {diffPct !== undefined && diffPct !== null && (
        <span className={`text-xs ${diffPct >= 0 ? 'text-green-600' : 'text-red-500'}`}>{diffPct >= 0 ? '+' : ''}{diffPct}%</span>
      )}
      {note && <div className="mt-1 text-[11px] text-amber-600">{note}</div>}
    </div>
  )
}

function PositionKpiCard({ label, value, diff }: { label: string; value: number; diff?: number | null }) {
  return (
    <div className="rounded border bg-white p-3">
      <div className="mb-1 truncate text-xs text-gray-500">{label}</div>
      <div className="text-lg font-bold text-gray-900">{value}</div>
      {diff !== undefined && diff !== null && (
        <span className={`text-xs ${diff <= 0 ? 'text-green-600' : 'text-red-500'}`}>{diff > 0 ? '+' : ''}{diff}</span>
      )}
      <div className="mt-1 text-[11px] text-gray-400">数値が小さいほど上位</div>
    </div>
  )
}

function MarkdownContent({ text }: { text: string }) {
  const lines = text.split('\n')
  return (
    <div className="space-y-1">
      {lines.map((line, i) => {
        if (line.startsWith('# '))  return <h1 key={i} className="text-lg font-bold mt-4 mb-2">{line.slice(2)}</h1>
        if (line.startsWith('## ')) return <h2 key={i} className="text-base font-bold mt-3 mb-1 text-gray-800">{line.slice(3)}</h2>
        if (line.startsWith('### ')) return <h3 key={i} className="text-sm font-semibold mt-2 text-gray-700">{line.slice(4)}</h3>
        if (line.startsWith('| ') && line.includes('|')) {
          if (line.match(/^\|[-| ]+\|$/)) return null
          const cells = line.split('|').filter((_, ci) => ci > 0 && ci < line.split('|').length - 1)
          const isHeader = lines[i + 1]?.match(/^\|[-| ]+\|$/)
          return (
            <div key={i} className={`grid text-xs ${isHeader ? 'font-semibold bg-gray-100' : 'border-b border-gray-100'}`}
              style={{ gridTemplateColumns: `repeat(${cells.length}, minmax(0, 1fr))` }}>
              {cells.map((c, ci) => <div key={ci} className="px-2 py-1 break-words">{c.trim().replace(/\*\*/g, '')}</div>)}
            </div>
          )
        }
        if (line.startsWith('- ') || line.startsWith('* ')) {
          return <p key={i} className="text-sm pl-3 text-gray-700">• {line.slice(2).replace(/\*\*(.*?)\*\*/g, '$1')}</p>
        }
        if (line.startsWith('**') && line.endsWith('**')) {
          return <p key={i} className="text-sm font-semibold text-gray-800">{line.replace(/\*\*/g, '')}</p>
        }
        if (line.trim() === '' || line === '---') return <div key={i} className="h-1" />
        return <p key={i} className="text-sm text-gray-700 leading-relaxed">{line.replace(/\*\*(.*?)\*\*/g, '$1')}</p>
      })}
    </div>
  )
}

const CONTENT_SEO_COLUMNS: { key: keyof ContentSeoRow; label: string }[] = [
  { key: 'period_month', label: '対象月' },
  { key: 'theme_group', label: 'テーマ群' },
  { key: 'theme', label: 'テーマ' },
  { key: 'area', label: 'エリア' },
  { key: 'gsc_clicks', label: 'GSCクリック' },
  { key: 'gsc_impressions', label: 'GSC表示回数' },
  { key: 'gsc_ctr', label: 'GSC CTR' },
  { key: 'gsc_average_position', label: 'GSC平均順位' },
  { key: 'ga4_pageviews', label: 'GA4 PV' },
  { key: 'ga4_phone_click', label: 'GA4電話CTA' },
  { key: 'ga4_reservation_click', label: 'GA4 WEB予約CTA' },
  { key: 'measurement_phase', label: '計測フェーズ' },
  { key: 'phone_click_is_noisy', label: '電話CTA参考値' },
]

function MeasurementPhaseBadge({ phase }: { phase: MeasurementPhase }) {
  const labelMap: Record<MeasurementPhase, string> = {
    comparable: '比較可能',
    pre_rework: '改修前',
    launch_partial_month: '公開初月（参考）',
    post_rework: '改修後',
  }
  const classMap: Record<MeasurementPhase, string> = {
    comparable: 'border-gray-200 bg-gray-50 text-gray-600',
    pre_rework: 'border-gray-200 bg-gray-50 text-gray-500',
    launch_partial_month: 'border-amber-200 bg-amber-50 text-amber-700',
    post_rework: 'border-blue-200 bg-blue-50 text-blue-700',
  }
  return <span className={`rounded border px-1.5 py-0.5 text-[11px] ${classMap[phase]}`}>{labelMap[phase]}</span>
}

function ContentSeoTable({ rows }: { rows: ContentSeoRow[] }) {
  const groups = Array.from(new Set(rows.map(r => r.theme_group)))
  return (
    <div className="space-y-3">
      {groups.map(group => {
        const groupRows = rows.filter(r => r.theme_group === group)
        return (
          <details key={group} className="rounded border bg-white p-3" open={groups.length <= 2}>
            <summary className="cursor-pointer select-none text-sm font-semibold text-gray-800">
              {group}（{groupRows.length}行）
            </summary>
            <div className="mt-2 overflow-x-auto">
              <table className="min-w-full text-left text-xs">
                <thead className="border-b bg-gray-50 text-gray-500">
                  <tr>
                    {CONTENT_SEO_COLUMNS.map(col => (
                      <th key={col.key} className="whitespace-nowrap px-2 py-1.5 font-medium">{col.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {groupRows.map((row, i) => (
                    <tr key={`${row.theme}-${row.area}-${i}`} className="border-b last:border-b-0">
                      <td className="whitespace-nowrap px-2 py-1.5 text-gray-500">{row.period_month}</td>
                      <td className="whitespace-nowrap px-2 py-1.5 text-gray-600">{row.theme_group}</td>
                      <td className="whitespace-nowrap px-2 py-1.5 font-medium text-gray-900">{row.theme}</td>
                      <td className="whitespace-nowrap px-2 py-1.5 text-gray-600">{row.area}</td>
                      <td className="px-2 py-1.5 text-gray-700">{row.gsc_clicks.toLocaleString()}</td>
                      <td className="px-2 py-1.5 text-gray-700">{row.gsc_impressions.toLocaleString()}</td>
                      <td className="px-2 py-1.5 text-gray-700">{row.gsc_ctr}%</td>
                      <td className="px-2 py-1.5 text-gray-700">{row.gsc_average_position}</td>
                      <td className="px-2 py-1.5 text-gray-700">{row.ga4_pageviews.toLocaleString()}</td>
                      <td className="px-2 py-1.5 text-gray-700">
                        {row.ga4_phone_click.toLocaleString()}
                        {row.phone_click_is_noisy && <span className="ml-1 text-[10px] text-amber-600">参考値</span>}
                      </td>
                      <td className="px-2 py-1.5 text-gray-700">{row.ga4_reservation_click.toLocaleString()}</td>
                      <td className="px-2 py-1.5"><MeasurementPhaseBadge phase={row.measurement_phase} /></td>
                      <td className="px-2 py-1.5 text-gray-500">{row.phone_click_is_noisy ? 'あり' : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        )
      })}
    </div>
  )
}

function ContentSeoDesignProposal() {
  return (
    <div className="rounded border bg-white p-4">
      <h3 className="mb-2 text-sm font-semibold text-gray-800">コンテンツSEO定点観測は未統合です</h3>
      <p className="mb-3 text-xs leading-relaxed text-gray-600">
        現在は8テーマ×4店舗の月次定点観測をローカルCSV（<code className="rounded bg-gray-100 px-1">app/data/looker-studio/content_page_monthly.csv</code> / <code className="rounded bg-gray-100 px-1">content_query_monthly.csv</code>）で生成しており、この画面（<code className="rounded bg-gray-100 px-1">analytics_reports.raw_data</code>）にはまだ取り込んでいません。
        次フェーズで週次レポート生成スクリプトに月次コンテンツSEO集計を追加し、<code className="rounded bg-gray-100 px-1">raw_data.contentSeo</code>（下記スキーマ）として保存する想定です。保存されればこの画面に自動で表示されます。
      </p>
      <div className="overflow-x-auto rounded border">
        <table className="min-w-full text-left text-xs">
          <thead className="border-b bg-gray-50 text-gray-500">
            <tr>
              <th className="px-2 py-1.5 font-medium">フィールド</th>
              <th className="px-2 py-1.5 font-medium">説明</th>
            </tr>
          </thead>
          <tbody className="text-gray-700">
            <tr className="border-b"><td className="px-2 py-1.5 font-mono">period_month</td><td className="px-2 py-1.5">対象月（例: 2026-07）</td></tr>
            <tr className="border-b"><td className="px-2 py-1.5 font-mono">theme_group</td><td className="px-2 py-1.5">initial_4 / new_4</td></tr>
            <tr className="border-b"><td className="px-2 py-1.5 font-mono">theme</td><td className="px-2 py-1.5">テーマ名（例: 顔面騎乗）</td></tr>
            <tr className="border-b"><td className="px-2 py-1.5 font-mono">area</td><td className="px-2 py-1.5">成田/千葉/西船橋/錦糸町</td></tr>
            <tr className="border-b"><td className="px-2 py-1.5 font-mono">gsc_clicks / gsc_impressions / gsc_ctr / gsc_average_position</td><td className="px-2 py-1.5">Search Console実績（Google検索からのクリック・表示・CTR・平均順位）</td></tr>
            <tr className="border-b"><td className="px-2 py-1.5 font-mono">ga4_pageviews / ga4_phone_click / ga4_reservation_click</td><td className="px-2 py-1.5">GA4実績（ページ上のCTA。GSCクリックとは別ソースのため混同しない）</td></tr>
            <tr className="border-b"><td className="px-2 py-1.5 font-mono">measurement_phase</td><td className="px-2 py-1.5">comparable / pre_rework / launch_partial_month / post_rework</td></tr>
            <tr><td className="px-2 py-1.5 font-mono">phone_click_is_noisy</td><td className="px-2 py-1.5">千葉・成田で対象月が2026-05-20〜07-31に重なる場合true（参考値）</td></tr>
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[11px] text-gray-400">
        新4テーマ（エネマグラ・前立腺マッサージ・パウダー性感・拘束プレイ）は2026-07-11反映のため、2026-07は launch_partial_month として前月比を強く読まない。GSCクリック0でもGA4のCTAが発生することは正常（検索以外の流入経由でCTAが起きるため）。
      </p>
    </div>
  )
}

export default function AnalyticsPage() {
  useEffect(() => { document.title = 'Web解析レポート | KIJ管理' }, [])
  const [reports, setReports] = useState<Report[]>([])
  const [selected, setSelected] = useState<Report | null>(null)
  const [activeTab, setActiveTab] = useState<TabId>('weekly')
  const [loading, setLoading] = useState(true)
  const [castSortKey, setCastSortKey] = useState<'views' | 'listing_views' | 'users' | 'cta_cvr'>('views')
  const [comparisonMode, setComparisonMode] = useState<ComparisonMode>('isolated')
  const [showPriorityC, setShowPriorityC] = useState(false)

  useEffect(() => {
    supabase
      .from('analytics_reports')
      .select('*')
      .order('report_date', { ascending: false })
      .limit(12)
      .then(({ data }) => {
        if (data && data.length > 0) {
          setReports(data as Report[])
          setSelected(data[0] as Report)
        }
        setLoading(false)
      })
  }, [])

  if (loading) return <div className="p-6 text-gray-500 text-sm">読み込み中...</div>

  if (reports.length === 0) {
    return (
      <div className="p-6">
        <h1 className="text-lg font-bold mb-2">ウェブ解析レポート</h1>
        <p className="text-sm text-gray-500">レポートがまだありません。VPSで analytics-report.js を実行してください。</p>
      </div>
    )
  }

  const ga4 = selected?.raw_data?.ga4
  const ga4Summary = selected?.raw_data?.ga4Summary
  const period = selected?.raw_data?.period
  const marketing = selected?.raw_data?.marketing
  const scSite = selected?.raw_data?.searchConsole ? Object.values(selected.raw_data.searchConsole)[0] : undefined
  const scCurrent = scSite?.current?.summary
  const scPrevious = scSite?.previous?.summary
  const contentSeo = selected?.raw_data?.contentSeo ?? []

  const actionItems = marketing?.actionItems?.slice(0, 5) ?? []
  const rank: Record<Priority, number> = { A: 0, B: 1, C: 2 }
  const topAlerts = [...(marketing?.alerts ?? [])].sort((a, b) => rank[a.priority] - rank[b.priority]).slice(0, 3)

  const seoOpportunitiesAll = marketing?.seoOpportunities ?? []
  const growthQueryOpportunitiesAll = marketing?.growthQueryOpportunities ?? []
  const pageSeoInsightsAll = marketing?.pageSeoInsights ?? []
  const storeInsightsAll = marketing?.storeInsights ?? []

  const pageSeoInsights = (showPriorityC ? pageSeoInsightsAll : pageSeoInsightsAll.filter(i => i.priority !== 'C')).slice(0, 8)
  const seoOpportunities = (showPriorityC ? seoOpportunitiesAll : seoOpportunitiesAll.filter(i => i.priority !== 'C')).slice(0, 8)
  const growthQueryOpportunities = (showPriorityC ? growthQueryOpportunitiesAll : growthQueryOpportunitiesAll.filter(i => i.priority !== 'C')).slice(0, 8)
  const hiddenCCount = pageSeoInsightsAll.filter(i => i.priority === 'C').length
    + seoOpportunitiesAll.filter(i => i.priority === 'C').length
    + growthQueryOpportunitiesAll.filter(i => i.priority === 'C').length

  const castAccess = selected?.raw_data?.castAccess ?? []
  const profileReferrers = selected?.raw_data?.profileReferrers ?? []

  const noisyIsolated = isNoisyPhoneClickWindow(period?.ga4)
  const activeGaSc = daysBetweenSafe(period?.ga4?.endDate, period?.searchConsole?.endDate)
  const googleUpdates = activeGoogleUpdatePeriods(period?.ga4)

  const phoneCvrCurrent = ga4Summary ? weightedCvr(ga4Summary.current.phone_click, ga4Summary.current.sessions) : null
  const phoneCvrPrevious = ga4Summary ? weightedCvr(ga4Summary.previous.phone_click, ga4Summary.previous.sessions) : null
  const reservationCvrCurrent = ga4Summary ? weightedCvr(ga4Summary.current.reservation_click, ga4Summary.current.sessions) : null
  const reservationCvrPrevious = ga4Summary ? weightedCvr(ga4Summary.previous.reservation_click, ga4Summary.previous.sessions) : null
  const phoneCvrDiffPt = phoneCvrCurrent !== null && phoneCvrPrevious !== null ? Math.round((phoneCvrCurrent - phoneCvrPrevious) * 10) / 10 : null
  const reservationCvrDiffPt = reservationCvrCurrent !== null && reservationCvrPrevious !== null ? Math.round((reservationCvrCurrent - reservationCvrPrevious) * 10) / 10 : null

  const conclusionLines = buildWeeklyConclusion({
    ga4Summary,
    scCurrent,
    scPrevious,
    alertCount: topAlerts.length + Math.max(0, (marketing?.alerts?.length ?? 0) - topAlerts.length),
    noisy: noisyIsolated,
  })

  const tabs: { id: TabId; label: string; count?: number }[] = [
    { id: 'weekly', label: '週次サマリ' },
    { id: 'stores', label: '店舗KPI', count: storeInsightsAll.length },
    { id: 'seo', label: 'SEO', count: pageSeoInsightsAll.filter(i => i.priority !== 'C').length },
    { id: 'contentSeo', label: 'コンテンツSEO', count: contentSeo.length || undefined },
    { id: 'log', label: '詳細ログ' },
  ]

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-bold">ウェブ解析レポート</h1>
        <select
          className="text-sm border rounded px-2 py-1"
          value={selected?.id}
          onChange={e => setSelected(reports.find(r => r.id === Number(e.target.value)) ?? null)}
        >
          {reports.map(r => (
            <option key={r.id} value={r.id}>
              {r.report_date} ({r.report_type})
            </option>
          ))}
        </select>
      </div>

      <div className="mb-5 overflow-x-auto border-b">
        <div className="flex min-w-max gap-1">
          {tabs.map(tab => {
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'border-gray-900 text-gray-900'
                    : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-800'
                }`}
              >
                {tab.label}
                {tab.count !== undefined && (
                  <span className={`ml-2 rounded px-1.5 py-0.5 text-xs ${isActive ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500'}`}>
                    {tab.count}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* ============ 週次サマリ ============ */}
      {activeTab === 'weekly' && (
        <div className="space-y-6">
          {period && (
            <section className="rounded border bg-white p-3 text-xs text-gray-600">
              <div className="grid gap-1 sm:grid-cols-3">
                <div>GA4期間: {period.ga4 ? <>{formatDate(period.ga4.startDate)} 〜 {formatDate(period.ga4.endDate)}</> : '-'}</div>
                <div>Search Console期間: {period.searchConsole ? <>{formatDate(period.searchConsole.startDate)} 〜 {formatDate(period.searchConsole.endDate)}</> : '-'}</div>
                <div>28日ローリング期間: {period.rolling28?.ga4 ? <>{formatDate(period.rolling28.ga4.startDate)} 〜 {formatDate(period.rolling28.ga4.endDate)}</> : '-'}</div>
              </div>
            </section>
          )}

          <section>
            <h2 className="mb-2 text-sm font-semibold text-gray-700">計測注意</h2>
            <div className="flex flex-wrap gap-2">
              {activeGaSc !== null && (
                <span className="rounded border border-gray-200 bg-gray-50 px-2 py-1 text-xs text-gray-600">
                  GA4とSearch Consoleは集計期間が異なります（反映遅延のため約{activeGaSc}日ずれ）。直接比較しない
                </span>
              )}
              {noisyIsolated && (
                <span className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-700">
                  千葉・成田のGA4電話CTAは二重発火バグ影響期間（2026-05-20〜07-31）と重なるため参考値
                </span>
              )}
              {googleUpdates.map(u => (
                <span key={u.label} className="rounded border border-purple-200 bg-purple-50 px-2 py-1 text-xs text-purple-700">
                  Googleアップデート期間「{u.label}」と重なっています。順位変動を自店舗要因と断定しない
                </span>
              ))}
            </div>
          </section>

          <section className="rounded border bg-white p-4">
            <h2 className="mb-2 text-sm font-semibold text-gray-700">今週の結論</h2>
            <div className="space-y-1.5">
              {conclusionLines.map((line, i) => (
                <p key={i} className="text-sm leading-relaxed text-gray-800">{line}</p>
              ))}
            </div>
          </section>

          {topAlerts.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-semibold text-gray-700">重要アラート</h2>
              <div className="space-y-2">
                {topAlerts.map((a, i) => (
                  <div key={`${a.category}-${a.target}-${i}`} className="flex items-start gap-2 rounded border border-red-100 bg-red-50 p-2.5">
                    <PriorityBadge priority={a.priority} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <CategoryLabel category={a.category} />
                        <span className="truncate text-sm font-semibold text-gray-900">{a.target}</span>
                      </div>
                      <p className="text-xs leading-relaxed text-gray-600">{a.reason}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {actionItems.length > 0 && (
            <section>
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-700">優先アクション</h2>
                <span className="text-xs text-gray-400">marketing.actionItems</span>
              </div>
              <div className="space-y-2">
                {actionItems.map((item, index) => (
                  <div key={`${item.category}-${item.target}-${index}`} className="rounded border bg-white p-3">
                    <div className="mb-2 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="mb-1 flex items-center gap-2">
                          <PriorityBadge priority={item.priority} />
                          <CategoryLabel category={item.category} />
                          <span className="text-xs text-gray-400">{item.owner}</span>
                        </div>
                        <h3 className="break-words text-sm font-semibold text-gray-900">{item.target}</h3>
                      </div>
                    </div>
                    <p className="mb-1 text-xs leading-relaxed text-gray-600">{item.reason}</p>
                    <p className="text-sm leading-relaxed text-gray-800">{item.action}</p>
                    <p className="mt-2 text-xs text-gray-500">期待効果: {item.expected_impact}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {ga4Summary && (
            <section>
              <h2 className="mb-2 text-sm font-semibold text-gray-700">M性感4店舗合計KPI</h2>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                <KpiCard label="セッション" value={ga4Summary.current.sessions.toLocaleString()} diffPct={ga4Summary.sessions_diff_pct} />
                <KpiCard
                  label="GA4電話CTA"
                  value={ga4Summary.current.phone_click.toLocaleString()}
                  diffPct={ga4Summary.phone_click_diff_pct}
                  note={noisyIsolated ? '千葉・成田分は参考値' : undefined}
                />
                <KpiCard label="GA4 WEB予約CTA" value={ga4Summary.current.reservation_click.toLocaleString()} diffPct={ga4Summary.reservation_click_diff_pct} />
                <KpiCard
                  label="電話CVR"
                  value={phoneCvrCurrent !== null ? `${phoneCvrCurrent}%` : '-'}
                  note={phoneCvrDiffPt !== null ? `${phoneCvrDiffPt >= 0 ? '+' : ''}${phoneCvrDiffPt}pt` : undefined}
                />
                <KpiCard
                  label="WEB予約CVR"
                  value={reservationCvrCurrent !== null ? `${reservationCvrCurrent}%` : '-'}
                  note={reservationCvrDiffPt !== null ? `${reservationCvrDiffPt >= 0 ? '+' : ''}${reservationCvrDiffPt}pt` : undefined}
                />
                {scCurrent && (
                  <>
                    <KpiCard
                      label="GSCクリック"
                      value={scCurrent.clicks.toLocaleString()}
                      diffPct={scPrevious ? pctChange(scCurrent.clicks, scPrevious.clicks) : null}
                    />
                    <KpiCard
                      label="GSC表示回数"
                      value={scCurrent.impressions.toLocaleString()}
                      diffPct={scPrevious ? pctChange(scCurrent.impressions, scPrevious.impressions) : null}
                    />
                    <KpiCard
                      label="GSC CTR"
                      value={`${scCurrent.ctr}%`}
                      note={scPrevious ? `${Math.round((scCurrent.ctr - scPrevious.ctr) * 10) / 10 >= 0 ? '+' : ''}${Math.round((scCurrent.ctr - scPrevious.ctr) * 10) / 10}pt` : undefined}
                    />
                    <PositionKpiCard
                      label="GSC平均順位"
                      value={scCurrent.position}
                      diff={scPrevious ? Math.round((scCurrent.position - scPrevious.position) * 10) / 10 : null}
                    />
                  </>
                )}
              </div>
            </section>
          )}
        </div>
      )}

      {/* ============ 店舗KPI ============ */}
      {activeTab === 'stores' && (
        <section className="mb-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">店舗別KPI比較</h2>
            <ComparisonModeToggle mode={comparisonMode} onChange={setComparisonMode} />
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {storeInsightsAll.map(store => {
              const ga4Entry = ga4?.[store.store_name]
              const isR28 = comparisonMode === 'rolling28'
              const period28 = isR28 ? ga4Entry?.rolling28 : undefined
              const current = isR28 ? period28?.current : ga4Entry?.current
              const previous = isR28 ? period28?.previous : ga4Entry?.previous
              const sessions = current?.sessions ?? store.sessions
              const sessionsDiffPct = isR28 && current && previous ? pctChange(current.sessions, previous.sessions) : store.sessions_diff_pct
              const phoneClick = current?.phone_click ?? store.phone_click
              const phoneClickDiffPct = isR28 && current && previous ? pctChange(current.phone_click ?? 0, previous.phone_click ?? 0) : store.phone_click_diff_pct
              const phoneCvr = current?.phone_cvr ?? weightedCvr(phoneClick ?? 0, sessions ?? 0)
              const reservationClick = current?.reservation_click ?? store.reservation_click
              const reservationClickDiffPct = isR28 && current && previous ? pctChange(current.reservation_click ?? 0, previous.reservation_click ?? 0) : store.reservation_click_diff_pct
              const reservationCvr = current?.reservation_cvr ?? weightedCvr(reservationClick ?? 0, sessions ?? 0)
              const requestClick = current?.request_click
              const requestClickDiffPct = isR28 && current && previous ? pctChange(current.request_click ?? 0, previous.request_click ?? 0) : null
              const noisy = isNoisyStore(store.store_name) && isNoisyPhoneClickWindow(isR28 ? period?.rolling28?.ga4 : period?.ga4)
              return (
                <div key={store.store_name} className="rounded border bg-white p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <h3 className="truncate text-sm font-semibold text-gray-900">{store.store_name}</h3>
                    <PriorityBadge priority={store.priority} />
                  </div>
                  <p className="mb-2 text-xs font-medium text-gray-700">{store.main_issue}</p>
                  {noisy && (
                    <p className="mb-2 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-700">
                      GA4電話CTAは二重発火バグ影響期間と重なるため参考値
                    </p>
                  )}
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-gray-600">
                    <div>セッション {sessions?.toLocaleString() ?? '-'}</div>
                    <div><SignedValue value={sessionsDiffPct} suffix="%" /></div>
                    <div>GA4電話CTA {phoneClick?.toLocaleString() ?? '-'}</div>
                    <div><SignedValue value={phoneClickDiffPct} suffix="%" /></div>
                    <div>電話CVR {phoneCvr}%</div>
                    <div>差分 <SignedValue value={store.phone_cvr_diff} suffix="pt" /></div>
                    <div>GA4 WEB予約CTA {reservationClick?.toLocaleString() ?? '-'}</div>
                    <div><SignedValue value={reservationClickDiffPct} suffix="%" /></div>
                    <div>WEB予約CVR {reservationCvr}%</div>
                    <div>差分 <SignedValue value={store.reservation_cvr_diff} suffix="pt" /></div>
                    <div>出勤リクエストCTA {requestClick?.toLocaleString() ?? '-'}</div>
                    <div><SignedValue value={requestClickDiffPct} suffix="%" /></div>
                  </div>
                  {store.primary_channel && (
                    <p className="mt-2 text-xs text-gray-500">
                      主チャネル: {store.primary_channel.name} {store.primary_channel.share}%
                    </p>
                  )}
                  <p className="mt-2 text-sm leading-relaxed text-gray-800">{store.recommended_action}</p>
                  {isR28 && (
                    <p className="mt-2 text-[11px] text-gray-400">課題・推奨アクションはAI判定（隔離7日間ベース）。数値のみ28日ローリング。</p>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* ============ SEO ============ */}
      {activeTab === 'seo' && (
        <div className="space-y-6">
          {pageSeoInsights.length > 0 && (
            <section>
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-700">店舗別SEOサマリ</h2>
                <span className="text-xs text-gray-400">marketing.pageSeoInsights</span>
              </div>
              <div className="overflow-x-auto rounded border bg-white">
                <table className="min-w-full text-left text-xs">
                  <thead className="border-b bg-gray-50 text-gray-500">
                    <tr>
                      <th className="px-2 py-1.5 font-medium">店舗</th>
                      <th className="px-2 py-1.5 font-medium">パス</th>
                      <th className="px-2 py-1.5 font-medium">GSCクリック</th>
                      <th className="px-2 py-1.5 font-medium">GSC表示回数</th>
                      <th className="px-2 py-1.5 font-medium">GSC CTR</th>
                      <th className="px-2 py-1.5 font-medium">GSC平均順位</th>
                      <th className="px-2 py-1.5 font-medium">課題</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageSeoInsights.map(item => {
                      const note = trafficQualityNote(item.impressions_diff_pct, item.ctr_diff)
                      return (
                        <tr key={`${item.store_name}-${item.path}`} className="border-b align-top last:border-b-0">
                          <td className="whitespace-nowrap px-2 py-1.5 font-medium text-gray-900">{item.store_name}</td>
                          <td className="whitespace-nowrap px-2 py-1.5 text-gray-500">{item.path}</td>
                          <td className="whitespace-nowrap px-2 py-1.5 text-gray-700">
                            {item.summary.clicks.toLocaleString()} <SignedValue value={item.clicks_diff_pct} suffix="%" />
                          </td>
                          <td className="whitespace-nowrap px-2 py-1.5 text-gray-700">
                            {item.summary.impressions.toLocaleString()} <SignedValue value={item.impressions_diff_pct} suffix="%" />
                            {note && <div className="text-[10px] text-gray-400">{note}</div>}
                          </td>
                          <td className="whitespace-nowrap px-2 py-1.5 text-gray-700">
                            {item.summary.ctr}% <SignedValue value={item.ctr_diff} suffix="pt" />
                          </td>
                          <td className="whitespace-nowrap px-2 py-1.5 text-gray-700">
                            {item.summary.position} <SignedValue value={item.position_diff} invert />
                          </td>
                          <td className="min-w-48 px-2 py-1.5 text-gray-700">{item.main_issue}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div className="mt-3 space-y-2">
                {pageSeoInsights.map(item => (
                  <details key={`detail-${item.store_name}-${item.path}`} className="rounded border bg-white p-3">
                    <summary className="cursor-pointer select-none text-sm font-semibold text-gray-900">
                      {item.store_name}（{item.path}）の詳細を見る
                    </summary>
                    <div className="mt-2">
                      {item.query_groups.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {item.query_groups.slice(0, 4).map(group => (
                            <span key={`${item.path}-${group.intent}`} className="rounded border bg-gray-50 px-2 py-1 text-xs text-gray-700">
                              {group.label} {group.share}% / GSC表示{group.impressions.toLocaleString()}
                            </span>
                          ))}
                        </div>
                      )}
                      {item.top_queries.length > 0 && (
                        <div className="mt-3 overflow-x-auto">
                          <table className="min-w-full text-left text-xs">
                            <thead className="text-gray-400">
                              <tr>
                                <th className="py-1 pr-3 font-medium">上位クエリ</th>
                                <th className="py-1 pr-3 font-medium">GSC表示回数</th>
                                <th className="py-1 pr-3 font-medium">GSC CTR</th>
                                <th className="py-1 pr-3 font-medium">GSC平均順位</th>
                              </tr>
                            </thead>
                            <tbody>
                              {item.top_queries.slice(0, 5).map((query, qi) => (
                                <tr key={`${item.path}-${qi}-${query.query}`} className="border-t border-gray-100">
                                  <td className="max-w-64 py-1 pr-3 font-medium text-gray-800">{query.query}</td>
                                  <td className="py-1 pr-3 text-gray-600">
                                    {query.impressions.toLocaleString()}
                                    <span className="ml-1 text-gray-400">(<SignedValue value={query.impressions_diff} />)</span>
                                  </td>
                                  <td className="py-1 pr-3 text-gray-600">{query.ctr}%</td>
                                  <td className="py-1 pr-3 text-gray-600">{query.position}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                      {item.query_drops && item.query_drops.length > 0 && (
                        <div className="mt-3 rounded border border-red-100 bg-red-50 p-2">
                          <div className="mb-1 text-xs font-semibold text-red-700">減少クエリ（上位3件）</div>
                          <div className="space-y-1">
                            {item.query_drops.slice(0, 3).map((query, qi) => (
                              <div key={`${item.path}-${qi}-${query.type}-${query.query}`} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-red-800">
                                <span className="font-medium">{query.query}</span>
                                <span className="text-red-500">{query.label}</span>
                                <span>
                                  GSC表示 {query.prev_impressions?.toLocaleString() ?? '-'} → {query.impressions.toLocaleString()}
                                  {query.impressions_diff_pct !== undefined && query.impressions_diff_pct !== null && (
                                    <span className="ml-1">({query.impressions_diff_pct}%)</span>
                                  )}
                                </span>
                              </div>
                            ))}
                          </div>
                          {item.query_drops.length > 3 && (
                            <p className="mt-1 text-[11px] text-red-400">他{item.query_drops.length - 3}件</p>
                          )}
                        </div>
                      )}
                      <p className="mt-3 text-sm leading-relaxed text-gray-800">{item.recommended_action}</p>
                    </div>
                  </details>
                ))}
              </div>
            </section>
          )}

          {!showPriorityC && hiddenCCount > 0 && (
            <button
              type="button"
              onClick={() => setShowPriorityC(true)}
              className="text-xs text-gray-400 underline hover:text-gray-600"
            >
              優先度C（{hiddenCCount}件）も表示する
            </button>
          )}
          {showPriorityC && (
            <button
              type="button"
              onClick={() => setShowPriorityC(false)}
              className="text-xs text-gray-400 underline hover:text-gray-600"
            >
              優先度Cを隠す
            </button>
          )}

          {(growthQueryOpportunities.length > 0 || seoOpportunities.length > 0) && (
            <details className="rounded border bg-white p-3">
              <summary className="cursor-pointer select-none text-sm font-semibold text-gray-800">
                その他のSEO候補（クエリ単位・詳細）
              </summary>
              <div className="mt-3 space-y-6">
                {growthQueryOpportunities.length > 0 && (
                  <div>
                    <h3 className="mb-2 text-xs font-semibold text-gray-600">非指名・欲求検索の成長候補</h3>
                    <div className="overflow-x-auto rounded border">
                      <table className="min-w-full text-left text-xs">
                        <thead className="border-b bg-gray-50 text-gray-500">
                          <tr>
                            <th className="px-3 py-2 font-medium">優先</th>
                            <th className="px-3 py-2 font-medium">店舗</th>
                            <th className="px-3 py-2 font-medium">分類</th>
                            <th className="px-3 py-2 font-medium">クエリ</th>
                            <th className="px-3 py-2 font-medium">GSC表示回数</th>
                            <th className="px-3 py-2 font-medium">GSC CTR</th>
                            <th className="px-3 py-2 font-medium">GSC平均順位</th>
                            <th className="px-3 py-2 font-medium">施策</th>
                          </tr>
                        </thead>
                        <tbody>
                          {growthQueryOpportunities.map((item, index) => (
                            <tr key={`${item.store_name}-${item.query}-${index}`} className="border-b last:border-b-0">
                              <td className="px-3 py-2 align-top"><PriorityBadge priority={item.priority} /></td>
                              <td className="whitespace-nowrap px-3 py-2 align-top text-gray-600">{item.store_name}</td>
                              <td className="whitespace-nowrap px-3 py-2 align-top text-gray-600">{item.label}</td>
                              <td className="min-w-44 px-3 py-2 align-top font-medium text-gray-900">{item.query}</td>
                              <td className="px-3 py-2 align-top text-gray-700">
                                {item.impressions.toLocaleString()}
                                <span className="ml-1 text-gray-400">(<SignedValue value={item.impressions_diff} />)</span>
                              </td>
                              <td className="px-3 py-2 align-top text-gray-700">
                                {item.ctr}%
                                <span className="ml-1 text-gray-400">(<SignedValue value={item.ctr_diff} suffix="pt" />)</span>
                              </td>
                              <td className="px-3 py-2 align-top text-gray-700">
                                {item.position}
                                <span className="ml-1 text-gray-400">(<SignedValue value={item.position_diff} invert />)</span>
                              </td>
                              <td className="min-w-64 px-3 py-2 align-top text-gray-700">{item.recommended_action}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {seoOpportunities.length > 0 && (
                  <div>
                    <h3 className="mb-2 text-xs font-semibold text-gray-600">SEO改善候補</h3>
                    <div className="overflow-x-auto rounded border">
                      <table className="min-w-full text-left text-xs">
                        <thead className="border-b bg-gray-50 text-gray-500">
                          <tr>
                            <th className="px-3 py-2 font-medium">優先</th>
                            <th className="px-3 py-2 font-medium">サイト</th>
                            <th className="px-3 py-2 font-medium">クエリ</th>
                            <th className="px-3 py-2 font-medium">GSC表示回数</th>
                            <th className="px-3 py-2 font-medium">GSC CTR</th>
                            <th className="px-3 py-2 font-medium">GSC平均順位</th>
                            <th className="px-3 py-2 font-medium">施策</th>
                          </tr>
                        </thead>
                        <tbody>
                          {seoOpportunities.map((item, index) => (
                            <tr key={`${item.site}-${item.query}-${index}`} className="border-b last:border-b-0">
                              <td className="px-3 py-2 align-top"><PriorityBadge priority={item.priority} /></td>
                              <td className="whitespace-nowrap px-3 py-2 align-top text-gray-600">{item.site}</td>
                              <td className="min-w-36 px-3 py-2 align-top font-medium text-gray-900">{item.query}</td>
                              <td className="px-3 py-2 align-top text-gray-700">
                                {item.impressions.toLocaleString()}
                                <span className="ml-1 text-gray-400">(<SignedValue value={item.impressions_diff} />)</span>
                              </td>
                              <td className="px-3 py-2 align-top text-gray-700">
                                {item.ctr}%
                                <span className="ml-1 text-gray-400">(<SignedValue value={item.ctr_diff} suffix="pt" />)</span>
                              </td>
                              <td className="px-3 py-2 align-top text-gray-700">
                                {item.position}
                                <span className="ml-1 text-gray-400">(<SignedValue value={item.position_diff} invert />)</span>
                              </td>
                              <td className="min-w-64 px-3 py-2 align-top text-gray-700">{item.recommended_action}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </details>
          )}
        </div>
      )}

      {/* ============ コンテンツSEO ============ */}
      {activeTab === 'contentSeo' && (
        <section className="mb-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">コンテンツSEO定点観測（8テーマ×4店舗）</h2>
            <span className="text-xs text-gray-400">raw_data.contentSeo</span>
          </div>
          {contentSeo.length > 0 ? <ContentSeoTable rows={contentSeo} /> : <ContentSeoDesignProposal />}
        </section>
      )}

      {/* ============ 詳細ログ ============ */}
      {activeTab === 'log' && (
        <div className="space-y-4">
          <details open className="rounded border bg-white p-4">
            <summary className="cursor-pointer select-none text-sm font-semibold text-gray-700">AIレポート全文</summary>
            <div className="mt-3">
              <MarkdownContent text={selected?.summary ?? ''} />
            </div>
          </details>

          {castAccess.length > 0 && (
            <details className="rounded border bg-white p-4">
              <summary className="cursor-pointer select-none text-sm font-semibold text-gray-700">
                キャスト別アクセス数（プロフィールPV）
              </summary>
              <div className="mt-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded border bg-white p-0.5 text-xs">
                      <button
                        type="button"
                        onClick={() => setCastSortKey('views')}
                        className={`rounded px-2 py-1 ${castSortKey === 'views' ? 'bg-gray-900 text-white' : 'text-gray-500'}`}
                      >
                        総PV順
                      </button>
                      <button
                        type="button"
                        onClick={() => setCastSortKey('listing_views')}
                        className={`rounded px-2 py-1 ${castSortKey === 'listing_views' ? 'bg-gray-900 text-white' : 'text-gray-500'}`}
                      >
                        一覧経由順
                      </button>
                      <button
                        type="button"
                        onClick={() => setCastSortKey('users')}
                        className={`rounded px-2 py-1 ${castSortKey === 'users' ? 'bg-gray-900 text-white' : 'text-gray-500'}`}
                      >
                        実訪問者数順
                      </button>
                      <button
                        type="button"
                        onClick={() => setCastSortKey('cta_cvr')}
                        className={`rounded px-2 py-1 ${castSortKey === 'cta_cvr' ? 'bg-gray-900 text-white' : 'text-gray-500'}`}
                      >
                        CVR順
                      </button>
                    </div>
                    <ComparisonModeToggle mode={comparisonMode} onChange={setComparisonMode} />
                  </div>
                </div>
                <p className="mb-2 text-xs leading-relaxed text-gray-500">
                  「一覧経由」= TOPページ・キャスト一覧・出勤スケジュールのサムネイル写真からプロフィールへ遷移した回数。「PV/人」は総PVを実訪問者数で割った値で、目立って高い場合は赤字表示。「CVR」はプロフィールページ上の電話・WEB予約・出勤リクエスト・アンケートクリック合計÷PV。
                </p>
                <div className="grid gap-3 md:grid-cols-2">
                  {castAccess.map(store => {
                    const sortedCasts = [...store.casts].sort((a, b) => b[castSortKey] - a[castSortKey])
                    return (
                      <div key={store.store_name} className="rounded border bg-white p-3">
                        <h3 className="mb-2 text-sm font-semibold text-gray-900">{store.store_name}</h3>
                        <div className="overflow-x-auto">
                          <table className="min-w-full text-left text-xs">
                            <thead className="text-gray-400">
                              <tr>
                                <th className="py-1 pr-2 font-medium whitespace-nowrap">キャスト</th>
                                <th className="py-1 pr-2 text-right font-medium">総PV</th>
                                <th className="py-1 pr-2 text-right font-medium">人数</th>
                                <th className="py-1 pr-2 text-right font-medium">PV/人</th>
                                <th className="py-1 pr-2 text-right font-medium">一覧経由</th>
                                <th className="py-1 pr-2 text-right font-medium">CTA</th>
                                <th className="py-1 pr-2 text-right font-medium">CVR</th>
                                <th className="py-1 pr-2 text-right font-medium">
                                  {comparisonMode === 'rolling28' ? '28日ローリング比' : '前週比'}
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {sortedCasts.slice(0, 10).map(c => {
                                const isR28 = comparisonMode === 'rolling28'
                                const diffValue = isR28 ? c.rolling28?.views_diff_pct ?? null : c.views_diff_pct
                                const r28HasDetail = isR28 && c.rolling28?.listing_views !== undefined
                                const views = isR28 ? c.rolling28?.views ?? c.views : c.views
                                const users = isR28 ? c.rolling28?.users ?? c.users : c.users
                                const viewsPerUser = isR28
                                  ? c.rolling28?.views_per_user ?? (users > 0 ? Math.round(views / users * 10) / 10 : null)
                                  : c.views_per_user
                                const listingViews = isR28 ? c.rolling28?.listing_views : c.listing_views
                                const listingViewsShare = isR28 ? c.rolling28?.listing_views_share : c.listing_views_share
                                const ctaClicks = isR28 ? c.rolling28?.cta_clicks : c.cta_clicks
                                const ctaCvr = isR28 ? c.rolling28?.cta_cvr : c.cta_cvr
                                const showDetail = !isR28 || r28HasDetail
                                return (
                                <tr key={c.gid} className="border-t border-gray-100">
                                  <td className="py-1 pr-2 whitespace-nowrap text-gray-800">
                                    {c.cast_name ?? <span className="text-gray-400">gid:{c.gid}（未登録）</span>}
                                  </td>
                                  <td className="py-1 pr-2 text-right text-gray-700">{views.toLocaleString()}</td>
                                  <td className="py-1 pr-2 text-right text-gray-700">{users.toLocaleString()}</td>
                                  <td className={`py-1 pr-2 text-right ${viewsPerUser !== null && viewsPerUser !== undefined && viewsPerUser >= 10 ? 'font-semibold text-red-600' : 'text-gray-700'}`}>
                                    {viewsPerUser ?? '-'}
                                  </td>
                                  <td className="py-1 pr-2 text-right text-gray-700">
                                    {showDetail ? (
                                      <>
                                        {listingViews!.toLocaleString()}
                                        <span className="ml-1 text-gray-400">({listingViewsShare}%)</span>
                                      </>
                                    ) : (
                                      <span className="text-gray-300">未対応</span>
                                    )}
                                  </td>
                                  <td className="py-1 pr-2 text-right text-gray-700">
                                    {showDetail ? ctaClicks!.toLocaleString() : <span className="text-gray-300">未対応</span>}
                                  </td>
                                  <td className={`py-1 pr-2 text-right ${showDetail && ctaCvr === 0 && views >= 50 ? 'font-semibold text-red-600' : 'text-gray-700'}`}>
                                    {showDetail ? `${ctaCvr}%` : <span className="text-gray-300">未対応</span>}
                                  </td>
                                  <td className="py-1 pr-2 text-right"><SignedValue value={diffValue} suffix="%" /></td>
                                </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </details>
          )}

          {profileReferrers.length > 0 && (
            <details className="rounded border bg-white p-4">
              <summary className="cursor-pointer select-none text-sm font-semibold text-gray-700">
                プロフィールページ 遷移元内訳
              </summary>
              <div className="mt-3">
                <p className="mb-2 text-xs text-gray-500">
                  「同一プロフィール再訪問」はbot等の自動アクセスによる同一ページの繰り返し閲覧が主因と判明したため、下記の内訳・%からは除外し、件数のみ注記で表示している。
                </p>
                <div className="grid gap-3 md:grid-cols-2">
                  {profileReferrers.map(store => {
                    const revisit = store.breakdown.find(b => b.category === 'same_profile_revisit')
                    const visibleBreakdown = store.breakdown.filter(b => b.category !== 'same_profile_revisit')
                    const visibleTotal = visibleBreakdown.reduce((sum, b) => sum + b.views, 0)
                    return (
                      <div key={store.store_name} className="rounded border bg-white p-3">
                        <h3 className="mb-2 text-sm font-semibold text-gray-900">{store.store_name}</h3>
                        <div className="space-y-1.5">
                          {visibleBreakdown.map(b => {
                            const share = visibleTotal > 0 ? Math.round(b.views / visibleTotal * 1000) / 10 : 0
                            return (
                              <div key={b.category} className="flex items-center gap-2 text-xs">
                                <span className="w-28 shrink-0 truncate text-gray-600">{b.label}</span>
                                <div className="h-2 flex-1 rounded bg-gray-100">
                                  <div className="h-2 rounded bg-gray-400" style={{ width: `${Math.min(share, 100)}%` }} />
                                </div>
                                <span className="w-12 shrink-0 text-right text-gray-700">{share}%</span>
                                <span className="w-14 shrink-0 text-right text-gray-400">{b.views.toLocaleString()}</span>
                              </div>
                            )
                          })}
                        </div>
                        {revisit && revisit.views > 0 && (
                          <p className="mt-2 text-[11px] text-gray-400">
                            ※同一プロフィール再訪問（bot等の疑い・集計から除外）: {revisit.views.toLocaleString()}件
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  )
}

function daysBetweenSafe(a?: string, b?: string) {
  if (!a || !b) return null
  const d = Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 86400000
  return Math.round(d)
}
