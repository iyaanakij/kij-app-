'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getCurrentUser, UserInfo } from '@/lib/auth'

export default function PhotoDiaryNewPage() {
  const router = useRouter()
  const [user, setUser] = useState<UserInfo | null>(null)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [previews, setPreviews] = useState<string[]>([])
  const [thumbnailIndex, setThumbnailIndex] = useState(0)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    getCurrentUser().then(u => {
      if (!u || u.role !== 'cast') { router.replace('/photodiary/login?error=not_logged_in'); return }
      setUser(u)
    })
  }, [router])

  const handleFileSelect = (selected: FileList | null) => {
    if (!selected) return
    const arr = Array.from(selected)
    setFiles(prev => [...prev, ...arr])
    arr.forEach(f => {
      const reader = new FileReader()
      reader.onload = e => setPreviews(prev => [...prev, e.target?.result as string])
      reader.readAsDataURL(f)
    })
  }

  const removeFile = (i: number) => {
    setFiles(prev => prev.filter((_, idx) => idx !== i))
    setPreviews(prev => prev.filter((_, idx) => idx !== i))
    if (thumbnailIndex === i) setThumbnailIndex(0)
    else if (thumbnailIndex > i) setThumbnailIndex(t => t - 1)
  }

  const handleSave = async (publish: boolean) => {
    if (!user?.staff_id) return
    setSaving(true)
    try {
      const { data: diary, error } = await supabase
        .from('photo_diaries')
        .insert({
          staff_id: user.staff_id,
          title: title.trim() || null,
          body: body.trim() || null,
          published: publish,
          published_at: publish ? new Date().toISOString() : null,
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

      router.push('/photodiary/post')
    } catch (e) {
      console.error(e)
      alert('保存に失敗しました。もう一度お試しください。')
      setSaving(false)
    }
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
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="タイトルを入力"
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 bg-gray-50"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1.5">本文</label>
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder="日記を書いてください..."
            rows={8}
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 bg-gray-50 resize-none"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1.5">写真</label>
          <label className="block w-full border-2 border-dashed border-gray-200 rounded-xl py-6 text-center cursor-pointer hover:border-pink-300 transition-colors">
            <div className="text-gray-400 text-sm">タップして写真を選択</div>
            <div className="text-gray-300 text-xs mt-1">複数枚選択可能</div>
            <input type="file" accept="image/*" multiple className="hidden" onChange={e => handleFileSelect(e.target.files)} />
          </label>

          {previews.length > 0 && (
            <>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {previews.map((src, i) => (
                  <div key={i} className="relative aspect-square">
                    <img src={src} alt="" className={`w-full h-full object-cover rounded-xl border-2 transition-all ${thumbnailIndex === i ? 'border-pink-500' : 'border-transparent'}`} />
                    <button onClick={() => setThumbnailIndex(i)} className={`absolute bottom-1 left-1 text-xs px-1.5 py-0.5 rounded-full font-bold ${thumbnailIndex === i ? 'bg-pink-500 text-white' : 'bg-black/40 text-white'}`}>
                      {thumbnailIndex === i ? 'TOP' : 'TOP?'}
                    </button>
                    <button onClick={() => removeFile(i)} className="absolute top-1 right-1 w-5 h-5 bg-black/50 text-white rounded-full text-xs flex items-center justify-center hover:bg-black/70">✕</button>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-2 text-center">「TOP?」をタップしてサムネイルを指定</p>
            </>
          )}
        </div>

        <div className="space-y-3 pt-2">
          <button onClick={() => handleSave(true)} disabled={saving} className="w-full bg-pink-500 hover:bg-pink-600 text-white font-bold py-3.5 rounded-2xl transition-colors disabled:opacity-50 shadow-sm">
            {saving ? '投稿中...' : '投稿する'}
          </button>
          <button onClick={() => handleSave(false)} disabled={saving} className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-3.5 rounded-2xl transition-colors disabled:opacity-50">
            下書き保存
          </button>
        </div>
      </div>
    </div>
  )
}
