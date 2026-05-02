import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json(
    { error: 'HP公式スクレイプ方式のシフト同期は廃止済みです。CS3承認シフト同期を使用してください。' },
    { status: 410 }
  )
}
