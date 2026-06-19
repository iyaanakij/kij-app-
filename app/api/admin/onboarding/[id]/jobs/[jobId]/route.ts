import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// PATCH /api/admin/onboarding/[id]/jobs/[jobId]
// body: { action: 'retry' | 'skip' }
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; jobId: string }> }
) {
  const { jobId } = await params
  const { action } = await request.json() as { action: 'retry' | 'skip' }

  if (!['retry', 'skip'].includes(action)) {
    return NextResponse.json({ error: 'action must be retry or skip' }, { status: 400 })
  }

  const newStatus = action === 'retry' ? 'pending' : 'skipped'

  const { error } = await sb.from('onboarding_jobs').update({
    status: newStatus,
    error_message: null,
    updated_at: new Date().toISOString(),
  }).eq('id', jobId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, status: newStatus })
}
