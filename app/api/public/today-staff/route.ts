import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { formatShiftTime } from '@/lib/types'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// HP base URLs per store_id
const HP_BASE: Record<number, string> = {
  1: 'https://www.m-kairaku.com/narita',
  2: 'https://www.m-kairaku.com/chiba',
  3: 'https://www.m-kairaku.com',
  4: 'https://www.m-kairaku.com/kinshicho',
  5: 'https://www.iyashitakute.com/narita',
  6: 'https://www.iyashitakute.com/chiba',
  7: 'https://www.iyashitakute.com/funabashi',
  8: 'https://www.iyashitakute.com/kinshicho',
}

const ALLOWED_ORIGINS = [
  'https://www.m-kairaku.com',
  'https://m-kairaku.com',
  'https://www.iyashitakute.com',
  'https://iyashitakute.com',
]

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
}

// Vercel は UTC なので +9h → JST。営業日は 7:00 JST 切り替え
function todayJST(): string {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000)
  if (now.getUTCHours() < 7) now.setUTCDate(now.getUTCDate() - 1)
  return now.toISOString().slice(0, 10)
}

export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get('origin')
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) })
}

export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  const { searchParams } = new URL(req.url)
  const storeId = parseInt(searchParams.get('store_id') ?? '', 10)
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '3', 10), 10)

  if (!storeId || !HP_BASE[storeId]) {
    return NextResponse.json(
      { error: 'invalid store_id' },
      { status: 400, headers: corsHeaders(origin) }
    )
  }

  const today = todayJST()

  // 当日シフトを取得（開始時刻昇順）
  // 将来の theme-based 優先表示: ここで staff の tags カラムを参照して並び替え
  const { data: shifts, error: shiftsError } = await supabase
    .from('shifts')
    .select('staff_id, start_time, end_time, staff:staff_id(id, name)')
    .eq('store_id', storeId)
    .eq('date', today)
    .eq('status', 'normal')
    .order('start_time', { ascending: true })

  if (shiftsError) {
    return NextResponse.json(
      { error: shiftsError.message },
      { status: 500, headers: corsHeaders(origin) }
    )
  }

  type ShiftRow = {
    staff_id: number
    start_time: number
    end_time: number
    staff: { id: number; name: string } | null
  }

  // staff_id 重複排除して limit 件取り出す
  const rows = (shifts ?? []) as unknown as ShiftRow[]
  const seen = new Set<number>()
  const picked: ShiftRow[] = []
  for (const row of rows) {
    if (!row.staff || seen.has(row.staff_id)) continue
    seen.add(row.staff_id)
    picked.push(row)
    if (picked.length >= limit) break
  }

  // スタッフごとの最新公開日記サムネイルを取得
  const staffIds = picked.map(r => r.staff_id)
  const photoMap = new Map<number, string>()

  if (staffIds.length > 0) {
    const { data: diaries } = await supabase
      .from('photo_diaries')
      .select('staff_id, thumbnail:photo_diary_images!thumbnail_image_id(storage_path)')
      .in('staff_id', staffIds)
      .eq('published', true)
      .not('thumbnail_image_id', 'is', null)
      .order('published_at', { ascending: false })

    for (const d of (diaries ?? []) as unknown as { staff_id: number; thumbnail: { storage_path: string } | null }[]) {
      if (!photoMap.has(d.staff_id) && d.thumbnail?.storage_path) {
        const { data } = supabase.storage.from('diary-images').getPublicUrl(d.thumbnail.storage_path)
        photoMap.set(d.staff_id, data.publicUrl)
      }
    }
  }

  const hpBase = HP_BASE[storeId]
  const staff = picked.map(r => ({
    name: r.staff!.name,
    photo_url: photoMap.get(r.staff_id) ?? null,
    start_time: formatShiftTime(r.start_time),
    end_time: formatShiftTime(r.end_time),
    // 将来: staff ごとのプロフィールURLを DB に持たせてここで返す
    profile_url: `${hpBase}/cast/`,
  }))

  return NextResponse.json(
    { staff, store_id: storeId, date: today },
    {
      headers: {
        ...corsHeaders(origin),
        'Cache-Control': 'public, max-age=300, stale-while-revalidate=60',
      },
    }
  )
}
