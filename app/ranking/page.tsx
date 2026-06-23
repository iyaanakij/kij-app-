'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { AREAS } from '@/lib/types'
import { getAuthHeaders } from '@/lib/auth'

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

function lastBatchStorageKey(month: string): string {
  return `kij_ranking_last_batch_completed_at_${month}`
}

function readLastBatchCompletedAt(month: string): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(lastBatchStorageKey(month))
}

function formatBatchTime(iso: string): string {
  return new Date(iso).toLocaleString('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

// area → CS3 shop_id
const AREA_TO_SHOP: Record<number, string> = {
  1: '111702', // 成田
  2: '111703', // 千葉
  3: '111701', // 西船橋
  4: '111704', // 錦糸町
}

interface StaffStats {
  staffId: number
  name: string
  // CS3成績（正確な値）
  honShimei: number
  shashinShimei: number
  totalRes: number
  honRate: number
  // コース時間
  courseMin: number
  honCourseMin: number
  nonHonCourseMin: number
  // シフト由来
  shiftMin: number
  kadoritsu: number
  // CS3データの有無
  hasCs3: boolean
}

interface Cs3PerformanceRow {
  staff_id: number | null
  cast_name: string
  m_shashin: number
  m_free: number
  m_hon_total: number
  m_total: number
  m_hon_course_min?: number | null
  m_shashin_course_min?: number | null
  e_shashin: number
  e_free: number
  e_hon_total: number
  e_total: number
  e_hon_course_min?: number | null
  e_shashin_course_min?: number | null
}

interface Cs3ReservationRow {
  staff_id: number
  store_id: number
  nomination_type: string | null
  course_duration: number | null
  notes: string | null
  staff?: { name: string } | null
}

interface ShiftRow {
  staff_id: number
  date: string
  start_time: number
  end_time: number
  status: 'normal' | 'x'
}

type RankingKey = keyof Pick<StaffStats, 'honShimei' | 'shashinShimei' | 'honRate' | 'kadoritsu' | 'nonHonCourseMin' | 'honCourseMin'>

interface RankingDef {
  key: RankingKey
  label: string
  higherIsBetter: boolean
  format: (v: number) => string
}

const RANKINGS: RankingDef[] = [
  { key: 'honShimei',        label: '本指名数',            higherIsBetter: true, format: v => `${v}件` },
  { key: 'shashinShimei',    label: '写真指名数',           higherIsBetter: true, format: v => `${v}件` },
  { key: 'honRate',          label: '本指名率',             higherIsBetter: true, format: v => `${(v * 100).toFixed(1)}%` },
  { key: 'kadoritsu',        label: '稼働率',               higherIsBetter: true, format: v => `${(v * 100).toFixed(1)}%` },
  { key: 'nonHonCourseMin',  label: '写真指名＋フリーコース総時間', higherIsBetter: true, format: v => `${v}分` },
  { key: 'honCourseMin',     label: '本指名コース総時間',    higherIsBetter: true, format: v => `${v}分` },
]

type BatchJobStatus = 'pending' | 'running' | 'done' | 'error'
interface BatchJob { id: number; year: number; month: number; status: BatchJobStatus; message?: string; completed_at?: string | null }

export default function RankingPage() {
  useEffect(() => { document.title = 'ランキング | KIJ管理' }, [])
  const monthOptions = getMonthOptions()
  const [month, setMonth] = useState(monthOptions[0].value)
  const [areaId, setAreaId] = useState(1)
  const [section, setSection] = useState<'M' | 'E'>('M')
  const [stats, setStats] = useState<StaffStats[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cs3Available, setCs3Available] = useState(false)
  const [cs3CourseAvailable, setCs3CourseAvailable] = useState(false)

  const [batchJob, setBatchJob] = useState<BatchJob | null>(null)
  const [batchError, setBatchError] = useState<string | null>(null)
  const [lastBatchCompletedAt, setLastBatchCompletedAt] = useState<string | null>(() => readLastBatchCompletedAt(monthOptions[0].value))
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const reloadRef = useRef<(() => void) | null>(null)

  function rememberBatchCompletedAt(targetMonth: string, completedAt: string) {
    setLastBatchCompletedAt(completedAt)
    localStorage.setItem(lastBatchStorageKey(targetMonth), completedAt)
  }

  useEffect(() => {
    let cancelled = false

    async function load() {
      reloadRef.current = () => { if (!cancelled) load() }
      setLoading(true)
      setError(null)
      try {
        const area = AREAS.find(a => a.id === areaId)!
        const storeId = section === 'M' ? area.storeIds[0] : area.storeIds[1]
        const [y, m] = month.split('-').map(Number)
        const dateFrom = `${month}-01`
        const dateTo = (() => {
          const last = new Date(y, m, 0).getDate()
          return `${month}-${String(last).padStart(2, '0')}`
        })()

        // ── CS3成績データ（ランキング集計の正ソース）──
        const shopCode = AREA_TO_SHOP[areaId]
        let hasCs3CourseColumns = true
        const initialCs3 = await supabase
          .from('cs3_cast_performance')
          .select('staff_id, cast_name, m_shashin, m_free, m_hon_total, m_total, m_hon_course_min, m_shashin_course_min, e_shashin, e_free, e_hon_total, e_total, e_hon_course_min, e_shashin_course_min')
          .eq('shop_id', shopCode)
          .eq('year', y)
          .eq('month', m)
        let cs3Rows: Cs3PerformanceRow[] | null = initialCs3.data
        let cs3Error = initialCs3.error
        if (cs3Error && /shashin_course_min/i.test(cs3Error.message)) {
          hasCs3CourseColumns = false
          const retry = await supabase
            .from('cs3_cast_performance')
            .select('staff_id, cast_name, m_shashin, m_free, m_hon_total, m_total, m_hon_course_min, e_shashin, e_free, e_hon_total, e_total, e_hon_course_min')
            .eq('shop_id', shopCode)
            .eq('year', y)
            .eq('month', m)
          cs3Rows = retry.data
          cs3Error = retry.error
        }
        if (cs3Error) throw new Error(`CS3成績データ取得失敗: ${cs3Error.message}`)

        if (cancelled) return

        const cs3Data = cs3Rows ?? []
        const hasCs3 = cs3Data.length > 0
        const useCs3Course = hasCs3 && hasCs3CourseColumns


        // ── 予約管理フォールバック（CS3成績未取得月・旧DB用）──
        const reservations = await fetchAllPaginated<Cs3ReservationRow>((from, to) =>
          supabase.from('reservations')
            .select('staff_id, store_id, nomination_type, course_duration, notes, staff(name)')
            .eq('store_id', storeId)
            .gte('date', dateFrom)
            .lte('date', dateTo)
            .not('staff_id', 'is', null)
            .like('notes', 'CS3:%')
            .range(from, to)
        )

        if (cancelled) return

        // CS3予約IDで重複排除
        const seenNotes = new Set<string>()
        const dedupedRes = reservations.filter((r) => {
          if (!r.notes?.startsWith('CS3:')) return true
          if (seenNotes.has(r.notes)) return false
          seenNotes.add(r.notes)
          return true
        })

        const staffMap = new Map<number, StaffStats>()

        function getOrCreate(id: number, name: string): StaffStats {
          if (!staffMap.has(id)) {
            staffMap.set(id, {
              staffId: id, name,
              honShimei: 0, shashinShimei: 0, totalRes: 0, honRate: 0,
              shiftMin: 0, courseMin: 0, kadoritsu: 0,
              honCourseMin: 0, nonHonCourseMin: 0,
              hasCs3: false,
            })
          }
          return staffMap.get(id)!
        }

        if (!useCs3Course) {
          // nomination_typeは"Ｍ指名"/"Ｍ写"/"Ｍフリー"形式で、本指名に'本'は含まれない
          for (const r of dedupedRes) {
            const s = getOrCreate(r.staff_id, r.staff?.name ?? `#${r.staff_id}`)
            const dur = r.course_duration ?? 0
            s.courseMin += dur
            const isFree    = r.nomination_type?.includes('フリー') ?? false
            if (!isFree && r.nomination_type && !r.nomination_type.includes('写')) s.honCourseMin += dur
          }
        }

        // CS3が取得済みなら全CS3キャストをstaffMapに追加し、ランキング集計値をCS3値で統一
        if (hasCs3) {
          let tempIdCounter = -1
          for (const r of cs3Data) {
            const honCount     = section === 'M' ? r.m_hon_total : r.e_hon_total
            const shashinCount = section === 'M' ? r.m_shashin   : r.e_shashin
            const total        = section === 'M' ? r.m_total      : r.e_total
            if (total === 0) continue  // このsectionで活動なし

            const sid  = r.staff_id ?? tempIdCounter--
            const name = (r.staff_id ? staffMap.get(r.staff_id)?.name : undefined) ?? r.cast_name
            const s    = getOrCreate(sid, name)
            s.honShimei     = honCount
            s.shashinShimei = shashinCount
            s.totalRes      = total
            s.hasCs3        = true
            const honCourseMin = section === 'M' ? (r.m_hon_course_min ?? 0) : (r.e_hon_course_min ?? 0)
            const nonHonCourseMin = useCs3Course
              ? (section === 'M' ? (r.m_shashin_course_min ?? 0) : (r.e_shashin_course_min ?? 0))
              : 0
            s.honCourseMin = honCourseMin
            if (useCs3Course) {
              s.nonHonCourseMin = nonHonCourseMin
              s.courseMin = s.honCourseMin + s.nonHonCourseMin
            }
          }
        } else {
          // CS3未取得フォールバック: 予約テーブルの指名カウントを使用
          for (const r of dedupedRes) {
            const s = staffMap.get(r.staff_id)!
            s.totalRes++
            if (r.nomination_type?.includes('本')) s.honShimei++
            if (r.nomination_type?.includes('写')) s.shashinShimei++
          }
        }

        // ── シフトデータ（稼働率計算用）──
        const staffIds = [...staffMap.keys()].filter(id => id > 0)
        if (staffIds.length > 0) {
          const shifts = await fetchAllPaginated<ShiftRow>((from, to) =>
            supabase.from('shifts')
              .select('staff_id, date, start_time, end_time, status')
              .in('store_id', area.storeIds)
              .in('staff_id', staffIds)
              .neq('status', 'x')
              .gte('date', dateFrom)
              .lte('date', dateTo)
              .range(from, to)
          )
          const shiftByDay = new Map<string, ShiftRow>()
          for (const sh of shifts) {
            const key = `${sh.staff_id}:${sh.date}`
            const current = shiftByDay.get(key)
            if (!current || (sh.end_time - sh.start_time) > (current.end_time - current.start_time)) {
              shiftByDay.set(key, sh)
            }
          }
          for (const sh of shiftByDay.values()) {
            const s = staffMap.get(sh.staff_id)
            if (s) s.shiftMin += Math.max(0, sh.end_time - sh.start_time) * 60
          }
        }

        const computed: StaffStats[] = Array.from(staffMap.values())
          .filter(s => !(s.shiftMin === 0 && s.totalRes === 0))
          .map(s => ({
            ...s,
            nonHonCourseMin: useCs3Course ? s.nonHonCourseMin : Math.max(0, s.courseMin - s.honCourseMin),
            honRate:   s.totalRes > 0 ? s.honShimei / s.totalRes : 0,
            kadoritsu: s.shiftMin > 0 ? s.courseMin / s.shiftMin : 0,
          }))

        if (!cancelled) {
          setStats(computed)
          setCs3Available(hasCs3)
          setCs3CourseAvailable(useCs3Course)
        }
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
      reloadRef.current = null
    }
  }, [month, areaId, section])

  useEffect(() => {
    let cancelled = false
    const [y, m] = month.split('-').map(Number)
    async function loadLastBatchCompletedAt() {
      try {
        const res = await fetch(`/api/admin/performance-batch-job?year=${y}&month=${m}`, { headers: await getAuthHeaders() })
        const data = await res.json()
        if (cancelled || !res.ok || !data.job?.completed_at) return
        setLastBatchCompletedAt(data.job.completed_at)
        localStorage.setItem(lastBatchStorageKey(month), data.job.completed_at)
      } catch {
        // 表示補助なので取得失敗時はキャッシュ表示のままにする
      }
    }
    loadLastBatchCompletedAt()
    return () => { cancelled = true }
  }, [month])

  // ポーリング停止
  function stopPoll() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }

  // unmount 時に polling を確実に止める
  useEffect(() => () => stopPoll(), [])

  // 集計ボタン
  async function handleBatchTrigger() {
    const [y, m] = month.split('-').map(Number)
    setBatchError(null)
    setBatchJob(null)
    stopPoll()

    const res = await fetch('/api/admin/trigger-performance-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...await getAuthHeaders() },
      body: JSON.stringify({ year: y, month: m }),
    })
    const data = await res.json()
    if (!res.ok || !data.job) { setBatchError(data.error ?? '集計開始に失敗しました'); return }

    setBatchJob(data.job)
    if (data.job.status === 'done') {
      const completedAt = data.job.completed_at ?? new Date().toISOString()
      rememberBatchCompletedAt(month, completedAt)
      reloadRef.current?.()
      return
    }
    if (data.job.status === 'error') { setBatchError(data.job.message ?? '集計エラー'); return }

    // pending / running → ポーリング開始（最大5分）
    const deadline = Date.now() + 5 * 60 * 1000
    let consecutiveFails = 0
    pollRef.current = setInterval(async () => {
      if (Date.now() > deadline) {
        stopPoll()
        setBatchError('集計タイムアウト（5分）。VPSのログを確認: tail -20 /var/log/shift-sync/performance-trigger.log')
        setBatchJob(null)
        return
      }
      try {
        const r = await fetch(`/api/admin/performance-batch-job?id=${data.job.id}`, { headers: await getAuthHeaders() })
        const d = await r.json()
        if (!r.ok || !d.job) {
          consecutiveFails++
          if (consecutiveFails >= 3) {
            stopPoll()
            setBatchError(`APIエラー: ${d.error ?? r.status}`)
          }
          return
        }
        consecutiveFails = 0
        setBatchJob(d.job)
        if (d.job.status === 'done') {
          const completedAt = d.job.completed_at ?? new Date().toISOString()
          rememberBatchCompletedAt(month, completedAt)
          stopPoll()
          reloadRef.current?.()
        } else if (d.job.status === 'error') {
          stopPoll()
          setBatchError(d.job.message ?? '集計エラー')
        }
      } catch {
        consecutiveFails++
        if (consecutiveFails >= 3) {
          stopPoll()
          setBatchError('ネットワークエラー。再度お試しください')
        }
      }
    }, 5000)
  }

  const batchRunning = batchJob?.status === 'pending' || batchJob?.status === 'running'

  function handleMonthChange(nextMonth: string) {
    setMonth(nextMonth)
    setLastBatchCompletedAt(readLastBatchCompletedAt(nextMonth))
  }

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
        <h1 className="text-xl font-bold text-gray-100 mb-1">キャストランキング</h1>
        <p className="text-xs text-gray-500 mb-6">
          指名数・本指名率{cs3CourseAvailable ? '・コース総時間' : ''}は CS3 成績データ（取得済み月のみ）を出典とします。
          {!cs3CourseAvailable && ' コース総時間はCS3コース時間列の反映待ちです。'}
          稼働率の分母はシフト表データです。
        </p>

        <div className="flex flex-wrap items-center gap-3 mb-6">
          <select
            value={month}
            onChange={e => handleMonthChange(e.target.value)}
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

          <button
            onClick={handleBatchTrigger}
            disabled={batchRunning}
            className="ml-auto px-4 py-1.5 rounded text-sm font-medium bg-emerald-700 text-white hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {batchRunning ? '集計中...' : '集計'}
          </button>
          {lastBatchCompletedAt && (
            <span className="text-xs text-gray-500 whitespace-nowrap">
              最終集計: {formatBatchTime(lastBatchCompletedAt)}
            </span>
          )}
        </div>

        {batchRunning && (
          <div className="text-emerald-400 text-xs mb-4 flex items-center gap-2">
            <span className="animate-spin inline-block w-3 h-3 border border-emerald-400 border-t-transparent rounded-full" />
            CS3から{month.replace('-', '年')}月の成績を取得中（最大数分かかります）
          </div>
        )}
        {batchError && (
          <div className="bg-red-900/40 border border-red-700/50 text-red-300 text-xs rounded px-3 py-2 mb-4">
            集計エラー: {batchError}
          </div>
        )}

        {month === '2026-04' && (
          <div className="bg-yellow-900/40 border border-yellow-700/50 text-yellow-300 text-xs rounded px-3 py-2 mb-4">
            ⚠ 2026年4月は予約同期の不具合により稼働率・コース時間に欠損があります。総合ランキングは参考値です。
            {!cs3Available && ' CS3 成績データ未取得のため本指名数・写真指名数も実数より少ない可能性があります。'}
          </div>
        )}

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
              <h2 className="text-sm font-semibold text-gray-300 mb-3 border-b border-gray-700 pb-2">
                総合ランキング
                <span className="ml-2 text-xs font-normal text-gray-500">（指名数・コース時間: CS3成績 / 稼働率分母: シフト）</span>
              </h2>
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
