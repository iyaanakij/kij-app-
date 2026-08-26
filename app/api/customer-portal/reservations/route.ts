// 顧客向けマイページアプリ専用API。
// CS3顧客IDでreservationsと突合し、未来の確定予約一覧を返す（複製保存はしない、都度取得のみ）。
// 呼び出し元は新規マイページアプリのサーバーのみ（Bearer固定トークン認証、lib/customerPortalAuth.ts）。
// 設計: A案（CS3顧客IDで直接紐付け）。profile/route.ts と同じく
// mail_customer_directory.cs3_customer_id をキーに使う。
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isAuthorizedCustomerPortalRequest } from '@/lib/customerPortalAuth'
import { toDomesticJpPhone } from '@/lib/phone'
import { errorMessage } from '@/lib/errors'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// 顧客に見せてよい列のみ。cs3_cast_fee/notes/communicated/arrival_confirmed/checked等の
// 内部管理列・内部原価は含めない（profile/route.tsと同じ方針）。
const RESERVATION_SELECT =
  'id, date, section, time, checkout_time, area, hotel, course_duration, nomination_type'

export async function POST(request: NextRequest) {
  if (!isAuthorizedCustomerPortalRequest(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json() as { phone?: string; cs3_customer_id?: string }

    let cs3CustomerId = body.cs3_customer_id?.trim() || null

    if (!cs3CustomerId) {
      const phone = toDomesticJpPhone(body.phone ?? '')
      if (!phone || phone.length < 9) {
        return NextResponse.json({ error: 'invalid_phone' }, { status: 400 })
      }

      const { data: directory, error: directoryError } = await sb
        .from('mail_customer_directory')
        .select('cs3_customer_id')
        .eq('phone', phone)
        .maybeSingle()
      if (directoryError) throw directoryError

      cs3CustomerId = directory?.cs3_customer_id ?? null
    }

    if (!cs3CustomerId) {
      return NextResponse.json({ matched: false, reservations: [] })
    }

    const today = new Date().toISOString().split('T')[0]
    const { data: reservations, error: reservationsError } = await sb
      .from('reservations')
      .select(RESERVATION_SELECT)
      .eq('cs3_customer_id', cs3CustomerId)
      .eq('status', 'confirmed')
      .gte('date', today)
      .order('date', { ascending: true })
      .order('time', { ascending: true })
    if (reservationsError) throw reservationsError

    return NextResponse.json({
      matched: true,
      reservations: reservations ?? [],
    })
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 })
  }
}
