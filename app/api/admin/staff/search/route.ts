import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q')?.trim() ?? ''
  if (!q) return NextResponse.json([])

  const { data, error } = await sb
    .from('staff')
    .select('id, name, staff_stores(store_id)')
    .ilike('name', `%${q}%`)
    .order('name')
    .limit(10)

  if (error) return NextResponse.json([], { status: 500 })

  const results = (data ?? []).map((s: { id: number; name: string; staff_stores: Array<{ store_id: number }> }) => ({
    id: s.id,
    name: s.name,
    store_ids: s.staff_stores.map(ss => ss.store_id),
  }))

  return NextResponse.json(results)
}
