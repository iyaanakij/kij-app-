'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { Reservation, Staff, STORES, formatTime, todayString } from '@/lib/types'

// ── 料金マスタ ──────────────────────────────────────────
const COURSE_PRICES: Record<number, Record<string, number>> = {
  60:  { ランジェリー: 14300, トップレス: 15400, ヌード: 17600 },
  80:  { ランジェリー: 18700, トップレス: 19800, ヌード: 22000 },
  100: { ランジェリー: 23100, トップレス: 24200, ヌード: 26400 },
  120: { ランジェリー: 27500, トップレス: 28600, ヌード: 30800 },
  150: { ランジェリー: 36300, トップレス: 37400, ヌード: 39600 },
  180: { ランジェリー: 44000, トップレス: 45100, ヌード: 47300 },
}

const COURSE_DURATIONS = [60, 80, 100, 120, 150, 180]
const COURSE_TYPES = ['ランジェリー', 'トップレス', 'ヌード']
const CATEGORIES = ['新規', '会員']

const NOMINATION_OPTIONS = [
  { label: '-',              value: '',      price: 0    },
  { label: '本指名 ¥2,200', value: '本',    price: 2200 },
  { label: '写メ指名 ¥2,200', value: '写',  price: 2200 },
  { label: 'フリー',         value: 'フリー', price: 0  },
]

const OP_OPTIONS = [
  { label: '-',                   value: '',               price: 0    },
  { label: '聖水 ¥2,200',         value: '聖水',           price: 2200 },
  { label: 'ロープ ¥2,200',       value: 'ロープ',         price: 2200 },
  { label: '私物パンティ ¥3,300', value: '私物パンティ',   price: 3300 },
  { label: 'ストッキング ¥1,100', value: 'ストッキング',   price: 1100 },
  { label: 'プラスチック浣腸 ¥1,100', value: 'プラスチック浣腸', price: 1100 },
  { label: 'コスプレ ¥2,200',     value: 'コスプレ',       price: 2200 },
]

const EXTENSION_OPTIONS = [
  { label: '-', value: 0 },
  ...Array.from({ length: 18 }, (_, i) => ({
    label: `${(i + 1) * 10}分 ¥${((i + 1) * 3000).toLocaleString()}`,
    value: (i + 1) * 3000,
  })),
]

const TRANSPORTATION_OPTIONS = [
  { label: '-',       value: 0     },
  ...Array.from({ length: 20 }, (_, i) => ({
    label: `¥${((i + 1) * 1000).toLocaleString()}`,
    value: (i + 1) * 1000,
  })),
]

const DISCOUNT_OPTIONS = [
  { label: '-',       value: 0 },
  ...Array.from({ length: 20 }, (_, i) => ({
    label: `-¥${((i + 1) * 1000).toLocaleString()}`,
    value: (i + 1) * 1000,
  })),
]

// ── 計算ヘルパー ────────────────────────────────────────
function calcTotal(form: Partial<Reservation>): number {
  let total = 0
  const duration = form.course_duration
  const courseType = form.course_type
  if (duration && courseType && COURSE_PRICES[duration]?.[courseType]) {
    total += COURSE_PRICES[duration][courseType]
  }
  total += NOMINATION_OPTIONS.find(n => n.value === form.nomination_type)?.price ?? 0
  if (form.nude) total += 1100
  total += OP_OPTIONS.find(o => o.value === form.option1)?.price ?? 0
  total += OP_OPTIONS.find(o => o.value === form.option2)?.price ?? 0
  total += OP_OPTIONS.find(o => o.value === form.option3)?.price ?? 0
  total += OP_OPTIONS.find(o => o.value === form.option4)?.price ?? 0
  total += OP_OPTIONS.find(o => o.value === form.option5)?.price ?? 0
  total += OP_OPTIONS.find(o => o.value === form.option6)?.price ?? 0
  total += form.membership_fee ?? 0
  total += form.transportation_fee ?? 0
  total += form.extension ?? 0
  total -= form.discount ?? 0
  return Math.max(0, total)
}

