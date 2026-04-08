'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getCurrentUser, UserInfo } from '@/lib/auth'

interface Preview { url: string; isVideo: boolean }
type PostMode = 'now' | 'scheduled' | 'draft'

function toLocalDatetimeValue(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export default function PhotoDiaryNewPage() {
  const router = useRouter()
  const [user, setUser] = useState<UserInfo | null>(null)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [previews, setPreviews] = useState<Preview[]>([])
  const [thumbnailIndex, setThumbnailIndex] = useState(0)
  const [postMode, setPostMode] = useState<PostMode>('now')
  const [scheduledAt, setScheduledAt] = useState(() => {
    const d = new Date(); d.setHours(d.getHours() + 1, 0, 0, 0)
    return toLocalDatetimeValue(d)
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    getCurrentUser().then(u => {
      if (!u || u.role !== 'cast') { router.replace('/photodiary/login?error=not_logged_in'); return }
      setUser(u)
    })
  }, [router])

  useEffect(() => {
    return () => previews.forEach(p => URL.revokeObjectURL(p.url))
  }, [])

  const handleFileSelect = (selected: FileList | null) => {
    if (!selected || selected.length === 0) return
    previews.forEach(p => URL.revokeObjectURL(p.url))
    const file = selected[0]
    setFiles([file])
    setPreviews([{ url: URL.createObjectURL(file), isVideo: file.type.startsWith('video/') }])
    setThumbnailIndex(0)
  }

  const removeFile = () => {
    previews.forEach(p => URL.revokeObjectURL(p.url))
    setFiles([])
    setPreviews([])
    setThumbnailIndex(0)
  }

  const handleSave = async () => {
    if (!user?.staff_id) return
    setSaving(true)
    try {
      const isScheduled = postMode === 'scheduled' && scheduledAt
      const publishNow = postMode === 'now'
      const scheduledDate = isScheduled ? new Date(scheduledAt) : null

      const { data: diary, error } = await supabase
        .from('photo_diaries')
        .insert({
          staff_id: user.staff_id,
          title: title.trim() || null,
          body: body.trim() || null,
          published: publishNow,
          published_at: publishNow ? new Date().toISOString() : null,
          scheduled_at: scheduledDate?.toISOString() ?? null,
        })
        .select()
        .single()

      if (error || !diary) throw error ?? new Error('保存失敗')

      const imageRecords: { diary_id: number; storage_path: string; sort_order: number }[] = []
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        const ext = file.name.split('.').pop() ?? 'jpg'
        const path = `${user.staff_id}/${diary.id}/${Date.now()}_${i}.${ext}`
        const { error: uploadError } = await supabase.storage.from('diary-images').upload(path, file)
        if (uploadError) throw uploadError
        imageRecords.push({ diary_id: diary.id, storage_path: path, sort_order: i })
      }

      let thumbnailImageId: number | null = null
      if (imageRecords.length > 0) {
        const { data: images } = await supabase.from('photo_diary_images').insert(imageRecords).select()
        if (images && images[thumbnailIndex]) thumbnailImageId = images[thumbnailIndex].id
      }

      if (thumbnailImageId) {
        await supabase.from('photo_diaries').update({ thumbnail_image_id: thumbnailImageId }).eq('id', diary.id)
      }

      // 即時投稿の場合のみ配信
      if (publishNow) {
        try {
          const deliverRes = await fetch('/api/photodiary/deliver', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ diary_id: diary.id }),
            keepalive: true,
          })
          const deliverBody = await deliverRes.json()
          if (!deliverRes.ok) {
            console.error('[deliver] 配信APIエラー:', deliverBody)
          } else {
            console.log('[deliver] 配信結果:', deliverBody)
          }
        } catch (err) {
          console.error('[deliver] fetch失敗:', err)
        }
      }

      router.push('/photodiary/post')
    } catch (e) {
      console.error(e)
      alert('保存に失敗しました。もう一度お試しください。')
      setSaving(false)
    }
  }

  const buttonLabel = () => {
    if (saving) return '処理中...'
    if (postMode === 'now') return '投稿する'
    if (postMode === 'scheduled') return '予約する'
    return '下書き保存'
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="bg-white shadow-sm border-b border-gray-100 px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <button onClick={() => router.push('/photodiary/post')} className="text-sm text-gray-400 hover:text-gray-600 transition-colors">← 戻る</button>
        <div className="text-base font-bold text-pink-500">日記を書く</div>
        <div className="w-8" />
      </div>

      <div className="p-4 max-w-lg mx-auto space-y-4">
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1.5">タイトル（任意）</label>
          <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="タイトルを入力"
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 bg-gray-50" />
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1.5">本文</label>
          <textarea value={body} onChange={e => setBody(e.target.value)} placeholder="日記を書いてください..." rows={8}
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 bg-gray-50 resize-none" />
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1.5">写真・動画</label>
          {previews.length === 0 ? (
            <label className="block w-full border-2 border-dashed border-gray-200 rounded-xl py-6 text-center cursor-pointer hover:border-pink-300 transition-colors">
              <div className="text-gray-400 text-sm">タップして写真・動画を選択</div>
              <div className="text-gray-300 text-xs mt-1">1枚まで</div>
              <input type="file" accept="image/*,video/*" className="hidden" onChange={e => handleFileSelect(e.target.files)} />
            </label>
          ) : (
            <div className="relative aspect-square w-40">
              {previews[0].isVideo ? (
                <video src={previews[0].url} className="w-full h-full object-cover rounded-xl border-2 border-pink-300" muted playsInline />
              ) : (
                <img src={previews[0].url} alt="" className="w-full h-full object-cover rounded-xl border-2 border-pink-300" />
              )}
              {previews[0].isVideo && <div className="absolute inset-0 flex items-center justify-center pointer-events-none"><span className="text-white text-2xl drop-shadow">▶</span></div>}
              <button onClick={removeFile} className="absolute top-1 right-1 w-5 h-5 bg-black/50 text-white rounded-full text-xs flex items-center justify-center hover:bg-black/70">✕</button>
            </div>
          )}
        </div>

        {/* 投稿設定 */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
          <div className="text-xs font-semibold text-gray-500">投稿設定</div>
          <div className="flex gap-2">
            {(['now', 'scheduled', 'draft'] as PostMode[]).map(mode => {
              const labels = { now: '今すぐ投稿', scheduled: '予約投稿', draft: '下書き保存' }
              return (
                <button
                  key={mode}
                  onClick={() => setPostMode(mode)}
                  className={`flex-1 py-2 rounded-xl text-xs font-bold border-2 transition-all ${postMode === mode ? 'border-pink-500 bg-pink-50 text-pink-600' : 'border-gray-200 text-gray-500'}`}
                >
                  {labels[mode]}
                </button>
              )
            })}
          </div>

          {postMode === 'scheduled' && (
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">公開日時</label>
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={e => setScheduledAt(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 bg-gray-50"
              />
            </div>
          )}
        </div>

        <button
          onClick={handleSave}
          disabled={saving || (postMode === 'scheduled' && !scheduledAt)}
          className={`w-full font-bold py-3.5 rounded-2xl transition-colors disabled:opacity-50 shadow-sm ${
            postMode === 'draft' ? 'bg-gray-100 hover:bg-gray-200 text-gray-700' : 'bg-pink-500 hover:bg-pink-600 text-white'
          }`}
        >
          {buttonLabel()}
        </button>
      </div>
    </div>
  )
}
