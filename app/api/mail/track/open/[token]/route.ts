import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const PIXEL = Buffer.from(
  'R0lGODlhAQABAPAAAP///wAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==',
  'base64'
)

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  if (/^[a-f0-9]{48,128}$/i.test(token)) {
    const { data } = await sb
      .from('mail_campaign_recipients')
      .select('id, open_count')
      .eq('token', token)
      .maybeSingle()

    if (data) {
      const now = new Date().toISOString()
      await sb
        .from('mail_campaign_recipients')
        .update({
          opened_at: now,
          open_count: Number(data.open_count ?? 0) + 1,
          updated_at: now,
        })
        .eq('id', data.id)
    }
  }

  return new NextResponse(PIXEL, {
    headers: {
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-store, max-age=0',
    },
  })
}