function calcCheckoutTime(time: number, courseDuration: number, extensionFee: number): number {
  const extensionMinutes = Math.round((extensionFee / 3000) * 10)
  const h = Math.floor(time / 100)
  const m = time % 100
  const totalMins = h * 60 + m + courseDuration + extensionMinutes
  return Math.floor(totalMins / 60) * 100 + (totalMins % 60)
}

// ── 初期値 ─────────────────────────────────────────────
const emptyReservation = (): Partial<Reservation> => ({
  section: 'E',
  row_number: null,
  time: null,
  customer_name: '',
  phone: '',
  confirmed: false,
  communicated: false,
  area: '',
  hotel: '',
  room_number: '',
  category: '',
  staff_id: null,
  nomination_type: '',
  course_duration: null,
  course_type: null,
  nude: false,
  option1: '',
  option2: '',
  option3: '',
  option4: '',
  option5: '',
  option6: '',
  membership_fee: 0,
  transportation_fee: 0,
  extension: 0,
  discount: 0,
  total_amount: 0,
  checkout_time: null,
  arrival_confirmed: false,
  notes: '',
  media: '',
  checked: false,
})

// ── セレクト共通スタイル ────────────────────────────────
const sel = 'w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

export default function ReservationsPage() {
  const [selectedDate, setSelectedDate] = useState(todayString())
  const [selectedStoreId, setSelectedStoreId] = useState<number | null>(null)
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [staffList, setStaffList] = useState<Staff[]>([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingReservation, setEditingReservation] = useState<Partial<Reservation>>(emptyReservation())
  const [isEditing, setIsEditing] = useState(false)
  const [savingId, setSavingId] = useState<number | null>(null)

  const fetchStaff = useCallback(async () => {
    const { data } = await supabase.from('staff').select('*').order('name')
    if (data) setStaffList(data)
  }, [])

  const fetchReservations = useCallback(async () => {
    setLoading(true)
    let query = supabase
      .from('reservations')
      .select('*, staff(id, name)')
      .eq('date', selectedDate)
      .order('section')
      .order('row_number')
      .order('time')
    if (selectedStoreId !== null) query = query.eq('store_id', selectedStoreId)
    const { data } = await query
    if (data) setReservations(data as Reservation[])
    setLoading(false)
  }, [selectedDate, selectedStoreId])

  useEffect(() => { fetchStaff() }, [fetchStaff])
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

  // フォーム更新 + 合計自動計算
  const updateForm = (patch: Partial<Reservation>) => {
    setEditingReservation(prev => {
      const next = { ...prev, ...patch }
      next.total_amount = calcTotal(next)
      return next
    })
  }

  const openAddModal = (section: 'E' | 'M') => {
    const maxRow = Math.max(0, ...reservations.filter(r => r.section === section).map(r => r.row_number ?? 0))
    setEditingReservation({
      ...emptyReservation(),
      section,
      row_number: maxRow + 1,
      store_id: selectedStoreId ?? 1,
      date: selectedDate,
    })
    setIsEditing(false)
    setModalOpen(true)
  }

  const openEditModal = (r: Reservation) => {
    setEditingReservation({ ...r })
    setIsEditing(true)
    setModalOpen(true)
  }

  const saveReservation = async () => {
    if (!editingReservation.store_id || !editingReservation.date) return
    if (isEditing && editingReservation.id) {
      setSavingId(editingReservation.id)
      const { id, staff, store, created_at, ...updateData } = editingReservation as Reservation
      await supabase.from('reservations').update(updateData).eq('id', id)
      setSavingId(null)
    } else {
      const { id, staff, store, created_at, ...insertData } = editingReservation as Reservation
      await supabase.from('reservations').insert(insertData)
    }
    setModalOpen(false)
    fetchReservations()
  }

  const deleteReservation = async (id: number) => {
    if (!confirm('この予約を削除しますか？')) return
    await supabase.from('reservations').delete().eq('id', id)
    fetchReservations()
  }

  const toggleField = async (id: number, field: 'confirmed' | 'communicated' | 'checked' | 'nude', current: boolean) => {
    setSavingId(id)
    await supabase.from('reservations').update({ [field]: !current }).eq('id', id)
    setReservations(prev => prev.map(r => r.id === id ? { ...r, [field]: !current } : r))
    setSavingId(null)
  }

  // 到着確認トグル → 退出時刻を自動計算
  const toggleArrival = async (r: Reservation) => {
    const newVal = !r.arrival_confirmed
    let checkout_time = r.checkout_time
    if (newVal && r.time && r.course_duration) {
      checkout_time = calcCheckoutTime(r.time, r.course_duration, r.extension ?? 0)
    }
    setSavingId(r.id)
    await supabase.from('reservations').update({ arrival_confirmed: newVal, checkout_time }).eq('id', r.id)
    setReservations(prev => prev.map(x => x.id === r.id ? { ...x, arrival_confirmed: newVal, checkout_time } : x))
    setSavingId(null)
  }

  const eCount = reservations.filter(r => r.section === 'E').length
  const mCount = reservations.filter(r => r.section === 'M').length

  const renderSection = (section: 'E' | 'M', label: string) => {
    const rows = reservations.filter(r => r.section === section)
    const bgHeader = section === 'E' ? 'bg-pink-200' : 'bg-orange-200'
    const bgRow    = section === 'E' ? 'bg-pink-50'  : 'bg-orange-50'

    return (
      <div className="mb-4">
        <div className={`flex items-center gap-3 px-3 py-2 ${bgHeader} rounded-t font-bold text-gray-800`}>
          <span>{label} ({section === 'E' ? eCount : mCount}件)</span>
          <button
            onClick={() => openAddModal(section)}
            className="ml-auto bg-blue-600 hover:bg-blue-700 text-white text-xs px-3 py-1 rounded"
          >
            + 追加
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse min-w-[1400px]">
            <thead>
              <tr className="bg-gray-700 text-white">
                {['CS','番号','時間','お客様名','確電','伝達','電話番号','エリア','ホテル','部屋','区分','女性','指名','種別','コース','OP1','OP2','OP3','OP4','OP5','OP6','入会金','交通費','延長','割引','金額','到着','退出','注釈','媒体','操作'].map(h => (
                  <th key={h} className="px-1 py-1 border border-gray-600 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={28} className={`text-center py-4 text-gray-400 ${bgRow}`}>予約なし</td>
                </tr>
              )}
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className={`${bgRow} hover:brightness-95 transition-all ${savingId === r.id ? 'opacity-50' : ''}`}
                >
                  <td className="px-1 py-0.5 border border-gray-200 text-center">
                    <input type="checkbox" checked={r.checked} onChange={() => toggleField(r.id, 'checked', r.checked)} className="cursor-pointer" />
                  </td>
                  <td className="px-1 py-0.5 border border-gray-200 text-center text-gray-600">{r.row_number}</td>
                  <td className="px-1 py-0.5 border border-gray-200 text-center font-mono font-bold">{formatTime(r.time)}</td>
                  <td className="px-1 py-0.5 border border-gray-200 font-medium">{r.customer_name}</td>
                  <td className="px-1 py-0.5 border border-gray-200 text-center">
                    <button onClick={() => toggleField(r.id, 'confirmed', r.confirmed)}
                      className={`w-5 h-5 rounded text-xs font-bold ${r.confirmed ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-400'}`}>
                      {r.confirmed ? '○' : ''}
                    </button>
                  </td>
                  <td className="px-1 py-0.5 border border-gray-200 text-center">
                    <button onClick={() => toggleField(r.id, 'communicated', r.communicated)}
                      className={`w-5 h-5 rounded text-xs font-bold ${r.communicated ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-400'}`}>
                      {r.communicated ? '○' : ''}
                    </button>
                  </td>
                  <td className="px-1 py-0.5 border border-gray-200 font-mono">{r.phone}</td>
                  <td className="px-1 py-0.5 border border-gray-200">{r.area}</td>
                  <td className="px-1 py-0.5 border border-gray-200">{r.hotel}</td>
                  <td className="px-1 py-0.5 border border-gray-200 text-center">{r.room_number}</td>
                  <td className="px-1 py-0.5 border border-gray-200 text-center font-medium">{r.category}</td>
                  <td className="px-1 py-0.5 border border-gray-200 text-center text-purple-700 font-medium">
                    {(r.staff as Staff)?.name ?? ''}
                  </td>
                  <td className="px-1 py-0.5 border border-gray-200 text-center">{r.nomination_type}</td>
                  <td className="px-1 py-0.5 border border-gray-200 text-center text-xs font-medium">{r.course_type}</td>
                  <td className="px-1 py-0.5 border border-gray-200 text-center">{r.course_duration ? `${r.course_duration}分` : ''}</td>
                  <td className="px-1 py-0.5 border border-gray-200 text-xs">{r.option1}</td>
                  <td className="px-1 py-0.5 border border-gray-200 text-xs">{r.option2}</td>
                  <td className="px-1 py-0.5 border border-gray-200 text-xs">{r.option3}</td>
                  <td className="px-1 py-0.5 border border-gray-200 text-xs">{r.option4}</td>
                  <td className="px-1 py-0.5 border border-gray-200 text-xs">{r.option5}</td>
                  <td className="px-1 py-0.5 border border-gray-200 text-xs">{r.option6}</td>
                  <td className="px-1 py-0.5 border border-gray-200 text-right">{r.membership_fee > 0 ? r.membership_fee.toLocaleString() : ''}</td>
                  <td className="px-1 py-0.5 border border-gray-200 text-right">{r.transportation_fee > 0 ? r.transportation_fee.toLocaleString() : ''}</td>
                  <td className="px-1 py-0.5 border border-gray-200 text-right">{r.extension > 0 ? r.extension.toLocaleString() : ''}</td>
                  <td className="px-1 py-0.5 border border-gray-200 text-right text-red-600">{r.discount > 0 ? `-${r.discount.toLocaleString()}` : ''}</td>
                  <td className="px-1 py-0.5 border border-gray-200 text-right font-bold text-blue-700">
                    {r.total_amount > 0 ? `¥${r.total_amount.toLocaleString()}` : ''}
                  </td>
                  {/* 到着確認 → 押したら退出時刻を自動計算 */}
                  <td className="px-1 py-0.5 border border-gray-200 text-center">
                    <button onClick={() => toggleArrival(r)}
                      className={`w-6 h-5 rounded text-xs font-bold ${r.arrival_confirmed ? 'bg-orange-500 text-white' : 'bg-gray-200 text-gray-400'}`}>
                      {r.arrival_confirmed ? '着' : ''}
                    </button>
                  </td>
                  <td className="px-1 py-0.5 border border-gray-200 text-center font-mono font-bold text-green-700">
                    {formatTime(r.checkout_time)}
                  </td>
                  <td className="px-1 py-0.5 border border-gray-200 text-gray-600 text-xs">{r.notes}</td>
                  <td className="px-1 py-0.5 border border-gray-200 text-xs">{r.media}</td>
                  <td className="px-1 py-0.5 border border-gray-200 text-center">
                    <div className="flex gap-1 justify-center">
                      <button onClick={() => openEditModal(r)}
                        className="bg-yellow-500 hover:bg-yellow-600 text-white text-xs px-1.5 py-0.5 rounded">編集</button>
                      <button onClick={() => deleteReservation(r.id)}
                        className="bg-red-500 hover:bg-red-600 text-white text-xs px-1.5 py-0.5 rounded">削除</button>
                    </div>
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
      <div className="bg-white rounded-lg shadow p-3 mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">日付</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex gap-1 flex-wrap">
            <button onClick={() => setSelectedStoreId(null)}
              className={`px-3 py-1 rounded text-sm font-medium transition-colors ${selectedStoreId === null ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}>
              全店舗
            </button>
            {STORES.map(s => (
              <button key={s.id} onClick={() => setSelectedStoreId(s.id)}
                className={`px-3 py-1 rounded text-sm font-medium transition-colors ${selectedStoreId === s.id ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}>
                {s.name}
              </button>
            ))}
          </div>
          <div className="ml-auto flex gap-4 text-sm font-medium">
            <span className="bg-pink-100 text-pink-800 px-2 py-1 rounded">E成約: {eCount}件</span>
            <span className="bg-orange-100 text-orange-800 px-2 py-1 rounded">M成約: {mCount}件</span>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="text-gray-500">読み込み中...</div>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow p-3">
          {renderSection('E', 'E 予約')}
          {renderSection('M', 'M 予約')}
        </div>
      )}

      {/* モーダル */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center overflow-y-auto pt-6 pb-10">
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-2xl mx-4">
            <div className="bg-gray-800 text-white px-4 py-3 rounded-t-lg flex items-center justify-between">
              <h2 className="font-bold text-lg">
                {isEditing ? '予約編集' : '新規予約追加'} — {editingReservation.section}セクション
              </h2>
              <button onClick={() => setModalOpen(false)} className="text-gray-300 hover:text-white text-xl">✕</button>
            </div>

            <div className="p-4 grid grid-cols-2 gap-3 text-sm">
              {/* 店舗 */}
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">店舗</label>
                <select value={editingReservation.store_id ?? ''} onChange={e => updateForm({ store_id: Number(e.target.value) })} className={sel}>
                  {STORES.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>

              {/* セクション / 番号 */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">セクション</label>
                <select value={editingReservation.section ?? 'E'} onChange={e => updateForm({ section: e.target.value as 'E' | 'M' })} className={sel}>
                  <option value="E">E</option>
                  <option value="M">M</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">番号</label>
                <input type="number" value={editingReservation.row_number ?? ''} onChange={e => updateForm({ row_number: Number(e.target.value) })} className={sel} />
              </div>

              {/* 時間 */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">時間</label>
                <input
                  type="time"
                  value={editingReservation.time !== null && editingReservation.time !== undefined
                    ? `${String(Math.floor(editingReservation.time / 100)).padStart(2,'0')}:${String(editingReservation.time % 100).padStart(2,'0')}`
                    : ''}
                  onChange={e => {
                    if (!e.target.value) { updateForm({ time: null }); return }
                    const [h, m] = e.target.value.split(':').map(Number)
                    updateForm({ time: h * 100 + m })
                  }}
                  className={sel}
                />
              </div>

              {/* お客様名 */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">お客様名</label>
                <input type="text" value={editingReservation.customer_name ?? ''} onChange={e => updateForm({ customer_name: e.target.value })} className={sel} />
              </div>

              {/* 電話番号 */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">電話番号</label>
                <input type="text" value={editingReservation.phone ?? ''} onChange={e => updateForm({ phone: e.target.value })} className={sel} />
              </div>

              {/* エリア */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">エリア</label>
                <input type="text" value={editingReservation.area ?? ''} onChange={e => updateForm({ area: e.target.value })} className={sel} />
              </div>

              {/* ホテル */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">ホテル</label>
                <input type="text" value={editingReservation.hotel ?? ''} onChange={e => updateForm({ hotel: e.target.value })} className={sel} />
              </div>

              {/* 部屋番号 */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">部屋番号</label>
                <input type="text" value={editingReservation.room_number ?? ''} onChange={e => updateForm({ room_number: e.target.value })} className={sel} />
              </div>

              {/* 区分（新規/会員） */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">区分</label>
                <select
                  value={editingReservation.category ?? ''}
                  onChange={e => {
                    const cat = e.target.value
                    updateForm({ category: cat, membership_fee: cat === '新規' ? 1100 : 0 })
                  }}
                  className={sel}
                >
                  <option value="">-</option>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              {/* 女性 */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">女性</label>
                <select value={editingReservation.staff_id ?? ''} onChange={e => updateForm({ staff_id: e.target.value ? Number(e.target.value) : null })} className={sel}>
                  <option value="">未選択</option>
                  {staffList.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>

              {/* 指名 */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">指名</label>
                <select value={editingReservation.nomination_type ?? ''} onChange={e => updateForm({ nomination_type: e.target.value })} className={sel}>
                  {NOMINATION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>

              {/* コース種別 */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">コース種別</label>
                <select value={editingReservation.course_type ?? ''} onChange={e => updateForm({ course_type: e.target.value || null })} className={sel}>
                  <option value="">-</option>
                  {COURSE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              {/* コース時間 */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">コース時間</label>
                <select
                  value={editingReservation.course_duration ?? ''}
                  onChange={e => updateForm({ course_duration: e.target.value ? Number(e.target.value) : null })}
                  className={sel}
                >
                  <option value="">-</option>
                  {COURSE_DURATIONS.map(d => {
                    const ct = editingReservation.course_type
                    const price = ct && COURSE_PRICES[d]?.[ct] ? ` ¥${COURSE_PRICES[d][ct].toLocaleString()}` : ''
                    return <option key={d} value={d}>{d}分{price}</option>
                  })}
                </select>
              </div>

              {/* OP1〜6 */}
              {(['option1','option2','option3','option4','option5','option6'] as const).map((field, i) => (
                <div key={field}>
                  <label className="block text-xs font-medium text-gray-600 mb-1">OP{i + 1}</label>
                  <select value={(editingReservation[field] as string) ?? ''} onChange={e => updateForm({ [field]: e.target.value })} className={sel}>
                    {OP_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              ))}

              {/* 入会金 */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">入会金</label>
                <select value={editingReservation.membership_fee ?? 0} onChange={e => updateForm({ membership_fee: Number(e.target.value) })} className={sel}>
                  <option value={0}>なし</option>
                  <option value={1100}>あり ¥1,100</option>
                </select>
              </div>

              {/* 交通費 */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">交通費</label>
                <select value={editingReservation.transportation_fee ?? 0} onChange={e => updateForm({ transportation_fee: Number(e.target.value) })} className={sel}>
                  {TRANSPORTATION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>

              {/* 延長 */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">延長</label>
                <select value={editingReservation.extension ?? 0} onChange={e => updateForm({ extension: Number(e.target.value) })} className={sel}>
                  {EXTENSION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>

              {/* 割引 */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">割引</label>
                <select value={editingReservation.discount ?? 0} onChange={e => updateForm({ discount: Number(e.target.value) })} className={sel}>
                  {DISCOUNT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>

              {/* 合計金額（自動計算） */}
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">合計金額（自動計算）</label>
                <div className="w-full border border-blue-300 bg-blue-50 rounded px-3 py-2 text-lg font-bold text-blue-700">
                  ¥{(editingReservation.total_amount ?? 0).toLocaleString()}
                </div>
              </div>

              {/* 媒体 */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">媒体</label>
                <input type="text" value={editingReservation.media ?? ''} onChange={e => updateForm({ media: e.target.value })} className={sel} />
              </div>

              {/* 注釈 */}
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">注釈</label>
                <textarea value={editingReservation.notes ?? ''} onChange={e => updateForm({ notes: e.target.value })} rows={2} className={sel} />
              </div>

              {/* チェックボックス群 */}
              <div className="col-span-2 flex gap-6">
                {([
                  { field: 'confirmed',    label: '確電' },
                  { field: 'communicated', label: '伝達' },
                  { field: 'checked',      label: 'CS' },
                ] as const).map(({ field, label }) => (
                  <label key={field} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={(editingReservation[field] as boolean) ?? false}
                      onChange={e => updateForm({ [field]: e.target.checked })}
                      className="w-4 h-4"
                    />
                    <span className="text-sm">{label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="px-4 py-3 bg-gray-50 rounded-b-lg flex gap-2 justify-end">
              <button onClick={() => setModalOpen(false)} className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded font-medium">
                キャンセル
              </button>
              <button onClick={saveReservation} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium">
                {isEditing ? '更新' : '追加'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
