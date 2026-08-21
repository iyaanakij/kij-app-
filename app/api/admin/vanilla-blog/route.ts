import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const IMAGE_BUCKET = 'vanilla-blog-images'
const MAX_IMAGE_BYTES = 500 * 1024 // qzin.jp側の上限（縦300×横300・500KB以内）に合わせる
const MAX_TITLE_LENGTH = 150 // qzin.jp側のタイトル欄上限

export async function GET(request: NextRequest) {
  const limit = Number(request.nextUrl.searchParams.get('limit') ?? '10')
  const { data, error } = await adminSupabase
    .from('vanilla_blog_jobs')
    .select('id, brand, title, status, result, error_message, created_at, updated_at')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ jobs: data ?? [] })
}

export async function POST(request: NextRequest) {
  const formData = await request.formData()
  const brand = formData.get('brand')
  const title = formData.get('title')
  const bodyHtml = formData.get('body_html')
  const image = formData.get('image')

  if (brand !== 'M' && brand !== 'E') {
    return NextResponse.json({ error: 'brand は M または E を指定してください' }, { status: 400 })
  }
  if (typeof title !== 'string' || !title.trim()) {
    return NextResponse.json({ error: 'タイトルは必須です' }, { status: 400 })
  }
  if (title.length > MAX_TITLE_LENGTH) {
    return NextResponse.json({ error: `タイトルは${MAX_TITLE_LENGTH}文字以内にしてください` }, { status: 400 })
  }
  if (typeof bodyHtml !== 'string' || !bodyHtml.trim()) {
    return NextResponse.json({ error: '本文は必須です' }, { status: 400 })
  }
  if (!(image instanceof File) || image.size === 0) {
    return NextResponse.json({ error: '画像は必須です' }, { status: 400 })
  }
  if (image.size > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: '画像は500KB以内にしてください' }, { status: 400 })
  }

  // 同時に処理中の同ブランドジョブがあれば連打防止（CP4/Venreyのクールダウンと同じ考え方）
  const { data: existing } = await adminSupabase
    .from('vanilla_blog_jobs')
    .select('id')
    .eq('brand', brand)
    .in('status', ['pending', 'running'])
    .limit(1)
  if (existing && existing.length > 0) {
    return NextResponse.json({ error: `${brand}版は既に処理中のジョブがあります。完了を待ってから再試行してください。` }, { status: 429 })
  }

  const ext = image.type === 'image/png' ? 'png' : 'jpg'
  const storagePath = `${brand}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const buffer = Buffer.from(await image.arrayBuffer())
  const { error: uploadError } = await adminSupabase.storage
    .from(IMAGE_BUCKET)
    .upload(storagePath, buffer, { contentType: image.type || 'image/jpeg' })
  if (uploadError) {
    return NextResponse.json({ error: `画像アップロードに失敗しました: ${uploadError.message}` }, { status: 500 })
  }

  const { data, error } = await adminSupabase
    .from('vanilla_blog_jobs')
    .insert({
      brand,
      title: title.trim(),
      body_html: bodyHtml,
      image_storage_path: storagePath,
      status: 'pending',
      requested_by: 'admin',
    })
    .select('id')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, job_id: data.id })
}
