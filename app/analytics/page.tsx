'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface PeriodRange {
  startDate: string
  endDate: string
}

interface Report {
  id: number
  report_date: string
  report_type: string
  summary: string
  raw_data: {
    // 新形式: ga4/searchConsole別の期間
    period?: {
      ga4?: PeriodRange
      searchConsole?: PeriodRange
      previous?: { ga4?: PeriodRange; searchConsole?: PeriodRange }
      // 旧形式互換
      startDate?: string
      endDate?: string
    }
    ga4?: Record<string, { current: GA4Summary; previous: GA4Summary }>
    marketing?: MarketingData
    castAccess?: CastAccessStore[]
    profileReferrers?: ProfileReferrerStore[]
  }
  created_at: string
}

interface CastReferrerBreakdownItem {
  category: string
  label: string
  views: number
}

interface CastAccessItem {
  gid: string
  cast_name: string | null
  views: number
  prev_views: number | null
  views_diff_pct: number | null
  listing_views: number
  listing_views_share: number
  referrer_breakdown: CastReferrerBreakdownItem[]
}

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
}

interface MarketingData {
  storeInsights?: StoreInsight[]
  seoOpportunities?: SeoOpportunity[]
  pageSeoInsights?: PageSeoInsight[]
  growthQueryOpportunities?: GrowthQueryOpportunity[]
  actionItems?: ActionItem[]
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

interface SearchSummary {
  clicks: number
  impressions: number
  ctr: number
  position: number
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
type TabId = 'overview' | 'stores' | 'seo' | 'cast' | 'report'

function formatDate(d: string) {
  return d.replace(/-/g, '/').slice(2)
}

function pctChange(curr: number, prev: number) {
  if (!prev) return null
  const p = Math.round((curr - prev) / prev * 100)
  return p
}

function PctBadge({ curr, prev }: { curr: number; prev: number }) {
  const p = pctChange(curr, prev)
  if (p === null) return null
  const color = p >= 0 ? 'text-green-600' : 'text-red-500'
  return <span className={`text-xs ${color} ml-1`}>{p >= 0 ? '+' : ''}{p}%</span>
}

function SignedValue({ value, suffix = '' }: { value: number | null | undefined; suffix?: string }) {
  if (value === null || value === undefined) return <span className="text-gray-400">-</span>
  const color = value >= 0 ? 'text-green-600' : 'text-red-500'
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

export default function AnalyticsPage() {
  useEffect(() => { document.title = 'Web解析レポート | KIJ管理' }, [])
  const [reports, setReports] = useState<Report[]>([])
  const [selected, setSelected] = useState<Report | null>(null)
  const [activeTab, setActiveTab] = useState<TabId>('overview')
  const [loading, setLoading] = useState(true)
  const [castSortKey, setCastSortKey] = useState<'views' | 'listing_views'>('views')

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
  const period = selected?.raw_data?.period
  const marketing = selected?.raw_data?.marketing
  const actionItems = marketing?.actionItems?.slice(0, 5) ?? []
  const seoOpportunities = marketing?.seoOpportunities?.slice(0, 8) ?? []
  const growthQueryOpportunities = marketing?.growthQueryOpportunities?.slice(0, 8) ?? []
  const pageSeoInsights = marketing?.pageSeoInsights?.slice(0, 6) ?? []
  const storeInsights = marketing?.storeInsights?.filter(s => s.priority !== 'C').slice(0, 6) ?? []
  const castAccess = selected?.raw_data?.castAccess ?? []
  const profileReferrers = selected?.raw_data?.profileReferrers ?? []
  const tabs: { id: TabId; label: string; count?: number }[] = [
    { id: 'overview', label: '概要', count: actionItems.length },
    { id: 'stores', label: '店舗', count: storeInsights.length },
    { id: 'seo', label: 'SEO', count: pageSeoInsights.length + growthQueryOpportunities.length + seoOpportunities.length },
    { id: 'cast', label: 'キャスト', count: castAccess.reduce((sum, s) => sum + s.casts.length, 0) },
    { id: 'report', label: 'AIレポート' },
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

      {period && (
        <p className="text-xs text-gray-500 mb-4">
          {period.ga4
            ? <>GA4: {formatDate(period.ga4.startDate)} 〜 {formatDate(period.ga4.endDate)}　SC: {formatDate(period.searchConsole!.startDate)} 〜 {formatDate(period.searchConsole!.endDate)}</>
            : <>集計期間: {formatDate(period.startDate!)} 〜 {formatDate(period.endDate!)}</>
          }
        </p>
      )}

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

      {activeTab === 'overview' && actionItems.length > 0 && (
        <section className="mb-6">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">今週の優先アクション</h2>
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

      {activeTab === 'stores' && storeInsights.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-sm font-semibold text-gray-700">店舗アラート</h2>
          <div className="grid gap-2 md:grid-cols-2">
            {storeInsights.map(store => (
              <div key={store.store_name} className="rounded border bg-white p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3 className="truncate text-sm font-semibold text-gray-900">{store.store_name}</h3>
                  <PriorityBadge priority={store.priority} />
                </div>
                <p className="mb-2 text-xs font-medium text-gray-700">{store.main_issue}</p>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-gray-600">
                  <div>セッション {store.sessions.toLocaleString()}</div>
                  <div>前週比 <SignedValue value={store.sessions_diff_pct} suffix="%" /></div>
                  <div>電話CVR {store.phone_cvr}%</div>
                  <div>差分 <SignedValue value={store.phone_cvr_diff} suffix="pt" /></div>
                  <div>WEB予約CVR {store.reservation_cvr}%</div>
                  <div>差分 <SignedValue value={store.reservation_cvr_diff} suffix="pt" /></div>
                </div>
                {store.primary_channel && (
                  <p className="mt-2 text-xs text-gray-500">
                    主チャネル: {store.primary_channel.name} {store.primary_channel.share}%
                  </p>
                )}
                <p className="mt-2 text-sm leading-relaxed text-gray-800">{store.recommended_action}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {activeTab === 'seo' && pageSeoInsights.length > 0 && (
        <section className="mb-6">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">店舗ページ別SEO深掘り</h2>
            <span className="text-xs text-gray-400">marketing.pageSeoInsights</span>
          </div>
          <div className="space-y-2">
            {pageSeoInsights.map(item => (
              <div key={`${item.store_name}-${item.path}`} className="rounded border bg-white p-3">
                <div className="mb-2 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="mb-1 flex items-center gap-2">
                      <PriorityBadge priority={item.priority} />
                      <span className="text-xs text-gray-500">{item.path}</span>
                    </div>
                    <h3 className="text-sm font-semibold text-gray-900">{item.store_name}</h3>
                  </div>
                </div>
                <p className="mb-2 text-xs font-medium text-gray-700">{item.main_issue}</p>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-gray-600 sm:grid-cols-4">
                  <div>クリック {item.summary.clicks.toLocaleString()}</div>
                  <div>前週比 <SignedValue value={item.clicks_diff_pct} suffix="%" /></div>
                  <div>表示 {item.summary.impressions.toLocaleString()}</div>
                  <div>前週比 <SignedValue value={item.impressions_diff_pct} suffix="%" /></div>
                  <div>CTR {item.summary.ctr}%</div>
                  <div>差分 <SignedValue value={item.ctr_diff} suffix="pt" /></div>
                  <div>順位 {item.summary.position}</div>
                  <div>差分 <SignedValue value={item.position_diff} /></div>
                </div>
                {item.query_groups.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {item.query_groups.slice(0, 4).map(group => (
                      <span key={`${item.path}-${group.intent}`} className="rounded border bg-gray-50 px-2 py-1 text-xs text-gray-700">
                        {group.label} {group.share}% / 表示{group.impressions.toLocaleString()}
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
                          <th className="py-1 pr-3 font-medium">表示</th>
                          <th className="py-1 pr-3 font-medium">CTR</th>
                          <th className="py-1 pr-3 font-medium">順位</th>
                        </tr>
                      </thead>
                      <tbody>
                        {item.top_queries.slice(0, 5).map(query => (
                          <tr key={`${item.path}-${query.query}`} className="border-t border-gray-100">
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
                    <div className="mb-1 text-xs font-semibold text-red-700">減少クエリ</div>
                    <div className="space-y-1">
                      {item.query_drops.slice(0, 4).map(query => (
                        <div key={`${item.path}-${query.type}-${query.query}`} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-red-800">
                          <span className="font-medium">{query.query}</span>
                          <span className="text-red-500">{query.label}</span>
                          <span>
                            表示 {query.prev_impressions?.toLocaleString() ?? '-'} → {query.impressions.toLocaleString()}
                            {query.impressions_diff_pct !== undefined && query.impressions_diff_pct !== null && (
                              <span className="ml-1">({query.impressions_diff_pct}%)</span>
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <p className="mt-3 text-sm leading-relaxed text-gray-800">{item.recommended_action}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {activeTab === 'seo' && growthQueryOpportunities.length > 0 && (
        <section className="mb-6">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">非指名・欲求検索の成長候補</h2>
            <span className="text-xs text-gray-400">marketing.growthQueryOpportunities</span>
          </div>
          <div className="overflow-x-auto rounded border bg-white">
            <table className="min-w-full text-left text-xs">
              <thead className="border-b bg-gray-50 text-gray-500">
                <tr>
                  <th className="px-3 py-2 font-medium">優先</th>
                  <th className="px-3 py-2 font-medium">店舗</th>
                  <th className="px-3 py-2 font-medium">分類</th>
                  <th className="px-3 py-2 font-medium">クエリ</th>
                  <th className="px-3 py-2 font-medium">表示</th>
                  <th className="px-3 py-2 font-medium">CTR</th>
                  <th className="px-3 py-2 font-medium">順位</th>
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
                      <span className="ml-1 text-gray-400">(<SignedValue value={item.position_diff} />)</span>
                    </td>
                    <td className="min-w-64 px-3 py-2 align-top text-gray-700">{item.recommended_action}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeTab === 'seo' && seoOpportunities.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-sm font-semibold text-gray-700">SEO改善候補</h2>
          <div className="overflow-x-auto rounded border bg-white">
            <table className="min-w-full text-left text-xs">
              <thead className="border-b bg-gray-50 text-gray-500">
                <tr>
                  <th className="px-3 py-2 font-medium">優先</th>
                  <th className="px-3 py-2 font-medium">サイト</th>
                  <th className="px-3 py-2 font-medium">クエリ</th>
                  <th className="px-3 py-2 font-medium">表示</th>
                  <th className="px-3 py-2 font-medium">CTR</th>
                  <th className="px-3 py-2 font-medium">順位</th>
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
                      <span className="ml-1 text-gray-400">(<SignedValue value={item.position_diff} />)</span>
                    </td>
                    <td className="min-w-64 px-3 py-2 align-top text-gray-700">{item.recommended_action}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeTab === 'cast' && castAccess.length > 0 && (
        <section className="mb-6">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-gray-700">キャスト別アクセス数（プロフィールPV）</h2>
              <span className="text-xs text-gray-400">raw_data.castAccess</span>
            </div>
            <div className="flex items-center gap-1 rounded border bg-white p-0.5 text-xs">
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
                一覧経由順（写真クリック）
              </button>
            </div>
          </div>
          <p className="mb-2 text-xs text-gray-500">
            「一覧経由」= TOPページ・キャスト一覧・出勤スケジュールのサムネイル写真からプロフィールへ遷移した回数。検索直帰や指名の直接流入を除いた、写真の訴求力に近い指標。
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            {castAccess.map(store => {
              const sortedCasts = [...store.casts].sort((a, b) => b[castSortKey] - a[castSortKey])
              return (
                <div key={store.store_name} className="rounded border bg-white p-3">
                  <h3 className="mb-2 text-sm font-semibold text-gray-900">{store.store_name}</h3>
                  <table className="min-w-full text-left text-xs">
                    <thead className="text-gray-400">
                      <tr>
                        <th className="py-1 pr-2 font-medium">キャスト</th>
                        <th className="py-1 pr-2 text-right font-medium">総PV</th>
                        <th className="py-1 pr-2 text-right font-medium">一覧経由</th>
                        <th className="py-1 pr-2 text-right font-medium">前週比</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedCasts.slice(0, 10).map(c => (
                        <tr key={c.gid} className="border-t border-gray-100">
                          <td className="py-1 pr-2 text-gray-800">
                            {c.cast_name ?? <span className="text-gray-400">gid:{c.gid}（未登録）</span>}
                          </td>
                          <td className="py-1 pr-2 text-right text-gray-700">{c.views.toLocaleString()}</td>
                          <td className="py-1 pr-2 text-right text-gray-700">
                            {c.listing_views.toLocaleString()}
                            <span className="ml-1 text-gray-400">({c.listing_views_share}%)</span>
                          </td>
                          <td className="py-1 pr-2 text-right"><SignedValue value={c.views_diff_pct} suffix="%" /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {activeTab === 'cast' && profileReferrers.length > 0 && (
        <section className="mb-6">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">プロフィールページ 遷移元内訳</h2>
            <span className="text-xs text-gray-400">raw_data.profileReferrers</span>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {profileReferrers.map(store => (
              <div key={store.store_name} className="rounded border bg-white p-3">
                <h3 className="mb-2 text-sm font-semibold text-gray-900">{store.store_name}</h3>
                <div className="space-y-1.5">
                  {store.breakdown.map(b => (
                    <div key={b.category} className="flex items-center gap-2 text-xs">
                      <span className="w-28 shrink-0 truncate text-gray-600">{b.label}</span>
                      <div className="h-2 flex-1 rounded bg-gray-100">
                        <div className="h-2 rounded bg-gray-400" style={{ width: `${Math.min(b.share, 100)}%` }} />
                      </div>
                      <span className="w-12 shrink-0 text-right text-gray-700">{b.share}%</span>
                      <span className="w-14 shrink-0 text-right text-gray-400">{b.views.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* GA4 店舗別サマリー */}
      {activeTab === 'overview' && ga4 && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-2">店舗別セッション数</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {Object.entries(ga4).map(([name, data]) => (
              <div key={name} className="bg-white border rounded p-3">
                <div className="text-xs text-gray-500 mb-1 truncate">{name}</div>
                <div className="text-xl font-bold">{data.current.sessions.toLocaleString()}</div>
                <PctBadge curr={data.current.sessions} prev={data.previous.sessions} />
                <div className="text-xs text-gray-400 mt-1">
                  直帰 {data.current.bounceRate}%
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AI分析レポート */}
      {activeTab === 'report' && (
        <div className="bg-white border rounded p-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">AI分析レポート</h2>
          <MarkdownContent text={selected?.summary ?? ''} />
        </div>
      )}
    </div>
  )
}
