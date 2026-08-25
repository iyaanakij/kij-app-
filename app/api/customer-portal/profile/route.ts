// 顧客向けマイページアプリ専用API。
// 電話番号からCS3顧客データとの一致状況・来店履歴を返す（複製保存はしない、都度取得のみ）。
// 呼び出し元は新規マイページアプリのサーバーのみ（Bearer固定トークン認証、lib/customerPortalAuth.ts）。
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isAuthorizedCustomerPortalRequest } from '@/lib/customerPortalAuth'
import { toDomesticJpPhone } from '@/lib/phone'
import { errorMessage } from '@/lib/errors'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// 顧客に見せてよい列のみ。committee_fee/store_profit等の内部原価は含めない。
const HISTORY_SELECT =
  'history_id, date, used_at, cast_name, course_label, nomination_label, area_label, location_label, revenue, payment_method'

export async function POST(request: NextRequest) {
  if (!isAuthorizedCustomerPortalRequest(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json() as { phone?: string }
    const phone = toDomesticJpPhone(body.phone ?? '')
    if (!phone || phone.length < 9) {
      return NextResponse.json({ error: 'invalid_phone' }, { status: 400 })
    }

    const { data: directory, error: directoryError } = await sb
      .from('mail_customer_directory')
      .select('phone, cs3_customer_id, name, first_visited_at')
      .eq('phone', phone)
      .maybeSingle()
    if (directoryError) throw directoryError

    const { data: recency, error: recencyError } = await sb
      .from('customer_visit_recency')
      .select('last_visited_at, visit_count')
      .eq('phone', phone)
      .maybeSingle()
    if (recencyError) throw recencyError

    if (!directory?.cs3_customer_id) {
      return NextResponse.json({
        matched: false,
        matched_customer_name: null,
        first_visited_at: directory?.first_visited_at ?? null,
        last_visited_at: recency?.last_visited_at ?? null,
        visit_count: recency?.visit_count ?? 0,
        history: [],
      })
    }

    const { data: history, error: historyError } = await sb
      .from('daily_report_transactions')
      .select(HISTORY_SELECT)
      .eq('customer_id', directory.cs3_customer_id)
      .eq('data_type', '成約')
      .order('used_at', { ascending: false })
      .limit(200)
    if (historyError) throw historyError

    return NextResponse.json({
      matched: true,
      matched_cs3_customer_id: directory.cs3_customer_id,
      matched_customer_name: directory.name ?? null,
      first_visited_at: directory.first_visited_at ?? null,
      last_visited_at: recency?.last_visited_at ?? null,
      visit_count: recency?.visit_count ?? 0,
      history: history ?? [],
    })
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 })
  }
}
