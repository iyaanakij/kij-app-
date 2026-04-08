'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { PhotoDiary, PhotoDiaryImage, isVideo } from '@/lib/types'
import { getCurrentUser, UserInfo } from '@/lib/auth'

function getMediaUrl(path: string) {
  return supabase.storage.from('diary-images').getPublicUrl(path).data.publicUrl
}

interface NewPreview { url: string; isVideo: boolean }
type PostMode = 'now' | 'scheduled' | 'draft'

function toLocalDatetimeValue(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export default function PhotoDiaryEditPage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const [user, setUser] = useState<UserInfo | null>(null)
  const [diary, setDiary] = useState<PhotoDiary | null>(null)
  const [existingImages, setExistingImages] = useState<PhotoDiaryImage[]>([])
  const [removedImageIds, setRemovedImageIds] = useState<number[]>([])
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [thumbnailImageId, setThumbnailImageId] = useState<number | null>(null)
  const [newFiles, setNewFiles] = useState<File[]>([])
  const [newPreviews, setNewPreviews] = useState<NewPreview[]>([])
  const [newThumbnailIndex, setNewThumbnailIndex] = useState<number | null>(null)
  const [postMode, setPostMode] = useState<PostMode>('now')
  const [scheduledAt, setScheduledAt] = useState(() => {
    const d = new Date(); d.setHours(d.getHours() + 1, 0, 0, 0)
    return toLocalDatetimeValue(d)
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    getCurrentUser().then(u => {
      if (!u || u.role !== 'cast') { router.replace('/photodiary/login?error=not_logged_in'); return }
      setUser(u)
    })
  }, [router])

  const fetchDiary = useCallback(async () => {
    if (!user?.staff_id) return
    const { data } = await supabase.from('photo_diaries').select('*').eq('id', id).eq('staff_id', user.staff_id).single()
    if (!data) { router.replace('/photodiary/post'); return }
    setDiary(data as PhotoDiary)
    setTitle(data.title ?? '')
    setBody(data.body ?? '')
    setThumbnailImageId(data.thumbnail_image_id)
    // 既存の状態を反映
    if (data.published) setPostMode('now')
    else if (data.scheduled_at) {
      setPostMode('scheduled')
      setScheduledAt(toLocalDatetimeValue(new Date(data.scheduled_at)))
    } else setPostMode('draft')

    const { data: images } = await supabase.from('photo_diary_images').select('*').eq('diary_id', id).order('sort_order')
    if (images) setExistingImages(images as PhotoDiaryImage[])
    setLoading(false)
  }, [user, id, router])

  useEffect(() => { fetchDiary() }, [fetchDiary])
  useEffect(() => { return () => newPreviews.forEach(p => URL.revokeObjectURL(p.url)) }, [])

  const handleFileSelect = (selected: FileList | null) => {
    if (!selected || selected.length === 0) return
    newPreviews.forEach(p => URL.revokeObjectURL(p.url))
    const file = selected[0]
    setNewFiles([file])
    setNewPreviews([{ url: URL.createObjectURL(file), isVideo: file.type.startsWith('video/') }])
    setNewThumbnailIndex(0)
  }

  const removeExistingImage = (img: PhotoDiaryImage) => {
    setRemovedImageIds(prev => [...prev, img.id])
    setExistingImages(prev => prev.filter(i => i.id !== img.id))
    if (thumbnailImageId === img.id) setThumbnailImageId(null)
  }

  const removeNewFile = (i: number) => {
    URL.revokeObjectURL(newPreviews[i].url)
    setNewFiles(prev => prev.filter((_, idx) => idx !== i))
    setNewPreviews(prev => prev.filter((_, idx) => idx !== i))
    if (newThumbnailIndex === i) setNewThumbnailIndex(null)
    else if (newThumbnailIndex !== null && newThumbnailIndex > i) setNewThumbnailIndex(t => t! - 1)
  }

  const handleSave = async () => {
    if (!user?.staff_id || !diary) return
    setSaving(true)
    try {
      if (removedImageIds.length > 0) {
        const { data: removedImgs } = await supabase.from('photo_diary_images').select('storage_path').in('id', removedImageIds)
        if (removedImgs) await supabase.storage.from('diary-images').remove(removedImgs.map(i => i.storage_path))
        await supabase.from('photo_diary_images').delete().in('id', removedImageIds)
      }

      const newImageRecords: { diary_id: number; storage_path: string; sort_order: number }[] = []
      const baseOrder = existingImages.length
      for (let i = 0; i < newFiles.length; i++) {
        const file = newFiles[i]
        const ext = file.name.split('.').pop() ?? 'jpg'
        const path = `${user.staff_id}/${diary.id}/${Date.now()}_${i}.${ext}`
        const { error: uploadError } = await supabase.storage.from('diary-images').upload(path, file)
        if (uploadError) throw uploadError
        newImageRecords.push({ diary_id: diary.id, storage_path: path, sort_order: baseOrder + i })
      }

      let finalThumbnailId = thumbnailImageId
      if (newImageRecords.length > 0) {
        const { data: newImgs } = await supabase.from('photo_diary_images').insert(newImageRecords).select()
        if (newImgs && newThumbnailIndex !== null && newImgs[newThumbnailIndex]) finalThumbnailId = newImgs[newThumbnailIndex].id
        else if (newImgs && finalThumbnailId === null) finalThumbnailId = newImgs[0].id
      }

      const isScheduled = postMode === 'scheduled' && scheduledAt
      const publishNow = postMode === 'now'
      const scheduledDate = isScheduled ? new Date(scheduledAt) : null

      const wasPublished = diary.published
      await supabase.from('photo_diaries').update({
        title: title.trim() || null,
        body: body.trim() || null,
        thumbnail_image_id: finalThumbnailId,
        published: publishNow,
        published_at: publishNow ? (diary.published_at ?? new Date().toISOString()) : null,
        scheduled_at: scheduledDate?.toISOString() ?? null,
      }).eq('id', diary.id)

      // 未公開→即時公開への変更時のみ配信
      if (publishNow && !wasPublished) {
        await fetch('/api/photodiary/deliver', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ diary_id: diary.id }),
          keepalive: true,
        }).catch(err => console.error('配信エラー:', err))
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
    if (postMode === 'now') return diary?.published ? '更新する' : '公開する'
    if (postMode === 'scheduled') return '予約する'
    return '下書き保存'
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-gray-50"><div className="text-gray-400 animate-pulse">読み込み中...</div></div>

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="bg-white shadow-sm border-b border-gray-100 px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <button onClick={() => router.push('/photodiary/post')} className="text-sm text-gray-400 hover:text-gray-600 transition-colors">← 戻る</button>
        <div className="text-base font-bold text-pink-500">日記を編集</div>
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

        {existingImages.length > 0 && (
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">登録済みの写真・動画</label>
            <div className="grid grid-cols-3 gap-2">
              {existingImages.map(img => (
                <div key={img.id} className="relative aspect-square">
                  {isVideo(img.storage_path) ? (
                    <video src={getMediaUrl(img.storage_path)} className={`w-full h-full object-cover rounded-xl border-2 ${thumbnailImageId === img.id ? 'border-pink-500' : 'border-transparent'}`} muted playsInline />
                  ) : (
                    <img src={getMediaUrl(img.storage_path)} alt="" className={`w-full h-full object-cover rounded-xl border-2 ${thumbnailImageId === img.id ? 'border-pink-500' : 'border-transparent'}`} />
                  )}
                  {isVideo(img.storage_path) && <div className="absolute inset-0 flex items-center justify-center pointer-events-none"><span className="text-white text-2xl drop-shadow">▶</span></div>}
                  <button onClick={() => setThumbnailImageId(img.id)} className={`absolute bottom-1 left-1 text-xs px-1.5 py-0.5 rounded-full font-bold ${thumbnailImageId === img.id ? 'bg-pink-500 text-white' : 'bg-black/40 text-white'}`}>
                    {thumbnailImageId === img.id ? 'TOP' : 'TOP?'}
                  </button>
                  <button onClick={() => removeExistingImage(img)} className="absolute top-1 right-1 w-5 h-5 bg-black/50 text-white rounded-full text-xs flex items-center justify-center hover:bg-black/70">✕</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {existingImages.length === 0 && (
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">写真・動画を追加</label>
            {newPreviews.length === 0 ? (
              <label className="block w-full border-2 border-dashed border-gray-200 rounded-xl py-5 text-center cursor-pointer hover:border-pink-300 transition-colors">
                <div className="text-gray-400 text-sm">タップして写真・動画を選択</div>
                <div className="text-gray-300 text-xs mt-1">1枚まで</div>
                <input type="file" accept="image/*,video/*" className="hidden" onChange={e => handleFileSelect(e.target.files)} />
              </label>
            ) : (
              <div className="relative aspect-square w-40">
                {newPreviews[0].isVideo ? (
                  <video src={newPreviews[0].url} className="w-full h-full object-cover rounded-xl border-2 border-pink-300" muted playsInline />
                ) : (
                  <img src={newPreviews[0].url} alt="" className="w-full h-full object-cover rounded-xl border-2 border-pink-300" />
                )}
                {newPreviews[0].isVideo && <div className="absolute inset-0 flex items-center justify-center pointer-events-none"><span className="text-white text-2xl drop-shadow">▶</span></div>}
                <button onClick={() => removeNewFile(0)} className="absolute top-1 right-1 w-5 h-5 bg-black/50 text-white rounded-full text-xs flex items-center justify-center hover:bg-black/70">✕</button>
              </div>
            )}
          </div>
        )}

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
