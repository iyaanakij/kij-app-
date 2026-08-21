import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function safeRedirectUrl(value: string | null): URL | null {
  if (!value) return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url
  } catch {
    return null
  }
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token') ?? ''
  const targetUrl = safeRedirectUrl(request.nextUrl.searchParams.get('url'))
  if (!targetUrl) {
    return NextResponse.json({ error: 'invalid url' }, { status: 400 })
  }

  if (/^[a-f0-9]{48,128}$/i.test(token)) {
    const { data } = await sb
      .from('mail_campaign_recipients')
      .select('id, click_count, first_clicked_at')
      .eq('token', token)
      .maybeSingle()

    if (data) {
      const now = new Date().toISOString()
      await sb
        .from('mail_campaign_recipients')
        .update({
          first_clicked_at: data.first_clicked_at ?? now,
          click_count: Number(data.click_count ?? 0) + 1,
          updated_at: now,
        })
        .eq('id', data.id)
    }
  }

  return NextResponse.redirect(targetUrl)
}
