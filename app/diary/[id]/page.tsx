import { createClient } from '@supabase/supabase-js'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PhotoDiaryImage } from '@/lib/types'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

function getImageUrl(path: string) {
  return supabase.storage.from('diary-images').getPublicUrl(path).data.publicUrl
}

export const revalidate = 60

export default async function DiaryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { data: diary } = await supabase
    .from('photo_diaries')
    .select('*, staff(name)')
    .eq('id', id)
    .eq('published', true)
    .single()

  if (!diary) notFound()

  const { data: images } = await supabase
    .from('photo_diary_images')
    .select('*')
    .eq('diary_id', id)
    .order('sort_order')

  const castName = (diary.staff as { name: string } | null)?.name
  const imgs = (images ?? []) as PhotoDiaryImage[]

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 shadow-sm sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <Link href="/diary" className="text-gray-400 hover:text-gray-600 text-sm transition-colors">← 一覧へ</Link>
          <h1 className="text-base font-bold text-pink-500">写メ日記</h1>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {/* キャスト情報・タイトル */}
          <div className="p-5 border-b border-gray-100">
            {castName && (
              <div className="text-sm font-bold text-pink-500 mb-1">{castName}</div>
            )}
            {diary.title && (
              <h2 className="text-lg font-bold text-gray-800">{diary.title}</h2>
            )}
            <div className="text-xs text-gray-400 mt-1">
              {diary.published_at ? new Date(diary.published_at).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' }) : ''}
            </div>
          </div>

          {/* 画像 */}
          {imgs.length > 0 && (
            <div className={`${imgs.length === 1 ? '' : 'grid grid-cols-2 gap-0.5'}`}>
              {imgs.map((img, i) => (
                <div key={img.id} className={`bg-gray-100 ${imgs.length === 1 ? 'aspect-[4/3]' : 'aspect-square'}`}>
                  <img
                    src={getImageUrl(img.storage_path)}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                </div>
              ))}
            </div>
          )}

          {/* 本文 */}
          {diary.body && (
            <div className="p-5">
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{diary.body}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
