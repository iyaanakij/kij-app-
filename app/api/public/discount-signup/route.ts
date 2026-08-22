import { randomInt } from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { corsHeaders } from '@/lib/publicCors'
import { isEmail } from '@/lib/email'
import { sendEmail } from '@/lib/emailProvider'
import { htmlToText } from '@/lib/mailCampaignTracking'
import { errorMessage } from '@/lib/errors'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'

function generateCouponCode(): string {
  const group = () => Array.from({ length: 3 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('')
  return `${group()}-${group()}`
}

function confirmationEmailHtml(couponCode: string): string {
  return `
    <p>メルマガご登録ありがとうございます。</p>
    <p>ご登録いただいたクーポンコードは以下の通りです。ご予約時にスタッフへお伝えください。</p>
    <p style="font-size:20px;font-weight:bold;letter-spacing:2px;">${couponCode}</p>
  `.trim()
}

type SignupRow = { id: number; coupon_code: string }

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get('origin')
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin, 'POST, OPTIONS') })
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')
  const headers = corsHeaders(origin, 'POST, OPTIONS')

  let body: { email?: string; company?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'リクエストの形式が正しくありません' }, { status: 400, headers })
  }

  if (body.company) {
    return NextResponse.json({ ok: true, coupon_code: null, already_registered: false, mail_sent: false }, { headers })
  }

  const email = body.email?.trim().toLowerCase()
  if (!email) {
    return NextResponse.json({ error: 'メールアドレスを入力してください' }, { status: 400, headers })
  }
  if (email.length > 254 || !isEmail(email)) {
    return NextResponse.json({ error: 'メールアドレスの形式が正しくありません' }, { status: 400, headers })
  }

  try {
    const { data: existing, error: existingError } = await sb
      .from('lp_discount_signups')
      .select('id, coupon_code')
      .eq('email', email)
      .maybeSingle()
    if (existingError) throw existingError

    if (existing) {
      const row = existing as SignupRow
      return NextResponse.json(
        { ok: true, coupon_code: row.coupon_code, already_registered: true, mail_sent: false },
        { headers }
      )
    }

    const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null
    const userAgent = request.headers.get('user-agent')

    let inserted: SignupRow | null = null
    for (let attempt = 0; attempt < 5 && !inserted; attempt++) {
      const couponCode = generateCouponCode()
      const { data, error } = await sb
        .from('lp_discount_signups')
        .insert({
          email,
          coupon_code: couponCode,
          ip_address: ipAddress,
          user_agent: userAgent,
        })
        .select('id, coupon_code')
        .single()

      if (!error) {
        inserted = data as SignupRow
        break
      }

      if (error.code === '23505' && error.message.includes('coupon_code')) continue

      if (error.code === '23505' && error.message.includes('email')) {
        const { data: winner, error: winnerError } = await sb
          .from('lp_discount_signups')
          .select('id, coupon_code')
          .eq('email', email)
          .single()
        if (winnerError) throw winnerError
        return NextResponse.json(
          { ok: true, coupon_code: (winner as SignupRow).coupon_code, already_registered: true, mail_sent: false },
          { headers }
        )
      }

      throw error
    }

    if (!inserted) {
      return NextResponse.json({ error: 'クーポンコードの発行に失敗しました。時間をおいて再度お試しください' }, { status: 500, headers })
    }

    const result = await sendEmail({
      to: email,
      subject: '【快楽M性感グループ】クーポンコードのご案内',
      text: htmlToText(confirmationEmailHtml(inserted.coupon_code)),
      html: confirmationEmailHtml(inserted.coupon_code),
    })

    await sb
      .from('lp_discount_signups')
      .update({
        confirmation_sent_at: result.success ? new Date().toISOString() : null,
        confirmation_error: result.success ? null : result.error ?? 'send failed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', inserted.id)

    return NextResponse.json(
      { ok: true, coupon_code: inserted.coupon_code, already_registered: false, mail_sent: result.success },
      { headers }
    )
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500, headers })
  }
}
