import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const STORE_CAST_URLS: { storeId: number; url: string }[] = [
  // 快楽M性感倶楽部 (store_id 1-4)
  { storeId: 1, url: 'https://www.m-kairaku.com/narita/cast/' },
  { storeId: 2, url: 'https://www.m-kairaku.com/chiba/cast/' },
  { storeId: 3, url: 'https://www.m-kairaku.com/cast/' },
  { storeId: 4, url: 'https://www.m-kairaku.com/kinshicho/cast/' },
  // 癒したくて (store_id 5-8)
  { storeId: 5, url: 'https://www.iyashitakute.com/narita/cast/' },
  { storeId: 6, url: 'https://www.iyashitakute.com/chiba/cast/' },
  { storeId: 7, url: 'https://www.iyashitakute.com/funabashi/cast/' },
  { storeId: 8, url: 'https://www.iyashitakute.com/kinshicho/cast/' },
]

async function fetchCastNames(url: string): Promise<string[]> {
  const res = await fetch(url, { cache: 'no-store' })
  const html = await res.text()

  const names: string[] = []
  const liPattern = /<li[^>]*data-girlid="\d+"[^>]*>([\s\S]*?)<\/li>/g
  let match
  while ((match = liPattern.exec(html)) !== null) {
    const block = match[1]
    const nameMatch = block.match(/<div[^>]*class="cast_name"[^>]*>([\s\S]*?)<\/div>/)
    if (!nameMatch) continue
    const nameRaw = nameMatch[1].replace(/<[^>]+>/g, '').trim()
    const nameOnly = nameRaw.match(/^(.+?)\(/)
    if (nameOnly) names.push(nameOnly[1].trim())
  }
  return names
}

export async function POST() {
  try {
    // 全店舗からキャスト名を取得
    const storeResults = await Promise.all(
      STORE_CAST_URLS.map(async ({ storeId, url }) => {
        const names = await fetchCastNames(url)
        return { storeId, names }
      })
    )

    // 既存スタッフと既存の店舗紐付けを一括取得
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
