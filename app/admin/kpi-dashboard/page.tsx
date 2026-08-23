'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { AREAS, todayString } from '@/lib/types'
import {
  DateRange,
  PeriodPair,
  buildDailyPair,
  buildWeeklyPair,
  buildMonthlyPair,
  buildYearOverYearPair,
  unionRange,
  pctChange,
} from '@/lib/kpiDateRanges'

interface StoreDailyKpiRow {
  area_id: number
  date: string
  close_count: number | null
  reserve_count: number | null
  cancel_count: number | null
  change_count: number | null
  other_count: number | null
  revenue_total: number | null
  committee_fee_total: number | null
  store_profit_total: number | null
  contracts_all_count: number | null
  new_customers: number | null
  repeat_customers: number | null
  inbound_calls_total: number | null
}

interface TransactionRow {
  area_id: number
  date: string
  data_type: string | null
  nomination_label: string | null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchAllPaginated<T>(buildQuery: (from: number, to: number) => any): Promise<T[]> {
  const PAGE = 1000
  let offset = 0
  const results: T[] = []
  while (true) {
    const { data, error } = await buildQuery(offset, offset + PAGE - 1)
    if (error) throw new Error(error.message)
    if (!data || data.length === 0) break
    results.push(...(data as T[]))
    if (data.length < PAGE) break
    offset += PAGE
  }
  return results
}

type TabKey = 'daily' | 'weekly' | 'monthly'

interface MetricAgg {
  revenue: number
  storeProfit: number
  committeeFee: number
  customers: number
  newCustomers: number
  repeatCustomers: number
  reservations: number
  cancellations: number
  inboundCalls: number
  nominations: number
}

function emptyAgg(): MetricAgg {
  return {
    revenue: 0, storeProfit: 0, committeeFee: 0, customers: 0, newCustomers: 0,
    repeatCustomers: 0, reservations: 0, cancellations: 0, inboundCalls: 0, nominations: 0,
  }
}

function aggregate(kpiRows: StoreDailyKpiRow[], txRows: TransactionRow[], areaId: number | null, range: DateRange): MetricAgg {
  const agg = emptyAgg()
  for (const r of kpiRows) {
    if (areaId != null && r.area_id !== areaId) continue
    if (r.date < range.start || r.date > range.end) continue
    agg.revenue += r.revenue_total ?? 0
    agg.storeProfit += r.store_profit_total ?? 0
    agg.committeeFee += r.committee_fee_total ?? 0
    agg.customers += r.contracts_all_count ?? 0
    agg.newCustomers += r.new_customers ?? 0
    agg.repeatCustomers += r.repeat_customers ?? 0
    agg.reservations += (r.close_count ?? 0) + (r.reserve_count ?? 0) + (r.cancel_count ?? 0) + (r.change_count ?? 0) + (r.other_count ?? 0)
    agg.cancellations += r.cancel_count ?? 0
    agg.inboundCalls += r.inbound_calls_total ?? 0
  }
  for (const t of txRows) {
    if (areaId != null && t.area_id !== areaId) continue
    if (t.date < range.start || t.date > range.end) continue
    if (t.data_type !== '成約') continue
    if (t.nomination_label && /本|写/.test(t.nomination_label)) agg.nominations += 1
  }
  return agg
}

interface MetricRow {
  key: string
  label: string
  format: (v: number) => string
  current: number
  previous: number
  invertColor?: boolean
}

function formatYen(n: number) { return `¥${Math.round(n).toLocaleString()}` }
function formatCount(n: number) { return `${Math.round(n).toLocaleString()}` }
function formatPct(n: number) { return `${n.toFixed(1)}%` }

function buildMetricRows(current: MetricAgg, previous: MetricAgg): MetricRow[] {
  const unitPriceCur = current.customers > 0 ? current.revenue / current.customers : 0
  const unitPricePrev = previous.customers > 0 ? previous.revenue / previous.customers : 0
  const nominationRateCur = current.customers > 0 ? (current.nominations / current.customers) * 100 : 0
  const nominationRatePrev = previous.customers > 0 ? (previous.nominations / previous.customers) * 100 : 0

  return [
    { key: 'revenue', label: '売上', format: formatYen, current: current.revenue, previous: previous.revenue },
    { key: 'storeProfit', label: '店落ち', format: formatYen, current: current.storeProfit, previous: previous.storeProfit },
    { key: 'committeeFee', label: '委託費', format: formatYen, current: current.committeeFee, previous: previous.committeeFee },
    { key: 'customers', label: '客数', format: formatCount, current: current.customers, previous: previous.customers },
    { key: 'unitPrice', label: '客単価', format: formatYen, current: unitPriceCur, previous: unitPricePrev },
    { key: 'newCustomers', label: '新規客数', format: formatCount, current: current.newCustomers, previous: previous.newCustomers },
    { key: 'repeatCustomers', label: 'リピーター数', format: formatCount, current: current.repeatCustomers, previous: previous.repeatCustomers },
    { key: 'nominations', label: '指名数', format: formatCount, current: current.nominations, previous: previous.nominations },
    { key: 'nominationRate', label: '指名率', format: formatPct, current: nominationRateCur, previous: nominationRatePrev },
    { key: 'reservations', label: '予約数', format: formatCount, current: current.reservations, previous: previous.reservations },
    { key: 'cancellations', label: 'キャンセル数', format: formatCount, current: current.cancellations, previous: previous.cancellations, invertColor: true },
    { key: 'inboundCalls', label: '入電数', format: formatCount, current: current.inboundCalls, previous: previous.inboundCalls },
  ]
}

// 寄与度コメント（無課金・テンプレ型）: 客数/客単価/新規/リピーター/指名率のうち
// 変化幅が最大の指標を定型文に当てはめる。LLM等の生成AIは使わない。
function buildContributionComment(rows: MetricRow[]): string | null {
  const targets = ['customers', 'unitPrice', 'newCustomers', 'repeatCustomers', 'nominationRate']
  let best: { label: string; pct: number } | null = null
  for (const r of rows) {
    if (!targets.includes(r.key)) continue
    const pct = pctChange(r.current, r.previous)
    if (pct == null) continue
    if (!best || Math.abs(pct) > Math.abs(best.pct)) best = { label: r.label, pct }
  }
  if (!best || Math.abs(best.pct) < 1) return null
  const dir = best.pct >= 0 ? '増加' : '減少'
  return `${best.label}の${dir}（${best.pct >= 0 ? '+' : ''}${best.pct.toFixed(1)}%）が最も大きな変動要因です`
}

function DiffBadge({ current, previous, invert }: { current: number; previous: number; invert?: boolean }) {
  const pct = pctChange(current, previous)
  if (pct == null) return <span className="text-xs text-gray-400 dark:text-gray-500">—</span>
  const isFlat = Math.abs(pct) < 0.05
  const isUp = pct > 0
  const good = invert ? !isUp : isUp
  const colorClass = isFlat
    ? 'text-gray-400 dark:text-gray-500'
    : good
      ? 'text-emerald-600 dark:text-emerald-400'
      : 'text-rose-600 dark:text-rose-400'
  const arrow = isFlat ? '±' : isUp ? '↑' : '↓'
  return <span className={`text-xs font-semibold tabular-nums ${colorClass}`}>{arrow}{Math.abs(pct).toFixed(1)}%</span>
}

function StoreCard({ name, current, previous, highlight }: { name: string; current: MetricAgg; previous: MetricAgg; highlight?: boolean }) {
  const rows = buildMetricRows(current, previous)
  const comment = buildContributionComment(rows)
  return (
    <div className={`rounded-xl border p-4 shadow-sm ${
      highlight
        ? 'border-blue-300 dark:border-blue-700 bg-blue-50/50 dark:bg-blue-950/20'
        : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900'
    }`}>
      <h2 className="font-semibold text-gray-900 dark:text-white mb-3">{name}</h2>
      <div className="space-y-1.5">
        {rows.map(r => (
          <div key={r.key} className="flex items-center justify-between text-sm">
            <span className="text-gray-500 dark:text-gray-400">{r.label}</span>
            <div className="flex items-center gap-2">
              <span className="font-medium text-gray-900 dark:text-white tabular-nums">{r.format(r.current)}</span>
              <DiffBadge current={r.current} previous={r.previous} invert={r.invertColor} />
            </div>
          </div>
        ))}
      </div>
      {comment && (
        <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 text-xs text-gray-600 dark:text-gray-300">
          {comment}
        </div>
      )}
    </div>
  )
}

function ComparisonGrid({ kpiRows, txRows, pair }: { kpiRows: StoreDailyKpiRow[]; txRows: TransactionRow[]; pair: PeriodPair }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      <StoreCard
        name="全社計"
        current={aggregate(kpiRows, txRows, null, pair.current)}
        previous={aggregate(kpiRows, txRows, null, pair.previous)}
        highlight
      />
      {AREAS.map(area => (
        <StoreCard
          key={area.id}
          name={area.name}
          current={aggregate(kpiRows, txRows, area.id, pair.current)}
          previous={aggregate(kpiRows, txRows, area.id, pair.previous)}
        />
      ))}
    </div>
  )
}

