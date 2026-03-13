'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { ShiftRequest, STORES, formatShiftTime } from '@/lib/types'
import { getCurrentUser, UserInfo } from '@/lib/auth'

const COURSE_DURATIONS_START = Array.from({ length: 25 }, (_, i) => i + 8) // 8〜32

export default function CastShiftPage() {
  const router = useRouter()
  const [user, setUser] = useState<UserInfo | null>(null)
  const [requests, setRequests] = useState<ShiftRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    store_id: 1,
    date: '',
    start_time: 14,
    end_time: 22,
    notes: '',
  })

  useEffect(() => {
    getCurrentUser().then(u => {
      if (!u) { router.replace('/cast/login'); return }
      if (u.role !== 'cast') { router.replace('/cast/login'); return }
      setUser(u)
      setLoading(false)
    })
  }, [router])

  const fetchRequests = useCallback(async () => {
    if (!user?.staff_id) return
    const { data } = await supabase
      .from('shift_requests')
      .select('*, store(*)')
      .eq('staff_id', user.staff_id)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
    if (data) setRequests(data as ShiftRequest[])
    setLoading(false)
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

  const statusBadge = (status: string) => {
    if (status === 'pending') return <span className="bg-yellow-100 text-yellow-700 text-xs font-bold px-2.5 py-1 rounded-full">審査中</span>
    if (status === 'approved') return <span className="bg-green-100 text-green-700 text-xs font-bold px-2.5 py-1 rounded-full">承認済</span>
    return <span className="bg-red-100 text-red-700 text-xs font-bold px-2.5 py-1 rounded-full">却下</span>
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-gray-400 animate-pulse">読み込み中...</div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-100 px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <div>
          <div className="text-base font-bold text-pink-500">KIJ マイページ</div>
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
        {/* 申請ボタン */}
        <button
          onClick={() => { setForm({ store_id: 1, date: '', start_time: 14, end_time: 22, notes: '' }); setModalOpen(true) }}
          className="w-full bg-pink-500 hover:bg-pink-600 text-white font-bold py-3.5 rounded-2xl shadow-sm transition-colors mb-5"
        >
          + シフトを申請する
        </button>

        {/* 申請一覧 */}
        <h2 className="text-sm font-bold text-gray-600 mb-3">申請履歴</h2>
        {requests.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">申請履歴がありません</div>
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
                      <div className="mt-2 text-xs bg-red-50 text-red-600 px-3 py-1.5 rounded-lg">
                        却下理由: {r.reject_reason}
                      </div>
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
                    <button
                      key={s.id}
                      onClick={() => setForm(p => ({ ...p, store_id: s.id }))}
                      className={`px-4 py-2 rounded-full text-sm font-medium border-2 transition-all ${form.store_id === s.id ? 'bg-pink-500 border-pink-500 text-white' : 'bg-white border-gray-200 text-gray-600'}`}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">日付</label>
                <input
                  type="date"
                  value={form.date}
                  onChange={e => setForm(p => ({ ...p, date: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 bg-gray-50"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5">開始時間</label>
                  <select
                    value={form.start_time}
                    onChange={e => setForm(p => ({ ...p, start_time: Number(e.target.value) }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 bg-gray-50"
                  >
                    {COURSE_DURATIONS_START.map(h => (
                      <option key={h} value={h}>{formatShiftTime(h)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5">終了時間</label>
                  <select
                    value={form.end_time}
                    onChange={e => setForm(p => ({ ...p, end_time: Number(e.target.value) }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 bg-gray-50"
                  >
                    {COURSE_DURATIONS_START.map(h => (
                      <option key={h} value={h}>{formatShiftTime(h)}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">メモ（任意）</label>
                <input
                  type="text"
                  value={form.notes}
                  onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                  placeholder="備考など"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 bg-gray-50"
                />
              </div>
            </div>
            <div className="px-5 pb-6">
              <button
                onClick={submitRequest}
                disabled={saving || !form.date}
                className="w-full bg-pink-500 hover:bg-pink-600 text-white font-bold py-3.5 rounded-2xl transition-colors disabled:opacity-50 shadow-sm"
              >
                {saving ? '送信中...' : '申請する'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
