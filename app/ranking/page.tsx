'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { AREAS } from '@/lib/types'

function getMonthOptions() {
  const options: { label: string; value: string }[] = []
  const now = new Date()
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    options.push({ label: `${y}年${d.getMonth() + 1}月`, value: `${y}-${m}` })
  }
  return options
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

function standardRank(values: number[], idx: number, higherIsBetter: boolean): number {
  const v = values[idx]
  return values.filter(o => (higherIsBetter ? o > v : o < v)).length + 1
}

interface StaffStats {
  staffId: number
  name: string
  honShimei: number
  shashinShimei: number
  totalRes: number
  honRate: number
  shiftMin: number
  courseMin: number
  kadoritsu: number
  honCourseMin: number
  shashinCourseMin: number
}

type RankingKey = keyof Pick<StaffStats, 'honShimei' | 'shashinShimei' | 'honRate' | 'kadoritsu' | 'shashinCourseMin' | 'honCourseMin'>

interface RankingDef {
  key: RankingKey
  label: string
  higherIsBetter: boolean
  format: (v: number) => string
}

const RANKINGS: RankingDef[] = [
  { key: 'honShimei',       label: '本指名数',            higherIsBetter: true, format: v => `${v}件` },
  { key: 'shashinShimei',   label: '写メ指名数',           higherIsBetter: true, format: v => `${v}件` },
  { key: 'honRate',         label: '本指名率',             higherIsBetter: true, format: v => `${(v * 100).toFixed(1)}%` },
  { key: 'kadoritsu',       label: '稼働率',               higherIsBetter: true, format: v => `${(v * 100).toFixed(1)}%` },
  { key: 'shashinCourseMin', label: '写メ指名コース総時間', higherIsBetter: true, format: v => `${v}分` },
  { key: 'honCourseMin',    label: '本指名コース総時間',    higherIsBetter: true, format: v => `${v}分` },
]

