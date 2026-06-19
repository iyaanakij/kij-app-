import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

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
  return NextResponse.json({ rules: data ?? [] })
}
