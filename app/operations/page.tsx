'use client'

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { Shift, Reservation, Staff, AREAS, formatShiftTime, hhmmToDecimal, todayString } from '@/lib/types'

const TIME_START = 10
const TIME_END = 30
const SLOT_MINUTES = 10
const TOTAL_SLOTS = ((TIME_END - TIME_START) * 60) / SLOT_MINUTES
const CELL_WIDTH = 10

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

const shouldShowLabel = (i: number) => i % 6 === 0
const isHourlyBoundary = (i: number) => i % 6 === 0

type CellStatus = 'outside' | 'available' | 'occupied'

interface StaffRow { staff: Staff; shift: Shift | null }

interface BoardAnnotation {
  id: string
  staff_id: number
  date: string
  start_time: number
  end_time: number
  color: string
  memo: string | null
  store_id: number
}

const ANNOTATION_COLORS = [
  { key: 'yellow',  label: '黄（休憩）',    bg: 'bg-yellow-200',  border: 'border-yellow-300' },
  { key: 'orange',  label: 'オレンジ（制限）', bg: 'bg-orange-200',  border: 'border-orange-300' },
  { key: 'red',     label: '赤（不在）',    bg: 'bg-red-200',     border: 'border-red-300'    },
  { key: 'green',   label: '緑（特記）',    bg: 'bg-green-200',   border: 'border-green-300'  },
  { key: 'purple',  label: '紫（その他）',  bg: 'bg-purple-200',  border: 'border-purple-300' },
  { key: 'gray',    label: 'グレー',        bg: 'bg-gray-300',    border: 'border-gray-400'   },
]