export default function RankingPage() {
  const monthOptions = getMonthOptions()
  const [month, setMonth] = useState(monthOptions[0].value)
  const [areaId, setAreaId] = useState(1)
  const [section, setSection] = useState<'M' | 'E'>('M')
  const [stats, setStats] = useState<StaffStats[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const area = AREAS.find(a => a.id === areaId)!
        const storeId = section === 'M' ? area.storeIds[0] : area.storeIds[1]
        const dateFrom = `${month}-01`
        const dateTo = (() => {
          const [y, m] = month.split('-').map(Number)
          const last = new Date(y, m, 0).getDate()
          return `${month}-${String(last).padStart(2, '0')}`
        })()

        const [reservations, shifts] = await Promise.all([
          fetchAllPaginated<any>((from, to) =>
            supabase.from('reservations')
              .select('staff_id, nomination_type, course_duration, staff(name)')
              .eq('store_id', storeId)
              .gte('date', dateFrom)
              .lte('date', dateTo)
              .not('staff_id', 'is', null)
              .range(from, to)
          ),
          fetchAllPaginated<any>((from, to) =>
            supabase.from('shifts')
              .select('staff_id, start_time, end_time, staff(name)')
              .eq('store_id', storeId)
              .gte('date', dateFrom)
              .lte('date', dateTo)
              .range(from, to)
          ),
        ])

        if (cancelled) return

        const staffMap = new Map<number, StaffStats>()

        const getOrCreate = (id: number, name: string) => {
          if (!staffMap.has(id)) {
            staffMap.set(id, {
              staffId: id, name,
              honShimei: 0, shashinShimei: 0, totalRes: 0, honRate: 0,
              shiftMin: 0, courseMin: 0, kadoritsu: 0,
              honCourseMin: 0, shashinCourseMin: 0,
            })
          }
          return staffMap.get(id)!
        }

        for (const r of reservations) {
          const s = getOrCreate(r.staff_id, r.staff?.name ?? `#${r.staff_id}`)
          s.totalRes++
          const dur = r.course_duration ?? 0
          s.courseMin += dur
          if (r.nomination_type?.includes('本')) { s.honShimei++; s.honCourseMin += dur }
          if (r.nomination_type?.includes('写')) { s.shashinShimei++; s.shashinCourseMin += dur }
        }

        for (const sh of shifts) {
          const s = getOrCreate(sh.staff_id, sh.staff?.name ?? `#${sh.staff_id}`)
          s.shiftMin += (sh.end_time - sh.start_time) * 60
        }

        const computed: StaffStats[] = Array.from(staffMap.values())
          .filter(s => !(s.shiftMin === 0 && s.totalRes === 0))
          .map(s => ({
            ...s,
            honRate: s.totalRes > 0 ? s.honShimei / s.totalRes : 0,
            kadoritsu: s.shiftMin > 0 ? s.courseMin / s.shiftMin : 0,
          }))

        setStats(computed)
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [month, areaId, section])

  const rankMaps = RANKINGS.map(def => {
    const values = stats.map(s => s[def.key])
    return new Map(stats.map((s, i) => [s.staffId, standardRank(values, i, def.higherIsBetter)]))
  })

  const sogoScores = stats.map(s => rankMaps.reduce((sum, m) => sum + (m.get(s.staffId) ?? 0), 0))
  const sogoRanked = stats
    .map((s, i) => ({ ...s, sogoScore: sogoScores[i], sogoRank: standardRank(sogoScores, i, false) }))
    .sort((a, b) => a.sogoRank - b.sogoRank)

  return (
    <div className="min-h-screen bg-gray-950 text-white pt-14">
      <div className="max-w-7xl mx-auto px-4 py-6">
        <h1 className="text-xl font-bold text-gray-100 mb-6">キャストランキング</h1>

        <div className="flex flex-wrap gap-3 mb-6">
          <select
            value={month}
            onChange={e => setMonth(e.target.value)}
            className="bg-gray-800 border border-gray-700 text-gray-200 rounded px-3 py-1.5 text-sm"
          >
            {monthOptions.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>

          <div className="flex gap-1">
            {AREAS.map(area => (
              <button
                key={area.id}
                onClick={() => setAreaId(area.id)}
                className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                  areaId === area.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                {area.name}
              </button>
            ))}
          </div>

          <div className="flex gap-1">
            {(['M', 'E'] as const).map(s => (
              <button
                key={s}
                onClick={() => setSection(s)}
                className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                  section === s
                    ? 'bg-pink-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                {s === 'M' ? 'M性感' : 'エステ'}
              </button>
            ))}
          </div>
        </div>

        {error && <div className="text-red-400 text-sm mb-4">エラー: {error}</div>}

        {loading ? (
          <div className="text-gray-400 text-sm">読み込み中...</div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
              {RANKINGS.map((def, ri) => {
                const rankMap = rankMaps[ri]
                const sorted = [...stats].sort((a, b) => (rankMap.get(a.staffId) ?? 99) - (rankMap.get(b.staffId) ?? 99))
                return (
                  <div key={def.key} className="bg-gray-900 rounded-lg p-4">
                    <h2 className="text-sm font-semibold text-gray-300 mb-3 border-b border-gray-700 pb-2">{def.label}</h2>
                    {sorted.length === 0 ? (
                      <div className="text-gray-600 text-xs text-center py-2">データなし</div>
                    ) : (
                      <table className="w-full text-sm">
                        <tbody>
                          {sorted.map(s => (
                            <tr key={s.staffId} className="border-b border-gray-800 last:border-0">
                              <td className="py-1 pr-2 text-gray-500 text-xs w-6">{rankMap.get(s.staffId)}</td>
                              <td className="py-1 text-gray-200 truncate max-w-0 w-full">{s.name}</td>
                              <td className="py-1 text-right text-gray-400 text-xs whitespace-nowrap pl-2">{def.format(s[def.key])}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )
              })}
            </div>

            <div className="bg-gray-900 rounded-lg p-4">
              <h2 className="text-sm font-semibold text-gray-300 mb-3 border-b border-gray-700 pb-2">総合ランキング</h2>
              {sogoRanked.length === 0 ? (
                <div className="text-gray-600 text-xs text-center py-4">データなし</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-gray-500 border-b border-gray-700">
                        <th className="pb-2 pr-2 text-left w-6">順位</th>
                        <th className="pb-2 pr-4 text-left">名前</th>
                        {RANKINGS.map(def => (
                          <th key={def.key} className="pb-2 px-2 text-center whitespace-nowrap">{def.label}</th>
                        ))}
                        <th className="pb-2 pl-3 text-center">合計</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sogoRanked.map(s => (
                        <tr key={s.staffId} className="border-b border-gray-800 last:border-0 hover:bg-gray-800/40">
                          <td className="py-1.5 pr-2 text-gray-300 text-xs font-semibold">{s.sogoRank}</td>
                          <td className="py-1.5 pr-4 text-gray-200 font-medium whitespace-nowrap">{s.name}</td>
                          {RANKINGS.map((_, ri) => (
                            <td key={ri} className="py-1.5 px-2 text-center text-gray-400 text-xs">
                              {rankMaps[ri].get(s.staffId)}位
                            </td>
                          ))}
                          <td className="py-1.5 pl-3 text-center text-yellow-400 font-mono text-xs">{s.sogoScore}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
