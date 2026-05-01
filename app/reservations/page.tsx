'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { Reservation, Staff, AREAS, M_STORE_IDS, formatTime, todayString } from '@/lib/types'

function calcCheckoutTime(startHHMM: number, courseDuration: number, extensionFee: number): number {
  const extensionMinutes = Math.round((extensionFee / 3000) * 10)
  const h = Math.floor(startHHMM / 100)
  const m = startHHMM % 100
  const totalMins = h * 60 + m + courseDuration + extensionMinutes
  return Math.floor(totalMins / 60) * 100 + (totalMins % 60)
}

// ── キャスト給計算 ──────────────────────────────────────
// コース種別ごとの給与テーブル（未入力はランジェリー扱い）
const COURSE_CAST_PAY: Record<number, Partial<Record<string, number>>> = {
  // ランジェリー=未入力時のデフォルト。T(トップレス)+1000、N(ヌード)+3000
  60:  { ランジェリー: 7000,  トップレス: 8000,  ヌード: 10000 },
  80:  { ランジェリー: 9000,  トップレス: 10000, ヌード: 12000 },
  100: { ランジェリー: 11000, トップレス: 12000, ヌード: 14000 },
  120: { ランジェリー: 13000, トップレス: 14000, ヌード: 16000 },
  150: { ランジェリー: 16000, トップレス: 17000, ヌード: 19000 },
  180: { ランジェリー: 19000, トップレス: 20000, ヌード: 22000 },
}
function getCourseCastPay(duration: number | null, courseType: string | null): number {
  if (!duration) return 0
  const key = courseType || 'ランジェリー'
  return COURSE_CAST_PAY[duration]?.[key] ?? COURSE_CAST_PAY[duration]?.['ランジェリー'] ?? 0
}

const OP_CAST_PAY: Record<string, number> = {
  '聖水': 2000,
  'ロープ': 1000,
  '私物パンティ': 3000,
  'ストッキング': 500,
  'プラスチック浣腸': 500,
  'コスプレ': 1000,
}
function calculateCastPay(r: Reservation): number {
  let pay = 0
  pay += getCourseCastPay(r.course_duration, r.course_type)
  if (r.nomination_type && r.nomination_type !== 'フリー' && r.nomination_type !== '') pay += 2000
  if (r.extension) pay += Math.round(r.extension * 0.5)
  if (r.transportation_fee) pay += r.transportation_fee
  if (r.nude) pay += 1000
  for (const opt of [r.option1, r.option2, r.option3, r.option4, r.option5, r.option6]) {
    if (opt) pay += OP_CAST_PAY[opt] ?? 0
  }
  if (r.discount) pay -= r.discount
  return Math.max(0, pay)
}

const MEMO_PREFIX = 'MEMO:'

function parseInternalMemo(value: string | null): string {
  return value?.startsWith(MEMO_PREFIX) ? value.slice(MEMO_PREFIX.length) : ''
}

function serializeInternalMemo(value: string | null): string | null {
  return value ? `${MEMO_PREFIX}${value}` : null
}

function MemoCell({
  reservation,
  onSaved,
}: {
  reservation: Reservation
  onSaved: (id: number, internalMemo: string) => void
}) {
  const memo = parseInternalMemo(reservation.media)
  const [value, setValue] = useState(memo)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setValue(memo)
  }, [memo])

  async function saveMemo() {
    const next = value.trim() === '' ? null : value
    if (memo === (next ?? '')) return
    setSaving(true)
    const { error } = await supabase
      .from('reservations')
      .update({ media: serializeInternalMemo(next) })
      .eq('id', reservation.id)
    if (!error) onSaved(reservation.id, next ?? '')
    setSaving(false)
  }

  return (
    <textarea
      value={value}
      onChange={e => setValue(e.target.value)}
      onBlur={saveMemo}
      rows={2}
      placeholder="メモ"
      className={`w-44 min-h-10 resize-y rounded border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200 ${saving ? 'opacity-60' : ''}`}
    />
  )
}

