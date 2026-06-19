import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

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
  const all: {
    cs3_cast_id: string
    site_id: string
    enabled: boolean
    cp4_gid: string | null
    venrey_cast_id: string | null
  }[] = []

  const CHUNK = 1000
  let from = 0
  while (true) {
    const { data, error } = await adminSupabase
      .from('publish_rules')
      .select('cs3_cast_id, site_id, enabled, cp4_gid, venrey_cast_id')
      .range(from, from + CHUNK - 1)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    all.push(...data)
    if (data.length < CHUNK) break
    from += CHUNK
  }

  const siteCreds = new Map<string, { cp4_gid: string | null; venrey_cast_id: string | null }>()
  const venreyCreds = new Map<string, string>()
  for (const r of all) {
    const key = `${r.cs3_cast_id}:${r.site_id}`
    const current = siteCreds.get(key) ?? { cp4_gid: null, venrey_cast_id: null }
    if (r.cp4_gid) current.cp4_gid = r.cp4_gid
    if (r.venrey_cast_id) current.venrey_cast_id = r.venrey_cast_id
    siteCreds.set(key, current)
    if (r.venrey_cast_id) {
      venreyCreds.set(`${r.cs3_cast_id}:${SITE_TO_VENREY_GROUP[r.site_id] ?? r.site_id}`, r.venrey_cast_id)
    }
  }

  // cs3_cast_id ごとに集計
  const map = new Map<string, {
    enabled_count: number
    has_cp4: boolean
    has_venrey: boolean
    warning_count: number  // enabled=true だが cp4_gid/venrey_cast_id 欠落
    all_disabled_with_ids: boolean
  }>()

  for (const r of all) {
    const id = r.cs3_cast_id
    if (!map.has(id)) {
      map.set(id, { enabled_count: 0, has_cp4: false, has_venrey: false, warning_count: 0, all_disabled_with_ids: false })
    }
    const s = map.get(id)!
    if (r.enabled) s.enabled_count++
    const creds = siteCreds.get(`${r.cs3_cast_id}:${r.site_id}`)
    const venreyId = venreyCreds.get(`${r.cs3_cast_id}:${SITE_TO_VENREY_GROUP[r.site_id] ?? r.site_id}`)
    if (creds?.cp4_gid) s.has_cp4 = true
    if (venreyId) s.has_venrey = true
    if (r.enabled && !creds?.cp4_gid && !venreyId) s.warning_count++
  }

  // all_disabled_with_ids: IDはあるが全行 disabled
  for (const s of map.values()) {
    if (s.enabled_count === 0 && (s.has_cp4 || s.has_venrey)) {
      s.all_disabled_with_ids = true
    }
  }

  const summary = Array.from(map.entries()).map(([cs3_cast_id, s]) => ({ cs3_cast_id, ...s }))
  return NextResponse.json({ summary })
}
