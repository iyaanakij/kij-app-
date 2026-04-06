import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import nodemailer from 'nodemailer'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function getImageUrl(path: string): string {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/diary-images/${path}`
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const { diary_id } = body as { diary_id?: number }

    if (!diary_id) {
      return NextResponse.json({ error: 'diary_id が必要です' }, { status: 400 })
    }

    console.log(`[deliver] diary_id=${diary_id} 開始`)

    // 日記情報を取得（画像は別クエリ）
    const { data: diary, error: diaryError } = await supabase
      .from('photo_diaries')
      .select('id, staff_id, title, body, published, published_at')
      .eq('id', diary_id)
      .single()

    console.log(`[deliver] diary取得結果: published=${diary?.published} error=${diaryError?.message ?? 'none'}`)

    if (diaryError || !diary) {
      console.error(`[deliver] diary取得失敗 diary_id=${diary_id}:`, diaryError?.message)
      return NextResponse.json({ error: `日記が見つかりません: ${diaryError?.message}` }, { status: 404 })
    }

    if (!diary.published) {
      console.error(`[deliver] diary_id=${diary_id} は未公開 (published=${diary.published})`)
      return NextResponse.json({ error: '未公開の日記です', published: diary.published }, { status: 404 })
    }

    // 画像を別クエリで取得
    const { data: images } = await supabase
      .from('photo_diary_images')
      .select('storage_path, sort_order')
      .eq('diary_id', diary_id)
      .order('sort_order')

    // スタッフ名を取得
    const { data: staff } = await supabase.from('staff').select('name').eq('id', diary.staff_id).single()

    // 有効な転送先を取得
    const { data: targets, error: targetsError } = await supabase
      .from('staff_diary_delivery_targets')
      .select('*')
      .eq('staff_id', diary.staff_id)
      .eq('enabled', true)
      .eq('delivery_type', 'email')

    if (targetsError) {
      console.error(`[deliver] targets取得失敗:`, targetsError.message)
      return NextResponse.json({ error: targetsError.message }, { status: 500 })
    }

    console.log(`[deliver] staff_id=${diary.staff_id} 有効転送先=${targets?.length ?? 0}件`)

    if (!targets || targets.length === 0) {
      return NextResponse.json({ sent: 0, skipped: 'no targets' })
    }

    // 既送信チェック
    const { data: existingLogs } = await supabase
      .from('diary_delivery_logs')
      .select('target_id')
      .eq('diary_id', diary_id)
      .eq('status', 'sent')

    const alreadySentTargetIds = new Set((existingLogs ?? []).map(l => l.target_id))
    const pendingTargets = targets.filter(t => !alreadySentTargetIds.has(t.id))

    if (pendingTargets.length === 0) {
      console.log(`[deliver] diary_id=${diary_id} 全ターゲット送信済み`)
      return NextResponse.json({ sent: 0, skipped: 'already sent' })
    }

    // メール本文作成
    const sortedImages = (images ?? []).map(img => getImageUrl(img.storage_path))

    const staffName = staff?.name ?? 'キャスト'
    const subject = diary.title ? `【${staffName}】${diary.title}` : `【${staffName}】写メ日記`
    const textBody = [
      diary.body ?? '',
      '',
      sortedImages.length > 0 ? '【画像URL】' : '',
      ...sortedImages,
    ].join('\n').trim()

    console.log(`[deliver] from=${process.env.RESEND_FROM_EMAIL} subject="${subject}"`)

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER!,
        pass: process.env.GMAIL_APP_PASSWORD!,
      },
    })

    // 送信処理（target単位で結果を追跡）
    const targetResults: { target_id: string; media_name: string; status: string; error?: string }[] = []

    for (const target of pendingTargets) {
      try {
        await transporter.sendMail({
          from: `写メ日記 <${process.env.GMAIL_USER}>`,
          to: target.destination,
          subject,
          text: textBody,
        })

        console.log(`[deliver] 送信成功 [${target.media_name}] to=${target.destination}`)
        await supabase.from('diary_delivery_logs').insert({
          diary_id,
          target_id: target.id,
          status: 'sent',
        })
        targetResults.push({ target_id: target.id, media_name: target.media_name, status: 'sent' })
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err)
        console.error(`[deliver] 送信失敗 [${target.media_name}] to=${target.destination}:`, errorMessage)
        await supabase.from('diary_delivery_logs').insert({
          diary_id,
          target_id: target.id,
          status: 'failed',
          error_message: errorMessage,
        })
        targetResults.push({ target_id: target.id, media_name: target.media_name, status: 'failed', error: errorMessage })
      }
    }

    const sent = targetResults.filter(r => r.status === 'sent').length
    const failed = targetResults.filter(r => r.status === 'failed').length
    console.log(`[deliver] diary_id=${diary_id} 完了: ${sent}件送信, ${failed}件失敗`)

    return NextResponse.json({ sent, failed, total: pendingTargets.length, results: targetResults })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error(`[deliver] 予期せぬエラー:`, msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