export default function ReservationsPage() {
  const [selectedDate, setSelectedDate] = useState(todayString())
  const [selectedAreaId, setSelectedAreaId] = useState<number | null>(null)
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [loading, setLoading] = useState(false)
  const [syncStatus, setSyncStatus] = useState<'idle' | 'waiting' | 'done' | 'error'>('idle')
  const [syncMsg, setSyncMsg] = useState('')

  // マウント時にlocalStorageからエリアを復元
  useEffect(() => {
    const saved = localStorage.getItem('kij_res_area')
    if (saved && !isNaN(Number(saved))) setSelectedAreaId(Number(saved))
  }, [])

  const selectArea = (id: number | null) => {
    setSelectedAreaId(id)
    if (id !== null) localStorage.setItem('kij_res_area', String(id))
  }
  const [savingId, setSavingId] = useState<number | null>(null)

  const fetchReservations = useCallback(async () => {
    setLoading(true)
    const area = AREAS.find(a => a.id === selectedAreaId)
    let query = supabase
      .from('reservations')
      .select('*, staff(id, name)')
      .eq('date', selectedDate)
      .order('section')
      .order('row_number')
      .order('time')
    if (area) query = query.in('store_id', area.storeIds)
    const { data } = await query
    if (data) setReservations(data as Reservation[])
    setLoading(false)
  }, [selectedDate, selectedAreaId])

  useEffect(() => { fetchReservations() }, [fetchReservations])

  useEffect(() => {
    const channel = supabase
      .channel('reservations-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reservations' }, () => {
        fetchReservations()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fetchReservations])

  // デーモンからの同期完了通知を受信
  useEffect(() => {
    const ch = supabase.channel('cs3-sync')
      .on('broadcast', { event: 'sync-done' }, ({ payload }) => {
        setSyncStatus('done')
        setSyncMsg(`完了 登録:${payload.synced} 削除:${payload.deleted}`)
        setTimeout(() => setSyncStatus('idle'), 4000)
      })
      .on('broadcast', { event: 'sync-error' }, ({ payload }) => {
        setSyncStatus('error')
        setSyncMsg(`エラー: ${payload.error}`)
        setTimeout(() => setSyncStatus('idle'), 5000)
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])


  const toggleField = async (id: number, field: 'confirmed' | 'communicated' | 'checked', current: boolean) => {
    setSavingId(id)
    await supabase.from('reservations').update({ [field]: !current }).eq('id', id)
    setReservations(prev => prev.map(r => r.id === id ? { ...r, [field]: !current } : r))
    setSavingId(null)
  }

  // 到着確認トグル → 現在時刻からコース時間分で退室時刻を自動計算
  const toggleArrival = async (r: Reservation) => {
    const newVal = !r.arrival_confirmed
    let checkout_time = r.checkout_time
    if (newVal && r.course_duration) {
      const now = new Date()
      const currentHHMM = now.getHours() * 100 + now.getMinutes()
      checkout_time = calcCheckoutTime(currentHHMM, r.course_duration, r.extension ?? 0)
    } else if (!newVal) {
      checkout_time = null
    }
    setSavingId(r.id)
    await supabase.from('reservations').update({ arrival_confirmed: newVal, checkout_time }).eq('id', r.id)
    setReservations(prev => prev.map(x => x.id === r.id ? { ...x, arrival_confirmed: newVal, checkout_time } : x))
    setSavingId(null)
  }

  const updateReservationMemo = (id: number, internalMemo: string) => {
    setReservations(prev => prev.map(r => r.id === id ? { ...r, media: serializeInternalMemo(internalMemo || null) } : r))
  }

  const mCount = reservations.filter(r => M_STORE_IDS.includes(r.store_id)).length
  const eCount = reservations.filter(r => !M_STORE_IDS.includes(r.store_id)).length

  const renderSection = (section: 'E' | 'M', label: string) => {
    const rows = reservations.filter(r => section === 'M' ? M_STORE_IDS.includes(r.store_id) : !M_STORE_IDS.includes(r.store_id))
    const bgHeader = section === 'E' ? 'bg-pink-200 text-pink-900' : 'bg-amber-200 text-amber-900'
    const bgRow    = section === 'E' ? 'bg-pink-50'  : 'bg-orange-50'

    return (
      <div className="mb-5">
        <div className={`flex items-center gap-3 px-4 py-2.5 ${bgHeader} rounded-t-lg font-bold`}>
          <span className="text-sm">{label}</span>
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${section === 'E' ? 'bg-pink-400 text-white' : 'bg-amber-500 text-white'}`}>
            {section === 'E' ? eCount : mCount}件
          </span>
        </div>
        <div className="overflow-x-auto border border-t-0 border-gray-200 rounded-b-lg">
          <table className="w-full text-xs border-collapse min-w-[900px]">
            <thead className="sticky top-0 z-10">
              <tr className="bg-gray-700 text-white">
                {['CS','番号','時間','お客様名','確電','伝達','電話番号','エリア','ホテル/部屋','区分','女性','指名','種別','コース','OP','加算','金額','到着','退出','メモ'].map(h => (
                  <th key={h} className="px-1.5 py-1.5 border border-gray-600 whitespace-nowrap font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={20} className={`text-center py-5 text-gray-400 ${bgRow}`}>予約なし</td>
                </tr>
              )}
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className={`transition-all text-xs ${savingId === r.id ? 'opacity-50' : ''} ${bgRow} hover:brightness-95`}
                >
                  <td className="px-1 py-1 border border-gray-200 text-center" onClick={e => e.stopPropagation()}>
                    <input type="checkbox" checked={r.checked} onChange={() => toggleField(r.id, 'checked', r.checked)} className="cursor-pointer accent-blue-600 w-3.5 h-3.5" />
                  </td>
                  <td className="px-1 py-1 border border-gray-200 text-center text-gray-600 font-mono">{r.row_number}</td>
                  <td className="px-1 py-1 border border-gray-200 text-center font-mono font-bold text-gray-800">{formatTime(r.time)}</td>
                  <td className="px-1.5 py-1 border border-gray-200 font-semibold text-gray-800">{r.customer_name}</td>
                  <td className="px-1 py-1 border border-gray-200 text-center" onClick={e => e.stopPropagation()}>
                    <button onClick={() => toggleField(r.id, 'confirmed', r.confirmed)} className={`w-6 h-5 rounded text-xs font-bold transition-colors ${r.confirmed ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-400 hover:bg-gray-300'}`}>{r.confirmed ? '○' : ''}</button>
                  </td>
                  <td className="px-1 py-1 border border-gray-200 text-center" onClick={e => e.stopPropagation()}>
                    <button onClick={() => toggleField(r.id, 'communicated', r.communicated)} className={`w-6 h-5 rounded text-xs font-bold transition-colors ${r.communicated ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-400 hover:bg-gray-300'}`}>{r.communicated ? '○' : ''}</button>
                  </td>
                  <td className="px-1 py-1 border border-gray-200 font-mono text-gray-700 whitespace-nowrap">{r.phone}</td>
                  <td className="px-1 py-1 border border-gray-200 text-gray-700 max-w-[90px] truncate whitespace-nowrap overflow-hidden" title={r.area ?? ''}>{r.area}</td>
                  <td className="px-1 py-1 border border-gray-200 text-gray-700 whitespace-nowrap">{[r.hotel, r.room_number].filter(Boolean).join(' ')}</td>
                  <td className="px-1 py-1 border border-gray-200 text-center font-semibold text-gray-700 whitespace-nowrap">{r.category}</td>
                  <td className="px-1 py-1 border border-gray-200 text-center text-purple-700 font-semibold whitespace-nowrap">{(r.staff as Staff)?.name ?? ''}</td>
                  <td className="px-1 py-1 border border-gray-200 text-center text-gray-700 whitespace-nowrap">{r.nomination_type}</td>
                  <td className="px-1 py-1 border border-gray-200 text-center font-medium text-gray-700 whitespace-nowrap">{r.course_type}</td>
                  <td className="px-1 py-1 border border-gray-200 text-center font-medium text-gray-700 whitespace-nowrap">{r.course_duration ? `${r.course_duration}分` : ''}</td>
                  <td className="px-1 py-1 border border-gray-200 text-gray-600 whitespace-nowrap">
                    {[r.option1, r.option2, r.option3, r.option4, r.option5, r.option6].filter(Boolean).join(', ')}
                  </td>
                  <td className="px-1 py-1 border border-gray-200 text-gray-600 text-right whitespace-nowrap">
                    {[
                      r.membership_fee > 0 ? `入${r.membership_fee.toLocaleString()}` : null,
                      r.transportation_fee > 0 ? `交${r.transportation_fee.toLocaleString()}` : null,
                      r.extension > 0 ? `延${r.extension.toLocaleString()}` : null,
                      r.discount > 0 ? `-${r.discount.toLocaleString()}` : null,
                    ].filter(Boolean).join(' ')}
                  </td>
                  <td className="px-1.5 py-1 border border-gray-200 text-right font-bold text-yellow-600 whitespace-nowrap">{r.total_amount > 0 ? `¥${r.total_amount.toLocaleString()}` : ''}</td>
                  <td className="px-1 py-1 border border-gray-200 text-center" onClick={e => e.stopPropagation()}>
                    <button onClick={() => toggleArrival(r)} className={`px-2 h-5 rounded-full text-xs font-bold transition-colors ${r.arrival_confirmed ? 'bg-orange-500 text-white' : 'bg-gray-200 text-gray-400 hover:bg-gray-300'}`}>着</button>
                  </td>
                  <td className="px-1 py-1 border border-gray-200 text-center font-mono font-bold text-emerald-600 whitespace-nowrap">{formatTime(r.checkout_time)}</td>
                  <td className="px-1 py-1 border border-gray-200 text-gray-600" onClick={e => e.stopPropagation()}>
                    <MemoCell reservation={r} onSaved={updateReservationMemo} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  return (
    <div className="p-3">
      {/* ヘッダー */}
      <div className="bg-white rounded-xl shadow-md border border-gray-100 p-4 mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1">
            <label className="text-sm font-semibold text-gray-600 mr-1">日付</label>
            <button
              onClick={() => {
                const d = new Date(selectedDate); d.setDate(d.getDate() - 1)
                setSelectedDate(d.toISOString().split('T')[0])
              }}
              className="px-2 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-bold transition-colors"
            >◀</button>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
            />
            <button
              onClick={() => {
                const d = new Date(selectedDate); d.setDate(d.getDate() + 1)
                setSelectedDate(d.toISOString().split('T')[0])
              }}
              className="px-2 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-bold transition-colors"
            >▶</button>
          </div>
          <div className="flex gap-1.5 flex-wrap">
            <button
              onClick={() => selectArea(null)}
              className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${selectedAreaId === null ? 'bg-blue-600 text-white shadow-sm' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
            >
              全店舗
            </button>
            {AREAS.map(a => (
              <button
                key={a.id}
                onClick={() => selectArea(a.id)}
                className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${selectedAreaId === a.id ? 'bg-blue-600 text-white shadow-sm' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
              >
                {a.name}
              </button>
            ))}
          </div>
          <div className="ml-auto flex gap-3 text-sm font-medium items-center">
            {/* 予約取得ボタン */}
            <button
              onClick={async () => {
                setSyncStatus('waiting')
                setSyncMsg('')
                await supabase.channel('cs3-sync').send({ type: 'broadcast', event: 'sync-request', payload: {} })
              }}
              disabled={syncStatus === 'waiting'}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                syncStatus === 'waiting' ? 'bg-blue-200 text-blue-500 cursor-wait' :
                syncStatus === 'done'    ? 'bg-green-100 text-green-700' :
                syncStatus === 'error'   ? 'bg-red-100 text-red-700' :
                'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              {syncStatus === 'waiting' ? '同期中...' :
               syncStatus === 'done'    ? `✓ ${syncMsg}` :
               syncStatus === 'error'   ? `✗ ${syncMsg}` :
               '↻ 予約取得'}
            </button>
            <span className="bg-pink-100 text-pink-800 px-3 py-1 rounded-full flex items-center gap-1.5">
              E
              <span className="bg-pink-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">{eCount}</span>
            </span>
            <span className="bg-amber-100 text-amber-800 px-3 py-1 rounded-full flex items-center gap-1.5">
              M
              <span className="bg-amber-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">{mCount}</span>
            </span>
          </div>
        </div>
      </div>

      {/* 日次売上サマリー */}
      {!loading && (() => {
        const totalSales = reservations.reduce((s, r) => s + (r.total_amount ?? 0), 0)
        const totalCastPay = reservations.reduce((s, r) => s + calculateCastPay(r), 0)
        const storeProft = totalSales - totalCastPay
        return (
          <div className="bg-white rounded-xl shadow-md border border-gray-100 px-5 py-3 mb-3 flex flex-wrap gap-6 items-center">
            <span className="text-sm font-semibold text-gray-500">当日売上</span>
            <span className="flex items-center gap-1.5">
              <span className="text-xs text-gray-400">売上合計</span>
              <span className="text-lg font-bold text-gray-900">¥{totalSales.toLocaleString()}</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="text-xs text-gray-400">キャスト給</span>
              <span className="text-lg font-bold text-red-600">¥{totalCastPay.toLocaleString()}</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="text-xs text-gray-400">店舗利益</span>
              <span className="text-lg font-bold text-blue-600">¥{storeProft.toLocaleString()}</span>
            </span>
            <span className="text-xs text-gray-400 ml-auto">{reservations.length}件</span>
          </div>
        )
      })()}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="text-gray-500 animate-pulse">読み込み中...</div>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-md border border-gray-100 p-4">
          {renderSection('E', 'エステ・癒したくて 予約')}
          {renderSection('M', '快楽M性感俱楽部 予約')}
        </div>
      )}

    </div>
  )
}
