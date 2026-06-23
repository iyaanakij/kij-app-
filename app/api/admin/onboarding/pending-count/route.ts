import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  const { count, error } = await sb
    .from('onboarding_submissions')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'submitted')

  if (error) return NextResponse.json({ count: 0 })
  return NextResponse.json({ count: count ?? 0 })
}
