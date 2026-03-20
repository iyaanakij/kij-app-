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
    const { data: images } = await supabase.from('photo_diary_images').select('*').eq('diary_id', id).order('sort_order')
    if (images) setExistingImages(images as PhotoDiaryImage[])
    setLoading(false)
  }, [user, id, router])

  useEffect(() => { fetchDiary() }, [fetchDiary])
  useEffect(() => { return () => newPreviews.forEach(p => URL.revokeObjectURL(p.url)) }, [])

  const handleFileSelect = (selected: FileList | null) => {
    if (!selected) return
    const arr = Array.from(selected)
    setNewFiles(prev => [...prev, ...arr])
    setNewPreviews(prev => [...prev, ...arr.map(f => ({ url: URL.createObjectURL(f), isVideo: f.type.startsWith('video/') }))])
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

  const handleSave = async (publish: boolean) => {
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

      await supabase.from('photo_diaries').update({
        title: title.trim() || null,
        body: body.trim() || null,
        thumbnail_image_id: finalThumbnailId,
        published: publish,
        published_at: publish && !diary.published_at ? new Date().toISOString() : diary.published_at,
      }).eq('id', diary.id)

      router.push('/photodiary/post')
    } catch (e) {
      console.error(e)
      alert('保存に失敗しました。もう一度お試しください。')
      setSaving(false)
    }
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

        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1.5">写真・動画を追加</label>
          <label className="block w-full border-2 border-dashed border-gray-200 rounded-xl py-5 text-center cursor-pointer hover:border-pink-300 transition-colors">
            <div className="text-gray-400 text-sm">タップして写真・動画を選択</div>
            <input type="file" accept="image/*,video/*" multiple className="hidden" onChange={e => handleFileSelect(e.target.files)} />
          </label>
          {newPreviews.length > 0 && (
            <div className="mt-3 grid grid-cols-3 gap-2">
              {newPreviews.map((p, i) => (
                <div key={i} className="relative aspect-square">
                  {p.isVideo ? (
                    <video src={p.url} className={`w-full h-full object-cover rounded-xl border-2 ${newThumbnailIndex === i ? 'border-pink-500' : 'border-transparent'}`} muted playsInline />
                  ) : (
                    <img src={p.url} alt="" className={`w-full h-full object-cover rounded-xl border-2 ${newThumbnailIndex === i ? 'border-pink-500' : 'border-transparent'}`} />
                  )}
                  {p.isVideo && <div className="absolute inset-0 flex items-center justify-center pointer-events-none"><span className="text-white text-2xl drop-shadow">▶</span></div>}
                  <button onClick={() => setNewThumbnailIndex(i)} className={`absolute bottom-1 left-1 text-xs px-1.5 py-0.5 rounded-full font-bold ${newThumbnailIndex === i ? 'bg-pink-500 text-white' : 'bg-black/40 text-white'}`}>
                    {newThumbnailIndex === i ? 'TOP' : 'TOP?'}
                  </button>
                  <button onClick={() => removeNewFile(i)} className="absolute top-1 right-1 w-5 h-5 bg-black/50 text-white rounded-full text-xs flex items-center justify-center hover:bg-black/70">✕</button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-3 pt-2">
          <button onClick={() => handleSave(true)} disabled={saving} className="w-full bg-pink-500 hover:bg-pink-600 text-white font-bold py-3.5 rounded-2xl transition-colors disabled:opacity-50 shadow-sm">
            {saving ? '保存中...' : (diary?.published ? '更新する' : '公開する')}
          </button>
          <button onClick={() => handleSave(false)} disabled={saving} className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-3.5 rounded-2xl transition-colors disabled:opacity-50">
            {diary?.published ? '非公開にして保存' : '下書き保存'}
          </button>
        </div>
      </div>
    </div>
  )
}
