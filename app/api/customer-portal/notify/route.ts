// 顧客向けマイページアプリからのスタッフ通知転送API（例: 予約リクエスト受信）。
// 通知先は CUSTOMER_PORTAL_NOTIFY_LINE_USER_IDS（カンマ区切りのLINE user id、複数可）。
import { NextRequest, NextResponse } from 'next/server'
import { sendLineMessage } from '@/lib/line'
import { isAuthorizedCustomerPortalRequest } from '@/lib/customerPortalAuth'
import { errorMessage } from '@/lib/errors'

export async function POST(request: NextRequest) {
  if (!isAuthorizedCustomerPortalRequest(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json() as { type?: string; message?: string }
    const message = body.message?.trim()
    if (!message) {
      return NextResponse.json({ error: 'missing_message' }, { status: 400 })
    }

    const targets = (process.env.CUSTOMER_PORTAL_NOTIFY_LINE_USER_IDS ?? '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)

    if (targets.length === 0) {
      return NextResponse.json({ success: false, reason: 'no_notify_targets' })
    }

    const results = await Promise.all(targets.map(id => sendLineMessage(id, message)))
    return NextResponse.json({ success: results.some(Boolean), sent: results.filter(Boolean).length })
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 })
  }
}
