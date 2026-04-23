import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(_request: NextRequest) {

  const all: Record<string, unknown>[] = []
  const CHUNK = 1000
  let from = 0
  while (true) {
    const { data, error } = await adminSupabase
      .from('publish_rules')
      .select('cs3_cast_id, source_shop_id, site_id, enabled, cp4_gid, venrey_cast_id, cast_name')
      .order('cast_name')
      .order('source_shop_id')
      .order('site_id')
      .range(from, from + CHUNK - 1)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    all.push(...data)
    if (data.length < CHUNK) break
    from += CHUNK
  }

  return NextResponse.json({ rules: all })
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const updates: { cs3_cast_id: string; source_shop_id: string; site_id: string; enabled: boolean }[] = body.updates
  if (!Array.isArray(updates) || updates.length === 0) {
    return NextResponse.json({ error: 'updates is required' }, { status: 400 })
  }

  const { error } = await adminSupabase
    .from('publish_rules')
    .upsert(
      updates.map(u => ({ ...u, updated_at: new Date().toISOString() })),
      { onConflict: 'cs3_cast_id,source_shop_id,site_id' }
    )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
