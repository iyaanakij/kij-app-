'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
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

function calcCheckoutTime(startHHMM: number, courseDuration: number, extensionFee: number): number {
  const extensionMinutes = Math.round((extensionFee / 3000) * 10)
  const h = Math.floor(startHHMM / 100)
  const m = startHHMM % 100
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

// ── キャスト給計算 ──────────────────────────────────────
// コース種別ごとの給与テーブル（未入力はランジェリー扱い）
const COURSE_CAST_PAY: Record<number, Partial<Record<string, number>>> = {
  60:  { ランジェリー: 7000  /* トップレス: ?, ヌード: ? */ },
  80:  { ランジェリー: 9000  },
  100: { ランジェリー: 11000 },
  120: { ランジェリー: 13000 },
  150: { ランジェリー: 16000 },
  180: { ランジェリー: 19000 },
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

// ── テンプレート生成 ────────────────────────────────────
function generateTemplate(r: Reservation): string {
  const time = r.time !== null && r.time !== undefined
    ? `${String(Math.floor(r.time / 100)).padStart(2,'0')}:${String(r.time % 100).padStart(2,'0')}`
    : '-'
  const name = r.customer_name || '-'
  const area = r.area || '-'
  const hotel = r.hotel || '-'
  const room = r.room_number || '-'
  const section = r.section || '-'
  const category = r.category || ''
  const nomination = r.nomination_type || 'フリー'
  const course = r.course_duration ? `${r.course_duration}分` : '-'
  const amount = `${(r.total_amount ?? 0).toLocaleString()}円`

  return `お疲れ様です。
お仕事の詳細をお知らせ致します。

【時間】${time}
【名前】${name}様

【エリア】${area}
【ホテル】${hotel}
【部屋番号】${room}

【EorM】${section}
【会員】${category}
【指名】${nomination}
【コース】${course}

【料金】${amount}

ご確認下さいm(_ _)m`
}

// ── セレクト共通スタイル ────────────────────────────────
const sel = 'w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white'
// インライン編集用
const iText = 'w-full bg-transparent border-b border-transparent focus:border-blue-400 outline-none text-xs px-0.5 min-w-0'
const iSel  = 'w-full bg-transparent border-0 outline-none text-xs cursor-pointer min-w-0 focus:bg-blue-50 rounded'

// ── 成田エリア・ホテルマスタ ────────────────────────────
const NARITA_AREAS = ['富里','駅','寺台','空港','大栄','カメリア','八千代','八街','酒々井','佐倉','芝山','栄町','神崎','香取','三里塚']
const NARITA_HOTELS = ['ルサン','ブーゲン','レインボー','バロン','パリシアン','富ファ','成ファ','レモン','湯楽城(ラディソン)','カメリア','WG','チャペル','デュアラ','ビムズ','アパ','コンフォート','リッチモンド','ウェルコ','Uシティ','ヒルトン','マイステイズ','ゲートウェイ','アートホテル','ANA','マロウド','日航','東横','東武','デイジー','ウィルスイート','フェスタ','K&K','自宅','富里予定','駅前予定','空港予定']
const CHIBA_AREAS = ['栄町','駅','祐光町','千葉みなと','幕張','幕張本郷','千葉北','西船橋','船橋','蘇我','浜野','市原','都賀']
const CHIBA_HOTELS = ['ガーネット','センチュリー','センチュリANEX','ビバリーヒルズ','ピーコック','Nホテル','パーマン','パインズ','ダイワロイネット千葉','ダイワロイネット中央','バリアン','マイス','リオ','ドンキーズジャングル','十色','アリア','自宅','栄町予定']

const NISHIFUNABASHI_AREAS = ['西船','錦糸町','原木','海神','船橋','東船橋','船橋競馬場','幕張','市川塩浜','市川','行徳','浦安','新浦安','舞浜','葛西','小岩','新小岩','松戸','栄','津田沼','祐光','千葉中央']
const NISHIFUNABASHI_HOTELS = ['プラザ','Kスリット','アリュール','アランド','MG','10セゾン','OPERAリゾート','OPERA～YOU～','クイーンエリザベス','ホワイトスクエア','ウィルベイシティ','セピア','トニーワン','31','自宅','ルーナ3','ベーネ','ルボ','ピュアアジアン','弐番館','グランスカイ','DUO','サラ','サラスイート','ミュージック','555アレー','ロハス','クレスト','明日香村','メタルウェーブ','ハンズTOKYO(徒歩)','コーレー','シークレットベニー']

const KINSHICHO_AREAS = ['錦糸町','西船橋','亀戸','墨田区','豊洲・有明','平井','新小岩','小岩','鶯谷','上野','日本橋','江戸川区','台東区','中央区','葛飾区','荒川区','足立区','港区','船橋','海神','幕張本郷','葛西','浦安','市川塩浜','市川']
const KINSHICHO_HOTELS = ['ルボ','ピュアアジアン','弐番館','グランスカイ','DUO','サラ','サラスイート','ミュージック','555アレー','ロハス','クレスト','明日香村','メタルウェーブ','ハンズTOKYO(徒歩)','コーレー','Kスリット','MG','シークレットベニー','錦糸アランド','ケンブリッジ','ツバキ(徒歩)','アイム(徒歩)','プチテル(徒歩)','自宅','バリアン','レイフィールド','ミニム','リッチモンド押上','バンブーガーデン','プラザ','アリュール','アランド']

const STORE_AREAS: Record<number, string[]> = { 1: NARITA_AREAS, 2: CHIBA_AREAS, 3: NISHIFUNABASHI_AREAS, 4: KINSHICHO_AREAS }
const STORE_HOTELS: Record<number, string[]> = { 1: NARITA_HOTELS, 2: CHIBA_HOTELS, 3: NISHIFUNABASHI_HOTELS, 4: KINSHICHO_HOTELS }

// ── ダブルブッキングチェック ────────────────────────────
function checkDoubleBooking(form: Partial<Reservation>, existing: Reservation[], skipId?: number): Reservation | null {
  if (!form.staff_id || !form.time || !form.course_duration) return null
  const newStart = Math.floor(form.time / 100) * 60 + (form.time % 100)
  const newExtMins = Math.round(((form.extension ?? 0) / 3000) * 10)
  const newEnd = newStart + form.course_duration + newExtMins
  for (const r of existing) {
    if (r.id === skipId) continue
    if (r.staff_id !== form.staff_id) continue
    if (!r.time || !r.course_duration) continue
    const rStart = Math.floor(r.time / 100) * 60 + (r.time % 100)
    const rExtMins = Math.round(((r.extension ?? 0) / 3000) * 10)
    const rEnd = rStart + r.course_duration + rExtMins
    if (newStart < rEnd && newEnd > rStart) return r
  }
  return null
}

// ── 検索付きプルダウン ──────────────────────────────────
interface SelectOption {
  label: string
  value: string | number
}

function SearchableSelect({
  value,
  onChange,
  options,
  className,
}: {
  value: string | number
  onChange: (v: string) => void
  options: SelectOption[]
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    if (open) {
      setQuery('')
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [open])

  const filtered = options.filter(o =>
    o.label.toLowerCase().includes(query.toLowerCase())
  )
  const selectedLabel = options.find(o => String(o.value) === String(value))?.label ?? ''

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={`${className} flex items-center justify-between text-left`}
      >
        <span className={selectedLabel ? 'text-gray-800' : 'text-gray-400'}>
          {selectedLabel || '選択...'}
        </span>
        <span className="text-gray-400 text-xs ml-1">▾</span>
      </button>
      {open && (
        <div className="absolute z-[100] left-0 right-0 mt-1 bg-white border border-gray-300 rounded-lg shadow-xl overflow-hidden">
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="検索..."
            className="w-full px-2 py-1.5 text-sm border-b border-gray-200 focus:outline-none"
          />
          <div className="max-h-44 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-2 py-2 text-xs text-gray-400 text-center">見つかりません</div>
            ) : filtered.map(o => (
              <div
                key={String(o.value)}
                onMouseDown={() => { onChange(String(o.value)); setOpen(false) }}
                className={`px-2 py-1.5 text-sm cursor-pointer hover:bg-blue-50 ${
                  String(o.value) === String(value) ? 'bg-blue-100 font-medium' : ''
                }`}
              >
                {o.label}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── テキスト入力＋候補プルダウン ────────────────────────
function ComboInput({
  value,
  onChange,
  onBlur,
  options,
  className,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  onBlur?: (v: string) => void
  options: string[]
  className?: string
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const currentValueRef = useRef(value)
  currentValueRef.current = value

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const filtered = options.filter(o => o.toLowerCase().includes(value.toLowerCase()))

  return (
    <div ref={ref} className="relative">
      <input
        type="text"
        value={value}
        onChange={e => { currentValueRef.current = e.target.value; onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onBlur={() => { setOpen(false); if (onBlur) onBlur(currentValueRef.current) }}
        className={className}
        placeholder={placeholder}
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-[100] left-0 right-0 mt-1 bg-white border border-gray-300 rounded-lg shadow-xl overflow-hidden">
          <div className="max-h-44 overflow-y-auto">
            {filtered.map(o => (
              <div
                key={o}
                onMouseDown={() => { currentValueRef.current = o; onChange(o); setOpen(false) }}
                className={`px-2 py-1.5 text-sm cursor-pointer hover:bg-blue-50 ${o === value ? 'bg-blue-100 font-medium' : ''}`}
              >
                {o}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default function ReservationsPage() {
  const [selectedDate, setSelectedDate] = useState(todayString())
  const [selectedStoreId, setSelectedStoreId] = useState<number | null>(null)
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [staffList, setStaffList] = useState<Staff[]>([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingReservation, setEditingReservation] = useState<Partial<Reservation>>(emptyReservation())
  const [isEditing, setIsEditing] = useState(false)

  // マウント時にlocalStorageから店舗を復元
  useEffect(() => {
    const saved = localStorage.getItem('kij_store')
    if (saved && !isNaN(Number(saved))) setSelectedStoreId(Number(saved))
  }, [])

  const selectStore = (id: number | null) => {
    setSelectedStoreId(id)
    if (id !== null) localStorage.setItem('kij_store', String(id))
  }
  const [savingId, setSavingId] = useState<number | null>(null)
  const [templateText, setTemplateText] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [conflictError, setConflictError] = useState<Reservation | null>(null)
  const [pastTimeError, setPastTimeError] = useState(false)
  const [annotationOverlap, setAnnotationOverlap] = useState<{ memo: string | null } | null>(null)
  const [pendingSave, setPendingSave] = useState(false)
  const [confirmedStaffIds, setConfirmedStaffIds] = useState<Set<number>>(new Set())

  // インライン編集
  const [inlineEditId, setInlineEditId] = useState<number | null>(null)
  const inlineDataRef = useRef<Partial<Reservation>>({})
  const [inlineData, setInlineData] = useState<Partial<Reservation>>({})

  const startInlineEdit = (r: Reservation) => {
    inlineDataRef.current = { ...r }
    setInlineData({ ...r })
    setInlineEditId(r.id)
  }

  const updateInlineLocal = (patch: Partial<Reservation>) => {
    const next = { ...inlineDataRef.current, ...patch }
    next.total_amount = calcTotal(next)
    inlineDataRef.current = next
    setInlineData(next)
  }

  const saveInlineField = async (patch: Partial<Reservation>) => {
    if (inlineEditId === null) return
    const next = { ...inlineDataRef.current, ...patch }
    next.total_amount = calcTotal(next)
    inlineDataRef.current = next
    setInlineData(next)
    await supabase.from('reservations').update({ ...patch, total_amount: next.total_amount }).eq('id', inlineEditId)
    setReservations(prev => prev.map(r => r.id === inlineEditId ? { ...r, ...next } as Reservation : r))
  }

  const fetchStaff = useCallback(async () => {
    const { data } = await supabase.from('staff').select('*').order('name')
    if (data) setStaffList(data)
  }, [])

  const fetchConfirmedShifts = useCallback(async () => {
    if (!selectedDate || selectedStoreId === null) { setConfirmedStaffIds(new Set()); return }
    const { data } = await supabase
      .from('shifts')
      .select('staff_id')
      .eq('date', selectedDate)
      .eq('store_id', selectedStoreId)
      .eq('status', 'normal')
    setConfirmedStaffIds(new Set((data ?? []).map((s: { staff_id: number }) => s.staff_id)))
  }, [selectedDate, selectedStoreId])

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

  // アノテーション確認後に自動保存
  useEffect(() => { if (pendingSave) saveReservation() }, [pendingSave]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { fetchConfirmedShifts() }, [fetchConfirmedShifts])

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
    setConflictError(null)
    setModalOpen(true)
  }

  const openEditModal = (r: Reservation) => {
    setEditingReservation({ ...r })
    setIsEditing(true)
    setConflictError(null)
    setModalOpen(true)
  }

  const saveReservation = async () => {
    if (!editingReservation.store_id || !editingReservation.date) return
    if (!isEditing && editingReservation.time != null) {
      const now = new Date()
      const currentTime = now.getHours() * 100 + now.getMinutes()
      const todayStr = todayString()
      if (editingReservation.date < todayStr ||
          (editingReservation.date === todayStr && editingReservation.time < currentTime)) {
        setPastTimeError(true)
        return
      }
    }
    setPastTimeError(false)
    const conflict = checkDoubleBooking(
      editingReservation,
      reservations,
      isEditing ? editingReservation.id : undefined
    )
    if (conflict) {
      setConflictError(conflict)
      return
    }
    setConflictError(null)

    // メモ（アノテーション）との重複チェック（新規のみ・確認前のみ）
    if (!isEditing && !pendingSave && editingReservation.staff_id && editingReservation.time != null && editingReservation.course_duration) {
      const resStartDecimal = Math.floor(editingReservation.time / 100) + (editingReservation.time % 100) / 60
      const resEndDecimal = resStartDecimal + editingReservation.course_duration / 60
      const { data: overlapping } = await supabase
        .from('board_annotations')
        .select('memo')
        .eq('date', editingReservation.date)
        .eq('staff_id', editingReservation.staff_id)
        .lt('start_time', resEndDecimal)
        .gt('end_time', resStartDecimal)
        .limit(1)
        .maybeSingle()
      if (overlapping) {
        setAnnotationOverlap(overlapping)
        return
      }
    }
    setPendingSave(false)

    if (isEditing && editingReservation.id) {
      setSavingId(editingReservation.id)
      const { id, staff, store, created_at, ...updateData } = editingReservation as Reservation
      await supabase.from('reservations').update(updateData).eq('id', id)
      setSavingId(null)
    } else {
      const { id, staff, store, created_at, ...insertData } = editingReservation as Reservation
      await supabase.from('reservations').insert(insertData)
      // 担当キャストにLINE通知（テンプレート形式）
      if (editingReservation.staff_id) {
        const msg = generateTemplate(editingReservation as Reservation)
        fetch('/api/line/notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ staff_id: editingReservation.staff_id, message: msg }),
        }).catch(() => {})
      }
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

  const eCount = reservations.filter(r => r.section === 'E').length
  const mCount = reservations.filter(r => r.section === 'M').length

  const renderSection = (section: 'E' | 'M', label: string) => {
    const rows = reservations.filter(r => r.section === section)
    const bgHeader = section === 'E' ? 'bg-pink-200 text-pink-900' : 'bg-amber-200 text-amber-900'
    const bgRow    = section === 'E' ? 'bg-pink-50'  : 'bg-orange-50'

    return (
      <div className="mb-5">
        <div className={`flex items-center gap-3 px-4 py-2.5 ${bgHeader} rounded-t-lg font-bold`}>
          <span className="text-sm">{label}</span>
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${section === 'E' ? 'bg-pink-400 text-white' : 'bg-amber-500 text-white'}`}>
            {section === 'E' ? eCount : mCount}件
          </span>
          <button
            onClick={() => openAddModal(section)}
            className="ml-auto bg-blue-600 hover:bg-blue-700 text-white text-xs px-3 py-1 rounded-full font-medium transition-colors shadow-sm"
          >
            + 追加
          </button>
        </div>
        <div className="overflow-x-auto border border-t-0 border-gray-200 rounded-b-lg">
          <table className="w-full text-xs border-collapse min-w-[1400px]">
            <thead className="sticky top-0 z-10">
              <tr className="bg-gray-700 text-white">
                {['CS','番号','時間','お客様名','確電','伝達','電話番号','エリア','ホテル','部屋','区分','女性','指名','種別','コース','OP1','OP2','OP3','OP4','OP5','OP6','入会金','交通費','延長','割引','金額','到着','退出','注釈','媒体','操作'].map(h => (
                  <th key={h} className="px-1.5 py-1.5 border border-gray-600 whitespace-nowrap font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={28} className={`text-center py-5 text-gray-400 ${bgRow}`}>予約なし</td>
                </tr>
              )}
              {rows.map((r) => {
                const isOpen = inlineEditId === r.id
                const d = inlineData
                const COLS = 31
                const fld = 'flex flex-col gap-0.5'
                const lbl = 'text-xs font-semibold text-gray-500 uppercase tracking-wide'
                const inp = 'border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white w-full'
                return (
                <>
                <tr
                  key={r.id}
                  onClick={() => isOpen ? setInlineEditId(null) : startInlineEdit(r)}
                  className={`transition-all cursor-pointer text-xs ${savingId === r.id ? 'opacity-50' : ''} ${isOpen ? 'bg-blue-50 border-l-2 border-blue-400' : `${bgRow} hover:brightness-95`}`}
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
                  <td className="px-1 py-1 border border-gray-200 font-mono text-gray-700">{r.phone}</td>
                  <td className="px-1 py-1 border border-gray-200 text-gray-700">{r.area}</td>
                  <td className="px-1 py-1 border border-gray-200 text-gray-700">{r.hotel}</td>
                  <td className="px-1 py-1 border border-gray-200 text-center text-gray-700">{r.room_number}</td>
                  <td className="px-1 py-1 border border-gray-200 text-center font-semibold text-gray-700">{r.category}</td>
                  <td className="px-1 py-1 border border-gray-200 text-center text-purple-700 font-semibold">{(r.staff as Staff)?.name ?? ''}</td>
                  <td className="px-1 py-1 border border-gray-200 text-center text-gray-700">{r.nomination_type}</td>
                  <td className="px-1 py-1 border border-gray-200 text-center font-medium text-gray-700">{r.course_type}</td>
                  <td className="px-1 py-1 border border-gray-200 text-center font-medium text-gray-700">{r.course_duration ? `${r.course_duration}分` : ''}</td>
                  <td className="px-1 py-1 border border-gray-200 text-gray-600">{r.option1}</td>
                  <td className="px-1 py-1 border border-gray-200 text-gray-600">{r.option2}</td>
                  <td className="px-1 py-1 border border-gray-200 text-gray-600">{r.option3}</td>
                  <td className="px-1 py-1 border border-gray-200 text-gray-600">{r.option4}</td>
                  <td className="px-1 py-1 border border-gray-200 text-gray-600">{r.option5}</td>
                  <td className="px-1 py-1 border border-gray-200 text-gray-600">{r.option6}</td>
                  <td className="px-1 py-1 border border-gray-200 text-right text-gray-700">{r.membership_fee > 0 ? r.membership_fee.toLocaleString() : ''}</td>
                  <td className="px-1 py-1 border border-gray-200 text-right text-gray-700">{r.transportation_fee > 0 ? r.transportation_fee.toLocaleString() : ''}</td>
                  <td className="px-1 py-1 border border-gray-200 text-right text-gray-700">{r.extension > 0 ? r.extension.toLocaleString() : ''}</td>
                  <td className="px-1 py-1 border border-gray-200 text-right text-red-600 font-medium">{r.discount > 0 ? `-${r.discount.toLocaleString()}` : ''}</td>
                  <td className="px-1.5 py-1 border border-gray-200 text-right font-bold text-yellow-600">{r.total_amount > 0 ? `¥${r.total_amount.toLocaleString()}` : ''}</td>
                  <td className="px-1 py-1 border border-gray-200 text-center" onClick={e => e.stopPropagation()}>
                    <button onClick={() => toggleArrival(r)} className={`px-2 h-5 rounded-full text-xs font-bold transition-colors ${r.arrival_confirmed ? 'bg-orange-500 text-white' : 'bg-gray-200 text-gray-400 hover:bg-gray-300'}`}>着</button>
                  </td>
                  <td className="px-1 py-1 border border-gray-200 text-center font-mono font-bold text-emerald-600">{formatTime(r.checkout_time)}</td>
                  <td className="px-1 py-1 border border-gray-200 text-gray-600">{r.notes}</td>
                  <td className="px-1 py-1 border border-gray-200 text-gray-600">{r.media}</td>
                  <td className="px-1 py-1 border border-gray-200 text-center" onClick={e => e.stopPropagation()}>
                    <div className="flex gap-1 justify-center">
                      <button onClick={() => { setTemplateText(generateTemplate(r)); setCopied(false) }} className="bg-green-500 hover:bg-green-600 text-white text-xs px-2 py-0.5 rounded">テンプレ</button>
                      <button onClick={() => openEditModal(r)} className="bg-yellow-500 hover:bg-yellow-600 text-white text-xs px-2 py-0.5 rounded">編集</button>
                      <button onClick={() => deleteReservation(r.id)} className="bg-red-500 hover:bg-red-600 text-white text-xs px-2 py-0.5 rounded">削除</button>
                    </div>
                  </td>
                </tr>
                {isOpen && (
                  <tr key={`${r.id}-edit`} className="bg-white border-l-2 border-blue-400">
                    <td colSpan={COLS} className="px-4 py-3 border-b border-blue-200">
                      <div className="grid grid-cols-4 gap-x-4 gap-y-2 text-sm">
                        {/* 行1: 番号 時間 お客様名 電話 */}
                        <div className={fld}><span className={lbl}>番号</span><input type="number" className={inp} value={d.row_number ?? ''} onChange={e => updateInlineLocal({ row_number: Number(e.target.value) })} onBlur={e => saveInlineField({ row_number: Number(e.target.value) })} /></div>
                        <div className={fld}><span className={lbl}>時間</span><input type="time" className={inp} value={d.time != null ? `${String(Math.floor(d.time/100)).padStart(2,'0')}:${String(d.time%100).padStart(2,'0')}` : ''} onChange={e => { if (!e.target.value){updateInlineLocal({time:null});return} const [h,m]=e.target.value.split(':').map(Number); updateInlineLocal({time:h*100+m}) }} onBlur={e => { if (!e.target.value){saveInlineField({time:null});return} const [h,m]=e.target.value.split(':').map(Number); saveInlineField({time:h*100+m}) }} /></div>
                        <div className={fld}><span className={lbl}>お客様名</span><input className={inp} value={d.customer_name ?? ''} onChange={e => updateInlineLocal({ customer_name: e.target.value })} onBlur={e => saveInlineField({ customer_name: e.target.value })} /></div>
                        <div className={fld}><span className={lbl}>電話番号</span><input className={inp} value={d.phone ?? ''} onChange={e => updateInlineLocal({ phone: e.target.value })} onBlur={e => saveInlineField({ phone: e.target.value })} /></div>
                        {/* 行2: エリア ホテル 部屋 区分 */}
                        <div className={fld}><span className={lbl}>エリア</span><ComboInput value={d.area ?? ''} onChange={v => updateInlineLocal({ area: v })} onBlur={v => saveInlineField({ area: v })} options={STORE_AREAS[d.store_id ?? 0] ?? []} className={inp} /></div>
                        <div className={fld}><span className={lbl}>ホテル</span><ComboInput value={d.hotel ?? ''} onChange={v => updateInlineLocal({ hotel: v })} onBlur={v => saveInlineField({ hotel: v })} options={STORE_HOTELS[d.store_id ?? 0] ?? []} className={inp} /></div>
                        <div className={fld}><span className={lbl}>部屋番号</span><input className={inp} value={d.room_number ?? ''} onChange={e => updateInlineLocal({ room_number: e.target.value })} onBlur={e => saveInlineField({ room_number: e.target.value })} /></div>
                        <div className={fld}><span className={lbl}>区分</span><SearchableSelect value={d.category ?? ''} onChange={v => saveInlineField({ category: v, membership_fee: v==='新規'?1100:0 })} options={[{ label: '-', value: '' }, ...CATEGORIES.map(c => ({ label: c, value: c }))]} className={inp} /></div>
                        {/* 行3: 女性 指名 種別 コース */}
                        <div className={fld}><span className={lbl}>女性</span><SearchableSelect value={d.staff_id ?? ''} onChange={v => saveInlineField({ staff_id: v ? Number(v) : null })} options={[{ label: '-', value: '' }, ...staffList.filter(s => confirmedStaffIds.has(s.id)).map(s => ({ label: s.name, value: s.id }))]} className={inp} /></div>
                        <div className={fld}><span className={lbl}>指名</span><SearchableSelect value={d.nomination_type ?? ''} onChange={v => saveInlineField({ nomination_type: v })} options={NOMINATION_OPTIONS.map(o => ({ label: o.label, value: o.value }))} className={inp} /></div>
                        <div className={fld}><span className={lbl}>種別</span><SearchableSelect value={d.course_type ?? ''} onChange={v => saveInlineField({ course_type: v || null })} options={[{ label: '-', value: '' }, ...COURSE_TYPES.map(t => ({ label: t, value: t }))]} className={inp} /></div>
                        <div className={fld}><span className={lbl}>コース</span><SearchableSelect value={d.course_duration ?? ''} onChange={v => saveInlineField({ course_duration: v ? Number(v) : null })} options={[{ label: '-', value: '' }, ...COURSE_DURATIONS.map(dur => ({ label: `${dur}分`, value: dur }))]} className={inp} /></div>
                        {/* 行4: OP1-4 */}
                        {(['option1','option2','option3','option4'] as const).map((f,i)=>(
                          <div key={f} className={fld}><span className={lbl}>OP{i+1}</span><SearchableSelect value={(d[f] as string) ?? ''} onChange={v => saveInlineField({ [f]: v })} options={OP_OPTIONS.map(o => ({ label: o.label, value: o.value }))} className={inp} /></div>
                        ))}
                        {/* 行5: OP5-6 入会金 交通費 */}
                        {(['option5','option6'] as const).map((f,i)=>(
                          <div key={f} className={fld}><span className={lbl}>OP{i+5}</span><SearchableSelect value={(d[f] as string) ?? ''} onChange={v => saveInlineField({ [f]: v })} options={OP_OPTIONS.map(o => ({ label: o.label, value: o.value }))} className={inp} /></div>
                        ))}
                        <div className={fld}><span className={lbl}>入会金</span><SearchableSelect value={d.membership_fee ?? 0} onChange={v => saveInlineField({ membership_fee: Number(v) })} options={[{ label: 'なし', value: 0 }, { label: 'あり ¥1,100', value: 1100 }]} className={inp} /></div>
                        <div className={fld}><span className={lbl}>交通費</span><SearchableSelect value={d.transportation_fee ?? 0} onChange={v => saveInlineField({ transportation_fee: Number(v) })} options={TRANSPORTATION_OPTIONS.map(o => ({ label: o.label, value: o.value }))} className={inp} /></div>
                        {/* 行6: 延長 割引 注釈 媒体 */}
                        <div className={fld}><span className={lbl}>延長</span><SearchableSelect value={d.extension ?? 0} onChange={v => saveInlineField({ extension: Number(v) })} options={EXTENSION_OPTIONS.map(o => ({ label: o.label, value: o.value }))} className={inp} /></div>
                        <div className={fld}><span className={lbl}>割引</span><SearchableSelect value={d.discount ?? 0} onChange={v => saveInlineField({ discount: Number(v) })} options={DISCOUNT_OPTIONS.map(o => ({ label: o.label, value: o.value }))} className={inp} /></div>
                        <div className={fld}><span className={lbl}>退出時刻</span><input type="time" className={inp} value={d.checkout_time != null ? `${String(Math.floor(d.checkout_time/100)).padStart(2,'0')}:${String(d.checkout_time%100).padStart(2,'0')}` : ''} onChange={e => { if (!e.target.value){updateInlineLocal({checkout_time:null});return} const [h,m]=e.target.value.split(':').map(Number); updateInlineLocal({checkout_time:h*100+m}) }} onBlur={e => { if (!e.target.value){saveInlineField({checkout_time:null});return} const [h,m]=e.target.value.split(':').map(Number); saveInlineField({checkout_time:h*100+m}) }} /></div>
                        <div className={fld}><span className={lbl}>注釈</span><input className={inp} value={d.notes ?? ''} onChange={e => updateInlineLocal({ notes: e.target.value })} onBlur={e => saveInlineField({ notes: e.target.value })} /></div>
                        <div className={fld}><span className={lbl}>媒体</span><input className={inp} value={d.media ?? ''} onChange={e => updateInlineLocal({ media: e.target.value })} onBlur={e => saveInlineField({ media: e.target.value })} /></div>
                      </div>
                      {/* 合計金額 */}
                      <div className="mt-3 flex items-center gap-3">
                        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">合計金額</span>
                        <span className="text-xl font-bold text-yellow-600">¥{(d.total_amount ?? 0).toLocaleString()}</span>
                        <button onClick={() => setInlineEditId(null)} className="ml-auto px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-full transition-colors">閉じる</button>
                      </div>
                    </td>
                  </tr>
                )}
                </>
                )
              })}
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
              onClick={() => selectStore(null)}
              className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${selectedStoreId === null ? 'bg-blue-600 text-white shadow-sm' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
            >
              全店舗
            </button>
            {STORES.map(s => (
              <button
                key={s.id}
                onClick={() => selectStore(s.id)}
                className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${selectedStoreId === s.id ? 'bg-blue-600 text-white shadow-sm' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
              >
                {s.name}
              </button>
            ))}
          </div>
          <div className="ml-auto flex gap-3 text-sm font-medium">
            <span className="bg-pink-100 text-pink-800 px-3 py-1 rounded-full flex items-center gap-1.5">
              E成約
              <span className="bg-pink-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">{eCount}</span>
            </span>
            <span className="bg-amber-100 text-amber-800 px-3 py-1 rounded-full flex items-center gap-1.5">
              M成約
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
          {renderSection('E', 'E 予約')}
          {renderSection('M', 'M 予約')}
        </div>
      )}

      {/* テンプレートモーダル */}
      {templateText !== null && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm">
            <div className="bg-gray-900 text-white px-5 py-3 rounded-t-xl flex items-center justify-between">
              <h2 className="font-bold text-sm">テンプレート</h2>
              <button onClick={() => setTemplateText(null)} className="text-gray-400 hover:text-white text-xl leading-none">✕</button>
            </div>
            <div className="p-4">
              <textarea
                readOnly
                value={templateText}
                rows={14}
                className="w-full border border-gray-200 rounded-lg p-3 text-sm font-mono bg-gray-50 resize-none focus:outline-none"
                onClick={e => (e.target as HTMLTextAreaElement).select()}
              />
              <button
                onClick={() => {
                  navigator.clipboard.writeText(templateText)
                  setCopied(true)
                  setTimeout(() => setCopied(false), 2000)
                }}
                className={`mt-3 w-full py-2.5 rounded-lg font-bold text-sm transition-colors ${
                  copied ? 'bg-green-500 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'
                }`}
              >
                {copied ? '✓ コピーしました' : 'クリップボードにコピー'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* モーダル */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center overflow-y-auto pt-6 pb-10">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4">
            <div className="bg-gray-900 text-white px-5 py-4 rounded-t-xl flex items-center justify-between">
              <h2 className="font-bold text-base">
                {isEditing ? '予約編集' : '新規予約追加'}
                <span className="ml-2 text-gray-400 font-normal text-sm">— {editingReservation.section}セクション</span>
              </h2>
              <button onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-white text-xl leading-none transition-colors">✕</button>
            </div>

            <div className="p-5 grid grid-cols-2 gap-3 text-sm">
              {/* 店舗 */}
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">店舗</label>
                <SearchableSelect
                  value={editingReservation.store_id ?? ''}
                  onChange={v => updateForm({ store_id: Number(v) })}
                  options={STORES.map(s => ({ label: s.name, value: s.id }))}
                  className={sel}
                />
              </div>

              {/* セクション / 番号 */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">セクション</label>
                <SearchableSelect
                  value={editingReservation.section ?? 'E'}
                  onChange={v => updateForm({ section: v as 'E' | 'M' })}
                  options={[{ label: 'E', value: 'E' }, { label: 'M', value: 'M' }]}
                  className={sel}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">番号</label>
                <input type="number" value={editingReservation.row_number ?? ''} onChange={e => updateForm({ row_number: Number(e.target.value) })} className={sel} />
              </div>

              {/* 時間 */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">時間</label>
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
                <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">お客様名</label>
                <input type="text" value={editingReservation.customer_name ?? ''} onChange={e => updateForm({ customer_name: e.target.value })} className={sel} />
              </div>

              {/* 電話番号 */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">電話番号</label>
                <input type="text" value={editingReservation.phone ?? ''} onChange={e => updateForm({ phone: e.target.value })} className={sel} />
              </div>

              {/* エリア */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">エリア</label>
                <ComboInput
                  value={editingReservation.area ?? ''}
                  onChange={v => updateForm({ area: v })}
                  options={STORE_AREAS[editingReservation.store_id ?? 0] ?? []}
                  className={sel}
                />
              </div>

              {/* ホテル */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">ホテル</label>
                <ComboInput
                  value={editingReservation.hotel ?? ''}
                  onChange={v => updateForm({ hotel: v })}
                  options={STORE_HOTELS[editingReservation.store_id ?? 0] ?? []}
                  className={sel}
                />
              </div>

              {/* 部屋番号 */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">部屋番号</label>
                <input type="text" value={editingReservation.room_number ?? ''} onChange={e => updateForm({ room_number: e.target.value })} className={sel} />
              </div>

              {/* 区分（新規/会員） */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">区分</label>
                <SearchableSelect
                  value={editingReservation.category ?? ''}
                  onChange={v => updateForm({ category: v, membership_fee: v === '新規' ? 1100 : 0 })}
                  options={[{ label: '-', value: '' }, ...CATEGORIES.map(c => ({ label: c, value: c }))]}
                  className={sel}
                />
              </div>

              {/* 女性 */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">女性</label>
                <SearchableSelect
                  value={editingReservation.staff_id ?? ''}
                  onChange={v => updateForm({ staff_id: v ? Number(v) : null })}
                  options={[{ label: '未選択', value: '' }, ...staffList.filter(s => confirmedStaffIds.has(s.id)).map(s => ({ label: s.name, value: s.id }))]}
                  className={sel}
                />
              </div>

              {/* 指名 */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">指名</label>
                <SearchableSelect
                  value={editingReservation.nomination_type ?? ''}
                  onChange={v => updateForm({ nomination_type: v })}
                  options={NOMINATION_OPTIONS.map(o => ({ label: o.label, value: o.value }))}
                  className={sel}
                />
              </div>

              {/* コース種別 */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">コース種別</label>
                <SearchableSelect
                  value={editingReservation.course_type ?? ''}
                  onChange={v => updateForm({ course_type: v || null })}
                  options={[{ label: '-', value: '' }, ...COURSE_TYPES.map(t => ({ label: t, value: t }))]}
                  className={sel}
                />
              </div>

              {/* コース時間 */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">コース時間</label>
                <SearchableSelect
                  value={editingReservation.course_duration ?? ''}
                  onChange={v => updateForm({ course_duration: v ? Number(v) : null })}
                  options={[{ label: '-', value: '' }, ...COURSE_DURATIONS.map(d => {
                    const ct = editingReservation.course_type
                    const price = ct && COURSE_PRICES[d]?.[ct] ? ` ¥${COURSE_PRICES[d][ct].toLocaleString()}` : ''
                    return { label: `${d}分${price}`, value: d }
                  })]}
                  className={sel}
                />
              </div>

              {/* OP1〜6 */}
              {(['option1','option2','option3','option4','option5','option6'] as const).map((field, i) => (
                <div key={field}>
                  <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">OP{i + 1}</label>
                  <SearchableSelect
                    value={(editingReservation[field] as string) ?? ''}
                    onChange={v => updateForm({ [field]: v })}
                    options={OP_OPTIONS.map(o => ({ label: o.label, value: o.value }))}
                    className={sel}
                  />
                </div>
              ))}

              {/* 入会金 */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">入会金</label>
                <SearchableSelect
                  value={editingReservation.membership_fee ?? 0}
                  onChange={v => updateForm({ membership_fee: Number(v) })}
                  options={[{ label: 'なし', value: 0 }, { label: 'あり ¥1,100', value: 1100 }]}
                  className={sel}
                />
              </div>

              {/* 交通費 */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">交通費</label>
                <SearchableSelect
                  value={editingReservation.transportation_fee ?? 0}
                  onChange={v => updateForm({ transportation_fee: Number(v) })}
                  options={TRANSPORTATION_OPTIONS.map(o => ({ label: o.label, value: o.value }))}
                  className={sel}
                />
              </div>

              {/* 延長 */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">延長</label>
                <SearchableSelect
                  value={editingReservation.extension ?? 0}
                  onChange={v => updateForm({ extension: Number(v) })}
                  options={EXTENSION_OPTIONS.map(o => ({ label: o.label, value: o.value }))}
                  className={sel}
                />
              </div>

              {/* 割引 */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">割引</label>
                <SearchableSelect
                  value={editingReservation.discount ?? 0}
                  onChange={v => updateForm({ discount: Number(v) })}
                  options={DISCOUNT_OPTIONS.map(o => ({ label: o.label, value: o.value }))}
                  className={sel}
                />
              </div>

              {/* 合計金額（自動計算） */}
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">合計金額（自動計算）</label>
                <div className="w-full border-2 border-yellow-400 bg-yellow-50 rounded-lg px-4 py-2.5 text-xl font-bold text-yellow-700">
                  ¥{(editingReservation.total_amount ?? 0).toLocaleString()}
                </div>
              </div>

              {/* 媒体 */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">媒体</label>
                <input type="text" value={editingReservation.media ?? ''} onChange={e => updateForm({ media: e.target.value })} className={sel} />
              </div>

              {/* 注釈 */}
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">注釈</label>
                <textarea value={editingReservation.notes ?? ''} onChange={e => updateForm({ notes: e.target.value })} rows={2} className={sel} />
              </div>

              {/* チェックボックス群 */}
              <div className="col-span-2 flex gap-6 pt-1">
                {([
                  { field: 'confirmed',    label: '確電' },
                  { field: 'communicated', label: '伝達' },
                  { field: 'checked',      label: 'CS' },
                ] as const).map(({ field, label }) => (
                  <label key={field} className="flex items-center gap-2 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={(editingReservation[field] as boolean) ?? false}
                      onChange={e => updateForm({ [field]: e.target.checked })}
                      className="w-4 h-4 accent-blue-600 cursor-pointer"
                    />
                    <span className="text-sm text-gray-700 group-hover:text-gray-900">{label}</span>
                  </label>
                ))}
              </div>
            </div>

            {annotationOverlap && (
              <div className="mx-5 mb-1 p-3 bg-yellow-50 border border-yellow-400 rounded-lg text-sm text-yellow-800 flex items-start gap-2">
                <span className="text-lg leading-none">⚠️</span>
                <div>
                  <div className="font-bold mb-1">メモが設定されています{annotationOverlap.memo ? `：「${annotationOverlap.memo}」` : ''}</div>
                  <div className="text-xs mb-2">この時間帯に被せて予約を取りますか？</div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setAnnotationOverlap(null) }}
                      className="px-3 py-1 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded text-xs font-medium"
                    >キャンセル</button>
                    <button
                      onClick={() => { setAnnotationOverlap(null); setPendingSave(true) }}
                      className="px-3 py-1 bg-yellow-500 hover:bg-yellow-600 text-white rounded text-xs font-bold"
                    >被せて予約する</button>
                  </div>
                </div>
              </div>
            )}
            {pastTimeError && (
              <div className="mx-5 mb-1 p-3 bg-red-50 border border-red-300 rounded-lg text-sm text-red-700 flex items-start gap-2">
                <span className="text-lg leading-none">⚠️</span>
                <span>過去の日時には予約を入力できません</span>
              </div>
            )}
            {conflictError && (
              <div className="mx-5 mb-1 p-3 bg-red-50 border border-red-300 rounded-lg text-sm text-red-700 flex items-start gap-2">
                <span className="text-lg leading-none">⚠️</span>
                <div>
                  <span className="font-bold">ダブルブッキング</span>
                  <span className="ml-1">
                    {staffList.find(s => s.id === conflictError.staff_id)?.name ?? 'スタッフ'} は {formatTime(conflictError.time)} 〜 に
                    「{conflictError.customer_name ?? '予約あり'}」({conflictError.course_duration}分) が入っています。
                  </span>
                </div>
              </div>
            )}
            <div className="px-5 py-4 bg-gray-50 rounded-b-xl flex gap-2 justify-end border-t border-gray-200">
              <button onClick={() => setModalOpen(false)} className="px-5 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg font-medium transition-colors">
                キャンセル
              </button>
              <button onClick={saveReservation} className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium shadow-sm transition-colors">
                {isEditing ? '更新' : '追加'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
