import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: Request) {
  try {
    const { staff_id } = await request.json() as { staff_id?: number }
    if (!staff_id) return NextResponse.json({ error: 'staff_id が必要です' }, { status: 400 })

    // user_roles から auth user ID を取得
    const { data: userRole, error: roleError } = await adminSupabase
      .from('user_roles')
      .select('id')
      .eq('staff_id', staff_id)
      .eq('role', 'cast')
      .maybeSingle()

    if (roleError) return NextResponse.json({ error: roleError.message }, { status: 500 })
    if (!userRole) return NextResponse.json({ error: 'アカウントが見つかりません' }, { status: 404 })

    // Auth ユーザーを削除（user_roles は cascade で削除される）
    const { error: deleteError } = await adminSupabase.auth.admin.deleteUser(userRole.id)
    if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 })

    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
