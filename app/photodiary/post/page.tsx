'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { PhotoDiary, PhotoDiaryImage, isVideo } from '@/lib/types'
import { getCurrentUser, UserInfo } from '@/lib/auth'

function getImageUrl(path: string) {
  return supabase.storage.from('diary-images').getPublicUrl(path).data.publicUrl
}

export default function PhotoDiaryPostPage() {
  const router = useRouter()
  const [user, setUser] = useState<UserInfo | null>(null)
  const [staffName, setStaffName] = useState('')
  const [diaries, setDiaries] = useState<(PhotoDiary & { thumbnail?: PhotoDiaryImage | null })[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getCurrentUser().then(async u => {
      if (!u || u.role !== 'cast') { router.replace('/photodiary/login?error=not_logged_in'); return }
      setUser(u)
      if (u.staff_id) {
        const { data } = await supabase.from('staff').select('name').eq('id', u.staff_id).single()
        if (data) setStaffName(data.name)
      }
      setLoading(false)
    })
  }, [router])

  const fetchDiaries = useCallback(async () => {
    if (!user?.staff_id) return
    const { data } = await supabase
      .from('photo_diaries')
      .select('*, thumbnail:photo_diary_images!thumbnail_image_id(id, storage_path)')
      .eq('staff_id', user.staff_id)
      .order('created_at', { ascending: false })
    if (data) setDiaries(data as (PhotoDiary & { thumbnail?: PhotoDiaryImage | null })[])
  }, [user])

  useEffect(() => { fetchDiaries() }, [fetchDiaries])

  const logout = async () => {
    await supabase.auth.signOut()
    router.replace('/photodiary/login')
  }

  const deleteDiary = async (id: number) => {
    if (!confirm('この日記を削除しますか？')) return
    await supabase.from('photo_diaries').delete().eq('id', id)
    fetchDiaries()
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
          <div className="text-base font-bold text-pink-500">写メ日記</div>
          {staffName && <div className="text-sm font-bold text-gray-700">{staffName}</div>}
        </div>
        <button onClick={logout} className="text-xs text-gray-400 hover:text-gray-600 transition-colors">ログアウト</button>
      </div>

      <div className="p-4 max-w-lg mx-auto">
        <button
          onClick={() => router.push('/photodiary/post/new')}
          className="w-full bg-pink-500 hover:bg-pink-600 text-white font-bold py-3.5 rounded-2xl shadow-sm transition-colors mb-5"
        >
          + 日記を書く
        </button>

        {diaries.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">日記がまだありません</div>
        ) : (
          <div className="space-y-3">
            {diaries.map(d => (
              <div key={d.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="flex gap-3 p-4">
                  {d.thumbnail?.storage_path ? (
                    <div className="w-20 h-20 rounded-xl flex-shrink-0 overflow-hidden bg-black relative">
                      {isVideo(d.thumbnail.storage_path) ? (
                        <>
                          <video
                            src={getImageUrl(d.thumbnail.storage_path)}
                            className="w-full h-full object-cover"
                            muted playsInline preload="metadata"
                            onLoadedMetadata={e => { (e.target as HTMLVideoElement).currentTime = 0.1 }}
                          />
                          <div className="absolute inset-0 flex items-center justify-center bg-black/20"><span className="text-white text-lg drop-shadow">▶</span></div>
                        </>
                      ) : (
                        <img src={getImageUrl(d.thumbnail.storage_path)} alt="" className="w-full h-full object-cover" />
                      )}
                    </div>
                  ) : (
                    <div className="w-20 h-20 bg-gray-100 rounded-xl flex-shrink-0 flex items-center justify-center">
                      <span className="text-gray-300 text-2xl">📷</span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {d.published ? (
                        <span className="text-xs bg-green-100 text-green-700 font-bold px-2 py-0.5 rounded-full">公開中</span>
                      ) : (
                        <span className="text-xs bg-gray-100 text-gray-500 font-bold px-2 py-0.5 rounded-full">下書き</span>
                      )}
                      <span className="text-xs text-gray-400">
                        {new Date(d.created_at).toLocaleDateString('ja-JP')}
                      </span>
                    </div>
                    <div className="font-bold text-gray-800 text-sm truncate">{d.title || '（タイトルなし）'}</div>
                    {d.body && (
                      <div className="text-xs text-gray-500 mt-1 line-clamp-2">{d.body}</div>
                    )}
                  </div>
                </div>
                <div className="border-t border-gray-100 flex">
                  <button
                    onClick={() => router.push(`/photodiary/post/${d.id}/edit`)}
                    className="flex-1 py-2.5 text-center text-sm text-pink-500 font-medium hover:bg-pink-50 transition-colors"
                  >
                    編集
                  </button>
                  <div className="w-px bg-gray-100" />
                  <button
                    onClick={() => deleteDiary(d.id)}
                    className="flex-1 py-2.5 text-center text-sm text-red-400 font-medium hover:bg-red-50 transition-colors"
                  >
                    削除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
