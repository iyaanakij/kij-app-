import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function requireStaffAuth(request: NextRequest): Promise<boolean> {
  const token = request.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return false
  const { data: { user }, error } = await adminSupabase.auth.getUser(token)
  if (error || !user) return false
  const { data } = await adminSupabase
    .from('user_roles').select('role').eq('id', user.id).maybeSingle()
  return data?.role === 'staff'
}

export async function GET(request: NextRequest) {
  if (!await requireStaffAuth(request))
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 })

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
