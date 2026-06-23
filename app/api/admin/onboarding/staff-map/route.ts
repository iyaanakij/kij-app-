import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  const { data, error } = await sb
    .from('onboarding_submissions')
    .select('id, staff_id, brand, area_id')
    .eq('status', 'approved')
    .not('staff_id', 'is', null)

  if (error) return NextResponse.json({}, { status: 500 })

  const map: Record<number, { id: number; brand: string; area_id: number }> = {}
  for (const s of data ?? []) {
    if (s.staff_id != null) map[s.staff_id] = { id: s.id, brand: s.brand, area_id: s.area_id }
  }

  return NextResponse.json(map)
}
