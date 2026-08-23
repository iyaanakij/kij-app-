'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { AREAS, todayString } from '@/lib/types'

interface StoreTarget {
  area_id: number
  daily_target_count: number | null
  unit_price: number
}

interface SalesGoalRow {
  area_id: number
  monthly_goal_yen: number | null
}

interface BreakEvenStat {
  areaId: number
  name: string
  dailyTarget: number | null
  unitPrice: number
  monthlyTargetCount: number | null
  monthlyTargetRevenue: number | null
  actualCount: number
  actualRevenue: number
  remainingCount: number | null
  remainingRevenue: number | null
  expectedPaceCount: number | null
  paceGapCount: number | null
}

interface SalesGoalStat {
  areaId: number
  name: string
  monthlyGoal: number | null
  actualRevenue: number
  remainingRevenue: number | null
  simpleDailyAvg: number | null
  requiredDailyPace: number | null
  expectedPaceRevenue: number | null
  paceGapRevenue: number | null
}

type MeterState = 'achieved' | 'onPace' | 'behind'

const METER_STYLES: Record<MeterState, { track: string; fill: string }> = {
  achieved: { track: 'bg-green-100 dark:bg-green-900/30', fill: 'bg-green-500 dark:bg-green-400' },
  onPace: { track: 'bg-blue-100 dark:bg-blue-900/30', fill: 'bg-blue-500 dark:bg-blue-400' },
  behind: { track: 'bg-amber-100 dark:bg-amber-900/30', fill: 'bg-amber-500 dark:bg-amber-400' },
}

function Meter({ percent, expectedPacePercent, state }: { percent: number; expectedPacePercent: number; state: MeterState }) {
  const style = METER_STYLES[state]
  const fillWidth = Math.min(100, Math.max(0, percent))
  const paceLeft = Math.min(100, Math.max(0, expectedPacePercent))
  return (
    <div className="mt-3">
      <div className={`relative h-3 rounded-full overflow-hidden ${style.track}`}>
        <div className={`h-full rounded-full ${style.fill}`} style={{ width: `${fillWidth}%` }} />
        <div
          className="absolute top-0 h-full w-[2px] bg-gray-500/60 dark:bg-gray-300/60"
          style={{ left: `${paceLeft}%` }}
          title="本日時点のペース目安"
        />
      </div>
      <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{percent.toFixed(0)}% 達成（線=本日時点のペース目安）</div>
    </div>
  )
}

