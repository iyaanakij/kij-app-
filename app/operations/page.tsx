'use client'

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { Shift, Reservation, Staff, STORES, formatShiftTime, hhmmToDecimal, todayString } from '@/lib/types'

// Time range: 10:00 to 30:00 (next day 6:00), each slot = 10 min
const TIME_START = 10
const TIME_END = 30
const SLOT_MINUTES = 10
const TOTAL_SLOTS = ((TIME_END - TIME_START) * 60) / SLOT_MINUTES // 120 slots
const CELL_WIDTH = 10 // px per slot

function getSlotIndex(decimalTime: number): number {
  return (decimalTime - TIME_START) / (SLOT_MINUTES / 60)
}

function slotLabel(slotIdx: number): string {
  const t = TIME_START + slotIdx * (SLOT_MINUTES / 60)
  if (t >= 24) {
    const h = Math.floor(t - 24)
    const m = Math.round((t - 24 - h) * 60)
    return `翌${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  }
  const h = Math.floor(t)
  const m = Math.round((t - h) * 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

// Show label only every 6 slots (= every hour)
const shouldShowLabel = (i: number) => i % 6 === 0
// Hourly boundary every 6 slots
const isHourlyBoundary = (i: number) => i % 6 === 0

type CellStatus = 'outside' | 'available' | 'occupied'

interface StaffRow {
  staff: Staff
  shift: Shift | null
}

export default function OperationsPage() {
  const [selectedDate, setSelectedDate] = useState(todayString())
  const [selectedStoreId, setSelectedStoreId] = useState<number>(1)
  const [shifts, setShifts] = useState<Shift[]>([])
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [staffList, setStaffList] = useState<Staff[]>([])
  const [loading, setLoading] = useState(false)
  const [currentTime, setCurrentTime] = useState<Date>(new Date())
  const containerRef = useRef<HTMLDivElement>(null)

  // 10秒ごとに現在時刻を更新
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 10000)
    return () => clearInterval(interval)
  }, [])

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [staffRes, shiftsRes, reservationsRes] = await Promise.all([
      supabase.from('staff').select('*').order('name'),
      supabase
        .from('shifts')
        .select('*')
        .eq('date', selectedDate)
        .eq('store_id', selectedStoreId)
        .neq('status', 'x'),
      supabase
        .from('reservations')
        .select('*')
        .eq('date', selectedDate)
        .eq('store_id', selectedStoreId),
    ])
    if (staffRes.data) setStaffList(staffRes.data)
    if (shiftsRes.data) setShifts(shiftsRes.data)
    if (reservationsRes.data) setReservations(reservationsRes.data)
    setLoading(false)
  }, [selectedDate, selectedStoreId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  useEffect(() => {
    const channel = supabase
      .channel('operations-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shifts' }, fetchData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reservations' }, fetchData)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fetchData])

  const staffRows = useMemo((): StaffRow[] => {
    const shiftStaffIds = new Set(shifts.map(s => s.staff_id))
    const rows: StaffRow[] = []

    shifts.forEach(shift => {
      const staff = staffList.find(s => s.id === shift.staff_id)
      if (staff) {
        rows.push({ staff, shift })
      }
    })

    // Also include staff with reservations but no shift
    reservations.forEach(r => {
      if (r.staff_id && !shiftStaffIds.has(r.staff_id)) {
        const staff = staffList.find(s => s.id === r.staff_id)
        if (staff && !rows.find(row => row.staff.id === r.staff_id)) {
          rows.push({ staff, shift: null })
        }
      }
    })

    rows.sort((a, b) => a.staff.name.localeCompare(b.staff.name, 'ja'))
    return rows
  }, [shifts, reservations, staffList])

  function getCellStatus(staffId: number, slotIdx: number): { status: CellStatus; reservation?: Reservation } {
    const slotTime = TIME_START + slotIdx * (SLOT_MINUTES / 60)

    const shift = shifts.find(s => s.staff_id === staffId)
    let inShift = false
    if (shift) {
      inShift = slotTime >= shift.start_time && slotTime < shift.end_time
    }

    if (!inShift) return { status: 'outside' }

    // Check if any reservation occupies this slot
    const occupying = reservations.find(r => {
      if (r.staff_id !== staffId) return false
      if (!r.time || !r.course_duration) return false
      const resStart = hhmmToDecimal(r.time)
      const extensionMinutes = Math.round((( r.extension ?? 0) / 3000) * 10)
      const totalDuration = r.course_duration + extensionMinutes
      const resEnd = resStart + totalDuration / 60
      return slotTime >= resStart && slotTime < resEnd
    })

    if (occupying) return { status: 'occupied', reservation: occupying }
    return { status: 'available' }
  }

  const slots = Array.from({ length: TOTAL_SLOTS }, (_, i) => i)

  // 現在時刻インジケーター
  const isToday = selectedDate === todayString()

  const currentDecimalTime = useMemo(() => {
    const h = currentTime.getHours()
    const m = currentTime.getMinutes()
    const s = currentTime.getSeconds()
    const decimal = h + m / 60 + s / 3600
    // 深夜0〜7時台は翌日扱い（+24）
    return decimal < TIME_START ? decimal + 24 : decimal
  }, [currentTime])

  const currentTimeSlotOffset = useMemo(() => {
    if (!isToday) return null
    if (currentDecimalTime < TIME_START || currentDecimalTime >= TIME_END) return null
    return (currentDecimalTime - TIME_START) * (60 / SLOT_MINUTES) * CELL_WIDTH
  }, [isToday, currentDecimalTime])

  // ページロード時・日付変更時に現在時刻位置へ自動スクロール
  useEffect(() => {
    if (!isToday || currentTimeSlotOffset === null) return
    const el = containerRef.current
    if (!el) return
    const scrollTarget = STAFF_COL_WIDTH + currentTimeSlotOffset - el.clientWidth / 2
    el.scrollLeft = Math.max(0, scrollTarget)
  }, [isToday, currentTimeSlotOffset, loading])

  const STAFF_COL_WIDTH = 160

  return (
    <div className="p-3">
      {/* Controls */}
      <div className="bg-white rounded-xl shadow-md border border-gray-100 p-4 mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-sm font-semibold text-gray-600">日付</label>
            <input
              type="date"
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
            />
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {STORES.map(s => (
              <button
                key={s.id}
                onClick={() => setSelectedStoreId(s.id)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  selectedStoreId === s.id
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {s.name}
              </button>
            ))}
          </div>
          <div className="ml-auto flex gap-4 text-xs">
            <span className="flex items-center gap-1.5">
              <span className="w-4 h-4 rounded bg-blue-200 border border-blue-300 inline-block"></span>
              <span className="text-gray-600">出勤中(空き)</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-4 h-4 rounded bg-red-400 border border-red-500 inline-block"></span>
              <span className="text-gray-600">対応中</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-4 h-4 rounded bg-gray-100 inline-block border border-gray-200"></span>
              <span className="text-gray-600">範囲外</span>
            </span>
            {isToday && (
              <span className="flex items-center gap-1.5">
                <span className="w-0.5 h-4 bg-red-500 inline-block"></span>
                <span className="text-gray-600">現在時刻</span>
              </span>
            )}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="text-gray-500 animate-pulse">読み込み中...</div>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-md border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto" ref={containerRef}>
            <div style={{ position: 'relative', minWidth: `${STAFF_COL_WIDTH + TOTAL_SLOTS * CELL_WIDTH}px` }}>
              {/* 現在時刻インジケーター */}
              {isToday && currentTimeSlotOffset !== null && (
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    bottom: 0,
                    left: STAFF_COL_WIDTH + currentTimeSlotOffset,
                    width: 2,
                    backgroundColor: '#ef4444',
                    zIndex: 20,
                    pointerEvents: 'none',
                  }}
                >
                  <span style={{
                    position: 'absolute',
                    top: 2,
                    left: 3,
                    fontSize: 9,
                    color: '#ef4444',
                    fontWeight: 'bold',
                    whiteSpace: 'nowrap',
                    background: 'white',
                    padding: '0 2px',
                    borderRadius: 2,
                  }}>
                    {currentTime.getHours() < 7
                      ? `翌${String(currentTime.getHours()).padStart(2,'0')}:${String(currentTime.getMinutes()).padStart(2,'0')}`
                      : `${String(currentTime.getHours()).padStart(2,'0')}:${String(currentTime.getMinutes()).padStart(2,'0')}`
                    }
                  </span>
                </div>
              )}

              <table className="text-xs border-collapse" style={{ width: STAFF_COL_WIDTH + TOTAL_SLOTS * CELL_WIDTH }}>
                <thead>
                  <tr className="bg-gray-900 text-white">
                    <th
                      className="sticky left-0 z-10 bg-gray-900 py-2 border-r border-gray-700 text-left"
                      style={{ width: STAFF_COL_WIDTH, minWidth: STAFF_COL_WIDTH, paddingLeft: 8, paddingRight: 8 }}
                    >
                      スタッフ / シフト
                    </th>
                    {slots.map(i => (
                      <th
                        key={i}
                        className={`px-0 py-1 text-center font-normal ${
                          isHourlyBoundary(i) ? 'border-l-2 border-gray-500' : 'border-l border-gray-700'
                        }`}
                        style={{ width: CELL_WIDTH, minWidth: CELL_WIDTH }}
                      >
                        {shouldShowLabel(i) ? (
                          <span className="text-gray-300 block whitespace-nowrap" style={{ fontSize: 8 }}>
                            {slotLabel(i)}
                          </span>
                        ) : null}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {staffRows.length === 0 && (
                    <tr>
                      <td colSpan={TOTAL_SLOTS + 1} className="text-center py-10 text-gray-400">
                        シフトデータなし
                      </td>
                    </tr>
                  )}
                  {staffRows.map(({ staff, shift }) => (
                    <tr key={staff.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                      <td
                        className="sticky left-0 z-10 bg-white border-r border-gray-200 py-1.5"
                        style={{ width: STAFF_COL_WIDTH, minWidth: STAFF_COL_WIDTH, paddingLeft: 8, paddingRight: 8 }}
                      >
                        <div className="font-semibold text-gray-800 truncate" style={{ maxWidth: STAFF_COL_WIDTH - 16 }}>
                          {staff.name}
                        </div>
                        {shift ? (
                          <div className="text-gray-500" style={{ fontSize: 10 }}>
                            {formatShiftTime(shift.start_time)} 〜 {formatShiftTime(shift.end_time)}
                          </div>
                        ) : (
                          <div className="text-gray-400" style={{ fontSize: 10 }}>シフトなし</div>
                        )}
                      </td>
                      {slots.map(slotIdx => {
                        const { status, reservation } = getCellStatus(staff.id, slotIdx)

                        let bgClass = 'bg-gray-100'
                        let borderClass = isHourlyBoundary(slotIdx)
                          ? 'border-l-2 border-gray-400'
                          : 'border-l border-gray-200'

                        if (status === 'available') {
                          bgClass = 'bg-blue-200'
                          borderClass = isHourlyBoundary(slotIdx)
                            ? 'border-l-2 border-blue-400'
                            : 'border-l border-blue-300'
                        } else if (status === 'occupied') {
                          bgClass = 'bg-red-400'
                          borderClass = isHourlyBoundary(slotIdx)
                            ? 'border-l-2 border-red-600'
                            : 'border-l border-red-500'
                        }

                        const title = status === 'occupied' && reservation
                          ? `${reservation.customer_name ?? ''} ${reservation.course_duration ?? ''}分`
                          : ''

                        // Show customer name only at first slot of reservation
                        let cellText = ''
                        if (status === 'occupied' && reservation && reservation.time) {
                          const resStartSlot = Math.round(getSlotIndex(hhmmToDecimal(reservation.time)))
                          if (slotIdx === resStartSlot) {
                            cellText = reservation.customer_name
                              ? reservation.customer_name.slice(0, 3)
                              : ''
                          }
                        }

                        return (
                          <td
                            key={slotIdx}
                            className={`p-0 ${bgClass} ${borderClass} transition-colors`}
                            title={title}
                            style={{ width: CELL_WIDTH, minWidth: CELL_WIDTH, height: 28 }}
                          >
                            {cellText && (
                              <span
                                className="text-white font-bold flex items-center h-full overflow-hidden whitespace-nowrap"
                                style={{ fontSize: 8, paddingLeft: 1 }}
                              >
                                {cellText}
                              </span>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Summary */}
          <div className="px-4 py-3 border-t border-gray-200 bg-gray-50 flex flex-wrap gap-6 text-sm">
            <div className="text-gray-600">
              出勤スタッフ:{' '}
              <span className="font-bold text-gray-900">{staffRows.filter(r => r.shift).length}名</span>
            </div>
            <div className="text-gray-600">
              対応中:{' '}
              <span className="font-bold text-red-600">
                {reservations.filter(r => r.staff_id && r.course_duration).length}件
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
