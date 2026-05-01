import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json({
    success: true,
    disabled: true,
    message: 'HP同期は廃止済みです。シフト表示対象はCS3在籍一覧で管理します。',
    perStore: {},
  })
}
