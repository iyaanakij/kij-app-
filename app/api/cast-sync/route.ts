import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const STORE_CAST_URLS: { storeId: number; url: string }[] = [
  { storeId: 1, url: 'https://www.cityheaven.net/chiba/A1204/A120401/narita-kairaku/girllist/' },
  { storeId: 2, url: 'https://www.cityheaven.net/chiba/A1201/A120101/m-kairaku/girllist/' },
  { storeId: 3, url: 'https://www.cityheaven.net/chiba/A1202/A120201/anappu_nishi/girllist/' },
  { storeId: 4, url: 'https://www.cityheaven.net/tokyo/A1313/A131301/m-kairaku/girllist/' },
  { storeId: 5, url: 'https://www.cityheaven.net/chiba/A1204/A120401/aromaseikan/girllist/' },
  { storeId: 6, url: 'https://www.cityheaven.net/chiba/A1201/A120101/iyashitakutechiba/girllist/' },
  { storeId: 7, url: 'https://www.cityheaven.net/chiba/A1202/A120201/iyashitakute/girllist/' },
  { storeId: 8, url: 'https://www.cityheaven.net/tokyo/A1313/A131301/iyashitakute/girllist/' },
]

const FETCH_OPTS: RequestInit = {
  cache: 'no-store',
  headers: {
    'User-Agent': 'Mozilla/5.0 (compatible)',
    'Cookie': 'nenrei=y',
  },
}

async function fetchCastNames(url: string): Promise<string[]> {
  const res = await fetch(url, FETCH_OPTS)
  const html = await res.text()
  const names: string[] = []
  const seen = new Set<string>()

  // PCテーマ: <p class="girl_name"><a ...>名前</a>
  const re1 = /<p[^>]*class="girl_name"[^>]*>[\s\S]*?<a[^>]*>([^<\n]+)<\/a>/g
  let m
  while ((m = re1.exec(html)) !== null) {
    const name = m[1].trim()
    if (name && !seen.has(name)) { names.push(name); seen.add(name) }
  }

  // スマホテーマ: <div class="girllisttext">名前<br
  if (names.length === 0) {
    const re2 = /<div[^>]*class="girllisttext"[^>]*>\s*([\s\S]*?)\s*<br/g
    while ((m = re2.exec(html)) !== null) {
      const name = m[1].replace(/<[^>]+>/g, '').trim().split('\n')[0].trim()
      if (name && !seen.has(name)) { names.push(name); seen.add(name) }
    }
  }

  return names
}

export async function POST() {
  try {
    await supabase.from('stores').upsert([
      { id: 5, name: '成田（癒し）' },
      { id: 6, name: '千葉（癒し）' },
      { id: 7, name: '西船橋（癒し）' },
      { id: 8, name: '錦糸町（癒し）' },
    ], { onConflict: 'id', ignoreDuplicates: true })

    const storeResults = await Promise.all(
      STORE_CAST_URLS.map(async ({ storeId, url }) => {
        const names = await fetchCastNames(url)
        return { storeId, names }
      })
    )

    const [{ data: existingStaff }, { data: existingStoreLinks }] = await Promise.all([
      supabase.from('staff').select('id, name'),
      supabase.from('staff_stores').select('staff_id, store_id'),
    ])

    const nameToId = new Map((existingStaff ?? []).map(s => [s.name, s.id]))
    const linkedSet = new Set((existingStoreLinks ?? []).map(l => `${l.staff_id}_${l.store_id}`))

    const perStore: Record<number, { added: number; linked: number; skipped: number; total: number }> = {}

    for (const { storeId, names } of storeResults) {
      let added = 0, linked = 0, skipped = 0

      for (const name of names) {
        let staffId = nameToId.get(name)

        if (!staffId) {
          const { data } = await supabase.from('staff').insert({ name }).select('id').single()
          if (!data?.id) continue
          staffId = data.id
          nameToId.set(name, staffId)
          added++
        }

        const key = `${staffId}_${storeId}`
        if (!linkedSet.has(key)) {
          await supabase.from('staff_stores').insert({ staff_id: staffId, store_id: storeId })
          linkedSet.add(key)
          linked++
        } else {
          skipped++
        }
      }

      perStore[storeId] = { added, linked, skipped, total: names.length }
    }

    return NextResponse.json({ success: true, perStore })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
