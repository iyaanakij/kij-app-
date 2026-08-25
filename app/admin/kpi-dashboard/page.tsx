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
  addDays,
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
  cast_name: string | null
  revenue: number | null
  used_at: string | null
}

interface StaffRow {
  id: number
  name: string
}

interface ShiftRow {
  staff_id: number
  store_id: number
  date: string
  start_time: number
  end_time: number
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

// ── ③曜日・時間帯分析 / ④女性×曜日 共通 ──────────────────────────

const WEEKDAY_LABELS = ['月', '火', '水', '木', '金', '土', '日']

// timestamptz(UTC保存)からJSTの曜日(0=月..6=日)と時刻を求める。
// ブラウザのローカルタイムゾーンに依存しないよう明示的に+9時間する。
function toJstWeekdayHour(iso: string): { weekday: number; hour: number } {
  const jst = new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000)
  return { weekday: (jst.getUTCDay() + 6) % 7, hour: jst.getUTCHours() }
}

function dateWeekday(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number)
  return (new Date(y, m - 1, d).getDay() + 6) % 7
}

// シフトのstore_idが指定エリアに属するか（areaId=nullなら全エリア対象）
function shiftMatchesArea(sh: ShiftRow, areaId: number | null): boolean {
  if (areaId == null) return true
  const area = AREAS.find((a) => a.id === areaId)
  return area ? area.storeIds.includes(sh.store_id) : false
}

// ── ③曜日・時間帯ヒートマップ ──

interface HeatCell { reservations: number; workingCasts: number }

const HOUR_BUCKETS = 12 // 2時間刻み×12

function computeHeatmap(txRows: TransactionRow[], shiftRows: ShiftRow[], areaId: number | null, range: DateRange): HeatCell[][] {
  const grid: HeatCell[][] = Array.from({ length: 7 }, () => Array.from({ length: HOUR_BUCKETS }, () => ({ reservations: 0, workingCasts: 0 })))

  for (const t of txRows) {
    if (t.data_type !== '成約' || !t.used_at) continue
    if (areaId != null && t.area_id !== areaId) continue
    if (t.date < range.start || t.date > range.end) continue
    const { weekday, hour } = toJstWeekdayHour(t.used_at)
    const bucket = Math.min(HOUR_BUCKETS - 1, Math.floor(hour / 2))
    grid[weekday][bucket].reservations += 1
  }

  // シフトが24時を跨ぐ場合（例: 22.0〜29.0）、24時以降の部分は翌日扱いとして
  // 集計から除外する（このダッシュボードでは日をまたぐ按分まではしない簡易実装）
  for (const sh of shiftRows) {
    if (sh.date < range.start || sh.date > range.end) continue
    if (!shiftMatchesArea(sh, areaId)) continue
    const weekday = dateWeekday(sh.date)
    const clampedEnd = Math.min(sh.end_time, 24)
    for (let b = 0; b < HOUR_BUCKETS; b++) {
      const bucketStart = b * 2
      const bucketEnd = bucketStart + 2
      if (sh.start_time < bucketEnd && clampedEnd > bucketStart) {
        grid[weekday][b].workingCasts += 1
      }
    }
  }

  return grid
}

