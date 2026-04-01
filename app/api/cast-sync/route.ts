import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const HP_CAST_URL = 'https://www.m-kairaku.com/cast/'
const NISHIFUNABASHI_STORE_ID = 3

async function fetchCastNames(): Promise<string[]> {
  const res = await fetch(HP_CAST_URL, { cache: 'no-store' })
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
    const castNames = await fetchCastNames()
    if (castNames.length === 0) {
      return NextResponse.json({ error: 'HPからキャスト情報を取得できませんでした' }, { status: 500 })
    }

    const { data: existingStaff } = await supabase.from('staff').select('id, name')
    const existingNames = new Map((existingStaff ?? []).map(s => [s.name, s.id]))

    const { data: existingStores } = await supabase
      .from('staff_stores')
      .select('staff_id')
      .eq('store_id', NISHIFUNABASHI_STORE_ID)
    const alreadyInStore = new Set((existingStores ?? []).map(s => s.staff_id))

    let added = 0
    let storeLinked = 0
    let skipped = 0

    for (const name of castNames) {
      let staffId = existingNames.get(name)

      if (!staffId) {
        // 新規スタッフ追加
        const { data } = await supabase
          .from('staff')
          .insert({ name })
          .select('id')
          .single()
        if (!data?.id) continue
        staffId = data.id
        added++
      }

      if (!alreadyInStore.has(staffId)) {
        // 西船橋に紐付け
        await supabase.from('staff_stores').insert({ staff_id: staffId, store_id: NISHIFUNABASHI_STORE_ID })
        storeLinked++
      } else {
        skipped++
      }
    }

    return NextResponse.json({
      success: true,
      total: castNames.length,
      added,
      storeLinked,
      skipped,
      names: castNames,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
