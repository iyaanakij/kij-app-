'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { Shift, Staff, ShiftRequest, STORES, formatShiftTime } from '@/lib/types'

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

function formatDateStr(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function displayShiftTime(shift: Shift): string {
  const fmt = (t: number) => {
    if (t >= 24) return `翌${t % 1 === 0 ? Math.floor(t - 24) : t - 24}`
    return t % 1 === 0 ? String(Math.floor(t)) : String(t)
  }
  return `${fmt(shift.start_time)}-${fmt(shift.end_time)}`
}

function parseShiftValue(value: string): { mode: 'delete' | 'x' | 'normal'; start?: number; end?: number } {
  const trimmed = value.trim()
  if (trimmed === '' || trimmed === '-') return { mode: 'delete' }
  if (trimmed.toLowerCase() === 'x') return { mode: 'x' }
  const parts = trimmed.split('-').map(Number)
  const start = parts[0]
  const end = parts[1]
  if (!isNaN(start)) return { mode: 'normal', start, end: isNaN(end) ? undefined : end }
  return { mode: 'delete' }
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
  const [tab, setTab] = useState<'calendar' | 'requests'>('calendar')
  const [requests, setRequests] = useState<ShiftRequest[]>([])
  const [rejectModalId, setRejectModalId] = useState<number | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  // Inline editing
  const [editingCell, setEditingCell] = useState<{ staffId: number; day: number } | null>(null)
  const [editValue, setEditValue] = useState('')
  const editInputRef = useRef<HTMLInputElement>(null)

  const todayYear = now.getFullYear()
  const todayMonth = now.getMonth() + 1
  const todayDay = now.getDate()

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

  const fetchRequests = useCallback(async () => {
    const { data } = await supabase
      .from('shift_requests')
      .select('*, staff(id, name)')
      .order('created_at', { ascending: false })
    if (data) setRequests(data as ShiftRequest[])
  }, [])

  useEffect(() => { fetchStaff() }, [fetchStaff])
  useEffect(() => { fetchShifts() }, [fetchShifts])
  useEffect(() => { fetchRequests() }, [fetchRequests])

  const approveRequest = async (req: ShiftRequest) => {
    await supabase.from('shifts').insert({
      staff_id: req.staff_id,
      store_id: req.store_id,
      date: req.date,
      start_time: req.start_time,
      end_time: req.end_time,
      status: 'normal',
      notes: req.notes ?? '',
    })
    await supabase.from('shift_requests').update({ status: 'approved' }).eq('id', req.id)
    fetchRequests()
    fetchShifts()
  }

  const rejectRequest = async () => {
    if (rejectModalId === null) return
    await supabase.from('shift_requests').update({ status: 'rejected', reject_reason: rejectReason || null }).eq('id', rejectModalId)
    setRejectModalId(null)
    setRejectReason('')
    fetchRequests()
  }

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

  function isToday(day: number): boolean {
    return year === todayYear && month === todayMonth && day === todayDay
  }

  function startEdit(staffId: number, day: number) {
    const shift = getShift(staffId, day)
    let val = ''
    if (shift) {
      val = shift.status === 'x' ? 'x' : displayShiftTime(shift)
    }
    setEditingCell({ staffId, day })
    setEditValue(val)
    setTimeout(() => {
      editInputRef.current?.focus()
      editInputRef.current?.select()
    }, 0)
  }

  async function commitEdit(staffId: number, day: number, value: string) {
    const dateStr = formatDateStr(year, month, day)
    const existingShift = getShift(staffId, day)
    const parsed = parseShiftValue(value)

    if (parsed.mode === 'delete') {
      if (existingShift?.id) {
        await supabase.from('shifts').delete().eq('id', existingShift.id)
      }
    } else if (parsed.mode === 'x') {
      const payload = {
        staff_id: staffId,
        store_id: selectedStoreId,
        date: dateStr,
        start_time: existingShift?.start_time ?? 14,
        end_time: existingShift?.end_time ?? 22,
        status: 'x',
        notes: existingShift?.notes ?? '',
      }
      if (existingShift?.id) await supabase.from('shifts').update(payload).eq('id', existingShift.id)
      else await supabase.from('shifts').insert(payload)
    } else if (parsed.mode === 'normal' && parsed.start !== undefined) {
      const payload = {
        staff_id: staffId,
        store_id: selectedStoreId,
        date: dateStr,
        start_time: parsed.start,
        end_time: parsed.end ?? existingShift?.end_time ?? 22,
        status: 'normal',
        notes: existingShift?.notes ?? '',
      }
      if (existingShift?.id) await supabase.from('shifts').update(payload).eq('id', existingShift.id)
      else await supabase.from('shifts').insert(payload)
    }
    fetchShifts()
  }

  function moveTo(staffIdx: number, dayIdx: number, direction: 'right' | 'left' | 'down' | 'up') {
    let si = staffIdx
    let di = dayIdx
    if (direction === 'right') {
      di++
      if (di >= days.length) { di = 0; si = (si + 1) % staffList.length }
    } else if (direction === 'left') {
      di--
      if (di < 0) { di = days.length - 1; si = Math.max(0, si - 1) }
    } else if (direction === 'down') {
      si = Math.min(staffList.length - 1, si + 1)
    } else if (direction === 'up') {
      si = Math.max(0, si - 1)
    }
    startEdit(staffList[si].id, days[di])
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>, staffIdx: number, dayIdx: number) {
    const staffId = staffList[staffIdx].id
    const day = days[dayIdx]

    if (e.key === 'Enter' || (e.key === 'Tab' && !e.shiftKey)) {
      e.preventDefault()
      commitEdit(staffId, day, editValue)
      moveTo(staffIdx, dayIdx, 'right')
    } else if (e.key === 'Tab' && e.shiftKey) {
      e.preventDefault()
      commitEdit(staffId, day, editValue)
      moveTo(staffIdx, dayIdx, 'left')
    } else if (e.key === 'Escape') {
      setEditingCell(null)
      setEditValue('')
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      commitEdit(staffId, day, editValue)
      moveTo(staffIdx, dayIdx, 'down')
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      commitEdit(staffId, day, editValue)
      moveTo(staffIdx, dayIdx, 'up')
    } else if (e.key === 'ArrowRight') {
      const input = e.currentTarget
      if (input.selectionStart === input.value.length && input.selectionEnd === input.value.length) {
        e.preventDefault()
        commitEdit(staffId, day, editValue)
        moveTo(staffIdx, dayIdx, 'right')
      }
    } else if (e.key === 'ArrowLeft') {
      const input = e.currentTarget
      if (input.selectionStart === 0 && input.selectionEnd === 0) {
        e.preventDefault()
        commitEdit(staffId, day, editValue)
        moveTo(staffIdx, dayIdx, 'left')
      }
    }
  }

  function prevMonth() {
    if (month === 1) { setYear(y => y - 1); setMonth(12) }
    else setMonth(m => m - 1)
  }

  function nextMonth() {
    if (month === 12) { setYear(y => y + 1); setMonth(1) }
    else setMonth(m => m + 1)
  }

  const pendingCount = requests.filter(r => r.status === 'pending').length

  return (
    <div className="p-3">
      {/* Tab切替 */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setTab('calendar')}
          className={`px-5 py-2 rounded-full text-sm font-medium transition-colors ${tab === 'calendar' ? 'bg-blue-600 text-white shadow-sm' : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'}`}
        >
          シフトカレンダー
        </button>
        <button
          onClick={() => setTab('requests')}
          className={`px-5 py-2 rounded-full text-sm font-medium transition-colors flex items-center gap-2 ${tab === 'requests' ? 'bg-blue-600 text-white shadow-sm' : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'}`}
        >
          申請管理
          {pendingCount > 0 && (
            <span className="bg-red-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">{pendingCount}</span>
          )}
        </button>
      </div>

      {/* 申請管理タブ */}
      {tab === 'requests' && (
        <div className="bg-white rounded-xl shadow-md border border-gray-100 overflow-hidden">
          {requests.length === 0 ? (
            <div className="text-center py-16 text-gray-400">申請はありません</div>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-900 text-white">
                  <th className="px-4 py-3 text-left font-semibold">キャスト</th>
                  <th className="px-4 py-3 text-left font-semibold">日付</th>
                  <th className="px-4 py-3 text-left font-semibold">店舗</th>
                  <th className="px-4 py-3 text-left font-semibold">時間</th>
                  <th className="px-4 py-3 text-left font-semibold">メモ</th>
                  <th className="px-4 py-3 text-center font-semibold">ステータス</th>
                  <th className="px-4 py-3 text-center font-semibold w-36">操作</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r, i) => (
                  <tr key={r.id} className={`border-b border-gray-100 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/70'}`}>
                    <td className="px-4 py-3 font-semibold text-gray-800">{(r.staff as { name: string })?.name ?? '-'}</td>
                    <td className="px-4 py-3 text-gray-700 font-mono">{r.date.replace(/-/g, '/')}</td>
                    <td className="px-4 py-3 text-gray-600">{STORES.find(s => s.id === r.store_id)?.name ?? '-'}</td>
                    <td className="px-4 py-3 text-gray-700">{formatShiftTime(r.start_time)} 〜 {formatShiftTime(r.end_time)}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs max-w-xs truncate">{r.notes ?? ''}</td>
                    <td className="px-4 py-3 text-center">
                      {r.status === 'pending' && <span className="bg-yellow-100 text-yellow-700 text-xs font-bold px-2.5 py-1 rounded-full">審査中</span>}
                      {r.status === 'approved' && <span className="bg-green-100 text-green-700 text-xs font-bold px-2.5 py-1 rounded-full">承認済</span>}
                      {r.status === 'rejected' && (
                        <div>
                          <span className="bg-red-100 text-red-700 text-xs font-bold px-2.5 py-1 rounded-full">却下</span>
                          {r.reject_reason && <div className="text-xs text-red-400 mt-0.5">{r.reject_reason}</div>}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {r.status === 'pending' && (
                        <div className="flex gap-1.5 justify-center">
                          <button onClick={() => approveRequest(r)} className="bg-green-500 hover:bg-green-600 text-white text-xs px-3 py-1.5 rounded-full font-medium transition-colors">承認</button>
                          <button onClick={() => { setRejectModalId(r.id); setRejectReason('') }} className="bg-red-500 hover:bg-red-600 text-white text-xs px-3 py-1.5 rounded-full font-medium transition-colors">却下</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* 却下モーダル */}
      {rejectModalId !== null && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm">
            <div className="bg-gray-900 text-white px-5 py-4 rounded-t-xl flex items-center justify-between">
              <h2 className="font-bold text-base">却下理由</h2>
              <button onClick={() => setRejectModalId(null)} className="text-gray-400 hover:text-white text-xl leading-none">✕</button>
            </div>
            <div className="p-5">
              <input
                type="text"
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                placeholder="理由（任意）"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
            </div>
            <div className="px-5 pb-5 flex gap-2 justify-end">
              <button onClick={() => setRejectModalId(null)} className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg text-sm font-medium transition-colors">キャンセル</button>
              <button onClick={rejectRequest} className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-medium transition-colors">却下する</button>
            </div>
          </div>
        </div>
      )}

      {/* シフトカレンダー（既存） */}
      {tab === 'calendar' && (
      <div>
      {/* Controls */}
      <div className="bg-white rounded-xl shadow-md border border-gray-100 p-4 mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <button onClick={prevMonth} className="w-8 h-8 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded-full text-gray-700 font-bold transition-colors">◀</button>
            <span className="font-bold text-lg text-gray-800 min-w-28 text-center">{year}年{String(month).padStart(2, '0')}月</span>
            <button onClick={nextMonth} className="w-8 h-8 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded-full text-gray-700 font-bold transition-colors">▶</button>
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {STORES.map(s => (
              <button
                key={s.id}
                onClick={() => setSelectedStoreId(s.id)}
                className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${selectedStoreId === s.id ? 'bg-blue-600 text-white shadow-sm' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
              >
                {s.name}
              </button>
            ))}
          </div>
          <div className="ml-auto text-xs text-gray-400">
            クリックで入力 / <kbd className="bg-gray-100 px-1 rounded">Enter</kbd><kbd className="bg-gray-100 px-1 rounded ml-1">Tab</kbd> で次へ / 矢印で移動 / <kbd className="bg-gray-100 px-1 rounded">Esc</kbd> でキャンセル
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="text-gray-500 animate-pulse">読み込み中...</div>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-md border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto" onClick={e => { if ((e.target as HTMLElement).tagName !== 'INPUT') { setEditingCell(null) } }}>
            <table className="text-xs border-collapse" style={{ minWidth: `${120 + daysInMonth * 52}px` }}>
              <thead>
                <tr className="bg-gray-900 text-white">
                  <th className="sticky left-0 z-10 bg-gray-900 px-3 py-2.5 border-r border-gray-700 w-28 text-left font-semibold">スタッフ</th>
                  {days.map(d => {
                    const wd = getWeekday(d)
                    const isSun = wd === 0
                    const isSat = wd === 6
                    const today = isToday(d)
                    return (
                      <th
                        key={d}
                        className={`px-1 py-2 border-l border-gray-700 text-center ${isSun ? 'text-red-300' : isSat ? 'text-sky-300' : 'text-gray-200'} ${today ? 'bg-blue-800' : ''}`}
                        style={{ minWidth: 52 }}
                      >
                        <div className={today ? 'inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-400 text-white font-bold text-xs' : ''}>{d}</div>
                        <div className="text-xs opacity-75">{WEEKDAY_LABELS[wd]}</div>
                      </th>
                    )
                  })}
                </tr>
                <tr className="bg-gray-800 text-white">
                  <td className="sticky left-0 z-10 bg-gray-800 px-3 py-1.5 border-r border-gray-600 text-xs text-gray-300">出勤人数</td>
                  {days.map(d => (
                    <td key={d} className={`px-1 py-1 border-l border-gray-600 text-center font-bold text-yellow-300 ${isToday(d) ? 'bg-blue-900' : ''}`}>
                      {getStaffCountForDay(d) || ''}
                    </td>
                  ))}
                </tr>
              </thead>
              <tbody>
                {staffList.length === 0 && (
                  <tr><td colSpan={daysInMonth + 1} className="text-center py-10 text-gray-400">スタッフなし</td></tr>
                )}
                {staffList.map((staff, staffIdx) => (
                  <tr key={staff.id} className={`border-b border-gray-100 ${staffIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50/70'}`}>
                    <td className="sticky left-0 z-10 bg-inherit border-r border-gray-200 px-3 py-1.5 font-semibold text-gray-800">{staff.name}</td>
                    {days.map((d, dayIdx) => {
                      const shift = getShift(staff.id, d)
                      const wd = getWeekday(d)
                      const isSun = wd === 0
                      const isSat = wd === 6
                      const today = isToday(d)
                      const isEditing = editingCell?.staffId === staff.id && editingCell?.day === d

                      let cellBg = 'hover:bg-blue-50'
                      let cellText = ''
                      let textColor = 'text-gray-700'

                      if (!shift) {
                        if (isSun) cellBg = 'bg-red-50 hover:bg-red-100'
                        else if (isSat) cellBg = 'bg-sky-50 hover:bg-sky-100'
                      } else if (shift.status === 'x') {
                        cellBg = 'bg-red-200 hover:bg-red-300'
                        cellText = '×'
                        textColor = 'text-red-700 font-bold'
                      } else {
                        cellBg = 'bg-pink-200 hover:bg-pink-300'
                        cellText = displayShiftTime(shift)
                        textColor = 'text-pink-900 font-medium'
                      }

                      return (
                        <td
                          key={d}
                          onClick={e => { e.stopPropagation(); startEdit(staff.id, d) }}
                          className={`relative border-l border-gray-100 px-0.5 py-0 text-center cursor-pointer transition-colors ${isEditing ? 'bg-yellow-50 ring-2 ring-inset ring-yellow-400 z-10' : `${cellBg} ${textColor}`} ${today ? 'ring-1 ring-inset ring-blue-400' : ''}`}
                          style={{ minWidth: 52, height: 30 }}
                        >
                          {isEditing ? (
                            <input
                              ref={editInputRef}
                              value={editValue}
                              onChange={e => setEditValue(e.target.value)}
                              onKeyDown={e => handleKeyDown(e, staffIdx, dayIdx)}
                              onBlur={() => {
                                commitEdit(staff.id, d, editValue)
                                setEditingCell(null)
                              }}
                              className="w-full h-full bg-transparent text-center text-xs font-medium text-gray-800 focus:outline-none"
                              style={{ fontSize: 10 }}
                              placeholder="14-22"
                            />
                          ) : (
                            <span className="block truncate text-center" style={{ fontSize: 10 }}>{cellText}</span>
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
      )}

      {/* Legend */}
      <div className="mt-3 flex gap-4 text-xs text-gray-500 flex-wrap">
        <span className="flex items-center gap-1.5"><span className="w-4 h-4 bg-pink-200 inline-block rounded border border-pink-300"></span> 出勤（例: <code className="bg-gray-100 px-1 rounded">14-22</code>）</span>
        <span className="flex items-center gap-1.5"><span className="w-4 h-4 bg-red-200 inline-block rounded border border-red-300"></span> 休み（<code className="bg-gray-100 px-1 rounded">x</code>）</span>
        <span className="flex items-center gap-1.5"><span className="w-4 h-4 bg-white inline-block rounded border border-gray-200"></span> 未登録（空欄で削除）</span>
        <span className="flex items-center gap-1.5"><span className="w-4 h-4 bg-red-50 inline-block rounded border border-red-200"></span> 日曜</span>
        <span className="flex items-center gap-1.5"><span className="w-4 h-4 bg-sky-50 inline-block rounded border border-sky-200"></span> 土曜</span>
      </div>
      </div>
      )}
    </div>
  )
}
