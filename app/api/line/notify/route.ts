import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendLineMessage } from '@/lib/line'

export async function POST(req: NextRequest) {
  const { staff_id, message } = await req.json()
  if (!staff_id || !message) {
    return NextResponse.json({ success: false, reason: 'missing_params' }, { status: 400 })
  }

  const adminSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data } = await adminSupabase
    .from('user_roles')
    .select('line_user_id')
    .eq('staff_id', staff_id)
    .eq('role', 'cast')
    .maybeSingle()

  if (!data?.line_user_id) {
    return NextResponse.json({ success: false, reason: 'no_line_id' })
  }

  const ok = await sendLineMessage(data.line_user_id, message)
  return NextResponse.json({ success: ok })
}
