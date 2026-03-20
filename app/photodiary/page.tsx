import { createClient } from '@supabase/supabase-js'
import Link from 'next/link'
import { PhotoDiary, PhotoDiaryImage } from '@/lib/types'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

function getImageUrl(path: string) {
  return supabase.storage.from('diary-images').getPublicUrl(path).data.publicUrl
}

export const dynamic = 'force-dynamic'

export default async function PhotoDiaryPublicPage() {
  const { data: diaries } = await supabase
    .from('photo_diaries')
    .select('*, staff(name), thumbnail:photo_diary_images!thumbnail_image_id(id, storage_path)')
    .eq('published', true)
    .order('published_at', { ascending: false })
    .limit(50)

  const items = (diaries ?? []) as (PhotoDiary & { staff: { name: string } | null; thumbnail: PhotoDiaryImage | null })[]

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-100 shadow-sm sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <h1 className="text-xl font-bold text-pink-500">写メ日記</h1>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6">
        {items.length === 0 ? (
          <div className="text-center py-20 text-gray-400">日記がまだありません</div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {items.map(d => (
              <Link
                key={d.id}
                href={`/photodiary/${d.id}`}
                className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow"
              >
                <div className="aspect-square bg-gray-100">
                  {d.thumbnail?.storage_path ? (
                    <img src={getImageUrl(d.thumbnail.storage_path)} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-300 text-3xl">📷</div>
                  )}
                </div>
                <div className="p-3">
                  {d.staff?.name && (
                    <div className="text-xs font-bold text-pink-500 mb-0.5">{d.staff.name}</div>
                  )}
                  <div className="text-sm font-medium text-gray-800 line-clamp-2">
                    {d.title || '（タイトルなし）'}
                  </div>
                  <div className="text-xs text-gray-400 mt-1">
                    {d.published_at ? new Date(d.published_at).toLocaleDateString('ja-JP') : ''}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
