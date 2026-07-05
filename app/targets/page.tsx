'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { AREAS, todayString } from '@/lib/types'

interface StoreTarget {
  area_id: number
  daily_target_count: number | null
  unit_price: number
}

interface AreaStat {
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
}

type MeterState = 'achieved' | 'onPace' | 'behind'

const METER_STYLES: Record<MeterState, { track: string; fill: string }> = {
  achieved: { track: 'bg-green-100 dark:bg-green-900/30', fill: 'bg-green-500 dark:bg-green-400' },
  onPace: { track: 'bg-blue-100 dark:bg-blue-900/30', fill: 'bg-blue-500 dark:bg-blue-400' },
  behind: { track: 'bg-amber-100 dark:bg-amber-900/30', fill: 'bg-amber-500 dark:bg-amber-400' },
}

function TargetMeter({ percent, expectedPacePercent, state }: { percent: number; expectedPacePercent: number; state: MeterState }) {
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

export default function TargetsPage() {
  const [targets, setTargets] = useState<Record<number, StoreTarget>>({})
  const [actuals, setActuals] = useState<Record<number, number>>({})
  const [editValues, setEditValues] = useState<Record<number, string>>({})
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const { data: targetRows } = await supabase.from('store_targets').select('*')
    const targetMap: Record<number, StoreTarget> = {}
    for (const row of targetRows ?? []) {
      targetMap[row.area_id] = row
    }
    setTargets(targetMap)
    setEditValues(
      Object.fromEntries(
        AREAS.map(a => [a.id, targetMap[a.id]?.daily_target_count?.toString() ?? ''])
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
        liveMap[area.id] = count ?? 0
      })
    )

    const actualMap: Record<number, number> = {}
    for (const area of AREAS) {
      actualMap[area.id] = (archivedMap[area.id] ?? 0) + (liveMap[area.id] ?? 0)
    }
    setActuals(actualMap)
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function saveTarget(areaId: number) {
    const raw = editValues[areaId]
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

  const stats: AreaStat[] = AREAS.map(area => {
    const target = targets[area.id]
    const dailyTarget = target?.daily_target_count ?? null
    const unitPrice = target?.unit_price ?? 9000
    const actualCount = actuals[area.id] ?? 0
    const actualRevenue = actualCount * unitPrice
    const monthlyTargetCount = dailyTarget != null ? dailyTarget * daysInMonth : null
    const monthlyTargetRevenue = monthlyTargetCount != null ? monthlyTargetCount * unitPrice : null
    const remainingCount = monthlyTargetCount != null ? monthlyTargetCount - actualCount : null
    const remainingRevenue = remainingCount != null ? remainingCount * unitPrice : null
    const expectedPaceCount = dailyTarget != null ? dailyTarget * day : null
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
    }
  })

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-6">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">店舗別 損益分岐ライン・実績</h1>
        <div className="text-sm text-gray-500 dark:text-gray-400">
          {year}年{month}月・本日 {today}・月末まで残り <span className="font-semibold text-gray-700 dark:text-gray-200">{daysRemaining}</span> 日
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-gray-500 dark:text-gray-400">読み込み中...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {stats.map(s => {
            const achieved = s.remainingCount != null && s.remainingCount <= 0
            return (
              <div
                key={s.areaId}
                className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 shadow-sm"
              >
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-semibold text-gray-900 dark:text-white">{s.name}</h2>
                  <div className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400">
                    日次目標
                    <input
                      type="number"
                      step="0.1"
                      value={editValues[s.areaId] ?? ''}
                      onChange={e => setEditValues(prev => ({ ...prev, [s.areaId]: e.target.value }))}
                      onBlur={() => saveTarget(s.areaId)}
                      placeholder="未設定"
                      className="w-16 px-1.5 py-0.5 text-right rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                    />
                    本/日
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <div>
                    <div className="text-gray-500 dark:text-gray-400">月間目標本数</div>
                    <div className="font-medium text-gray-900 dark:text-white">{formatCount(s.monthlyTargetCount)}本</div>
                  </div>
                  <div>
                    <div className="text-gray-500 dark:text-gray-400">月間目標売上</div>
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
                  <TargetMeter
                    percent={(s.actualCount / s.monthlyTargetCount) * 100}
                    expectedPacePercent={((s.expectedPaceCount ?? 0) / s.monthlyTargetCount) * 100}
                    state={achieved ? 'achieved' : s.actualCount >= (s.expectedPaceCount ?? 0) ? 'onPace' : 'behind'}
                  />
                )}

                <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between">
                  {s.dailyTarget == null ? (
                    <span className="text-sm text-gray-400 dark:text-gray-500">目標未設定</span>
                  ) : achieved ? (
                    <span className="text-sm font-semibold text-green-600 dark:text-green-400">月間目標達成 🎉</span>
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