function decimalToHHMM(decimal: number): string {
  const h = Math.floor(decimal)
  const m = Math.round((decimal - h) * 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function hhmmStringToDecimal(hhmm: string, nextDay: boolean): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h + m / 60 + (nextDay ? 24 : 0)
}

function slotToTimeLabel(slotDecimal: number): { hhmm: string; next: boolean } {
  const next = slotDecimal >= 24
  const d = next ? slotDecimal - 24 : slotDecimal
  return { hhmm: decimalToHHMM(d), next }
}

export default function OperationsPage() {
  const [selectedDate, setSelectedDate] = useState(todayString())
  const [selectedAreaId, setSelectedAreaId] = useState(3) // デフォルト: 西船橋
  const [shifts, setShifts] = useState<Shift[]>([])
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [staffList, setStaffList] = useState<Staff[]>([])
  const [annotations, setAnnotations] = useState<BoardAnnotation[]>([])
  const [loading, setLoading] = useState(false)

  // drag state
  const [drag, setDrag] = useState<{ staffId: number; startSlot: number; endSlot: number } | null>(null)
  const dragRef = useRef<typeof drag>(null)
  const dragStartRef = useRef<{ staffId: number; slot: number } | null>(null)
  const dragMovedRef = useRef(false)
  useEffect(() => { dragRef.current = drag }, [drag])

  // annotation modal
  const [annotationModal, setAnnotationModal] = useState(false)
  const [editAnnotation, setEditAnnotation] = useState<{
    staff_id: number | null
    start_hhmm: string; start_next: boolean
    end_hhmm: string;   end_next: boolean
    color: string; memo: string
  }>({ staff_id: null, start_hhmm: '13:00', start_next: false, end_hhmm: '14:00', end_next: false, color: 'yellow', memo: '' })
  const [editingAnnotationId, setEditingAnnotationId] = useState<string | null>(null)

const [currentTimeDecimal, setCurrentTimeDecimal] = useState<number | null>(null)
  const [currentTimeLabel, setCurrentTimeLabel] = useState<string>('')
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const update = () => {
      const now = new Date()
      const h = now.getHours(); const m = now.getMinutes(); const s = now.getSeconds()
      let decimal = h + m / 60 + s / 3600
      if (decimal < TIME_START) decimal += 24
      setCurrentTimeDecimal(decimal)
      setCurrentTimeLabel(h < 7 ? `翌${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}` : `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`)
    }
    update()
    const interval = setInterval(update, 10000)
    return () => clearInterval(interval)
  }, [])

  const fetchData = useCallback(async () => {
    setLoading(true)
    const area = AREAS.find(a => a.id === selectedAreaId)!
    const [staffRes, shiftsRes, reservationsRes, annotationsRes] = await Promise.all([
      supabase.from('staff').select('*').order('name'),
      supabase.from('shifts').select('*').eq('date', selectedDate).in('store_id', area.storeIds).neq('status', 'x'),
      supabase.from('reservations').select('*').eq('date', selectedDate).in('store_id', area.storeIds),
      supabase.from('board_annotations').select('*').eq('date', selectedDate).in('store_id', area.storeIds),
    ])
    if (staffRes.data) setStaffList(staffRes.data)
    if (shiftsRes.data) setShifts(shiftsRes.data)
    if (reservationsRes.data) setReservations(reservationsRes.data)
    if (annotationsRes.data) setAnnotations(annotationsRes.data)
    setLoading(false)
  }, [selectedDate, selectedAreaId])

  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    const channel = supabase
      .channel('operations-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shifts' }, fetchData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reservations' }, fetchData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'board_annotations' }, fetchData)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fetchData])

  // Global mouseup: just clean up drag tracking refs, keep visual selection
  useEffect(() => {
    const handleMouseUp = () => {
      dragStartRef.current = null
      dragMovedRef.current = false
    }
    document.addEventListener('mouseup', handleMouseUp)
    return () => document.removeEventListener('mouseup', handleMouseUp)
  }, [])

  const staffRows = useMemo((): StaffRow[] => {
    const seen = new Set<number>()
    const rows: StaffRow[] = []
    // シフトがある人を追加（同一スタッフが複数店舗に掲載されている場合は最初の1件のみ）
    shifts.forEach(shift => {
      if (seen.has(shift.staff_id)) return
      const staff = staffList.find(s => s.id === shift.staff_id)
      if (staff) { rows.push({ staff, shift }); seen.add(shift.staff_id) }
    })
    // シフトなし・予約だけある人を追加
    reservations.forEach(r => {
      if (!r.staff_id || seen.has(r.staff_id)) return
      const staff = staffList.find(s => s.id === r.staff_id)
      if (staff) { rows.push({ staff, shift: null }); seen.add(r.staff_id) }
    })
    rows.sort((a, b) => (a.shift?.start_time ?? 99) - (b.shift?.start_time ?? 99))
    return rows
  }, [shifts, reservations, staffList])

  function getCellStatus(staffId: number, slotIdx: number): { status: CellStatus; reservation?: Reservation } {
    const slotTime = TIME_START + slotIdx * (SLOT_MINUTES / 60)
    const occupying = reservations.find(r => {
      if (r.staff_id !== staffId || !r.time || !r.course_duration) return false
      const resStart = hhmmToDecimal(r.time)
      const resEnd = resStart + (r.course_duration + Math.round(((r.extension ?? 0) / 3000) * 10)) / 60
      return slotTime >= resStart && slotTime < resEnd
    })
    if (occupying) return { status: 'occupied', reservation: occupying }
    const shift = shifts.find(s => s.staff_id === staffId)
    return { status: shift && slotTime >= shift.start_time && slotTime < shift.end_time ? 'available' : 'outside' }
  }

  function getCellAnnotation(staffId: number, slotIdx: number): BoardAnnotation | null {
    const slotTime = TIME_START + slotIdx * (SLOT_MINUTES / 60)
    return annotations.find(a => a.staff_id === staffId && slotTime >= a.start_time && slotTime < a.end_time) ?? null
  }

  const slots = Array.from({ length: TOTAL_SLOTS }, (_, i) => i)
  const isToday = selectedDate === todayString()
  const currentTimeSlotOffset = useMemo(() => {
    if (!isToday || currentTimeDecimal === null) return null
    if (currentTimeDecimal < TIME_START || currentTimeDecimal >= TIME_END) return null
    return (currentTimeDecimal - TIME_START) * (60 / SLOT_MINUTES) * CELL_WIDTH
  }, [isToday, currentTimeDecimal])

  useEffect(() => {
    if (!isToday || currentTimeSlotOffset === null) return
    const el = containerRef.current
    if (!el) return
    el.scrollLeft = Math.max(0, STAFF_COL_WIDTH + currentTimeSlotOffset - el.clientWidth / 2)
  }, [isToday, currentTimeSlotOffset, loading])

  const STAFF_COL_WIDTH = 160

  const openAnnotationModal = () => {
    if (drag) {
      const minSlot = Math.min(drag.startSlot, drag.endSlot)
      const maxSlot = Math.max(drag.startSlot, drag.endSlot)
      const startDecimal = TIME_START + minSlot * (SLOT_MINUTES / 60)
      const endDecimal   = TIME_START + (maxSlot + 1) * (SLOT_MINUTES / 60)
      const s = slotToTimeLabel(startDecimal)
      const e = slotToTimeLabel(endDecimal)
      setEditAnnotation({
        staff_id: drag.staffId,
        start_hhmm: s.hhmm, start_next: s.next,
        end_hhmm: e.hhmm,   end_next: e.next,
        color: 'yellow', memo: '',
      })
    } else {
      setEditAnnotation({
        staff_id: staffRows[0]?.staff.id ?? null,
        start_hhmm: '13:00', start_next: false,
        end_hhmm: '14:00',   end_next: false,
        color: 'yellow', memo: '',
      })
    }
    setAnnotationModal(true)
  }

  const openEditAnnotation = (ann: BoardAnnotation) => {
    const s = slotToTimeLabel(ann.start_time)
    const e = slotToTimeLabel(ann.end_time)
    setEditAnnotation({
      staff_id: ann.staff_id,
      start_hhmm: s.hhmm, start_next: s.next,
      end_hhmm: e.hhmm,   end_next: e.next,
      color: ann.color,
      memo: ann.memo ?? '',
    })
    setEditingAnnotationId(ann.id)
    setAnnotationModal(true)
  }

  const saveAnnotation = async () => {
    if (!editAnnotation.staff_id) return
    const startTime = hhmmStringToDecimal(editAnnotation.start_hhmm, editAnnotation.start_next)
    const endTime   = hhmmStringToDecimal(editAnnotation.end_hhmm,   editAnnotation.end_next)
    if (startTime >= endTime) return
    const payload = {
      staff_id: editAnnotation.staff_id,
      date: selectedDate,
      start_time: startTime,
      end_time: endTime,
      color: editAnnotation.color,
      memo: editAnnotation.memo,
      store_id: shifts.find(s => s.staff_id === editAnnotation.staff_id)?.store_id ?? 1,
    }
    if (editingAnnotationId) {
      await supabase.from('board_annotations').update(payload).eq('id', editingAnnotationId)
    } else {
      await supabase.from('board_annotations').insert(payload)
    }
    setAnnotationModal(false)
    setEditingAnnotationId(null)
    setDrag(null)
    fetchData()
  }

  const deleteAnnotation = async (id: string) => {
    await supabase.from('board_annotations').delete().eq('id', id)
    setAnnotationModal(false)
    setEditingAnnotationId(null)
    fetchData()
  }

  return (
    <div className="p-3">
      {/* Controls */}
      <div className="bg-white rounded-xl shadow-md border border-gray-100 p-4 mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1">
            <button onClick={() => { const d = new Date(selectedDate); d.setDate(d.getDate()-1); setSelectedDate(d.toISOString().split('T')[0]) }} className="px-2 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-bold transition-colors">◀</button>
            <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50" />
            <button onClick={() => { const d = new Date(selectedDate); d.setDate(d.getDate()+1); setSelectedDate(d.toISOString().split('T')[0]) }} className="px-2 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-bold transition-colors">▶</button>
          </div>
          <div className="flex gap-1.5">
            {AREAS.map(a => (
              <button key={a.id} onClick={() => setSelectedAreaId(a.id)} className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${selectedAreaId === a.id ? 'bg-blue-600 text-white shadow-sm' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>{a.name}</button>
            ))}
          </div>
          {drag ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-indigo-700 bg-indigo-100 border border-indigo-300 rounded-lg px-2 py-1">
                {staffList.find(s => s.id === drag.staffId)?.name}
                {slotLabel(Math.min(drag.startSlot, drag.endSlot))} 〜 {slotLabel(Math.max(drag.startSlot, drag.endSlot) + 1)}
              </span>
              <button onClick={openAnnotationModal} className="px-3 py-1.5 rounded-lg bg-yellow-400 hover:bg-yellow-500 text-yellow-900 text-sm font-bold transition-colors">＋ メモ追加</button>
              <button onClick={() => setDrag(null)} className="px-2 py-1.5 rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-600 text-sm transition-colors">✕</button>
            </div>
          ) : (
            <button onClick={openAnnotationModal} className="px-3 py-1.5 rounded-lg bg-yellow-400 hover:bg-yellow-500 text-yellow-900 text-sm font-medium transition-colors">＋ メモ追加</button>
          )}
          <div className="ml-auto flex gap-4 text-xs flex-wrap">
            <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-blue-200 border border-blue-300 inline-block"></span><span className="text-gray-600">空き</span></span>
            <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-red-400 border border-red-500 inline-block"></span><span className="text-gray-600">対応中</span></span>
            <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-yellow-200 border border-yellow-300 inline-block"></span><span className="text-gray-600">メモ</span></span>
            <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-gray-100 inline-block border border-gray-200"></span><span className="text-gray-600">範囲外</span></span>
            {isToday && <span className="flex items-center gap-1.5"><span className="w-0.5 h-4 bg-red-500 inline-block"></span><span className="text-gray-600">現在時刻</span></span>}
            <span className="text-gray-400 italic">ドラッグで範囲選択 → メモ追加</span>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><div className="text-gray-500 animate-pulse">読み込み中...</div></div>
      ) : (
        <div className="bg-white rounded-xl shadow-md border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto" ref={containerRef}>
            <div style={{ position: 'relative', minWidth: `${STAFF_COL_WIDTH + TOTAL_SLOTS * CELL_WIDTH}px` }}>
              {isToday && currentTimeSlotOffset !== null && (
                <div style={{ position:'absolute', top:0, bottom:0, left: STAFF_COL_WIDTH + currentTimeSlotOffset, width:2, backgroundColor:'#ef4444', zIndex:20, pointerEvents:'none' }}>
                  <span style={{ position:'absolute', top:2, left:3, fontSize:9, color:'#ef4444', fontWeight:'bold', whiteSpace:'nowrap', background:'white', padding:'0 2px', borderRadius:2 }}>{currentTimeLabel}</span>
                </div>
              )}

              <table
                className="text-xs border-collapse select-none"
                style={{ width: STAFF_COL_WIDTH + TOTAL_SLOTS * CELL_WIDTH, tableLayout:'fixed' }}
                onMouseLeave={() => {
                  // ドラッグ中（dragStartRef がセット済み）のみキャンセル
                  if (dragStartRef.current && !dragMovedRef.current) {
                    dragStartRef.current = null
                    setDrag(null)
                  }
                }}
              >
                <thead>
                  <tr className="bg-gray-900 text-white">
                    <th className="sticky left-0 z-10 bg-gray-900 py-2 border-r border-gray-700 text-left" style={{ width: STAFF_COL_WIDTH, minWidth: STAFF_COL_WIDTH, paddingLeft:8, paddingRight:8 }}>
                      スタッフ / シフト
                    </th>
                    {slots.map(i => (
                      <th key={i} className={`px-0 py-1 text-center font-normal ${isHourlyBoundary(i) ? 'border-l-2 border-gray-500' : 'border-l border-gray-700'}`} style={{ width: CELL_WIDTH, minWidth: CELL_WIDTH }}>
                        {shouldShowLabel(i) ? <span className="text-gray-300 block whitespace-nowrap" style={{ fontSize:8 }}>{slotLabel(i)}</span> : null}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {staffRows.length === 0 && (
                    <tr><td colSpan={TOTAL_SLOTS+1} className="text-center py-10 text-gray-400">シフトデータなし</td></tr>
                  )}
                  {staffRows.map(({ staff, shift }) => (
                    <tr key={staff.id} className="border-b border-gray-100">
                      <td className="sticky left-0 z-10 bg-white border-r border-gray-200 py-1.5" style={{ width: STAFF_COL_WIDTH, minWidth: STAFF_COL_WIDTH, paddingLeft:8, paddingRight:8 }}>
                        <div className="font-semibold text-gray-800 truncate" style={{ maxWidth: STAFF_COL_WIDTH-16 }}>{staff.name}</div>
                        {shift
                          ? <div className="text-gray-500" style={{ fontSize:10 }}>{formatShiftTime(shift.start_time)} 〜 {formatShiftTime(shift.end_time)}</div>
                          : <div className="text-gray-400" style={{ fontSize:10 }}>シフトなし</div>
                        }
                      </td>
                      {slots.map(slotIdx => {
                        const { status, reservation } = getCellStatus(staff.id, slotIdx)
                        const annotation = getCellAnnotation(staff.id, slotIdx)
                        const colorDef = annotation ? ANNOTATION_COLORS.find(c => c.key === annotation.color) : null

                        // Drag highlight
                        const isDragged = drag && drag.staffId === staff.id &&
                          slotIdx >= Math.min(drag.startSlot, drag.endSlot) &&
                          slotIdx <= Math.max(drag.startSlot, drag.endSlot)

                        let bgClass = 'bg-gray-100'
                        let borderClass = isHourlyBoundary(slotIdx) ? 'border-l-2 border-gray-400' : 'border-l border-gray-200'

                        if (isDragged) {
                          bgClass = 'bg-indigo-300'
                          borderClass = isHourlyBoundary(slotIdx) ? 'border-l-2 border-indigo-500' : 'border-l border-indigo-400'
                        } else if (status === 'occupied') {
                          bgClass = 'bg-red-400'
                          borderClass = isHourlyBoundary(slotIdx) ? 'border-l-2 border-red-600' : 'border-l border-red-500'
                        } else if (annotation && colorDef) {
                          bgClass = colorDef.bg
                          borderClass = isHourlyBoundary(slotIdx) ? `border-l-2 ${colorDef.border}` : `border-l ${colorDef.border}`
                        } else if (status === 'available') {
                          bgClass = 'bg-blue-200'
                          borderClass = isHourlyBoundary(slotIdx) ? 'border-l-2 border-blue-400' : 'border-l border-blue-300'
                        }

                        const title = status === 'occupied' && reservation
                          ? `${reservation.customer_name ?? ''} ${reservation.course_duration ?? ''}分`
                          : annotation ? `${annotation.memo ?? ''} (${decimalToHHMM(annotation.start_time)}〜${decimalToHHMM(annotation.end_time)}) ※クリックで削除` : ''

                        let cellText = ''
                        if (status === 'occupied' && reservation && reservation.time) {
                          const resStartSlot = Math.round(getSlotIndex(hhmmToDecimal(reservation.time)))
                          if (slotIdx === resStartSlot) cellText = (reservation.customer_name ?? '').slice(0, 3)
                        } else if (annotation && annotation.memo) {
                          const annStartSlot = Math.round(getSlotIndex(annotation.start_time))
                          if (slotIdx === annStartSlot) cellText = annotation.memo.slice(0, 5)
                        }

                        return (
                          <td
                            key={slotIdx}
                            className={`p-0 ${bgClass} ${borderClass} transition-colors cursor-crosshair`}
                            title={title}
                            style={{ width: CELL_WIDTH, minWidth: CELL_WIDTH, height: 28 }}
                            onMouseDown={e => {
                              e.preventDefault()
                              dragStartRef.current = { staffId: staff.id, slot: slotIdx }
                              dragMovedRef.current = false
                              // don't reset drag state yet — wait until mouse moves
                            }}
                            onMouseEnter={() => {
                              if (dragStartRef.current) {
                                dragMovedRef.current = true
                                setDrag({ staffId: dragStartRef.current.staffId, startSlot: dragStartRef.current.slot, endSlot: dragStartRef.current.staffId === staff.id ? slotIdx : dragStartRef.current.slot })
                              }
                            }}
                            onClick={() => {
                              if (!dragMovedRef.current && annotation && status !== 'occupied') {
                                openEditAnnotation(annotation)
                              }
                            }}
                          >
                            {cellText && (
                              <span className={`font-bold flex items-center h-full whitespace-nowrap pointer-events-none ${status === 'occupied' ? 'text-white' : 'text-gray-700'}`} style={{ fontSize: 11, paddingLeft: 2, overflow: 'visible', position: 'relative', zIndex: 5 }}>
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

          <div className="px-4 py-3 border-t border-gray-200 bg-gray-50 flex flex-wrap gap-6 text-sm">
            <div className="text-gray-600">出勤スタッフ: <span className="font-bold text-gray-900">{staffRows.filter(r => r.shift).length}名</span></div>
            <div className="text-gray-600">対応中: <span className="font-bold text-red-600">{reservations.filter(r => r.staff_id && r.course_duration).length}件</span></div>
          </div>
        </div>
      )}

      {/* メモ追加モーダル */}
      {annotationModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-bold text-gray-800 mb-4">{editingAnnotationId ? 'メモ編集' : 'メモ追加'}</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">スタッフ</label>
                <select value={editAnnotation.staff_id ?? ''} onChange={e => setEditAnnotation(a => ({ ...a, staff_id: Number(e.target.value) }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {staffRows.map(({ staff }) => <option key={staff.id} value={staff.id}>{staff.name}</option>)}
                </select>
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">開始</label>
                  <input type="time" value={editAnnotation.start_hhmm} onChange={e => setEditAnnotation(a => ({ ...a, start_hhmm: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <label className="flex items-center gap-1 mt-1 text-xs text-gray-500 cursor-pointer">
                    <input type="checkbox" checked={editAnnotation.start_next} onChange={e => setEditAnnotation(a => ({ ...a, start_next: e.target.checked }))} /> 翌日
                  </label>
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">終了</label>
                  <input type="time" value={editAnnotation.end_hhmm} onChange={e => setEditAnnotation(a => ({ ...a, end_hhmm: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <label className="flex items-center gap-1 mt-1 text-xs text-gray-500 cursor-pointer">
                    <input type="checkbox" checked={editAnnotation.end_next} onChange={e => setEditAnnotation(a => ({ ...a, end_next: e.target.checked }))} /> 翌日
                  </label>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">色</label>
                <div className="flex gap-2 flex-wrap">
                  {ANNOTATION_COLORS.map(c => (
                    <button key={c.key} onClick={() => setEditAnnotation(a => ({ ...a, color: c.key }))} className={`px-2 py-1 rounded-lg text-xs border-2 transition-all ${c.bg} ${editAnnotation.color === c.key ? 'border-gray-700 scale-110 shadow' : c.border}`}>
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">メモ</label>
                <input type="text" value={editAnnotation.memo} onChange={e => setEditAnnotation(a => ({ ...a, memo: e.target.value }))} placeholder="例：休憩、80分まで対応可" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => { setAnnotationModal(false); setEditingAnnotationId(null) }} className="flex-1 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium transition-colors">キャンセル</button>
              {editingAnnotationId && (
                <button onClick={() => deleteAnnotation(editingAnnotationId)} className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-medium transition-colors">削除</button>
              )}
              <button onClick={saveAnnotation} className="flex-1 py-2 bg-yellow-400 hover:bg-yellow-500 text-yellow-900 rounded-lg text-sm font-bold transition-colors">保存</button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
