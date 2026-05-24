import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// 同名スタッフの重複を解消する
// 最も古い（id最小）レコードを正とし、新しい方のIDを付け替えてから削除
export async function POST() {
  try {
    const { data: allStaff } = await supabase.from('staff').select('id, name').order('id')
    if (!allStaff) return NextResponse.json({ error: 'fetch failed' }, { status: 500 })

    // 名前ごとにグルーピング
    const byName = new Map<string, number[]>()
    for (const s of allStaff) {
      const ids = byName.get(s.name) ?? []
      ids.push(s.id)
      byName.set(s.name, ids)
    }

    const merged: { name: string; kept: number; removed: number[] }[] = []

    for (const [name, ids] of byName) {
      if (ids.length < 2) continue

      const keepId = ids[0]
      const removeIds = ids.slice(1)

      for (const removeId of removeIds) {
        // shifts の staff_id を付け替え（既存のkeepId重複は無視）
        await supabase.from('shifts').update({ staff_id: keepId }).eq('staff_id', removeId)

        // staff_stores の付け替え（重複はdelete後insert）
        const { data: links } = await supabase
          .from('staff_stores').select('store_id').eq('staff_id', removeId)
        for (const link of links ?? []) {
          const { data: exists } = await supabase
            .from('staff_stores').select('staff_id')
            .eq('staff_id', keepId).eq('store_id', link.store_id).maybeSingle()
          if (!exists) {
            await supabase.from('staff_stores').insert({ staff_id: keepId, store_id: link.store_id })
          }
        }
        await supabase.from('staff_stores').delete().eq('staff_id', removeId)

        // shift_requests の付け替え
        await supabase.from('shift_requests').update({ staff_id: keepId }).eq('staff_id', removeId)

        // photo_diaries の付け替え
        await supabase.from('photo_diaries').update({ staff_id: keepId }).eq('staff_id', removeId)

        // スタッフ削除
        await supabase.from('staff').delete().eq('id', removeId)
      }

      merged.push({ name, kept: keepId, removed: removeIds })
    }

    return NextResponse.json({ success: true, merged, total: merged.length })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
