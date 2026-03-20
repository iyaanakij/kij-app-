import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export const revalidate = 300

export async function GET() {
  const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://kij-app.vercel.app'

  const { data: diaries } = await supabase
    .from('photo_diaries')
    .select('*, staff(name), thumbnail:photo_diary_images!thumbnail_image_id(id, storage_path)')
    .eq('published', true)
    .order('published_at', { ascending: false })
    .limit(20)

  const items = (diaries ?? []).map(d => {
    const castName = (d.staff as { name: string } | null)?.name ?? ''
    const thumbnailPath = (d.thumbnail as { storage_path: string } | null)?.storage_path
    const thumbnailUrl = thumbnailPath
      ? supabase.storage.from('diary-images').getPublicUrl(thumbnailPath).data.publicUrl
      : null
    const pubDate = d.published_at ? new Date(d.published_at).toUTCString() : new Date(d.created_at).toUTCString()
    const title = d.title ?? `${castName}の写メ日記`
    const description = d.body ? d.body.slice(0, 200) : ''

    return `
    <item>
      <title><![CDATA[${title}]]></title>
      <link>${siteUrl}/diary/${d.id}</link>
      <guid isPermaLink="true">${siteUrl}/diary/${d.id}</guid>
      <pubDate>${pubDate}</pubDate>
      <author><![CDATA[${castName}]]></author>
      <description><![CDATA[${description}]]></description>
      ${thumbnailUrl ? `<enclosure url="${thumbnailUrl}" type="image/jpeg" length="0" />` : ''}
    </item>`
  }).join('')

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>KIJ 写メ日記</title>
    <link>${siteUrl}/diary</link>
    <description>KIJ キャストの写メ日記</description>
    <language>ja</language>
    <atom:link href="${siteUrl}/feed.xml" rel="self" type="application/rss+xml" />
    ${items}
  </channel>
</rss>`

  return new NextResponse(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
    },
  })
}
