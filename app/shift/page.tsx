'use client'

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { Shift, Staff, ShiftRequest, AREAS, formatShiftTime, todayString } from '@/lib/types'

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

function formatDateStr(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function displayShiftTime(shift: Shift): string {
  const fmt = (t: number) => {
    const base = t >= 24 ? t - 24 : t
    const h = Math.floor(base)
    const timeStr = base % 1 === 0 ? String(h) : `${h}.5`
    return t >= 24 ? `翌${timeStr}` : timeStr
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
const NARITA_AREA_ID = 1
const DORM_TOTAL_ROOMS = 5
const DORM_USAGE_MEMO = '__SHIFT_DORM_USAGE__'
const DORM_ENTRY_MEMO_PREFIX = '__NARITA_DORM_ENTRY__'
const SHOOTING_MEMO_PREFIX = '__SHIFT_SHOOTING__'
const RETURN_HOME_MEMO = '__SHIFT_RETURN_HOME__'
const SHIFT_CONFIRMED_MEMO = '__SHIFT_CONFIRMED__'
const SUMMARY_COLUMN_WIDTH = 72

interface ShiftMarker {
  id: string
  staff_id: number
  date: string
  store_id: number
  memo: string | null
}

export default function ShiftPage() {
  const todayStr = todayString()
  const [todayYear, todayMonth, todayDay2] = todayStr.split('-').map(Number)
  const [year, setYear] = useState(todayYear)
  const [month, setMonth] = useState(todayMonth)
  const [selectedAreaId, setSelectedAreaId] = useState(3) // デフォルト: 西船橋
  const [staffList, setStaffList] = useState<Staff[]>([])
  const [staffStores, setStaffStores] = useState<{ staff_id: number; store_id: number }[]>([])
  const [shifts, setShifts] = useState<Shift[]>([])
  const [shiftMarkers, setShiftMarkers] = useState<ShiftMarker[]>([])
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState<'calendar' | 'requests'>('calendar')
  const [requests, setRequests] = useState<ShiftRequest[]>([])
  const [rejectModalId, setRejectModalId] = useState<number | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null)
  const [hiddenDays, setHiddenDays] = useState<Set<number>>(new Set())

  function toggleHiddenDay(day: number) {
    setHiddenDays(prev => {
      const next = new Set(prev)
      if (next.has(day)) next.delete(day)
      else next.add(day)
      return next
    })
  }

  const hiddenDaysKey = `kij_shift_hidden_days_${year}_${month}_${selectedAreaId}`

  useEffect(() => {
    try {
      const stored = localStorage.getItem(hiddenDaysKey)
      setHiddenDays(stored ? new Set(JSON.parse(stored) as number[]) : new Set())
    } catch {
      setHiddenDays(new Set())
    }
  }, [hiddenDaysKey])

  useEffect(() => {
    if (hiddenDays.size === 0) localStorage.removeItem(hiddenDaysKey)
    else localStorage.setItem(hiddenDaysKey, JSON.stringify(Array.from(hiddenDays)))
  }, [hiddenDays, hiddenDaysKey])

  // Inline editing
  const [editingCell, setEditingCell] = useState<{ staffId: number; day: number } | null>(null)
  const [editValue, setEditValue] = useState('')
  const editInputRef = useRef<HTMLInputElement>(null)

  const todayDay = todayDay2

  const daysInMonth = getDaysInMonth(year, month)
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1)
  const summaryColumnCount = selectedAreaId === NARITA_AREA_ID ? 4 : 3

  const normalShifts = useMemo(() => shifts.filter(s => s.status !== 'x'), [shifts])

  const dailyStaffCounts = useMemo(() => {
    const byDate = new Map<string, Set<number>>()
    normalShifts.forEach(shift => {
      if (!byDate.has(shift.date)) byDate.set(shift.date, new Set())
      byDate.get(shift.date)!.add(shift.staff_id)
    })
    return byDate
  }, [normalShifts])

  const staffMonthlyStats = useMemo(() => {
    const stats = new Map<number, { days: number; hours: number }>()
    const seenStaffDays = new Set<string>()
    normalShifts.forEach(shift => {
      const current = stats.get(shift.staff_id) ?? { days: 0, hours: 0 }
      const staffDayKey = `${shift.staff_id}:${shift.date}`
      if (!seenStaffDays.has(staffDayKey)) {
        current.days += 1
        current.hours += Math.max(0, shift.end_time - shift.start_time)
        seenStaffDays.add(staffDayKey)
      }
      stats.set(shift.staff_id, current)
    })
    return stats
  }, [normalShifts])

  const monthlyTotalShiftDays = useMemo(() => {
    return Array.from(dailyStaffCounts.values()).reduce((sum, ids) => sum + ids.size, 0)
  }, [dailyStaffCounts])

  const monthlyTotalHours = useMemo(() => {
    return Array.from(staffMonthlyStats.values()).reduce((sum, stats) => sum + stats.hours, 0)
  }, [staffMonthlyStats])

  const monthlyAverageStaffCount = daysInMonth > 0 ? monthlyTotalShiftDays / daysInMonth : 0

  const monthlyDormUsageRate = useMemo(() => {
    if (selectedAreaId !== NARITA_AREA_ID) return 0
    const usedDormDays = new Set(
      shiftMarkers
        .filter(isDormMarker)
        .map(d => `${d.staff_id}:${d.date}`)
    ).size
    const totalDormDays = DORM_TOTAL_ROOMS * getDaysInMonth(year, month)
    return totalDormDays > 0 ? (usedDormDays / totalDormDays) * 100 : 0
  }, [shiftMarkers, selectedAreaId, year, month])

  function formatHours(hours: number): string {
    return Number.isInteger(hours) ? String(hours) : hours.toFixed(1)
  }

  // 選択エリアに所属するスタッフだけを表示する。
  const sortedStaffList = useMemo(() => {
    const area = AREAS.find(a => a.id === selectedAreaId)!
    const areaStaffIds = new Set(
      staffStores
        .filter(link => area.storeIds.includes(link.store_id))
        .map(link => link.staff_id)
    )
    const visibleStaff = staffList.filter(staff => areaStaffIds.has(staff.id))
    return visibleStaff.sort((a, b) => {
      const aCount = shifts.filter(s => s.staff_id === a.id).length
      const bCount = shifts.filter(s => s.staff_id === b.id).length
      if (bCount !== aCount) return bCount - aCount
      return a.name.localeCompare(b.name, 'ja')
    })
  }, [staffList, staffStores, shifts, selectedAreaId])

  const fetchStaff = useCallback(async () => {
    const [{ data: staffData }, { data: storeLinks }] = await Promise.all([
      supabase.from('staff').select('*').order('name'),
      supabase.from('staff_stores').select('staff_id, store_id'),
    ])
    if (staffData) setStaffList(staffData)
    if (storeLinks) setStaffStores(storeLinks)
  }, [])

  const fetchShifts = useCallback(async () => {
    setLoading(true)
    const area = AREAS.find(a => a.id === selectedAreaId)!
    const startDate = formatDateStr(year, month, 1)
    const endDate = formatDateStr(year, month, getDaysInMonth(year, month))
    const { data } = await supabase
      .from('shifts')
      .select('*')
      .in('store_id', area.storeIds)
      .gte('date', startDate)
      .lte('date', endDate)
    if (data) setShifts(data)
    setLoading(false)
  }, [year, month, selectedAreaId])

  const fetchShiftMarkers = useCallback(async () => {
    const area = AREAS.find(a => a.id === selectedAreaId)!
    const startDate = formatDateStr(year, month, 1)
    const endDate = formatDateStr(year, month, getDaysInMonth(year, month))
    const memoFilter = selectedAreaId === NARITA_AREA_ID
      ? `memo.eq.${DORM_USAGE_MEMO},memo.like.${DORM_ENTRY_MEMO_PREFIX}%,memo.like.${SHOOTING_MEMO_PREFIX}%,memo.eq.${RETURN_HOME_MEMO},memo.eq.${SHIFT_CONFIRMED_MEMO}`
      : `memo.like.${SHOOTING_MEMO_PREFIX}%,memo.eq.${SHIFT_CONFIRMED_MEMO}`
    const { data, error } = await supabase
      .from('board_annotations')
      .select('id, staff_id, date, store_id, memo')
      .or(memoFilter)
      .in('store_id', area.storeIds)
      .gte('date', startDate)
      .lte('date', endDate)
    if (error) {
      console.warn('failed to fetch shift markers', error)
      setShiftMarkers([])
      return
    }
    setShiftMarkers(((data ?? []) as ShiftMarker[]).filter(marker => marker.staff_id !== null))
  }, [year, month, selectedAreaId])

  const fetchRequests = useCallback(async () => {
    const { data } = await supabase
      .from('shift_requests')
      .select('*, staff(id, name)')
      .order('created_at', { ascending: false })
    if (data) setRequests(data as ShiftRequest[])
  }, [])

  const fetchLastSyncAt = useCallback(async () => {
    const { data } = await supabase
      .from('shifts')
      .select('created_at')
      .eq('notes', 'CS3同期')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    setLastSyncAt(data?.created_at ?? null)
  }, [])

  useEffect(() => { fetchStaff() }, [fetchStaff])
  useEffect(() => { fetchShifts() }, [fetchShifts])
  useEffect(() => { fetchShiftMarkers() }, [fetchShiftMarkers])
  useEffect(() => { fetchRequests() }, [fetchRequests])
  useEffect(() => { fetchLastSyncAt() }, [fetchLastSyncAt])

  const notifyLine = (staff_id: number, message: string) => {
    fetch('/api/line/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ staff_id, message }),
    }).catch(() => {})
  }

  const approveRequest = async (req: ShiftRequest) => {
    const payload = {
      staff_id: req.staff_id,
      store_id: req.store_id,
      date: req.date,
      start_time: req.start_time,
      end_time: req.end_time,
      status: 'normal',
      notes: req.notes ?? '',
    }
    const { data: existing } = await supabase
      .from('shifts')
      .select('id')
      .eq('staff_id', req.staff_id)
      .eq('date', req.date)
      .maybeSingle()
    if (existing?.id) {
      await supabase.from('shifts').update(payload).eq('id', existing.id)
    } else {
      await supabase.from('shifts').insert(payload)
    }
    await supabase.from('shift_requests').update({ status: 'approved' }).eq('id', req.id)
    notifyLine(req.staff_id, `✅ シフト申請が承認されました\n📅 ${req.date}\n🕐 ${req.start_time}〜${req.end_time}`)
    fetchRequests()
    fetchShifts()
  }

  const rejectRequest = async () => {
    if (rejectModalId === null) return
    const req = requests.find(r => r.id === rejectModalId)
    await supabase.from('shift_requests').update({ status: 'rejected', reject_reason: rejectReason || null }).eq('id', rejectModalId)
    if (req) {
      const reason = rejectReason ? `\n理由: ${rejectReason}` : ''
      notifyLine(req.staff_id, `❌ シフト申請が却下されました\n📅 ${req.date}${reason}`)
    }
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
    return dailyStaffCounts.get(dateStr)?.size ?? 0
  }

  function isDormMarker(marker: ShiftMarker): boolean {
    return marker.memo === DORM_USAGE_MEMO || marker.memo?.startsWith(DORM_ENTRY_MEMO_PREFIX) === true
  }

  function isShootingMarker(marker: ShiftMarker): boolean {
    return marker.memo?.startsWith(SHOOTING_MEMO_PREFIX) === true
  }

  function getShootingText(marker: ShiftMarker | undefined): string {
    if (!marker?.memo?.startsWith(SHOOTING_MEMO_PREFIX)) return ''
    return marker.memo.slice(SHOOTING_MEMO_PREFIX.length)
  }

  function getMarker(staffId: number, day: number, predicate: (marker: ShiftMarker) => boolean): ShiftMarker | undefined {
    const dateStr = formatDateStr(year, month, day)
    return shiftMarkers.find(marker => marker.staff_id === staffId && marker.date === dateStr && predicate(marker))
  }

  function getDormUsage(staffId: number, day: number): ShiftMarker | undefined {
    return getMarker(staffId, day, isDormMarker)
  }

  function getShootingMarker(staffId: number, day: number): ShiftMarker | undefined {
    return getMarker(staffId, day, isShootingMarker)
  }

  function getReturnHomeMarker(staffId: number, day: number): ShiftMarker | undefined {
    return getMarker(staffId, day, marker => marker.memo === RETURN_HOME_MEMO)
  }

  function isConfirmed(staffId: number): boolean {
    const dateStr = formatDateStr(year, month, 1)
    return shiftMarkers.some(m => m.staff_id === staffId && m.date === dateStr && m.memo === SHIFT_CONFIRMED_MEMO)
  }

  async function toggleConfirmed(staffId: number) {
    const dateStr = formatDateStr(year, month, 1)
    const existing = shiftMarkers.find(m => m.staff_id === staffId && m.date === dateStr && m.memo === SHIFT_CONFIRMED_MEMO)
    const area = AREAS.find(a => a.id === selectedAreaId)!
    const storeId = area.storeIds[0]
    if (existing) {
      await supabase.from('board_annotations').delete().eq('id', existing.id)
      setShiftMarkers(current => current.filter(m => m.id !== existing.id))
      return
    }
    const { data, error } = await supabase
      .from('board_annotations')
      .insert({ staff_id: staffId, date: dateStr, start_time: 0, end_time: 0, color: 'blue', memo: SHIFT_CONFIRMED_MEMO, store_id: storeId })
      .select('id, staff_id, date, store_id, memo')
      .single()
    if (error) { console.warn('failed to save shift confirmation', error); return }
    if (data) setShiftMarkers(current => [...current, data as ShiftMarker])
  }

  function getDormCountForDay(day: number): number {
    const dateStr = formatDateStr(year, month, day)
    const ids = new Set(
      shiftMarkers
        .filter(d => isDormMarker(d) && d.date === dateStr)
        .map(d => d.staff_id)
    )
    return ids.size
  }

  function getDormVacancyForDay(day: number): number {
    return Math.max(0, DORM_TOTAL_ROOMS - getDormCountForDay(day))
  }

  async function clearDormUsage(staffId: number, day: number) {
    if (selectedAreaId !== NARITA_AREA_ID) return
    const dateStr = formatDateStr(year, month, day)
    await supabase
      .from('board_annotations')
      .delete()
      .eq('staff_id', staffId)
      .eq('date', dateStr)
      .eq('memo', DORM_USAGE_MEMO)
    await supabase
      .from('board_annotations')
      .delete()
      .eq('staff_id', staffId)
      .eq('date', dateStr)
      .like('memo', `${DORM_ENTRY_MEMO_PREFIX}%`)
    setShiftMarkers(current => current.filter(d => !(d.staff_id === staffId && d.date === dateStr && isDormMarker(d))))
  }

  async function toggleSimpleMarker(staffId: number, day: number, memo: string, color: string) {
    const dateStr = formatDateStr(year, month, day)
    const existing = getMarker(staffId, day, marker => marker.memo === memo)
    if (existing) {
      await supabase.from('board_annotations').delete().eq('id', existing.id)
      setShiftMarkers(current => current.filter(d => d.id !== existing.id))
      return
    }
    const payload = {
      staff_id: staffId,
      date: dateStr,
      start_time: 0,
      end_time: 0,
      color,
      memo,
      store_id: getShift(staffId, day)?.store_id ?? resolveStoreId(staffId),
    }
    const { data, error } = await supabase.from('board_annotations').insert(payload).select('id, staff_id, date, store_id, memo').single()
    if (error) {
      console.warn('failed to save shift marker', error)
      return
    }
    if (data) setShiftMarkers(current => [...current, data as ShiftMarker])
  }

  async function saveShootingMarker(staffId: number, day: number, text: string) {
    const dateStr = formatDateStr(year, month, day)
    const existing = getShootingMarker(staffId, day)
    const memo = `${SHOOTING_MEMO_PREFIX}${text}`
    const payload = {
      staff_id: staffId,
      date: dateStr,
      start_time: 0,
      end_time: 0,
      color: 'purple',
      memo,
      store_id: getShift(staffId, day)?.store_id ?? resolveStoreId(staffId),
    }
    if (existing) {
      const { error } = await supabase.from('board_annotations').update(payload).eq('id', existing.id)
      if (error) {
        console.warn('failed to save shooting marker', error)
        return
      }
      setShiftMarkers(current => current.map(marker => marker.id === existing.id ? { ...marker, memo } : marker))
      return
    }
    const { data, error } = await supabase.from('board_annotations').insert(payload).select('id, staff_id, date, store_id, memo').single()
    if (error) {
      console.warn('failed to save shooting marker', error)
      return
    }
    if (data) setShiftMarkers(current => [...current, data as ShiftMarker])
  }

  async function toggleDormUsage(staffId: number, day: number) {
    if (selectedAreaId !== NARITA_AREA_ID) return
    const shift = getShift(staffId, day)
    if (shift?.status === 'x') return
    if (getDormUsage(staffId, day)) {
      await clearDormUsage(staffId, day)
      return
    }
    await toggleSimpleMarker(staffId, day, DORM_USAGE_MEMO, 'green')
  }

  async function toggleShooting(staffId: number, day: number) {
    const shift = getShift(staffId, day)
    if (shift?.status === 'x') return
    const existing = getShootingMarker(staffId, day)
    const currentText = getShootingText(existing)
    const input = window.prompt('撮影スケジュールのメモを入力してください。空欄で撮影マーカーを削除します。', currentText)
    if (input === null) return
    const nextText = input.trim()
    if (!nextText) {
      if (existing) {
        await supabase.from('board_annotations').delete().eq('id', existing.id)
        setShiftMarkers(current => current.filter(marker => marker.id !== existing.id))
      }
      return
    }
    await saveShootingMarker(staffId, day, nextText)
  }

  async function toggleReturnHome(staffId: number, day: number) {
    if (selectedAreaId !== NARITA_AREA_ID) return
    const shift = getShift(staffId, day)
    if (shift?.status === 'x') return
    await toggleSimpleMarker(staffId, day, RETURN_HOME_MEMO, 'gray')
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

  function resolveStoreId(staffId: number): number {
    const area = AREAS.find(a => a.id === selectedAreaId)!
    return staffStores.find(ss => ss.staff_id === staffId && area.storeIds.includes(ss.store_id))?.store_id ?? area.storeIds[0]
  }

  async function commitEdit(staffId: number, day: number, value: string) {
    const dateStr = formatDateStr(year, month, day)
    const existingShift = getShift(staffId, day)
    const parsed = parseShiftValue(value)
    const storeId = existingShift?.store_id ?? resolveStoreId(staffId)

    if (parsed.mode === 'delete') {
      if (existingShift?.id) {
        await supabase.from('shifts').delete().eq('id', existingShift.id)
      }
      await clearDormUsage(staffId, day)
    } else if (parsed.mode === 'x') {
      const payload = {
        staff_id: staffId,
        store_id: storeId,
        date: dateStr,
        start_time: existingShift?.start_time ?? 14,
        end_time: existingShift?.end_time ?? 22,
        status: 'x',
        notes: existingShift?.notes ?? '',
      }
      if (existingShift?.id) await supabase.from('shifts').update(payload).eq('id', existingShift.id)
      else await supabase.from('shifts').insert(payload)
      await clearDormUsage(staffId, day)
    } else if (parsed.mode === 'normal' && parsed.start !== undefined) {
      const payload = {
        staff_id: staffId,
        store_id: storeId,
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
    if (sortedStaffList.length === 0) return
    let si = staffIdx
    let di = dayIdx
    if (direction === 'right') {
      di++
      if (di >= days.length) { di = 0; si = (si + 1) % sortedStaffList.length }
    } else if (direction === 'left') {
      di--
      if (di < 0) { di = days.length - 1; si = Math.max(0, si - 1) }
    } else if (direction === 'down') {
      si = Math.min(sortedStaffList.length - 1, si + 1)
    } else if (direction === 'up') {
      si = Math.max(0, si - 1)
    }
    startEdit(sortedStaffList[si].id, days[di])
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>, staffIdx: number, dayIdx: number) {
    const staff = sortedStaffList[staffIdx]
    if (!staff) return
    const staffId = staff.id
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
                    <td className="px-4 py-3 text-gray-600">{AREAS.find(a => a.storeIds.includes(r.store_id))?.name ?? '-'}{r.store_id >= 5 ? 'E' : r.store_id ? 'M' : ''}</td>
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
          <div className="flex gap-1.5 flex-wrap items-center">
            {AREAS.map(a => (
              <button
                key={a.id}
                onClick={() => setSelectedAreaId(a.id)}
                className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${selectedAreaId === a.id ? 'bg-blue-600 text-white shadow-sm' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
              >
                {a.name}
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2">
            {hiddenDays.size > 0 && (
              <button
                onClick={() => setHiddenDays(new Set())}
                className="px-3 py-1 text-xs bg-amber-100 hover:bg-amber-200 text-amber-800 rounded-full font-medium transition-colors"
              >
                全日表示（{hiddenDays.size}件非表示）
              </button>
            )}
            {lastSyncAt && (
              <span className="text-xs text-gray-400">
                CS3同期: {new Date(lastSyncAt).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            <div className="group relative">
              <button className="w-6 h-6 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 text-xs font-bold transition-colors">?</button>
              <div className="absolute right-0 top-8 w-64 bg-gray-900 text-white text-xs rounded-lg px-3 py-2 hidden group-hover:block z-10 shadow-lg leading-5">
                クリックで入力<br/>
                <kbd className="bg-white/20 px-1 rounded">Enter</kbd> / <kbd className="bg-white/20 px-1 rounded">Tab</kbd> で次へ<br/>
                矢印で移動 / <kbd className="bg-white/20 px-1 rounded">Esc</kbd> でキャンセル
              </div>
            </div>
          </div>
        </div>
      </div>


      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="text-gray-500 animate-pulse">読み込み中...</div>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-md border border-gray-100">
          <div className="overflow-x-auto overflow-y-auto" style={{ maxHeight: 'calc(100vh - 160px)' }} onClick={e => { if ((e.target as HTMLElement).tagName !== 'INPUT') { setEditingCell(null) } }}>
            <table className="text-xs border-collapse" style={{ minWidth: `${160 + days.reduce((sum, d) => sum + (hiddenDays.has(d) ? 10 : 52), 0) + summaryColumnCount * SUMMARY_COLUMN_WIDTH}px` }}>
              <thead className="sticky top-0 z-20">
                <tr className="bg-gray-900 text-white">
                  <th className="sticky left-0 z-10 bg-gray-900 px-3 py-2.5 border-r border-gray-700 w-28 text-left font-semibold">スタッフ</th>
                  <th className="sticky left-28 z-10 bg-gray-900 px-1 py-2.5 border-r border-gray-700 w-10 text-center font-semibold text-[10px]">確認</th>
                  {days.map(d => {
                    const wd = getWeekday(d)
                    const isSun = wd === 0
                    const isSat = wd === 6
                    const today = isToday(d)
                    const hidden = hiddenDays.has(d)
                    if (hidden) {
                      return (
                        <th
                          key={d}
                          onClick={() => toggleHiddenDay(d)}
                          className="border-l border-gray-700 text-center cursor-pointer hover:bg-gray-700"
                          style={{ minWidth: 10, width: 10, maxWidth: 10, padding: 0 }}
                          title={`${d}日を表示`}
                        >
                          <div className="text-gray-500 select-none" style={{ writingMode: 'vertical-rl', fontSize: 8, lineHeight: 1, padding: '2px 1px' }}>▶</div>
                        </th>
                      )
                    }
                    return (
                      <th
                        key={d}
                        onClick={() => toggleHiddenDay(d)}
                        className={`px-1 py-2 border-l border-gray-700 text-center cursor-pointer select-none ${isSun ? 'text-red-300' : isSat ? 'text-sky-300' : 'text-gray-200'} ${today ? 'bg-blue-800' : 'hover:bg-gray-700'}`}
                        style={{ minWidth: 52 }}
                        title={`${d}日を非表示`}
                      >
                        <div className={today ? 'inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-400 text-white font-bold text-xs' : ''}>{d}</div>
                        <div className="text-xs opacity-75">{WEEKDAY_LABELS[wd]}</div>
                      </th>
                    )
                  })}
                  <th className="px-2 py-2 border-l-2 border-gray-500 text-center font-semibold" style={{ minWidth: SUMMARY_COLUMN_WIDTH }}>出勤日数</th>
                  <th className="px-2 py-2 border-l border-gray-700 text-center font-semibold" style={{ minWidth: SUMMARY_COLUMN_WIDTH }}>出勤時間</th>
                  <th className="px-2 py-2 border-l border-gray-700 text-center font-semibold" style={{ minWidth: SUMMARY_COLUMN_WIDTH }}>平均人数</th>
                  {selectedAreaId === NARITA_AREA_ID && (
                    <th className="px-2 py-2 border-l border-gray-700 text-center font-semibold" style={{ minWidth: SUMMARY_COLUMN_WIDTH }}>寮使用率</th>
                  )}
                </tr>
                <tr className="bg-gray-800 text-white">
                  <td className="sticky left-0 z-10 bg-gray-800 px-3 py-1.5 border-r border-gray-600 text-xs text-gray-300">
                    <div>出勤人数</div>
                    {selectedAreaId === NARITA_AREA_ID && <div className="text-[10px] text-emerald-200">寮空室</div>}
                  </td>
                  <td className="sticky left-28 z-10 bg-gray-800 border-r border-gray-600 w-10"></td>
                  {days.map(d => {
                    if (hiddenDays.has(d)) {
                      return <td key={d} className="border-l border-gray-600 bg-gray-800" style={{ minWidth: 10, width: 10, maxWidth: 10, padding: 0 }} />
                    }
                    return (
                      <td key={d} className={`px-1 py-1 border-l border-gray-600 text-center font-bold ${isToday(d) ? 'bg-blue-900' : ''}`}>
                        <div className="text-yellow-300">{getStaffCountForDay(d) || ''}</div>
                        {selectedAreaId === NARITA_AREA_ID && (
                          <div className="text-[10px] leading-3 text-emerald-200">{getDormVacancyForDay(d)}</div>
                        )}
                      </td>
                    )
                  })}
                  <td className="px-1 py-1 border-l-2 border-gray-500 text-center font-bold text-yellow-300">{monthlyTotalShiftDays || ''}</td>
                  <td className="px-1 py-1 border-l border-gray-600 text-center font-bold text-yellow-300">{monthlyTotalHours ? `${formatHours(monthlyTotalHours)}h` : ''}</td>
                  <td className="px-1 py-1 border-l border-gray-600 text-center font-bold text-yellow-300">{monthlyAverageStaffCount ? monthlyAverageStaffCount.toFixed(1) : ''}</td>
                  {selectedAreaId === NARITA_AREA_ID && (
                    <td className="px-1 py-1 border-l border-gray-600 text-center font-bold text-emerald-200">{monthlyDormUsageRate ? `${monthlyDormUsageRate.toFixed(1)}%` : '0.0%'}</td>
                  )}
                </tr>
              </thead>
              <tbody>
                {sortedStaffList.length === 0 && (
                  <tr><td colSpan={daysInMonth + 1 + summaryColumnCount} className="text-center py-10 text-gray-400">スタッフなし</td></tr>
                )}
                {sortedStaffList.map((staff, staffIdx) => {
                  const monthlyStats = staffMonthlyStats.get(staff.id) ?? { days: 0, hours: 0 }

                  return (
                  <tr key={staff.id} className={`border-b border-gray-100 ${staffIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50/70'}`}>
                    <td className="sticky left-0 z-10 bg-inherit border-r border-gray-200 px-3 py-1.5 font-semibold text-gray-800">{staff.name}</td>
                    <td className="sticky left-28 z-10 bg-inherit border-r border-gray-200 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={isConfirmed(staff.id)}
                        onChange={() => toggleConfirmed(staff.id)}
                        onClick={e => e.stopPropagation()}
                        className="cursor-pointer accent-blue-600 w-3.5 h-3.5"
                      />
                    </td>
                    {days.map((d, dayIdx) => {
                      if (hiddenDays.has(d)) {
                        return (
                          <td
                            key={d}
                            onClick={() => toggleHiddenDay(d)}
                            className="border-l border-gray-100 bg-gray-50 cursor-pointer hover:bg-blue-50"
                            style={{ minWidth: 10, width: 10, maxWidth: 10, padding: 0 }}
                          />
                        )
                      }
                      const shift = getShift(staff.id, d)
                      const wd = getWeekday(d)
                      const isSun = wd === 0
                      const isSat = wd === 6
                      const today = isToday(d)
                      const isEditing = editingCell?.staffId === staff.id && editingCell?.day === d
                      const canUseMarkers = !shift || shift.status !== 'x'
                      const shootingMarker = canUseMarkers ? getShootingMarker(staff.id, d) : undefined
                      const shootingText = getShootingText(shootingMarker)
                      const isShooting = !!shootingMarker
                      const isDorm = selectedAreaId === NARITA_AREA_ID && canUseMarkers && !!getDormUsage(staff.id, d)
                      const isReturnHome = selectedAreaId === NARITA_AREA_ID && canUseMarkers && !!getReturnHomeMarker(staff.id, d)
                      const markerLabels = [
                        isShooting ? '撮影' : null,
                        isDorm ? '寮' : null,
                        isReturnHome ? '帰' : null,
                      ].filter(Boolean).join(' ')

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
                        cellText = displayShiftTime(shift)
                        textColor = 'text-pink-900 font-medium'
                        cellBg = 'bg-pink-200 hover:bg-pink-300'
                      }
                      if (canUseMarkers && isReturnHome) {
                        cellBg = 'bg-amber-200 hover:bg-amber-300'
                        textColor = 'text-amber-950 font-semibold'
                      }
                      if (canUseMarkers && isDorm) {
                        cellBg = 'bg-emerald-200 hover:bg-emerald-300'
                        textColor = 'text-emerald-950 font-semibold'
                      }
                      if (canUseMarkers && isShooting) {
                        cellBg = 'bg-violet-200 hover:bg-violet-300'
                        textColor = 'text-violet-950 font-semibold'
                      }
                      if (!shift && markerLabels) cellText = markerLabels

                      return (
                        <td
                          key={d}
                          title={shootingText || undefined}
                          onClick={e => { e.stopPropagation(); startEdit(staff.id, d) }}
                          className={`group relative border-l border-gray-100 px-0.5 py-0 text-center cursor-pointer transition-colors overflow-visible ${isEditing ? 'bg-yellow-50 ring-2 ring-inset ring-yellow-400 z-10' : `${cellBg} ${textColor}`} ${today ? 'ring-1 ring-inset ring-blue-400' : ''}`}
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
                            <>
                              <span className="relative z-0 flex h-full items-center justify-center truncate text-center" style={{ fontSize: 10 }}>{cellText}</span>
                              {markerLabels && shift && (
                                <span
                                  className="absolute bottom-0.5 right-0.5 z-0 max-w-[42px] truncate rounded bg-white/70 px-0.5 text-[8px] font-bold leading-3 text-gray-700"
                                  title={shootingText || undefined}
                                >
                                  {markerLabels}
                                </span>
                              )}
                              {canUseMarkers && (
                                <div className="absolute left-1/2 top-0.5 z-30 hidden -translate-x-1/2 justify-center gap-0.5 rounded bg-white/95 px-0.5 py-0.5 shadow-md ring-1 ring-gray-200 group-hover:flex">
                                  <button
                                    type="button"
                                    onClick={e => { e.stopPropagation(); toggleShooting(staff.id, d) }}
                                    className={`rounded px-0.5 text-[9px] font-bold leading-3 ${isShooting ? 'bg-violet-700 text-white' : 'text-violet-700 hover:bg-violet-100'}`}
                                    title={isShooting ? (shootingText || '撮影メモを編集') : '撮影にする'}
                                  >
                                    撮影
                                  </button>
                                  {selectedAreaId === NARITA_AREA_ID && (
                                    <>
                                      <button
                                        type="button"
                                        onClick={e => { e.stopPropagation(); toggleDormUsage(staff.id, d) }}
                                        className={`rounded px-0.5 text-[9px] font-bold leading-3 ${isDorm ? 'bg-emerald-700 text-white' : 'text-emerald-700 hover:bg-emerald-100'}`}
                                        title={isDorm ? '寮使用を解除' : '寮使用にする'}
                                      >
                                        寮
                                      </button>
                                      <button
                                        type="button"
                                        onClick={e => { e.stopPropagation(); toggleReturnHome(staff.id, d) }}
                                        className={`rounded px-0.5 text-[9px] font-bold leading-3 ${isReturnHome ? 'bg-amber-700 text-white' : 'text-amber-700 hover:bg-amber-100'}`}
                                        title={isReturnHome ? '帰を解除' : '帰にする'}
                                      >
                                        帰
                                      </button>
                                    </>
                                  )}
                                </div>
                              )}
                            </>
                          )}
                        </td>
                      )
                    })}
                    <td className="border-l-2 border-gray-300 px-1.5 py-1 text-center font-bold text-gray-800 bg-gray-50">{monthlyStats.days || ''}</td>
                    <td className="border-l border-gray-200 px-1.5 py-1 text-center font-bold text-gray-800 bg-gray-50">{monthlyStats.hours ? `${formatHours(monthlyStats.hours)}h` : ''}</td>
                    <td className="border-l border-gray-200 px-1.5 py-1 text-center text-gray-300 bg-gray-50">-</td>
                    {selectedAreaId === NARITA_AREA_ID && (
                      <td className="border-l border-gray-200 px-1.5 py-1 text-center text-gray-300 bg-gray-50">-</td>
                    )}
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="mt-3 flex gap-4 text-xs text-gray-500 flex-wrap">
        <span className="flex items-center gap-1.5"><span className="w-4 h-4 bg-pink-200 inline-block rounded border border-pink-300"></span> 出勤（例: <code className="bg-gray-100 px-1 rounded">14-22</code>）</span>
        <span className="flex items-center gap-1.5"><span className="w-4 h-4 bg-violet-200 inline-block rounded border border-violet-300"></span> 撮影</span>
        {selectedAreaId === NARITA_AREA_ID && (
          <>
            <span className="flex items-center gap-1.5"><span className="w-4 h-4 bg-emerald-200 inline-block rounded border border-emerald-300"></span> 寮使用</span>
            <span className="flex items-center gap-1.5"><span className="w-4 h-4 bg-amber-200 inline-block rounded border border-amber-300"></span> 帰</span>
          </>
        )}
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
