import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// staff.id を参照する全テーブル（docs/architecture/database.md FK制約セクション参照）。
// staff削除時にCASCADEで子ごと消えるテーブルが含まれるため、削除前に必ずtarget_idへ付け替える。
const REASSIGN_TABLES = [
  'shifts',
  'reservations',
  'board_annotations',
  'photo_diaries',
  'shift_requests',
  'staff_diary_delivery_targets',
  'user_roles',
  'onboarding_submissions',
] as const

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({})) as { source_id?: number; target_id?: number }
  const { source_id, target_id } = body

  if (!source_id || !target_id) {
    return NextResponse.json({ error: 'source_id と target_id が必要です' }, { status: 400 })
  }
  if (source_id === target_id) {
    return NextResponse.json({ error: '同じキャストは統合できません' }, { status: 400 })
  }

  const [{ data: source, error: sourceErr }, { data: target, error: targetErr }] = await Promise.all([
    sb.from('staff').select('*').eq('id', source_id).single(),
    sb.from('staff').select('*').eq('id', target_id).single(),
  ])
  if (sourceErr || !source) return NextResponse.json({ error: '統合元キャストが見つかりません' }, { status: 404 })
  if (targetErr || !target) return NextResponse.json({ error: '統合先キャストが見つかりません' }, { status: 404 })

  // CS3 ID 競合チェック: 両方に異なるIDが設定されている場合はどちらが正か判断できないため統合を拒否
  if (source.cs3_cast_id && target.cs3_cast_id && source.cs3_cast_id !== target.cs3_cast_id) {
    return NextResponse.json({
      error: `両方に異なるCS3 IDが設定されています（統合元:${source.cs3_cast_id} / 統合先:${target.cs3_cast_id}）。先にどちらかの紐付けを解除してから統合してください`,
    }, { status: 409 })
  }

  // ログインアカウント競合チェック: 両方にuser_rolesがある場合、どちらの認証情報を残すか自動判断できない
  const [{ data: sourceRoles }, { data: targetRoles }] = await Promise.all([
    sb.from('user_roles').select('id').eq('staff_id', source_id),
    sb.from('user_roles').select('id').eq('staff_id', target_id),
  ])
  if ((sourceRoles?.length ?? 0) > 0 && (targetRoles?.length ?? 0) > 0) {
    return NextResponse.json({ error: '両方にログインアカウントが紐付いています。先に手動で確認・整理してから統合してください' }, { status: 409 })
  }

  // シフト日付競合チェック: 同じ店舗×日付のシフトが両方にある場合、上書きしてよいか判断できないため拒否
  const [{ data: sourceShifts }, { data: targetShifts }] = await Promise.all([
    sb.from('shifts').select('store_id, date').eq('staff_id', source_id),
    sb.from('shifts').select('store_id, date').eq('staff_id', target_id),
  ])
  const targetShiftKeys = new Set((targetShifts ?? []).map(s => `${s.store_id}_${s.date}`))
  const shiftConflicts = (sourceShifts ?? []).filter(s => targetShiftKeys.has(`${s.store_id}_${s.date}`))
  if (shiftConflicts.length > 0) {
    return NextResponse.json({
      error: `統合先と同じ店舗×日付のシフトが${shiftConflicts.length}件重複しています。先に手動で調整してから統合してください`,
      conflicts: shiftConflicts,
    }, { status: 409 })
  }

  // ── ここから実書き込み。子テーブルの付け替え → 最後に統合元staffを削除する順序を厳守 ──

  // staff_stores: target が未所属の store_id だけ追加してから、source側の行は削除
  const [{ data: sourceStores }, { data: targetStores }] = await Promise.all([
    sb.from('staff_stores').select('store_id').eq('staff_id', source_id),
    sb.from('staff_stores').select('store_id').eq('staff_id', target_id),
  ])
  const targetStoreIds = new Set((targetStores ?? []).map(s => s.store_id))
  const newStoreIds = (sourceStores ?? []).map(s => s.store_id).filter(sid => !targetStoreIds.has(sid))
  if (newStoreIds.length > 0) {
    const { error } = await sb.from('staff_stores').insert(newStoreIds.map(sid => ({ staff_id: target_id, store_id: sid })))
    if (error) return NextResponse.json({ error: `staff_stores付け替え失敗: ${error.message}` }, { status: 500 })
  }
  await sb.from('staff_stores').delete().eq('staff_id', source_id)

  for (const table of REASSIGN_TABLES) {
    const { error } = await sb.from(table).update({ staff_id: target_id }).eq('staff_id', source_id)
    if (error) {
      return NextResponse.json({
        error: `${table}のstaff_id付け替えに失敗しました: ${error.message}（一部テーブルは既に付け替え済みの可能性があります。手動確認してください。統合元staffはまだ削除していません）`,
      }, { status: 500 })
    }
  }

  // CS3 ID引き継ぎ（target未設定・source設定済みの場合のみ）+ notesへ統合履歴を記録
  const patch: Record<string, unknown> = {
    notes: `${target.notes ?? ''}\n[統合] staff_id=${source_id}「${source.name}」を統合(${new Date().toISOString()})`.trim(),
  }
  if (!target.cs3_cast_id && source.cs3_cast_id) patch.cs3_cast_id = source.cs3_cast_id

  const { error: patchErr } = await sb.from('staff').update(patch).eq('id', target_id)
  if (patchErr) {
    return NextResponse.json({ error: `統合先staffの更新に失敗しました: ${patchErr.message}（データの付け替えは完了しています。統合元staffはまだ削除していません）` }, { status: 500 })
  }

  const { error: deleteErr } = await sb.from('staff').delete().eq('id', source_id)
  if (deleteErr) {
    return NextResponse.json({ error: `統合元staffの削除に失敗しました: ${deleteErr.message}（データの付け替えは完了しています。手動で統合元staffを削除してください）` }, { status: 500 })
  }

  return NextResponse.json({ ok: true, target_id, merged_store_ids: newStoreIds })
}