const TABS: { key: TabKey; label: string }[] = [
  { key: 'daily', label: '日次' },
  { key: 'weekly', label: '週次' },
  { key: 'monthly', label: '月次' },
]

export default function KpiDashboardPage() {
  useEffect(() => { document.title = '経営KPIダッシュボード | KIJ管理' }, [])

  const [tab, setTab] = useState<TabKey>('daily')
  const [kpiRows, setKpiRows] = useState<StoreDailyKpiRow[]>([])
  const [txRows, setTxRows] = useState<TransactionRow[]>([])
  const [loading, setLoading] = useState(true)

  const today = todayString()
  // store_daily_kpiは毎朝、前日分のみ追加される（当日分は存在しない）ため、
  // 「直近の確定日」＝前日を集計の基準日にする
  const asOf = useMemo(() => {
    const [y, m, d] = today.split('-').map(Number)
    const prev = new Date(y, m - 1, d - 1)
    return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}-${String(prev.getDate()).padStart(2, '0')}`
  }, [today])
  const dailyPair = useMemo(() => buildDailyPair(asOf), [asOf])
  const weeklyPair = useMemo(() => buildWeeklyPair(asOf), [asOf])
  const monthlyPair = useMemo(() => buildMonthlyPair(asOf), [asOf])
  const yoyPair = useMemo(() => buildYearOverYearPair(asOf), [asOf])

  const fetchRange = useMemo(() => {
    let range = dailyPair.previous
    for (const p of [dailyPair, weeklyPair, monthlyPair, yoyPair]) {
      range = unionRange(range, p.current)
      range = unionRange(range, p.previous)
    }
    return range
  }, [dailyPair, weeklyPair, monthlyPair, yoyPair])

  const load = useCallback(async () => {
    setLoading(true)
    const [kpi, tx] = await Promise.all([
      fetchAllPaginated<StoreDailyKpiRow>((from, to) =>
        supabase.from('store_daily_kpi')
          .select('area_id, date, close_count, reserve_count, cancel_count, change_count, other_count, revenue_total, committee_fee_total, store_profit_total, contracts_all_count, new_customers, repeat_customers, inbound_calls_total')
          .gte('date', fetchRange.start).lte('date', fetchRange.end)
          .range(from, to)
      ),
      fetchAllPaginated<TransactionRow>((from, to) =>
        supabase.from('daily_report_transactions')
          .select('area_id, date, data_type, nomination_label')
          .gte('date', fetchRange.start).lte('date', fetchRange.end)
          .range(from, to)
      ),
    ])
    setKpiRows(kpi)
    setTxRows(tx)
    setLoading(false)
  }, [fetchRange])

  useEffect(() => { load() }, [load])

  const activePair: PeriodPair = tab === 'daily' ? dailyPair : tab === 'weekly' ? weeklyPair : monthlyPair

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">経営KPIダッシュボード</h1>
        <div className="text-sm text-gray-500 dark:text-gray-400">本日 {today}・データ基準日 {asOf}（前日分まで反映）</div>
      </div>

      <div className="flex gap-1 mb-4">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${
              tab === t.key
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-sm text-gray-500 dark:text-gray-400">読み込み中...</div>
      ) : (
        <div className="space-y-6">
          <div className="text-sm text-gray-500 dark:text-gray-400">
            {activePair.label}（{activePair.current.start}〜{activePair.current.end}） vs {activePair.compareLabel}（{activePair.previous.start}〜{activePair.previous.end}）
          </div>

          <ComparisonGrid kpiRows={kpiRows} txRows={txRows} pair={activePair} />

          {tab === 'monthly' && (
            <div>
              <h2 className="font-semibold text-gray-900 dark:text-white mb-3">
                前年同月比（{yoyPair.current.start}〜{yoyPair.current.end} vs {yoyPair.previous.start}〜{yoyPair.previous.end}）
              </h2>
              <ComparisonGrid kpiRows={kpiRows} txRows={txRows} pair={yoyPair} />
            </div>
          )}

          <div className="text-xs text-gray-400 dark:text-gray-500">
            ※ データは2026-08-22以降の日次スナップショットのみ蓄積されています。過去分の週次/月次/前年同月比較は、データが十分に貯まるまで参考値になりません。
          </div>
        </div>
      )}
    </div>
  )
}
