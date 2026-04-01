import { NextRequest, NextResponse } from 'next/server'
import { runShiftSync } from '@/app/api/shift-sync/route'

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const results = await runShiftSync()
    console.log('シフト自動同期完了:', JSON.stringify(results))
    return NextResponse.json({ success: true, results })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('シフト自動同期エラー:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
