'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { AREAS, Shift, Staff } from '@/lib/types'

const NARITA_AREA_ID = 1
const NARITA_STORE_ID = 1
const DORM_ROOMS = ['203', '303', '305', '306', '307']
const DORM_ENTRY_MEMO_PREFIX = '__NARITA_DORM_ENTRY__'
const DORM_COMMENT_MEMO_PREFIX = '__NARITA_DORM_COMMENT__'

type DormStatus = '' | 'stay' | 'checkin' | 'checkout' | 'after_shift'

interface StaffStore {
  staff_id: number
  store_id: number
}

interface DormEntryData {
  room: string
  status: DormStatus
  checkoutTime: string
  cleaned: boolean
}

interface DormEntry extends DormEntryData {
  id: string
  staff_id: number | null
  date: string
}

interface BoardAnnotationRow {
  id: string
  staff_id: number | null
  date: string
  memo: string | null
}

const STATUS_OPTIONS: { value: DormStatus; label: string }[] = [
  { value: '', label: '-' },
  { value: 'stay', label: '宿泊中' },
  { value: 'checkin', label: '入室予定' },
  { value: 'checkout', label: '退室予定' },
  { value: 'after_shift', label: '出勤後帰宅' },
]

const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土']

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

function formatDateStr(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function parseDormEntry(row: BoardAnnotationRow): DormEntry | null {
  if (!row.memo?.startsWith(DORM_ENTRY_MEMO_PREFIX)) return null
  try {
    const raw = JSON.parse(row.memo.slice(DORM_ENTRY_MEMO_PREFIX.length)) as Partial<DormEntryData>
    if (!raw.room || !DORM_ROOMS.includes(raw.room)) return null
    return {
      id: row.id,
      staff_id: row.staff_id,
      date: row.date,
      room: raw.room,
      status: raw.status ?? '',
      checkoutTime: raw.checkoutTime ?? '',
      cleaned: Boolean(raw.cleaned),
    }
  } catch {
    return null
  }
}

function encodeDormEntry(data: DormEntryData): string {
  return `${DORM_ENTRY_MEMO_PREFIX}${JSON.stringify(data)}`
}

function getStatusLabel(status: DormStatus): string {
  return STATUS_OPTIONS.find(s => s.value === status)?.label ?? '-'
}

export default function DormPage() {
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth() + 1)
  const [staffList, setStaffList] = useState<Staff[]>([])
  const [staffStores, setStaffStores] = useState<StaffStore[]>([])
  const [shifts, setShifts] = useState<Shift[]>([])
  const [entries, setEntries] = useState<DormEntry[]>([])
  const [comments, setComments] = useState<Record<string, { id: string; text: string }>>({})
  const [loading, setLoading] = useState(false)

  const daysInMonth = getDaysInMonth(year, month)
  const days = useMemo(() => Array.from({ length: daysInMonth }, (_, i) => i + 1), [daysInMonth])
  const naritaArea = AREAS.find(a => a.id === NARITA_AREA_ID)!

  const fetchData = useCallback(async () => {
    setLoading(true)
    const startDate = formatDateStr(year, month, 1)
    const endDate = formatDateStr(year, month, daysInMonth)
    const [staffRes, storeRes, shiftRes, dormRes] = await Promise.all([
      supabase.from('staff').select('*').order('name'),
      supabase.from('staff_stores').select('staff_id, store_id'),
      supabase
        .from('shifts')
        .select('*')
        .in('store_id', naritaArea.storeIds)
        .gte('date', startDate)
        .lte('date', endDate)
        .neq('status', 'x'),
      supabase
        .from('board_annotations')
        .select('id, staff_id, date, memo')
        .eq('store_id', NARITA_STORE_ID)
        .or(`memo.like.${DORM_ENTRY_MEMO_PREFIX}%,memo.like.${DORM_COMMENT_MEMO_PREFIX}%`)
        .gte('date', startDate)
        .lte('date', endDate),
    ])

    if (staffRes.data) setStaffList(staffRes.data as Staff[])
    if (storeRes.data) setStaffStores(storeRes.data as StaffStore[])
    if (shiftRes.data) setShifts(shiftRes.data as Shift[])

    const nextEntries: DormEntry[] = []
    const nextComments: Record<string, { id: string; text: string }> = {}
    ;((dormRes.data ?? []) as BoardAnnotationRow[]).forEach(row => {
      const entry = parseDormEntry(row)
      if (entry) {
        nextEntries.push(entry)
        return
      }
      if (row.memo?.startsWith(DORM_COMMENT_MEMO_PREFIX)) {
        nextComments[row.date] = { id: row.id, text: row.memo.slice(DORM_COMMENT_MEMO_PREFIX.length) }
      }
    })
    setEntries(nextEntries)
    setComments(nextComments)
    setLoading(false)
  }, [year, month, daysInMonth, naritaArea.storeIds])

  useEffect(() => { fetchData() }, [fetchData])

  const naritaStaffIds = useMemo(() => {
    return new Set(staffStores.filter(s => naritaArea.storeIds.includes(s.store_id)).map(s => s.staff_id))
  }, [staffStores, naritaArea.storeIds])

  const naritaStaff = useMemo(() => {
    return staffList.filter(s => naritaStaffIds.has(s.id))
  }, [staffList, naritaStaffIds])

  function prevMonth() {
    if (month === 1) { setYear(y => y - 1); setMonth(12) }
    else setMonth(m => m - 1)
  }

  function nextMonth() {
    if (month === 12) { setYear(y => y + 1); setMonth(1) }
    else setMonth(m => m + 1)
  }

  function getEntry(date: string, room: string): DormEntry | undefined {
    return entries.find(e => e.date === date && e.room === room)
  }

  function getStaffName(staffId: number | null): string {
    if (!staffId) return ''
    return staffList.find(s => s.id === staffId)?.name ?? ''
  }

  function getStaffOptionsForDate(date: string): Staff[] {
    const shiftStaffIds = new Set(shifts.filter(s => s.date === date).map(s => s.staff_id))
    const shiftStaff = staffList.filter(s => shiftStaffIds.has(s.id))
    const remaining = naritaStaff.filter(s => !shiftStaffIds.has(s.id))
    return [...shiftStaff, ...remaining]
  }

  function getOccupiedCount(date: string): number {
    return new Set(entries.filter(e => e.date === date && e.staff_id).map(e => e.room)).size
  }

  async function saveEntry(date: string, room: string, patch: Partial<DormEntryData> & { staff_id?: number | null }) {
    const existing = getEntry(date, room)
    const current: DormEntryData = {
      room,
      status: existing?.status ?? '',
      checkoutTime: existing?.checkoutTime ?? '',
      cleaned: existing?.cleaned ?? false,
    }
    const next: DormEntryData = { ...current, ...patch, room }
    const staffId = patch.staff_id !== undefined ? patch.staff_id : existing?.staff_id ?? null
    const shouldDelete = !staffId && !next.status && !next.checkoutTime && !next.cleaned

    if (shouldDelete) {
      if (existing) {
        await supabase.from('board_annotations').delete().eq('id', existing.id)
        setEntries(list => list.filter(e => e.id !== existing.id))
      }
      return
    }

    const payload = {
      staff_id: staffId,
      date,
      start_time: 0,
      end_time: 0,
      color: 'green',
      memo: encodeDormEntry(next),
      store_id: NARITA_STORE_ID,
    }

    if (existing) {
      await supabase.from('board_annotations').update(payload).eq('id', existing.id)
    } else {
      await supabase.from('board_annotations').insert(payload)
    }
    fetchData()
  }

  async function saveComment(date: string, text: string) {
    const existing = comments[date]
    if (!text.trim()) {
      if (existing) {
        await supabase.from('board_annotations').delete().eq('id', existing.id)
        setComments(current => {
          const next = { ...current }
          delete next[date]
          return next
        })
      }
      return
    }
    const payload = {
      staff_id: null,
      date,
      start_time: 0,
      end_time: 0,
      color: 'gray',
      memo: `${DORM_COMMENT_MEMO_PREFIX}${text}`,
      store_id: NARITA_STORE_ID,
    }
    if (existing) await supabase.from('board_annotations').update(payload).eq('id', existing.id)
    else await supabase.from('board_annotations').insert(payload)
    fetchData()
  }

  return (
    <div className="p-3">
      <div className="bg-white rounded-xl shadow-md border border-gray-100 p-4 mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <button onClick={prevMonth} className="w-8 h-8 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded-full text-gray-700 font-bold transition-colors">◀</button>
            <span className="font-bold text-lg text-gray-800 min-w-28 text-center">{year}年{String(month).padStart(2, '0')}月</span>
            <button onClick={nextMonth} className="w-8 h-8 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded-full text-gray-700 font-bold transition-colors">▶</button>
          </div>
          <div className="h-6 w-px bg-gray-200" />
          <div>
            <div className="text-sm font-bold text-gray-800">成田店 寮管理</div>
            <div className="text-xs text-gray-500">部屋数 {DORM_ROOMS.length} / 部屋 {DORM_ROOMS.join('・')}</div>
          </div>
          <button onClick={fetchData} className="ml-auto px-3 py-1.5 rounded-full bg-gray-900 text-white text-xs font-bold hover:bg-gray-700 transition-colors">再読込</button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="text-gray-500 animate-pulse">読み込み中...</div>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-md border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1180px] text-xs border-collapse">
              <thead>
                <tr className="bg-gray-900 text-white">
                  <th className="sticky left-0 z-20 bg-gray-900 px-3 py-3 text-left border-r border-gray-700 w-24">日付</th>
                  <th className="px-2 py-3 text-center border-r border-gray-700 w-16">泊</th>
                  <th className="px-2 py-3 text-center border-r border-gray-700 w-16">残</th>
                  {DORM_ROOMS.map(room => (
                    <th key={room} className="px-2 py-3 text-center border-r border-gray-700 min-w-44">{room}</th>
                  ))}
                  <th className="px-3 py-3 text-left min-w-64">寮についてのコメント</th>
                </tr>
              </thead>
              <tbody>
                {days.map(day => {
                  const date = formatDateStr(year, month, day)
                  const wd = new Date(year, month - 1, day).getDay()
                  const occupied = getOccupiedCount(date)
                  const vacancy = Math.max(0, DORM_ROOMS.length - occupied)
                  const staffOptions = getStaffOptionsForDate(date)
                  return (
                    <tr key={date} className={`border-b border-gray-100 ${wd === 0 ? 'bg-red-50/70' : wd === 6 ? 'bg-sky-50/70' : 'bg-white'}`}>
                      <td className="sticky left-0 z-10 bg-inherit border-r border-gray-200 px-3 py-2 font-bold text-gray-800">
                        <div>{day}</div>
                        <div className={`text-[11px] ${wd === 0 ? 'text-red-500' : wd === 6 ? 'text-sky-500' : 'text-gray-400'}`}>{WEEKDAY_LABELS[wd]}</div>
                      </td>
                      <td className="border-r border-gray-100 px-2 py-2 text-center text-base font-bold text-emerald-700">{occupied || ''}</td>
                      <td className={`border-r border-gray-100 px-2 py-2 text-center text-base font-bold ${vacancy === 0 ? 'text-red-600' : 'text-gray-800'}`}>{vacancy}</td>
                      {DORM_ROOMS.map(room => {
                        const entry = getEntry(date, room)
                        return (
                          <td key={room} className="border-r border-gray-100 px-2 py-2 align-top">
                            <div className={`rounded border p-2 ${entry?.staff_id ? 'border-emerald-300 bg-emerald-50' : 'border-gray-200 bg-white'}`}>
                              <select
                                value={entry?.staff_id ?? ''}
                                onChange={e => saveEntry(date, room, { staff_id: e.target.value ? Number(e.target.value) : null })}
                                className="w-full rounded border border-gray-200 bg-white px-2 py-1 text-xs text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                              >
                                <option value="">-</option>
                                {staffOptions.map(staff => (
                                  <option key={staff.id} value={staff.id}>{staff.name}</option>
                                ))}
                              </select>
                              <div className="mt-1 grid grid-cols-2 gap-1">
                                <select
                                  value={entry?.status ?? ''}
                                  onChange={e => saveEntry(date, room, { status: e.target.value as DormStatus })}
                                  className="rounded border border-gray-200 bg-white px-1 py-1 text-[11px] text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                  title={getStatusLabel(entry?.status ?? '')}
                                >
                                  {STATUS_OPTIONS.map(status => (
                                    <option key={status.value} value={status.value}>{status.label}</option>
                                  ))}
                                </select>
                                <input
                                  value={entry?.checkoutTime ?? ''}
                                  onChange={e => saveEntry(date, room, { checkoutTime: e.target.value })}
                                  placeholder="退室"
                                  className="rounded border border-gray-200 px-1 py-1 text-[11px] text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                />
                              </div>
                              <label className="mt-1 flex items-center gap-1.5 text-[11px] text-gray-600">
                                <input
                                  type="checkbox"
                                  checked={entry?.cleaned ?? false}
                                  onChange={e => saveEntry(date, room, { cleaned: e.target.checked })}
                                  className="h-3.5 w-3.5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                                />
                                清掃済み
                              </label>
                              {entry?.staff_id && (
                                <div className="mt-1 truncate text-[10px] font-medium text-emerald-800">{getStaffName(entry.staff_id)}</div>
                              )}
                            </div>
                          </td>
                        )
                      })}
                      <td className="px-3 py-2 align-top">
                        <textarea
                          defaultValue={comments[date]?.text ?? ''}
                          onBlur={e => saveComment(date, e.target.value)}
                          rows={3}
                          placeholder="コメント"
                          className="w-full resize-none rounded border border-gray-200 px-2 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1.5"><span className="h-4 w-4 rounded border border-emerald-300 bg-emerald-50"></span> 利用中</span>
        <span>泊: 利用部屋数</span>
        <span>残: 空室数</span>
        <span>部屋割りはシフト管理の寮使用表示にも反映されます</span>
      </div>
    </div>
  )
}
