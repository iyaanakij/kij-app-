import { createClient } from '@supabase/supabase-js'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PhotoDiaryImage, isVideo } from '@/lib/types'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

function getImageUrl(path: string) {
  return supabase.storage.from('diary-images').getPublicUrl(path).data.publicUrl
}

export const dynamic = 'force-dynamic'

export default async function PhotoDiaryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const now = new Date().toISOString()
  const { data: diary } = await supabase
    .from('photo_diaries')
    .select('*, staff(name)')
    .eq('id', id)
    .or(`published.eq.true,and(scheduled_at.not.is.null,scheduled_at.lte.${now})`)
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
      <div className="bg-white border-b border-gray-100 shadow-sm sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <Link href="/photodiary" className="text-gray-400 hover:text-gray-600 text-sm transition-colors">← 一覧へ</Link>
          <h1 className="text-base font-bold text-pink-500">写メ日記</h1>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-5 border-b border-gray-100">
            {castName && <div className="text-sm font-bold text-pink-500 mb-1">{castName}</div>}
            {diary.title && <h2 className="text-lg font-bold text-gray-800">{diary.title}</h2>}
            <div className="text-xs text-gray-400 mt-1">
              {new Date(diary.published_at ?? diary.scheduled_at ?? diary.created_at).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })}
            </div>
          </div>

          {imgs.length > 0 && (
            <div className={imgs.length === 1 ? '' : 'grid grid-cols-2 gap-0.5'}>
              {imgs.map(img => (
                <div key={img.id} className="bg-black">
                  {isVideo(img.storage_path) ? (
                    <video src={getImageUrl(img.storage_path)} className="w-full max-h-[70vh]" controls playsInline />
                  ) : (
                    <div className={imgs.length === 1 ? 'aspect-[4/3]' : 'aspect-square'}>
                      <img src={getImageUrl(img.storage_path)} alt="" className="w-full h-full object-cover" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

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
