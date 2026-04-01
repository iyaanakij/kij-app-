export interface Store {
  id: number
  name: string
}

export interface Staff {
  id: number
  name: string
  join_date: string | null
  notes: string | null
  created_at: string
  stores?: Store[]
}

export interface StaffStore {
  staff_id: number
  store_id: number
}

export interface Shift {
  id: number
  staff_id: number
  store_id: number
  date: string
  start_time: number
  end_time: number
  status: 'normal' | 'x'
  notes: string | null
  created_at: string
  staff?: Staff
  store?: Store
}

export interface Reservation {
  id: number
  store_id: number
  date: string
  section: 'E' | 'M' | null
  row_number: number | null
  time: number | null
  customer_name: string | null
  phone: string | null
  confirmed: boolean
  communicated: boolean
  area: string | null
  hotel: string | null
  room_number: string | null
  category: string | null
  staff_id: number | null
  nomination_type: string | null
  course_duration: number | null
  course_type: string | null
  nude: boolean
  option1: string | null
  option2: string | null
  option3: string | null
  option4: string | null
  option5: string | null
  option6: string | null
  membership_fee: number
  transportation_fee: number
  extension: number
  discount: number
  total_amount: number
  checkout_time: number | null
  arrival_confirmed: boolean
  notes: string | null
  media: string | null
  checked: boolean
  created_at: string
  staff?: Staff
  store?: Store
}

export interface ShiftRequest {
  id: number
  staff_id: number
  store_id: number
  date: string
  start_time: number
  end_time: number
  status: 'pending' | 'approved' | 'rejected'
  notes: string | null
  reject_reason: string | null
  created_at: string
  staff?: Staff
  store?: Store
}

export function isVideo(path: string): boolean {
  return /\.(mp4|mov|webm|avi|mkv|m4v|ogg)$/i.test(path)
}

export interface PhotoDiary {
  id: number
  staff_id: number
  title: string | null
  body: string | null
  thumbnail_image_id: number | null
  published: boolean
  published_at: string | null
  scheduled_at: string | null
  created_at: string
  updated_at: string
  staff?: { name: string }
  thumbnail?: PhotoDiaryImage | null
}

export interface PhotoDiaryImage {
  id: number
  diary_id: number
  storage_path: string
  sort_order: number
  created_at: string
}

export const STORES: Store[] = [
  { id: 1, name: '成田' },
  { id: 2, name: '千葉' },
  { id: 3, name: '西船橋' },
  { id: 4, name: '錦糸町' },
]

// 癒したくて店舗（id 5-8、地域はSTORESと対応）
export const IYASHI_STORES: Store[] = [
  { id: 5, name: '成田' },
  { id: 6, name: '千葉' },
  { id: 7, name: '西船橋' },
  { id: 8, name: '錦糸町' },
]

export const M_STORE_IDS = [1, 2, 3, 4]
export const Y_STORE_IDS = [5, 6, 7, 8]

export type StaffBrand = 'M' | 'Y' | 'both' | 'none'

export function getStaffBrand(storeIds: number[]): StaffBrand {
  const hasM = storeIds.some(id => M_STORE_IDS.includes(id))
  const hasY = storeIds.some(id => Y_STORE_IDS.includes(id))
  if (hasM && hasY) return 'both'
  if (hasM) return 'M'
  if (hasY) return 'Y'
  return 'none'
}

export function formatTime(hhmm: number | null): string {
  if (hhmm === null || hhmm === undefined) return ''
  const h = Math.floor(hhmm / 100)
  const m = hhmm % 100
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function formatShiftTime(t: number): string {
  if (t >= 24) {
    return `翌${String(Math.floor(t - 24)).padStart(2, '0')}:00`
  }
  const h = Math.floor(t)
  const m = Math.round((t - h) * 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function hhmmToDecimal(hhmm: number): number {
  const h = Math.floor(hhmm / 100)
  const m = hhmm % 100
  return h + m / 60
}

export function todayString(): string {
  const d = new Date()
  // 営業日の切り替えは翌7時 → 7時前は前日扱い
  if (d.getHours() < 7) {
    d.setDate(d.getDate() - 1)
  }
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