function HeatmapTable({ grid }: { grid: HeatCell[][] }) {
  const max = Math.max(1, ...grid.flat().map(c => c.reservations))
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-3">
      <table className="min-w-full text-xs border-separate border-spacing-1">
        <thead>
          <tr>
            <th className="w-10"></th>
            {Array.from({ length: HOUR_BUCKETS }, (_, b) => (
              <th key={b} className="font-medium text-gray-500 dark:text-gray-400 text-center whitespace-nowrap px-1">
                {b * 2}時
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {WEEKDAY_LABELS.map((label, wd) => (
            <tr key={label}>
              <td className="font-semibold text-gray-700 dark:text-gray-300 text-center">{label}</td>
              {grid[wd].map((cell, b) => {
                const ratio = cell.reservations / max
                const rate = cell.workingCasts > 0 ? Math.round((cell.reservations / cell.workingCasts) * 100) : null
                return (
                  <td
                    key={b}
                    className="rounded-md text-center py-1.5 min-w-[46px]"
                    style={{ backgroundColor: cell.reservations > 0 ? `rgba(37, 99, 235, ${0.12 + ratio * 0.55})` : undefined }}
                  >
                    <div className="font-semibold text-gray-900 dark:text-white">{cell.reservations || ''}</div>
                    {cell.workingCasts > 0 && (
                      <div className="text-[9px] text-gray-500 dark:text-gray-400">
                        稼働{cell.workingCasts}{rate != null ? `・${rate}%` : ''}
                      </div>
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 text-[11px] text-gray-400 dark:text-gray-500">
        各セル: 予約数（太字）／稼働{'{'}稼働キャスト数{'}'}・予約率（予約数÷稼働キャスト数）。色が濃いほど予約数が多い時間帯。
      </div>
    </div>
  )
}

// ── ④女性×曜日マトリクス ──

type Tier = '◎' | '○' | '△'

interface CastWeekdayAgg { revenue: number; dates: Set<string> }

function computeCastWeekdayMatrix(txRows: TransactionRow[], areaId: number | null, range: DateRange): Map<string, CastWeekdayAgg[]> {
  const byCast = new Map<string, CastWeekdayAgg[]>()
  for (const t of txRows) {
    if (t.data_type !== '成約' || !t.cast_name || !t.used_at) continue
    if (areaId != null && t.area_id !== areaId) continue
    if (t.date < range.start || t.date > range.end) continue
    const { weekday } = toJstWeekdayHour(t.used_at)
    let cells = byCast.get(t.cast_name)
    if (!cells) {
      cells = Array.from({ length: 7 }, () => ({ revenue: 0, dates: new Set<string>() }))
      byCast.set(t.cast_name, cells)
    }
    cells[weekday].revenue += t.revenue ?? 0
    cells[weekday].dates.add(t.date)
  }
  return byCast
}

// その女性自身の曜日別「1稼働日あたり平均売上」を比較し、上位/下位を◎/△とする
// （店舗全体との比較ではなく、あくまで本人内の強い曜日・弱い曜日を見るための指標）
function tierForCast(avgByWeekday: (number | null)[]): (Tier | null)[] {
  const withData = avgByWeekday
    .map((v, i) => ({ v, i }))
    .filter((x): x is { v: number; i: number } => x.v != null)
  if (withData.length < 3) return avgByWeekday.map(v => (v == null ? null : '○'))
  const sorted = [...withData].sort((a, b) => b.v - a.v)
  const edgeCount = Math.max(1, Math.ceil(sorted.length / 3))
  const topSet = new Set(sorted.slice(0, edgeCount).map(x => x.i))
  const bottomSet = new Set(sorted.slice(-edgeCount).map(x => x.i))
  return avgByWeekday.map((v, i) => (v == null ? null : topSet.has(i) ? '◎' : bottomSet.has(i) ? '△' : '○'))
}

const TIER_STYLE: Record<Tier, string> = {
  '◎': 'text-rose-600 dark:text-rose-400',
  '○': 'text-gray-500 dark:text-gray-400',
  '△': 'text-blue-500 dark:text-blue-400',
}

function CastWeekdayMatrixTable({ byCast }: { byCast: Map<string, CastWeekdayAgg[]> }) {
  const rows = [...byCast.entries()]
    .map(([name, cells]) => {
      const avg = cells.map(c => (c.dates.size > 0 ? c.revenue / c.dates.size : null))
      const totalRevenue = cells.reduce((sum, c) => sum + c.revenue, 0)
      return { name, avg, tiers: tierForCast(avg), totalRevenue }
    })
    .filter(r => r.totalRevenue > 0)
    .sort((a, b) => b.totalRevenue - a.totalRevenue)

  if (rows.length === 0) {
    return <div className="text-sm text-gray-400 dark:text-gray-500 py-6 text-center">対象期間の実績データがありません</div>
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
      <table className="min-w-full text-sm">
        <thead className="border-b border-gray-200 dark:border-gray-700">
          <tr>
            <th className="text-left font-medium text-gray-500 dark:text-gray-400 px-3 py-2 whitespace-nowrap">キャスト</th>
            {WEEKDAY_LABELS.map(l => (
              <th key={l} className="font-medium text-gray-500 dark:text-gray-400 px-3 py-2 text-center">{l}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
          {rows.map(r => (
            <tr key={r.name}>
              <td className="px-3 py-2 whitespace-nowrap font-medium text-gray-900 dark:text-white">{r.name}</td>
              {r.tiers.map((tier, i) => (
                <td key={i} className="px-3 py-2 text-center">
                  {tier ? (
                    <span className={`text-base font-bold ${TIER_STYLE[tier]}`} title={r.avg[i] != null ? formatYen(r.avg[i]!) : ''}>
                      {tier}
                    </span>
                  ) : (
                    <span className="text-gray-300 dark:text-gray-700">—</span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="p-3 text-[11px] text-gray-400 dark:text-gray-500 border-t border-gray-100 dark:border-gray-800">
        ◎○△は店舗全体との比較ではなく、そのキャスト自身の曜日別「1稼働日あたり平均売上」の中での相対順位（上位3分の1=◎、下位3分の1=△）。セルにカーソルを合わせると平均売上を表示。
      </div>
    </div>
  )
}

const TABS: { key: TabKey; label: string }[] = [
  { key: 'daily', label: '日次' },
  { key: 'weekly', label: '週次' },
  { key: 'monthly', label: '月次' },
]

// バックフィル済みデータの開始日（2026-08-23実施、2025-08-23〜の1年分）。
// これより前は日付ピッカーで選んでもデータが存在しない。
const MIN_ASOF = '2025-08-23'

// ── ②キャスト比較 ──────────────────────────────────────────

interface CastAgg {
  revenue: number
  count: number
  nominations: number
  shiftMinutes: number
}

function emptyCastAgg(): CastAgg {
  return { revenue: 0, count: 0, nominations: 0, shiftMinutes: 0 }
}

// shifts は (staff_id, date) が重複しうる（HP同期/CS3同期が別store_idで書くため）。
// 既存 /ranking と同じく、当日最長のシフトだけを採用してdedupする。
function dedupLongestShift(shifts: ShiftRow[]): ShiftRow[] {
  const byKey = new Map<string, ShiftRow>()
  for (const sh of shifts) {
    const key = `${sh.staff_id}:${sh.date}`
    const current = byKey.get(key)
    if (!current || (sh.end_time - sh.start_time) > (current.end_time - current.start_time)) {
      byKey.set(key, sh)
    }
  }
  return [...byKey.values()]
}

function computeCastStats(
  txRows: TransactionRow[],
  staffRows: StaffRow[],
  shiftRows: ShiftRow[],
  areaId: number | null,
  range: DateRange,
) {
  const nameToId = new Map(staffRows.map(s => [s.name, s.id]))
  const byCast = new Map<string, CastAgg>()

  for (const t of txRows) {
    if (!t.cast_name || t.data_type !== '成約') continue
    if (areaId != null && t.area_id !== areaId) continue
    if (t.date < range.start || t.date > range.end) continue
    const agg = byCast.get(t.cast_name) ?? emptyCastAgg()
    agg.revenue += t.revenue ?? 0
    agg.count += 1
    if (t.nomination_label && /本|写/.test(t.nomination_label)) agg.nominations += 1
    byCast.set(t.cast_name, agg)
  }

  const dedupedShifts = dedupLongestShift(
    shiftRows.filter(sh => sh.date >= range.start && sh.date <= range.end && shiftMatchesArea(sh, areaId))
  )
  const shiftMinByStaffId = new Map<number, number>()
  for (const sh of dedupedShifts) {
    const min = Math.max(0, sh.end_time - sh.start_time) * 60
    shiftMinByStaffId.set(sh.staff_id, (shiftMinByStaffId.get(sh.staff_id) ?? 0) + min)
  }
  for (const [castName, agg] of byCast.entries()) {
    const staffId = nameToId.get(castName)
    if (staffId != null) agg.shiftMinutes = shiftMinByStaffId.get(staffId) ?? 0
  }

  return byCast
}

interface CastTableRow {
  name: string
  revenue: number
  count: number
  unitPrice: number
  nominations: number
  nominationRate: number
  shiftHours: number
  revenuePerHour: number
  prevRevenue: number
  prevCount: number
  prevUnitPrice: number
  prevNominationRate: number
  prevShiftHours: number
}

function formatHours(min: number) { return `${(min / 60).toFixed(1)}h` }

function buildCastTableRows(current: Map<string, CastAgg>, previous: Map<string, CastAgg>): CastTableRow[] {
  const names = new Set([...current.keys()])
  const rows: CastTableRow[] = []
  for (const name of names) {
    const cur = current.get(name) ?? emptyCastAgg()
    const prev = previous.get(name) ?? emptyCastAgg()
    if (cur.count === 0) continue
    rows.push({
      name,
      revenue: cur.revenue,
      count: cur.count,
      unitPrice: cur.count > 0 ? cur.revenue / cur.count : 0,
      nominations: cur.nominations,
      nominationRate: cur.count > 0 ? (cur.nominations / cur.count) * 100 : 0,
      shiftHours: cur.shiftMinutes / 60,
      revenuePerHour: cur.shiftMinutes > 0 ? cur.revenue / (cur.shiftMinutes / 60) : 0,
      prevRevenue: prev.revenue,
      prevCount: prev.count,
      prevUnitPrice: prev.count > 0 ? prev.revenue / prev.count : 0,
      prevNominationRate: prev.count > 0 ? (prev.nominations / prev.count) * 100 : 0,
      prevShiftHours: prev.shiftMinutes / 60,
    })
  }
  return rows.sort((a, b) => b.revenue - a.revenue)
}

function CastComparisonTable({
  txRows, staffRows, shiftRows, areaId, pair,
}: {
  txRows: TransactionRow[]
  staffRows: StaffRow[]
  shiftRows: ShiftRow[]
  areaId: number | null
  pair: PeriodPair
}) {
  const current = computeCastStats(txRows, staffRows, shiftRows, areaId, pair.current)
  const previous = computeCastStats(txRows, staffRows, shiftRows, areaId, pair.previous)
  const rows = buildCastTableRows(current, previous)

  if (rows.length === 0) {
    return <div className="text-sm text-gray-400 dark:text-gray-500 py-6 text-center">対象期間の実績データがありません</div>
  }

  const th = 'text-left font-medium text-gray-500 dark:text-gray-400 px-3 py-2 whitespace-nowrap'
  const td = 'px-3 py-2 whitespace-nowrap text-gray-900 dark:text-white tabular-nums'

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
      <table className="min-w-full text-sm">
        <thead className="border-b border-gray-200 dark:border-gray-700">
          <tr>
            <th className={th}>キャスト</th>
            <th className={th}>売上</th>
            <th className={th}>本数</th>
            <th className={th}>客単価</th>
            <th className={th}>指名</th>
            <th className={th}>指名率</th>
            <th className={th}>出勤時間</th>
            <th className={th}>時間売上</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
          {rows.map(r => (
            <tr key={r.name}>
              <td className={`${td} font-medium`}>{r.name}</td>
              <td className={td}>
                <div className="flex items-center gap-1.5">
                  {formatYen(r.revenue)}
                  <DiffBadge current={r.revenue} previous={r.prevRevenue} />
                </div>
              </td>
              <td className={td}>
                <div className="flex items-center gap-1.5">
                  {r.count}
                  <DiffBadge current={r.count} previous={r.prevCount} />
                </div>
              </td>
              <td className={td}>
                <div className="flex items-center gap-1.5">
                  {formatYen(r.unitPrice)}
                  <DiffBadge current={r.unitPrice} previous={r.prevUnitPrice} />
                </div>
              </td>
              <td className={td}>{r.nominations}</td>
              <td className={td}>
                <div className="flex items-center gap-1.5">
                  {formatPct(r.nominationRate)}
                  <DiffBadge current={r.nominationRate} previous={r.prevNominationRate} />
                </div>
              </td>
              <td className={td}>
                <div className="flex items-center gap-1.5">
                  {formatHours(r.shiftHours * 60)}
                  <DiffBadge current={r.shiftHours} previous={r.prevShiftHours} />
                </div>
              </td>
              <td className={td}>{r.shiftHours > 0 ? formatYen(r.revenuePerHour) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function KpiDashboardPage() {
  useEffect(() => { document.title = 'KPIダッシュボード | KIJ管理' }, [])

  const [view, setView] = useState<'store' | 'cast' | 'weekday'>('store')
  const [tab, setTab] = useState<TabKey>('daily')
  const [castAreaId, setCastAreaId] = useState<number | null>(null)
  const [kpiRows, setKpiRows] = useState<StoreDailyKpiRow[]>([])
  const [txRows, setTxRows] = useState<TransactionRow[]>([])
  const [staffRows, setStaffRows] = useState<StaffRow[]>([])
  const [shiftRows, setShiftRows] = useState<ShiftRow[]>([])
  const [loading, setLoading] = useState(true)

  const today = todayString()
  // store_daily_kpiは毎朝、前日分のみ追加される（当日分は存在しない）ため、
  // 「直近の確定日」＝前日をデフォルトの集計基準日にする。ユーザーが日付ピッカーで
  // 過去の基準日を選べば、日次/週次/月次すべてその日を起点に遡って計算し直す。
  const maxAsOf = useMemo(() => addDays(today, -1), [today])
  const [asOf, setAsOf] = useState(maxAsOf)
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
    const [kpi, tx, staff] = await Promise.all([
      fetchAllPaginated<StoreDailyKpiRow>((from, to) =>
        supabase.from('store_daily_kpi')
          .select('area_id, date, close_count, reserve_count, cancel_count, change_count, other_count, revenue_total, committee_fee_total, store_profit_total, contracts_all_count, new_customers, repeat_customers, inbound_calls_total')
          .gte('date', fetchRange.start).lte('date', fetchRange.end)
          .range(from, to)
      ),
      fetchAllPaginated<TransactionRow>((from, to) =>
        supabase.from('daily_report_transactions')
          .select('area_id, date, data_type, nomination_label, cast_name, revenue, used_at')
          .gte('date', fetchRange.start).lte('date', fetchRange.end)
          .range(from, to)
      ),
      fetchAllPaginated<StaffRow>((from, to) =>
        supabase.from('staff').select('id, name').range(from, to)
      ),
    ])
    setKpiRows(kpi)
    setTxRows(tx)
    setStaffRows(staff)

    const staffIds = staff.map(s => s.id)
    const shifts = staffIds.length > 0
      ? await fetchAllPaginated<ShiftRow>((from, to) =>
          supabase.from('shifts')
            .select('staff_id, store_id, date, start_time, end_time')
            .in('staff_id', staffIds)
            .neq('status', 'x')
            .gte('date', fetchRange.start).lte('date', fetchRange.end)
            .range(from, to)
        )
      : []
    setShiftRows(shifts)
    setLoading(false)
  }, [fetchRange])

  useEffect(() => { load() }, [load])

  const activePair: PeriodPair = tab === 'daily' ? dailyPair : tab === 'weekly' ? weeklyPair : monthlyPair

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">経営KPIダッシュボード</h1>
        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
          <span>データ基準日</span>
          <button
            onClick={() => setAsOf(d => addDays(d, -1))}
            disabled={asOf <= MIN_ASOF}
            className="px-2 py-1 rounded-md border border-gray-300 dark:border-gray-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-100 dark:hover:bg-gray-800"
            aria-label="前日"
          >
            ◀
          </button>
          <input
            type="date"
            value={asOf}
            min={MIN_ASOF}
            max={maxAsOf}
            onChange={e => {
              const v = e.target.value
              if (v) setAsOf(v < MIN_ASOF ? MIN_ASOF : v > maxAsOf ? maxAsOf : v)
            }}
            className="px-2 py-1 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          />
          <button
            onClick={() => setAsOf(d => addDays(d, 1))}
            disabled={asOf >= maxAsOf}
            className="px-2 py-1 rounded-md border border-gray-300 dark:border-gray-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-100 dark:hover:bg-gray-800"
            aria-label="翌日"
          >
            ▶
          </button>
          {asOf !== maxAsOf && (
            <button
              onClick={() => setAsOf(maxAsOf)}
              className="px-2.5 py-1 rounded-md border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              最新に戻す
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex gap-1">
          {([{ key: 'store', label: '①店舗KPI' }, { key: 'cast', label: '②キャスト比較' }, { key: 'weekday', label: '③④曜日分析' }] as const).map(v => (
            <button
              key={v.key}
              onClick={() => setView(v.key)}
              className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${
                view === v.key
                  ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100'
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>

        <div className="flex gap-1">
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
      </div>

      {loading ? (
        <div className="text-sm text-gray-500 dark:text-gray-400">読み込み中...</div>
      ) : view === 'store' ? (
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
            ※ データは{MIN_ASOF}以降の日次スナップショットを保持しています（錦糸町店のみ2026-03-12以降）。上部のデータ基準日を変更すると過去の期間に遡って閲覧できます。
          </div>
        </div>
      ) : view === 'cast' ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm text-gray-500 dark:text-gray-400">
              {activePair.label}（{activePair.current.start}〜{activePair.current.end}） vs {activePair.compareLabel}（{activePair.previous.start}〜{activePair.previous.end}）・売上降順
            </div>
            <select
              value={castAreaId ?? ''}
              onChange={e => setCastAreaId(e.target.value === '' ? null : Number(e.target.value))}
              className="px-2.5 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            >
              <option value="">全エリア</option>
              {AREAS.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>

          <CastComparisonTable
            txRows={txRows}
            staffRows={staffRows}
            shiftRows={shiftRows}
            areaId={castAreaId}
            pair={activePair}
          />

          <div className="text-xs text-gray-400 dark:text-gray-500">
            ※ 客単価・時間売上はCS3デイリーレポート明細（成約のみ）と出勤シフトの突き合わせによる概算です。出勤時間はキャスト名でstaffテーブルと名寄せしており、名前が一致しない場合は0時間扱いになります。
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm text-gray-500 dark:text-gray-400">
              {activePair.label}（{activePair.current.start}〜{activePair.current.end}）
            </div>
            <select
              value={castAreaId ?? ''}
              onChange={e => setCastAreaId(e.target.value === '' ? null : Number(e.target.value))}
              className="px-2.5 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            >
              <option value="">全エリア</option>
              {AREAS.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>

          <div>
            <h2 className="font-semibold text-gray-900 dark:text-white mb-3">③曜日・時間帯分析</h2>
            <HeatmapTable grid={computeHeatmap(txRows, shiftRows, castAreaId, activePair.current)} />
          </div>

          <div>
            <h2 className="font-semibold text-gray-900 dark:text-white mb-3">④女性×曜日</h2>
            <CastWeekdayMatrixTable byCast={computeCastWeekdayMatrix(txRows, castAreaId, activePair.current)} />
          </div>

          <div className="text-xs text-gray-400 dark:text-gray-500">
            ※ 曜日パターンは短期間だと偏りが出やすいため、週次〜月次タブでの参照を推奨します。シフトが24時を跨ぐ場合、24時以降の部分（翌日扱い）は稼働キャスト数の集計から除外される簡易実装です。
          </div>
        </div>
      )}
    </div>
  )
}
