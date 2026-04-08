import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    // 管理者セッション確認
    const token = request.headers.get('authorization')?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: '認証が必要です' }, { status: 401 })

    const { data: { user: caller } } = await adminSupabase.auth.getUser(token)
    if (!caller) return NextResponse.json({ error: '認証が必要です' }, { status: 401 })

    const { data: callerRole } = await adminSupabase
      .from('user_roles')
      .select('role')
      .eq('id', caller.id)
      .maybeSingle()
    if (callerRole?.role !== 'staff') return NextResponse.json({ error: '権限がありません' }, { status: 403 })

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

    // 日記IDを取得
    const { data: diaries } = await adminSupabase
      .from('photo_diaries')
      .select('id')
      .eq('staff_id', staff_id)
    const diaryIds = (diaries ?? []).map(d => d.id)

    if (diaryIds.length > 0) {
      // ストレージ画像を削除
      const { data: images } = await adminSupabase
        .from('photo_diary_images')
        .select('storage_path')
        .in('diary_id', diaryIds)
      if (images && images.length > 0) {
        await adminSupabase.storage.from('diary-images').remove(images.map(i => i.storage_path))
      }

      // 日記を削除（photo_diary_images / diary_delivery_logs は CASCADE で削除）
      await adminSupabase.from('photo_diaries').delete().in('id', diaryIds)
    }

    // Auth ユーザーを削除（user_roles は cascade で削除される）
    const { error: deleteError } = await adminSupabase.auth.admin.deleteUser(userRole.id)
    if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 })

    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
