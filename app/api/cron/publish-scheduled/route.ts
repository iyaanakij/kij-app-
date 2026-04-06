import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  // Vercel Cron認証
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const now = new Date().toISOString()

  const { data, error } = await supabase
    .from('photo_diaries')
    .update({
      published: true,
      published_at: now,
      scheduled_at: null,
    })
    .eq('published', false)
    .not('scheduled_at', 'is', null)
    .lte('scheduled_at', now)
    .select('id, title')

  if (error) {
    console.error('予約投稿エラー:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const publishedItems = data ?? []
  console.log(`予約投稿: ${publishedItems.length}件公開`)

  // 公開された日記を配信
  if (publishedItems.length > 0) {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://kij-app.vercel.app'
    await Promise.allSettled(
      publishedItems.map(item =>
        fetch(`${baseUrl}/api/photodiary/deliver`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ diary_id: item.id }),
        }).catch(err => console.error(`配信エラー diary_id=${item.id}:`, err))
      )
    )
  }

  return NextResponse.json({ published: publishedItems.length, items: data })
}
