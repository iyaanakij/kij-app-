import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  const id = Number(request.nextUrl.searchParams.get('id'))
  if (!id) return NextResponse.json({ error: 'id が必要です' }, { status: 400 })

  const { data: job, error } = await adminSupabase
    .from('performance_batch_jobs')
    .select('*')
    .eq('id', id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ job })
}
