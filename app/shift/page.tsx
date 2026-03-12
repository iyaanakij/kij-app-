'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { Shift, Staff, STORES } from '@/lib/types'

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

function formatDateStr(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function displayShiftTime(shift: Shift): string {
  const fmt = (t: number) => {
    if (t >= 24) return `翌${Math.floor(t - 24)}`
    return String(Math.floor(t))
  }
  return `${fmt(shift.start_time)}〜${fmt(shift.end_time)}`
}

const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土']

export default function ShiftPage() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [selectedStoreId, setSelectedStoreId] = useState(1)
  const [staffList, setStaffList] = useState<Staff[]>([])
  const [shifts, setShifts] = useState<Shift[]>([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [modalStaff, setModalStaff] = useState<Staff | null>(null)
  const [modalDay, setModalDay] = useState<number>(1)
  const [modalShift, setModalShift] = useState<Partial<Shift> | null>(null)
  const [saving, setSaving] = useState(false)

  const daysInMonth = getDaysInMonth(year, month)
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1)

  const fetchStaff = useCallback(async () => {
    const { data } = await supabase.from('staff').select('*').order('name')
    if (data) setStaffList(data)
  }, [])

  const fetchShifts = useCallback(async () => {
    setLoading(true)
    const startDate = formatDateStr(year, month, 1)
    const endDate = formatDateStr(year, month, daysInMonth)
    const { data } = await supabase
      .from('shifts')
      .select('*')
      .eq('store_id', selectedStoreId)
      .gte('date', startDate)
      .lte('date', endDate)
    if (data) setShifts(data)
    setLoading(false)
  }, [year, month, selectedStoreId, daysInMonth])

  useEffect(() => { fetchStaff() }, [fetchStaff])
  useEffect(() => { fetchShifts() }, [fetchShifts])

  function getShift(staffId: number, day: number): Shift | undefined {
    const dateStr = formatDateStr(year, month, day)
    return shifts.find(s => s.staff_id === staffId && s.date === dateStr)
  }

  function getStaffCountForDay(day: number): number {
    const dateStr = formatDateStr(year, month, day)
    return shifts.filter(s => s.date === dateStr && s.status !== 'x').length
  }

  function getWeekday(day: number): number {
    return new Date(year, month - 1, day).getDay()
  }

  function openModal(staff: Staff, day: number) {
    const existing = getShift(staff.id, day)
    setModalStaff(staff)
    setModalDay(day)
    if (existing) {
      setModalShift({ ...existing })
    } else {
      setModalShift({
        staff_id: staff.id,
        store_id: selectedStoreId,
        date: formatDateStr(year, month, day),
        start_time: 14,
        end_time: 22,
        status: 'normal',
        notes: '',
      })
    }
    setModalOpen(true)
  }

  async function saveShift() {
    if (!modalShift) return
    setSaving(true)
    const dateStr = formatDateStr(year, month, modalDay)
    const payload = {
      staff_id: modalShift.staff_id,
      store_id: selectedStoreId,
      date: dateStr,
      start_time: modalShift.start_time ?? 14,
      end_time: modalShift.end_time ?? 22,
      status: modalShift.status ?? 'normal',
      notes: modalShift.notes ?? '',
    }
    if (modalShift.id) {
      await supabase.from('shifts').update(payload).eq('id', modalShift.id)
    } else {
      await supabase.from('shifts').insert(payload)
    }
    setSaving(false)
    setModalOpen(false)
    fetchShifts()
  }

  async function deleteShift() {
    if (!modalShift?.id) return
    if (!confirm('このシフトを削除しますか？')) return
    await supabase.from('shifts').delete().eq('id', modalShift.id)
    setModalOpen(false)
    fetchShifts()
  }

  async function setDayOff() {
    if (!modalShift) return
    setSaving(true)
    const dateStr = formatDateStr(year, month, modalDay)
    const payload = {
      staff_id: modalShift.staff_id,
      store_id: selectedStoreId,
      date: dateStr,
      start_time: modalShift.start_time ?? 14,
      end_time: modalShift.end_time ?? 22,
      status: 'x',
      notes: modalShift.notes ?? '',
    }
    if (modalShift.id) {
      await supabase.from('shifts').update(payload).eq('id', modalShift.id)
    } else {
      await supabase.from('shifts').insert(payload)
    }
    setSaving(false)
    setModalOpen(false)
    fetchShifts()
  }

  function prevMonth() {
    if (month === 1) { setYear(y => y - 1); setMonth(12) }
    else setMonth(m => m - 1)
  }

  function nextMonth() {
    if (month === 12) { setYear(y => y + 1); setMonth(1) }
    else setMonth(m => m + 1)
  }

  return (
    <div className="p-3">
      {/* Controls */}
      <div className="bg-white rounded-lg shadow p-3 mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <button onClick={prevMonth} className="px-2 py-1 bg-gray-200 hover:bg-gray-300 rounded text-sm">◀</button>
            <span className="font-bold text-lg text-gray-800 min-w-28 text-center">
              {year}年{String(month).padStart(2, '0')}月
            </span>
            <button onClick={nextMonth} className="px-2 py-1 bg-gray-200 hover:bg-gray-300 rounded text-sm">▶</button>
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
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="text-gray-500">読み込み中...</div>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="text-xs border-collapse" style={{ minWidth: `${120 + daysInMonth * 50}px` }}>
              <thead>
                <tr className="bg-gray-800 text-white">
                  <th className="sticky left-0 z-10 bg-gray-800 px-3 py-2 border-r border-gray-600 w-28 text-left">
                    スタッフ
                  </th>
                  {days.map(d => {
                    const wd = getWeekday(d)
                    const isSun = wd === 0
                    const isSat = wd === 6
                    return (
                      <th
                        key={d}
                        className={`px-1 py-1 border-l border-gray-600 text-center w-12 ${
                          isSun ? 'text-red-300' : isSat ? 'text-blue-300' : 'text-gray-200'
                        }`}
                        style={{ minWidth: 50 }}
                      >
                        <div>{d}</div>
                        <div className="text-xs opacity-75">{WEEKDAY_LABELS[wd]}</div>
                      </th>
                    )
                  })}
                </tr>
                {/* Staff count row */}
                <tr className="bg-gray-700 text-white">
                  <td className="sticky left-0 z-10 bg-gray-700 px-3 py-1 border-r border-gray-600 text-xs text-gray-300">
                    出勤人数
                  </td>
                  {days.map(d => (
                    <td key={d} className="px-1 py-1 border-l border-gray-600 text-center font-bold text-yellow-300">
                      {getStaffCountForDay(d) || ''}
                    </td>
                  ))}
                </tr>
              </thead>
              <tbody>
                {staffList.length === 0 && (
                  <tr>
                    <td colSpan={daysInMonth + 1} className="text-center py-10 text-gray-400">
                      スタッフなし
                    </td>
                  </tr>
                )}
                {staffList.map((staff, rowIdx) => (
                  <tr
                    key={staff.id}
                    className={`border-b border-gray-100 ${rowIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}
                  >
                    <td className="sticky left-0 z-10 bg-inherit border-r border-gray-200 px-2 py-1 font-medium text-gray-800">
                      {staff.name}
                    </td>
                    {days.map(d => {
                      const shift = getShift(staff.id, d)
                      const wd = getWeekday(d)
                      const isSun = wd === 0
                      const isSat = wd === 6

                      let cellBg = 'hover:bg-blue-50'
                      let cellText = ''
                      let textColor = 'text-gray-700'

                      if (isSun) cellBg += ' bg-red-50'
                      else if (isSat) cellBg += ' bg-blue-50'

                      if (shift) {
                        if (shift.status === 'x') {
                          cellBg = 'bg-red-200 hover:bg-red-300'
                          cellText = '×'
                          textColor = 'text-red-700 font-bold'
                        } else {
                          cellBg = 'bg-pink-200 hover:bg-pink-300'
                          cellText = displayShiftTime(shift)
                          textColor = 'text-pink-900 font-medium'
                        }
                      }

                      return (
                        <td
                          key={d}
                          onClick={() => openModal(staff, d)}
                          className={`border-l border-gray-100 px-0.5 py-0.5 text-center cursor-pointer transition-colors ${cellBg} ${textColor}`}
                          style={{ minWidth: 50, height: 30 }}
                        >
                          <span className="block truncate text-center" style={{ fontSize: 10 }}>
                            {cellText}
                          </span>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="mt-3 flex gap-4 text-xs text-gray-600 flex-wrap">
        <span className="flex items-center gap-1"><span className="w-4 h-4 bg-pink-200 inline-block rounded"></span> 出勤</span>
        <span className="flex items-center gap-1"><span className="w-4 h-4 bg-red-200 inline-block rounded"></span> 休み(×)</span>
        <span className="flex items-center gap-1"><span className="w-4 h-4 bg-white border border-gray-200 inline-block rounded"></span> 未登録</span>
      </div>

      {/* Modal */}
      {modalOpen && modalShift && modalStaff && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center">
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-sm mx-4">
            <div className="bg-gray-800 text-white px-4 py-3 rounded-t-lg flex items-center justify-between">
              <h2 className="font-bold">
                シフト編集 - {modalStaff.name}
                <span className="text-sm font-normal ml-2 text-gray-300">
                  {year}/{String(month).padStart(2, '0')}/{String(modalDay).padStart(2, '0')}
                </span>
              </h2>
              <button onClick={() => setModalOpen(false)} className="text-gray-300 hover:text-white">✕</button>
            </div>
            <div className="p-4 space-y-3 text-sm">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">ステータス</label>
                <select
                  value={modalShift.status ?? 'normal'}
                  onChange={e => setModalShift(p => p ? { ...p, status: e.target.value as 'normal' | 'x' } : p)}
                  className="w-full border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="normal">出勤</option>
                  <option value="x">休み (×)</option>
                </select>
              </div>
              {modalShift.status !== 'x' && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      開始時間 (例: 14 = 14:00, 29 = 翌5:00)
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      max="32"
                      value={modalShift.start_time ?? 14}
                      onChange={e => setModalShift(p => p ? { ...p, start_time: Number(e.target.value) } : p)}
                      className="w-full border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      終了時間
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      max="32"
                      value={modalShift.end_time ?? 22}
                      onChange={e => setModalShift(p => p ? { ...p, end_time: Number(e.target.value) } : p)}
                      className="w-full border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </>
              )}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">メモ</label>
                <input
                  type="text"
                  value={modalShift.notes ?? ''}
                  onChange={e => setModalShift(p => p ? { ...p, notes: e.target.value } : p)}
                  className="w-full border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="px-4 py-3 bg-gray-50 rounded-b-lg flex gap-2 justify-between">
              <div>
                {modalShift.id && (
                  <button
                    onClick={deleteShift}
                    className="px-3 py-2 bg-red-500 hover:bg-red-600 text-white rounded font-medium text-sm transition-colors"
                  >
                    削除
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setModalOpen(false)}
                  className="px-3 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded font-medium text-sm transition-colors"
                >
                  キャンセル
                </button>
                <button
                  onClick={saveShift}
                  disabled={saving}
                  className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium text-sm transition-colors disabled:opacity-50"
                >
                  {saving ? '保存中...' : '保存'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
