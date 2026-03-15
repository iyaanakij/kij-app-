'use client'

import { useEffect, useState, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { ShiftRequest, Staff, STORES, formatShiftTime } from '@/lib/types'
import { getCurrentUser, UserInfo } from '@/lib/auth'

const HOURS = Array.from({ length: 25 }, (_, i) => i + 8)
const WEEKDAY = ['日', '月', '火', '水', '木', '金', '土']

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate()
}

function getLineLinkUrl(userId: string) {
  return `https://access.line.me/oauth2/v2.1/authorize?` +
    new URLSearchParams({
      response_type: 'code',
      client_id: '2009450638',
      redirect_uri: 'https://kij-app.vercel.app/api/line/callback',
      state: `link:${userId}`,
      scope: 'profile openid',
    }).toString()
}

function CastShiftPageInner() {
  const router = useRouter()
  const params = useSearchParams()
  const [user, setUser] = useState<UserInfo | null>(null)
  const [staffName, setStaffName] = useState('')
  const [lineLinked, setLineLinked] = useState<boolean | null>(null)
  const [requests, setRequests] = useState<ShiftRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const now = new Date()
  const [calYear, setCalYear] = useState(now.getFullYear())
  const [calMonth, setCalMonth] = useState(now.getMonth() + 1)
  const [form, setForm] = useState({
    store_id: 1,
    date: '',
    start_time: 14,
    end_time: 22,
    notes: '',
  })

  useEffect(() => {
    getCurrentUser().then(async u => {
      if (!u || u.role !== 'cast') { router.replace('/cast/login'); return }
      setUser(u)
      if (u.staff_id) {
        const { data } = await supabase.from('staff').select('name').eq('id', u.staff_id).single()
        if (data) setStaffName(data.name)
      }
      // LINE連携状態を確認
      const { data: role } = await supabase.from('user_roles').select('line_user_id').eq('id', u.id).single()
      setLineLinked(!!role?.line_user_id)
      setLoading(false)
    })
  }, [router])

  useEffect(() => {
    if (params.get('line_linked') === '1') setLineLinked(true)
  }, [params])

  const fetchRequests = useCallback(async () => {
    if (!user?.staff_id) return
    const { data } = await supabase
      .from('shift_requests')
      .select('*')
      .eq('staff_id', user.staff_id)
      .order('date', { ascending: false })
    if (data) setRequests(data as ShiftRequest[])
  }, [user])

  useEffect(() => { fetchRequests() }, [fetchRequests])

  const submitRequest = async () => {
    if (!user?.staff_id || !form.date) return
    setSaving(true)
    await supabase.from('shift_requests').insert({
      staff_id: user.staff_id,
      store_id: form.store_id,
      date: form.date,
      start_time: form.start_time,
      end_time: form.end_time,
      notes: form.notes || null,
      status: 'pending',
    })
    setSaving(false)
    setModalOpen(false)
    fetchRequests()
  }

  const logout = async () => {
    await supabase.auth.signOut()
    router.replace('/cast/login')
  }

  const openModalWithDate = (dateStr: string) => {
    setForm({ store_id: 1, date: dateStr, start_time: 14, end_time: 22, notes: '' })
    setModalOpen(true)
  }

  // カレンダー用データ
  const daysInMonth = getDaysInMonth(calYear, calMonth)
  const firstDow = new Date(calYear, calMonth - 1, 1).getDay()
  const requestMap = new Map<string, ShiftRequest>()
  requests.forEach(r => { requestMap.set(r.date, r) })

  const prevMonth = () => {
    if (calMonth === 1) { setCalYear(y => y - 1); setCalMonth(12) }
    else setCalMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (calMonth === 12) { setCalYear(y => y + 1); setCalMonth(1) }
    else setCalMonth(m => m + 1)
  }

  const statusBadge = (status: string) => {
    if (status === 'pending') return <span className="bg-yellow-100 text-yellow-700 text-xs font-bold px-2.5 py-1 rounded-full">審査中</span>
    if (status === 'approved') return <span className="bg-green-100 text-green-700 text-xs font-bold px-2.5 py-1 rounded-full">承認済</span>
    return <span className="bg-red-100 text-red-700 text-xs font-bold px-2.5 py-1 rounded-full">却下</span>
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-gray-400 animate-pulse">読み込み中...</div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-100 px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <div>
          <div className="text-base font-bold text-pink-500">KIJ マイページ</div>
          {staffName && <div className="text-sm font-bold text-gray-700">{staffName}</div>}
          <div className="text-xs text-gray-400">{user?.email}</div>
        </div>
        <button onClick={logout} className="text-xs text-gray-400 hover:text-gray-600 transition-colors">ログアウト</button>
      </div>

      {/* Tab nav */}
      <div className="flex bg-white border-b border-gray-100">
        <div className="flex-1 py-3 text-center text-sm font-bold text-pink-500 border-b-2 border-pink-500">シフト申請</div>
        <button onClick={() => router.push('/cast/reservations')} className="flex-1 py-3 text-center text-sm text-gray-400 hover:text-gray-600 transition-colors">予約・顧客</button>
      </div>

      <div className="p-4 max-w-lg mx-auto">

        {/* LINE連携バナー */}
        {lineLinked === false && (
          <div className="bg-[#06C755]/10 border border-[#06C755]/30 rounded-2xl p-4 mb-4 flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-bold text-[#05a347]">LINE通知を受け取る</div>
              <div className="text-xs text-gray-500 mt-0.5">予約・シフト承認をLINEでお知らせします</div>
            </div>
            <a
              href={user ? getLineLinkUrl(user.id) : '#'}
              className="flex items-center gap-1.5 bg-[#06C755] hover:bg-[#05b34c] text-white text-xs font-bold px-3 py-2 rounded-xl whitespace-nowrap transition-colors"
            >
              LINE連携
            </a>
          </div>
        )}
        {lineLinked === true && params.get('line_linked') === '1' && (
          <div className="bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3 rounded-2xl mb-4 text-center font-bold">
            ✅ LINE連携が完了しました！
          </div>
        )}

        {/* カレンダー */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 mb-5">
          {/* 月ナビ */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <button onClick={prevMonth} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold transition-colors">◀</button>
            <span className="font-bold text-gray-800">{calYear}年{String(calMonth).padStart(2,'0')}月</span>
            <button onClick={nextMonth} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold transition-colors">▶</button>
          </div>
          {/* 曜日ヘッダー */}
          <div className="grid grid-cols-7 text-center text-xs font-semibold py-2">
            {WEEKDAY.map((w, i) => (
              <div key={w} className={i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-gray-500'}>{w}</div>
            ))}
          </div>
          {/* 日付グリッド */}
          <div className="grid grid-cols-7 gap-0 pb-3 px-1">
            {Array.from({ length: firstDow }).map((_, i) => <div key={`e${i}`} />)}
            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => {
              const dateStr = `${calYear}-${String(calMonth).padStart(2,'0')}-${String(d).padStart(2,'0')}`
              const req = requestMap.get(dateStr)
              const dow = new Date(calYear, calMonth - 1, d).getDay()
              const isToday = dateStr === new Date().toISOString().split('T')[0]
              let dotColor = ''
              if (req?.status === 'approved') dotColor = 'bg-green-400'
              else if (req?.status === 'pending') dotColor = 'bg-yellow-400'
              else if (req?.status === 'rejected') dotColor = 'bg-red-400'
              return (
                <button
                  key={d}
                  onClick={() => openModalWithDate(dateStr)}
                  className={`flex flex-col items-center py-1.5 rounded-xl mx-0.5 transition-colors ${req ? 'bg-pink-50' : 'hover:bg-gray-50'}`}
                >
                  <span className={`w-7 h-7 flex items-center justify-center rounded-full text-sm font-medium ${
                    isToday ? 'bg-pink-500 text-white' :
                    dow === 0 ? 'text-red-400' :
                    dow === 6 ? 'text-blue-400' : 'text-gray-700'
                  }`}>{d}</span>
                  {dotColor && <span className={`w-1.5 h-1.5 rounded-full mt-0.5 ${dotColor}`} />}
                  {req && (
                    <span className="text-xs text-gray-500 leading-tight mt-0.5" style={{ fontSize: 9 }}>
                      {formatShiftTime(req.start_time).replace(':00','')}〜
                    </span>
                  )}
                </button>
              )
            })}
          </div>
          {/* 凡例 */}
          <div className="flex gap-4 justify-center pb-3 text-xs text-gray-500">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-400 inline-block"></span>審査中</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-400 inline-block"></span>承認済</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400 inline-block"></span>却下</span>
          </div>
        </div>

        {/* 申請ボタン */}
        <button
          onClick={() => { setForm({ store_id: 1, date: '', start_time: 14, end_time: 22, notes: '' }); setModalOpen(true) }}
          className="w-full bg-pink-500 hover:bg-pink-600 text-white font-bold py-3.5 rounded-2xl shadow-sm transition-colors mb-5"
        >
          + シフトを申請する
        </button>

        {/* 申請履歴 */}
        <h2 className="text-sm font-bold text-gray-600 mb-3">申請履歴</h2>
        {requests.length === 0 ? (
          <div className="text-center py-8 text-gray-400 text-sm">申請履歴がありません</div>
        ) : (
          <div className="space-y-3">
            {requests.map(r => (
              <div key={r.id} className={`bg-white rounded-2xl shadow-sm border p-4 ${r.status === 'rejected' ? 'border-red-200' : 'border-gray-100'}`}>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-bold text-gray-800">{r.date.replace(/-/g, '/')}</div>
                    <div className="text-sm text-gray-500 mt-0.5">
                      {STORES.find(s => s.id === r.store_id)?.name} ／ {formatShiftTime(r.start_time)} 〜 {formatShiftTime(r.end_time)}
                    </div>
                    {r.notes && <div className="text-xs text-gray-400 mt-1">{r.notes}</div>}
                    {r.status === 'rejected' && r.reject_reason && (
                      <div className="mt-2 text-xs bg-red-50 text-red-600 px-3 py-1.5 rounded-lg">却下理由: {r.reject_reason}</div>
                    )}
                  </div>
                  <div className="ml-3 shrink-0">{statusBadge(r.status)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 申請モーダル */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-bold text-gray-800">シフト申請</h2>
              <button onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">店舗</label>
                <div className="flex gap-2 flex-wrap">
                  {STORES.map(s => (
                    <button key={s.id} onClick={() => setForm(p => ({ ...p, store_id: s.id }))}
                      className={`px-4 py-2 rounded-full text-sm font-medium border-2 transition-all ${form.store_id === s.id ? 'bg-pink-500 border-pink-500 text-white' : 'bg-white border-gray-200 text-gray-600'}`}>
                      {s.name}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">日付</label>
                <input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 bg-gray-50" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5">開始時間</label>
                  <select value={form.start_time} onChange={e => setForm(p => ({ ...p, start_time: Number(e.target.value) }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 bg-gray-50">
                    {HOURS.map(h => <option key={h} value={h}>{formatShiftTime(h)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5">終了時間</label>
                  <select value={form.end_time} onChange={e => setForm(p => ({ ...p, end_time: Number(e.target.value) }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 bg-gray-50">
                    {HOURS.map(h => <option key={h} value={h}>{formatShiftTime(h)}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">メモ（任意）</label>
                <input type="text" value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                  placeholder="備考など"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 bg-gray-50" />
              </div>
            </div>
            <div className="px-5 pb-6">
              <button onClick={submitRequest} disabled={saving || !form.date}
                className="w-full bg-pink-500 hover:bg-pink-600 text-white font-bold py-3.5 rounded-2xl transition-colors disabled:opacity-50 shadow-sm">
                {saving ? '送信中...' : '申請する'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function CastShiftPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-400 animate-pulse">読み込み中...</div>
      </div>
    }>
      <CastShiftPageInner />
    </Suspense>
  )
}
