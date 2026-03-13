'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Reservation, formatTime } from '@/lib/types'
import { getCurrentUser, UserInfo } from '@/lib/auth'

export default function CastReservationsPage() {
  const router = useRouter()
  const [user, setUser] = useState<UserInfo | null>(null)
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'upcoming' | 'past'>('upcoming')

  useEffect(() => {
    getCurrentUser().then(u => {
      if (!u) { router.replace('/cast/login'); return }
      if (u.role !== 'cast') { router.replace('/cast/login'); return }
      setUser(u)
    })
  }, [router])

  const fetchReservations = useCallback(async () => {
    if (!user?.staff_id) return
    const today = new Date()
    if (today.getHours() < 7) today.setDate(today.getDate() - 1)
    const todayStr = today.toISOString().split('T')[0]

    const query = supabase
      .from('reservations')
      .select('*')
      .eq('staff_id', user.staff_id)
      .order('date', { ascending: filter === 'upcoming' })
      .order('time', { ascending: true })

    if (filter === 'upcoming') {
      query.gte('date', todayStr)
    } else {
      query.lt('date', todayStr)
    }

    const { data } = await query
    if (data) setReservations(data as Reservation[])
    setLoading(false)
  }, [user, filter])

  useEffect(() => { fetchReservations() }, [fetchReservations])

  const logout = async () => {
    await supabase.auth.signOut()
    router.replace('/cast/login')
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
        <button onClick={() => router.push('/cast/shift')} className="flex-1 py-3 text-center text-sm text-gray-400 hover:text-gray-600 transition-colors">シフト申請</button>
        <div className="flex-1 py-3 text-center text-sm font-bold text-pink-500 border-b-2 border-pink-500">予約・顧客</div>
      </div>

      <div className="p-4 max-w-lg mx-auto">
        {/* Filter */}
        <div className="flex bg-gray-100 rounded-2xl p-1 mb-4">
          <button
            onClick={() => setFilter('upcoming')}
            className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${filter === 'upcoming' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500'}`}
          >
            今後の予約
          </button>
          <button
            onClick={() => setFilter('past')}
            className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${filter === 'past' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500'}`}
          >
            過去の履歴
          </button>
        </div>

        {reservations.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">予約がありません</div>
        ) : (
          <div className="space-y-3">
            {reservations.map(r => (
              <div key={r.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="font-bold text-gray-800">{r.date.replace(/-/g, '/')}</div>
                  <div className="text-sm font-bold text-pink-600">{formatTime(r.time)}</div>
                </div>
                <div className="space-y-1 text-sm text-gray-600">
                  <div className="flex justify-between">
                    <span className="text-gray-400">お客様</span>
                    <span className="font-medium text-gray-800">{r.customer_name || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">エリア</span>
                    <span>{[r.area, r.hotel, r.room_number].filter(Boolean).join(' ')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">コース</span>
                    <span>{r.course_type} {r.course_duration ? `${r.course_duration}分` : '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">指名</span>
                    <span>{r.nomination_type || 'フリー'}</span>
                  </div>
                  {r.total_amount > 0 && (
                    <div className="flex justify-between pt-1 border-t border-gray-100 mt-1">
                      <span className="text-gray-400">料金</span>
                      <span className="font-bold text-yellow-600">¥{r.total_amount.toLocaleString()}</span>
                    </div>
                  )}
                  {r.notes && (
                    <div className="text-xs text-gray-400 pt-1">{r.notes}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
