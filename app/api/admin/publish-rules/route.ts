import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const SITE_TO_VENREY_GROUP: Record<string, string> = {
  iya_narita: 'iya_narita',
  iya_chiba: 'iya_narita',
  iya_funabashi: 'iya_kinshicho',
  iya_kinshicho: 'iya_kinshicho',
  mka_narita: 'mka_narita',
  mka_chiba: 'mka_narita',
  mka_funabashi: 'mka_kinshicho',
  mka_kinshicho: 'mka_kinshicho',
}

export async function GET() {
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

  const castIds = [...new Set(updates.map(u => u.cs3_cast_id))]
  const { data: existing, error: existingError } = await adminSupabase
    .from('publish_rules')
    .select('cs3_cast_id, source_shop_id, site_id, cp4_gid, venrey_cast_id, cast_name')
    .in('cs3_cast_id', castIds)

  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 })

  const rowCreds = new Map<string, { cp4_gid: string | null; venrey_cast_id: string | null; cast_name: string | null }>()
  const siteCreds = new Map<string, { cp4_gid: string | null; venrey_cast_id: string | null; cast_name: string | null }>()
  const venreyCreds = new Map<string, string>()
  const castNames = new Map<string, string>()
  for (const row of existing ?? []) {
    const rowKey = `${row.cs3_cast_id}:${row.source_shop_id}:${row.site_id}`
    rowCreds.set(rowKey, {
      cp4_gid: row.cp4_gid,
      venrey_cast_id: row.venrey_cast_id,
      cast_name: row.cast_name,
    })
    if (row.cast_name && !castNames.has(row.cs3_cast_id)) castNames.set(row.cs3_cast_id, row.cast_name)

    const siteKey = `${row.cs3_cast_id}:${row.site_id}`
    const current = siteCreds.get(siteKey) ?? { cp4_gid: null, venrey_cast_id: null, cast_name: row.cast_name ?? null }
    if (row.cp4_gid) current.cp4_gid = row.cp4_gid
    if (row.venrey_cast_id) current.venrey_cast_id = row.venrey_cast_id
    if (!current.cast_name && row.cast_name) current.cast_name = row.cast_name
    siteCreds.set(siteKey, current)
    if (row.venrey_cast_id) {
      venreyCreds.set(`${row.cs3_cast_id}:${SITE_TO_VENREY_GROUP[row.site_id] ?? row.site_id}`, row.venrey_cast_id)
    }
  }

  const { error } = await adminSupabase
    .from('publish_rules')
    .upsert(
      updates.map(u => {
        const row = rowCreds.get(`${u.cs3_cast_id}:${u.source_shop_id}:${u.site_id}`)
        const site = siteCreds.get(`${u.cs3_cast_id}:${u.site_id}`)
        return {
          ...u,
          cp4_gid: row?.cp4_gid ?? site?.cp4_gid ?? null,
          venrey_cast_id: row?.venrey_cast_id ?? venreyCreds.get(`${u.cs3_cast_id}:${SITE_TO_VENREY_GROUP[u.site_id] ?? u.site_id}`) ?? null,
          cast_name: row?.cast_name ?? site?.cast_name ?? castNames.get(u.cs3_cast_id) ?? null,
          updated_at: new Date().toISOString(),
        }
      }),
      { onConflict: 'cs3_cast_id,source_shop_id,site_id' }
    )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function PATCH(request: NextRequest) {
  const body = await request.json()
  const { cs3_cast_id, cast_name } = body as { cs3_cast_id?: string; cast_name?: string }
  if (!cs3_cast_id || typeof cast_name !== 'string' || !cast_name.trim()) {
    return NextResponse.json({ error: 'cs3_cast_id and cast_name are required' }, { status: 400 })
  }

  const { error } = await adminSupabase
    .from('publish_rules')
    .update({ cast_name: cast_name.trim(), updated_at: new Date().toISOString() })
    .eq('cs3_cast_id', cs3_cast_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
