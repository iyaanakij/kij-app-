'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { Shift, Reservation, Staff, STORES, formatShiftTime, hhmmToDecimal, todayString } from '@/lib/types'

// Time range: 10:00 to 30:00 (next day 6:00), each slot = 30 min
const TIME_START = 10
const TIME_END = 30
const SLOT_MINUTES = 30
const TOTAL_SLOTS = ((TIME_END - TIME_START) * 60) / SLOT_MINUTES // 40 slots

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
      // Normalize: if resStart < TIME_START, it might be on previous day — skip
      const resEnd = resStart + r.course_duration / 60
      return slotTime >= resStart && slotTime < resEnd
    })

    if (occupying) return { status: 'occupied', reservation: occupying }
    return { status: 'available' }
  }

  const slots = Array.from({ length: TOTAL_SLOTS }, (_, i) => i)

  // Show every other slot label to avoid crowding
  const shouldShowLabel = (i: number) => i % 2 === 0

  return (
    <div className="p-3">
      {/* Controls */}
      <div className="bg-white rounded-lg shadow p-3 mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">日付</label>
            <input
              type="date"
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              className="border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex gap-1 flex-wrap">
            {STORES.map(s => (
              <button
                key={s.id}
                onClick={() => setSelectedStoreId(s.id)}
                className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                  selectedStoreId === s.id ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                {s.name}
              </button>
            ))}
          </div>
          <div className="ml-auto flex gap-4 text-xs">
            <span className="flex items-center gap-1">
              <span className="w-4 h-4 rounded bg-blue-300 inline-block"></span> 出勤中(空き)
            </span>
            <span className="flex items-center gap-1">
              <span className="w-4 h-4 rounded bg-red-400 inline-block"></span> 対応中
            </span>
            <span className="flex items-center gap-1">
              <span className="w-4 h-4 rounded bg-gray-200 inline-block"></span> 範囲外
            </span>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="text-gray-500">読み込み中...</div>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="text-xs border-collapse" style={{ minWidth: `${180 + TOTAL_SLOTS * 32}px` }}>
              <thead>
                <tr className="bg-gray-800 text-white">
                  <th className="sticky left-0 z-10 bg-gray-800 px-3 py-2 border-r border-gray-600 w-44 text-left">
                    スタッフ / シフト
                  </th>
                  {slots.map(i => (
                    <th
                      key={i}
                      className="px-0 py-1 border-l border-gray-600 w-8 text-center font-normal"
                      style={{ minWidth: 32 }}
                    >
                      {shouldShowLabel(i) ? (
                        <span className="text-xs text-gray-300 block" style={{ fontSize: 9 }}>
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
                  <tr key={staff.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="sticky left-0 z-10 bg-white border-r border-gray-200 px-2 py-1">
                      <div className="font-medium text-gray-800">{staff.name}</div>
                      {shift ? (
                        <div className="text-xs text-gray-500">
                          {formatShiftTime(shift.start_time)} 〜 {formatShiftTime(shift.end_time)}
                        </div>
                      ) : (
                        <div className="text-xs text-gray-400">シフトなし</div>
                      )}
                    </td>
                    {slots.map(slotIdx => {
                      const { status, reservation } = getCellStatus(staff.id, slotIdx)
                      let bgClass = 'bg-gray-100'
                      let title = ''
                      if (status === 'available') {
                        bgClass = 'bg-blue-300'
                      } else if (status === 'occupied') {
                        bgClass = 'bg-red-400'
                        title = reservation
                          ? `${reservation.customer_name ?? ''} ${reservation.course_duration ?? ''}分`
                          : ''
                      }

                      // Show text only for first slot of reservation
                      let cellText = ''
                      if (status === 'occupied' && reservation && reservation.time) {
                        const resStartSlot = Math.round(getSlotIndex(hhmmToDecimal(reservation.time)))
                        if (slotIdx === resStartSlot) {
                          cellText = reservation.course_duration ? `${reservation.course_duration}` : ''
                        }
                      }

                      return (
                        <td
                          key={slotIdx}
                          className={`border-l border-gray-100 p-0 ${bgClass} transition-colors`}
                          title={title}
                          style={{ width: 32, minWidth: 32, height: 28 }}
                        >
                          {cellText && (
                            <span className="text-white font-bold text-xs flex items-center justify-center h-full">
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

          {/* Summary */}
          <div className="p-3 border-t border-gray-200 bg-gray-50 flex flex-wrap gap-4 text-sm">
            <div className="text-gray-600">
              出勤スタッフ: <span className="font-bold text-gray-900">{staffRows.filter(r => r.shift).length}名</span>
            </div>
            <div className="text-gray-600">
              対応中: <span className="font-bold text-red-600">
                {reservations.filter(r => r.staff_id && r.course_duration).length}件
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
