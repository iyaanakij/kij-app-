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

export async function GET(request: NextRequest) {
  const cs3_cast_id = request.nextUrl.searchParams.get('cs3_cast_id')
  if (!cs3_cast_id) return NextResponse.json({ error: 'cs3_cast_id is required' }, { status: 400 })

  const { data, error } = await adminSupabase
    .from('publish_rules')
    .select('cs3_cast_id, source_shop_id, site_id, enabled, cp4_gid, venrey_cast_id, cast_name')
    .eq('cs3_cast_id', cs3_cast_id)
    .order('source_shop_id')
    .order('site_id')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const siteCreds = new Map<string, { cp4_gid: string | null; venrey_cast_id: string | null }>()
  const venreyCreds = new Map<string, string>()
  for (const row of data ?? []) {
    const current = siteCreds.get(row.site_id) ?? { cp4_gid: null, venrey_cast_id: null }
    if (row.cp4_gid) current.cp4_gid = row.cp4_gid
    if (row.venrey_cast_id) current.venrey_cast_id = row.venrey_cast_id
    siteCreds.set(row.site_id, current)
    if (row.venrey_cast_id) {
      venreyCreds.set(SITE_TO_VENREY_GROUP[row.site_id] ?? row.site_id, row.venrey_cast_id)
    }
  }

  const rules = (data ?? []).map(row => {
    const creds = siteCreds.get(row.site_id)
    return {
      ...row,
      cp4_gid: row.cp4_gid ?? creds?.cp4_gid ?? null,
      venrey_cast_id: row.venrey_cast_id ?? venreyCreds.get(SITE_TO_VENREY_GROUP[row.site_id] ?? row.site_id) ?? null,
    }
  })

  return NextResponse.json({ rules })
}
