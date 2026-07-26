'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { AREAS, todayString } from '@/lib/types'

interface SalesGoalRow {
  area_id: number
  monthly_goal_yen: number | null
}

interface AreaStat {
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

function GoalMeter({ percent, expectedPacePercent, state }: { percent: number; expectedPacePercent: number; state: MeterState }) {
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

function formatYen(n: number | null): string {
  return n == null ? '—' : `¥${Math.round(n).toLocaleString()}`
}

export default function SalesGoalPage() {
  const [goals, setGoals] = useState<Record<number, SalesGoalRow>>({})
  const [unitPrices, setUnitPrices] = useState<Record<number, number>>({})
  const [actualRevenues, setActualRevenues] = useState<Record<number, number>>({})
  const [editValues, setEditValues] = useState<Record<number, string>>({})
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const { data: goalRows } = await supabase.from('store_sales_goals').select('*')
    const goalMap: Record<number, SalesGoalRow> = {}
    for (const row of goalRows ?? []) {
      goalMap[row.area_id] = row
    }
    setGoals(goalMap)
    setEditValues(
      Object.fromEntries(
        AREAS.map(a => [a.id, goalMap[a.id]?.monthly_goal_yen?.toString() ?? ''])
      )
    )

    // 単価は損益分岐ライン（store_targets）の設定を流用する
    const { data: targetRows } = await supabase.from('store_targets').select('area_id, unit_price')
    const unitPriceMap: Record<number, number> = {}
    for (const row of targetRows ?? []) {
      unitPriceMap[row.area_id] = row.unit_price
    }
    setUnitPrices(unitPriceMap)

    // 過去日分: store_daily_actuals に積み上げ済みの日次スナップショットを合算
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
        liveMap[area.id] = count ?? 0
      })
    )

    const revenueMap: Record<number, number> = {}
    for (const area of AREAS) {
      const count = (archivedMap[area.id] ?? 0) + (liveMap[area.id] ?? 0)
      const unitPrice = unitPriceMap[area.id] ?? 9000
      revenueMap[area.id] = count * unitPrice
    }
    setActualRevenues(revenueMap)
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function saveGoal(areaId: number) {
    const raw = editValues[areaId]
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

  const stats: AreaStat[] = AREAS.map(area => {
    const monthlyGoal = goals[area.id]?.monthly_goal_yen ?? null
    const actualRevenue = actualRevenues[area.id] ?? 0
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
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-6">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">店舗別 売上目標・実績</h1>
        <div className="text-sm text-gray-500 dark:text-gray-400">
          {year}年{month}月・本日 {today}・月末まで残り <span className="font-semibold text-gray-700 dark:text-gray-200">{daysRemaining}</span> 日
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-gray-500 dark:text-gray-400">読み込み中...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {stats.map(s => {
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
                      value={editValues[s.areaId] ?? ''}
                      onChange={e => setEditValues(prev => ({ ...prev, [s.areaId]: e.target.value }))}
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
                    <GoalMeter
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
      )}
    </div>
  )
}
