import { NextRequest, NextResponse } from 'next/server'
import { sendLineMessage } from '@/lib/line'
import { createAdminClient, requireStaffUser } from '@/lib/server-auth'

export async function POST(req: NextRequest) {
  const adminSupabase = createAdminClient()
  const user = await requireStaffUser(req, adminSupabase)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { staff_id, message } = await req.json()
  if (!staff_id || !message) {
    return NextResponse.json({ success: false, reason: 'missing_params' }, { status: 400 })
  }

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
