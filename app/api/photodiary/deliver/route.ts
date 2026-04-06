import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { Resend } from 'resend'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// 画像URLを取得（storage_path → public URL）
function getImageUrl(path: string): string {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  return `${supabaseUrl}/storage/v1/object/public/diary-images/${path}`
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const { diary_id } = body as { diary_id?: number }

    if (!diary_id) {
      return NextResponse.json({ error: 'diary_id が必要です' }, { status: 400 })
    }

    // 日記情報を取得
    const { data: diary, error: diaryError } = await supabase
      .from('photo_diaries')
      .select(`
        id, staff_id, title, body, published_at,
        photo_diary_images(storage_path, sort_order)
      `)
      .eq('id', diary_id)
      .eq('published', true)
      .single()

    if (diaryError || !diary) {
      return NextResponse.json({ error: '日記が見つからないか未公開です' }, { status: 404 })
    }

    // スタッフ名を取得
    const { data: staff } = await supabase
      .from('staff')
      .select('name')
      .eq('id', diary.staff_id)
      .single()

    // 有効な転送先を取得
    const { data: targets } = await supabase
      .from('staff_diary_delivery_targets')
      .select('*')
      .eq('staff_id', diary.staff_id)
      .eq('enabled', true)
      .eq('delivery_type', 'email')

    if (!targets || targets.length === 0) {
      return NextResponse.json({ sent: 0, skipped: 'no targets' })
    }

    // 既送信チェック（同一diary_idで sent のログがあれば重複送信しない）
    const { data: existingLogs } = await supabase
      .from('diary_delivery_logs')
      .select('target_id')
      .eq('diary_id', diary_id)
      .eq('status', 'sent')

    const alreadySentTargetIds = new Set((existingLogs ?? []).map(l => l.target_id))
    const pendingTargets = targets.filter(t => !alreadySentTargetIds.has(t.id))

    if (pendingTargets.length === 0) {
      return NextResponse.json({ sent: 0, skipped: 'already sent' })
    }

    // 画像URLリストを作成（sort_order順）
    const sortedImages = (diary.photo_diary_images ?? [])
      .sort((a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order)
      .map((img: { storage_path: string }) => getImageUrl(img.storage_path))

    const staffName = staff?.name ?? 'キャスト'
    const subject = diary.title
      ? `【${staffName}】${diary.title}`
      : `【${staffName}】写メ日記`

    // テキスト本文
    const textBody = [
      diary.body ?? '',
      '',
      sortedImages.length > 0 ? '【画像URL】' : '',
      ...sortedImages,
    ].join('\n').trim()

    const resend = new Resend(process.env.RESEND_API_KEY!)

    // 送信処理
    const results = await Promise.allSettled(
      pendingTargets.map(async target => {
        try {
          await resend.emails.send({
            from: process.env.RESEND_FROM_EMAIL!,
            to: target.destination,
            subject,
            text: textBody,
          })

          await supabase.from('diary_delivery_logs').insert({
            diary_id,
            target_id: target.id,
            status: 'sent',
          })

          return { target_id: target.id, media_name: target.media_name, status: 'sent' }
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : String(err)

          await supabase.from('diary_delivery_logs').insert({
            diary_id,
            target_id: target.id,
            status: 'failed',
            error_message: errorMessage,
          })

          return { target_id: target.id, media_name: target.media_name, status: 'failed', error: errorMessage }
        }
      })
    )

    const sent = results.filter(r => r.status === 'fulfilled' && (r.value as { status: string }).status === 'sent').length
    const failed = results.length - sent

    console.log(`写メ日記配信 diary_id=${diary_id}: ${sent}件送信, ${failed}件失敗`)

    return NextResponse.json({ sent, failed, total: pendingTargets.length })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