const today = todayString()
const [year, month, day] = today.split('-').map(Number)
const daysInMonth = new Date(year, month, 0).getDate()
const daysRemaining = daysInMonth - day + 1
const monthStart = `${year}-${String(month).padStart(2, '0')}-01`
const yesterday = (() => {
  const d = new Date(year, month - 1, day - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
})()

function formatCount(n: number | null): string {
  return n == null ? '—' : n.toFixed(1)
}

function formatYen(n: number | null): string {
  return n == null ? '—' : `¥${Math.round(n).toLocaleString()}`
}

type Tab = 'goal' | 'breakeven'

export default function SalesGoalPage() {
  const [tab, setTab] = useState<Tab>('goal')

  const [targets, setTargets] = useState<Record<number, StoreTarget>>({})
  const [goals, setGoals] = useState<Record<number, SalesGoalRow>>({})
  const [actualCounts, setActualCounts] = useState<Record<number, number>>({})
  const [editTargetValues, setEditTargetValues] = useState<Record<number, string>>({})
  const [editGoalValues, setEditGoalValues] = useState<Record<number, string>>({})
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: targetRows }, { data: goalRows }] = await Promise.all([
      supabase.from('store_targets').select('*'),
      supabase.from('store_sales_goals').select('*'),
    ])

    const targetMap: Record<number, StoreTarget> = {}
    for (const row of targetRows ?? []) {
      targetMap[row.area_id] = row
    }
    setTargets(targetMap)
    setEditTargetValues(
      Object.fromEntries(
        AREAS.map(a => [a.id, targetMap[a.id]?.daily_target_count?.toString() ?? ''])
      )
    )

    const goalMap: Record<number, SalesGoalRow> = {}
    for (const row of goalRows ?? []) {
      goalMap[row.area_id] = row
    }
    setGoals(goalMap)
    setEditGoalValues(
      Object.fromEntries(
        AREAS.map(a => [a.id, goalMap[a.id]?.monthly_goal_yen?.toString() ?? ''])
      )
    )

    // 過去日分: store_daily_actuals に積み上げ済みの日次スナップショットを合算
    // （reservationsは当日+未来分しか保持されないため、過去日はここから拾う）
    const { data: archivedRows } = await supabase
      .from('store_daily_actuals')
      .select('area_id, count')
      .gte('date', monthStart)
      .lte('date', yesterday)
    const archivedMap: Record<number, number> = {}
    for (const row of archivedRows ?? []) {
      archivedMap[row.area_id] = (archivedMap[row.area_id] ?? 0) + row.count
    }

    // 当日分: reservationsのライブ件数
    const liveMap: Record<number, number> = {}
    await Promise.all(
      AREAS.map(async area => {
        const { count } = await supabase
          .from('reservations')
          .select('id', { count: 'exact', head: true })
          .in('store_id', area.storeIds)
          .eq('date', today)
          .neq('status', 'cancelled')
        liveMap[area.id] = count ?? 0
      })
    )

    const countMap: Record<number, number> = {}
    for (const area of AREAS) {
      countMap[area.id] = (archivedMap[area.id] ?? 0) + (liveMap[area.id] ?? 0)
    }
    setActualCounts(countMap)
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function saveTarget(areaId: number) {
    const raw = editTargetValues[areaId]
    const value = raw === '' ? null : Number(raw)
    if (value !== null && Number.isNaN(value)) return
    const unitPrice = targets[areaId]?.unit_price ?? 9000
    const { error } = await supabase
      .from('store_targets')
      .upsert({ area_id: areaId, daily_target_count: value, unit_price: unitPrice })
    if (error) {
      alert(`保存に失敗しました: ${error.message}`)
      return
    }
    setTargets(prev => ({
      ...prev,
      [areaId]: { area_id: areaId, daily_target_count: value, unit_price: unitPrice },
    }))
  }

  async function saveGoal(areaId: number) {
    const raw = editGoalValues[areaId]
    const value = raw === '' ? null : Number(raw)
    if (value !== null && Number.isNaN(value)) return
    const { error } = await supabase
      .from('store_sales_goals')
      .upsert({ area_id: areaId, monthly_goal_yen: value })
    if (error) {
      alert(`保存に失敗しました: ${error.message}`)
      return
    }
    setGoals(prev => ({
      ...prev,
      [areaId]: { area_id: areaId, monthly_goal_yen: value },
    }))
  }

  const breakEvenStats: BreakEvenStat[] = AREAS.map(area => {
    const target = targets[area.id]
    const dailyTarget = target?.daily_target_count ?? null
    const unitPrice = target?.unit_price ?? 9000
    const actualCount = actualCounts[area.id] ?? 0
    const actualRevenue = actualCount * unitPrice
    const monthlyTargetCount = dailyTarget != null ? dailyTarget * daysInMonth : null
    const monthlyTargetRevenue = monthlyTargetCount != null ? monthlyTargetCount * unitPrice : null
    const remainingCount = monthlyTargetCount != null ? monthlyTargetCount - actualCount : null
    const remainingRevenue = remainingCount != null ? remainingCount * unitPrice : null
    const expectedPaceCount = dailyTarget != null ? dailyTarget * day : null
    const paceGapCount = expectedPaceCount != null ? expectedPaceCount - actualCount : null
    return {
      areaId: area.id,
      name: area.name,
      dailyTarget,
      unitPrice,
      monthlyTargetCount,
      monthlyTargetRevenue,
      actualCount,
      actualRevenue,
      remainingCount,
      remainingRevenue,
      expectedPaceCount,
      paceGapCount,
    }
  })

  const salesGoalStats: SalesGoalStat[] = AREAS.map(area => {
    const unitPrice = targets[area.id]?.unit_price ?? 9000
    const actualCount = actualCounts[area.id] ?? 0
    const actualRevenue = actualCount * unitPrice
    const monthlyGoal = goals[area.id]?.monthly_goal_yen ?? null
    const remainingRevenue = monthlyGoal != null ? monthlyGoal - actualRevenue : null
    const simpleDailyAvg = monthlyGoal != null ? monthlyGoal / daysInMonth : null
    const requiredDailyPace =
      monthlyGoal != null ? (remainingRevenue != null && remainingRevenue > 0 ? remainingRevenue / daysRemaining : 0) : null
    const expectedPaceRevenue = monthlyGoal != null ? (monthlyGoal * day) / daysInMonth : null
    const paceGapRevenue = expectedPaceRevenue != null ? expectedPaceRevenue - actualRevenue : null
    return {
      areaId: area.id,
      name: area.name,
      monthlyGoal,
      actualRevenue,
      remainingRevenue,
      simpleDailyAvg,
      requiredDailyPace,
      expectedPaceRevenue,
      paceGapRevenue,
    }
  })

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">売上目標</h1>
        <div className="text-sm text-gray-500 dark:text-gray-400">
          {year}年{month}月・本日 {today}・月末まで残り <span className="font-semibold text-gray-700 dark:text-gray-200">{daysRemaining}</span> 日
        </div>
      </div>

      <div className="flex gap-1 mb-6">
        {(
          [
            { key: 'goal', label: '売上目標' },
            { key: 'breakeven', label: '損益分岐ライン' },
          ] as const
        ).map(t => (
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
      ) : tab === 'goal' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {salesGoalStats.map(s => {
            const achieved = s.remainingRevenue != null && s.remainingRevenue <= 0
            return (
              <div
                key={s.areaId}
                className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 shadow-sm"
              >
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-semibold text-gray-900 dark:text-white">{s.name}</h2>
                  <div className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400">
                    月間目標
                    <span>¥</span>
                    <input
                      type="number"
                      step="10000"
                      value={editGoalValues[s.areaId] ?? ''}
                      onChange={e => setEditGoalValues(prev => ({ ...prev, [s.areaId]: e.target.value }))}
                      onBlur={() => saveGoal(s.areaId)}
                      placeholder="未設定"
                      className="w-28 px-1.5 py-0.5 text-right rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <div>
                    <div className="text-gray-500 dark:text-gray-400">単純日割り目安</div>
                    <div className="font-medium text-gray-900 dark:text-white">{formatYen(s.simpleDailyAvg)}</div>
                  </div>
                  <div>
                    <div className="text-gray-500 dark:text-gray-400">実績売上（今月）</div>
                    <div className="font-medium text-gray-900 dark:text-white">{formatYen(s.actualRevenue)}</div>
                  </div>
                  <div>
                    <div className="text-gray-500 dark:text-gray-400">残り日数で必要な1日あたり</div>
                    <div className="font-medium text-gray-900 dark:text-white">{formatYen(s.requiredDailyPace)}</div>
                  </div>
                  <div>
                    <div className="text-gray-500 dark:text-gray-400">残り金額</div>
                    <div className="font-medium text-gray-900 dark:text-white">{formatYen(s.remainingRevenue)}</div>
                  </div>
                </div>

                {s.monthlyGoal != null && (
                  <>
                    <Meter
                      percent={(s.actualRevenue / s.monthlyGoal) * 100}
                      expectedPacePercent={((s.expectedPaceRevenue ?? 0) / s.monthlyGoal) * 100}
                      state={achieved ? 'achieved' : s.actualRevenue >= (s.expectedPaceRevenue ?? 0) ? 'onPace' : 'behind'}
                    />
                    <div className="mt-1 text-xs">
                      {s.paceGapRevenue != null && s.paceGapRevenue > 0 ? (
                        <span className="text-amber-600 dark:text-amber-400">
                          本日時点のペース目安まで あと <span className="font-semibold">{formatYen(s.paceGapRevenue)}</span>
                        </span>
                      ) : (
                        <span className="text-blue-600 dark:text-blue-400 font-medium">本日時点のペース目安 達成中</span>
                      )}
                    </div>
                  </>
                )}

                <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between">
                  {s.monthlyGoal == null ? (
                    <span className="text-sm text-gray-400 dark:text-gray-500">売上目標未設定</span>
                  ) : achieved ? (
                    <span className="text-sm font-semibold text-green-600 dark:text-green-400">月間目標達成 🎉</span>
                  ) : (
                    <div className="text-sm">
                      <span className="text-gray-500 dark:text-gray-400">あと </span>
                      <span className="font-semibold text-orange-600 dark:text-orange-400">{formatYen(s.remainingRevenue)}</span>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {breakEvenStats.map(s => {
            const achieved = s.remainingCount != null && s.remainingCount <= 0
            return (
              <div
                key={s.areaId}
                className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 shadow-sm"
              >
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-semibold text-gray-900 dark:text-white">{s.name}</h2>
                  <div className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400">
                    日次分岐
                    <input
                      type="number"
                      step="0.1"
                      value={editTargetValues[s.areaId] ?? ''}
                      onChange={e => setEditTargetValues(prev => ({ ...prev, [s.areaId]: e.target.value }))}
                      onBlur={() => saveTarget(s.areaId)}
                      placeholder="未設定"
                      className="w-16 px-1.5 py-0.5 text-right rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                    />
                    本/日
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <div>
                    <div className="text-gray-500 dark:text-gray-400">月間分岐本数</div>
                    <div className="font-medium text-gray-900 dark:text-white">{formatCount(s.monthlyTargetCount)}本</div>
                  </div>
                  <div>
                    <div className="text-gray-500 dark:text-gray-400">月間分岐売上</div>
                    <div className="font-medium text-gray-900 dark:text-white">{formatYen(s.monthlyTargetRevenue)}</div>
                  </div>
                  <div>
                    <div className="text-gray-500 dark:text-gray-400">実績本数（今月）</div>
                    <div className="font-medium text-gray-900 dark:text-white">{s.actualCount}本</div>
                  </div>
                  <div>
                    <div className="text-gray-500 dark:text-gray-400">実績売上（今月）</div>
                    <div className="font-medium text-gray-900 dark:text-white">{formatYen(s.actualRevenue)}</div>
                  </div>
                </div>

                {s.dailyTarget != null && s.monthlyTargetCount && (
                  <>
                    <Meter
                      percent={(s.actualCount / s.monthlyTargetCount) * 100}
                      expectedPacePercent={((s.expectedPaceCount ?? 0) / s.monthlyTargetCount) * 100}
                      state={achieved ? 'achieved' : s.actualCount >= (s.expectedPaceCount ?? 0) ? 'onPace' : 'behind'}
                    />
                    <div className="mt-1 text-xs">
                      {s.paceGapCount != null && s.paceGapCount > 0 ? (
                        <span className="text-amber-600 dark:text-amber-400">
                          本日時点のペース目安まで あと <span className="font-semibold">{formatCount(s.paceGapCount)}本</span>
                        </span>
                      ) : (
                        <span className="text-blue-600 dark:text-blue-400 font-medium">本日時点のペース目安 達成中</span>
                      )}
                    </div>
                  </>
                )}

                <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between">
                  {s.dailyTarget == null ? (
                    <span className="text-sm text-gray-400 dark:text-gray-500">分岐ライン未設定</span>
                  ) : achieved ? (
                    <span className="text-sm font-semibold text-green-600 dark:text-green-400">損益分岐ライン到達 🎉</span>
                  ) : (
                    <div className="text-sm">
                      <span className="text-gray-500 dark:text-gray-400">あと </span>
                      <span className="font-semibold text-orange-600 dark:text-orange-400">{formatCount(s.remainingCount)}本</span>
                      <span className="text-gray-500 dark:text-gray-400"> / </span>
                      <span className="font-semibold text-orange-600 dark:text-orange-400">{formatYen(s.remainingRevenue)}</span>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
