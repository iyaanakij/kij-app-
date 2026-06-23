import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const staffId = parseInt(id, 10)
  if (isNaN(staffId)) return NextResponse.json({ error: 'invalid id' }, { status: 400 })

  const { data: subs, error } = await sb
    .from('onboarding_submissions')
    .select('id, brand, area_id, status, normalized_data')
    .eq('staff_id', staffId)
    .eq('status', 'approved')
    .order('id')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (!subs || subs.length === 0) return NextResponse.json({ submissions: [] })

  const subIds = subs.map(s => s.id)
  const { data: jobs } = await sb
    .from('onboarding_jobs')
    .select('submission_id, job_type, status')
    .in('submission_id', subIds)
    .in('job_type', ['create_cp4_profile', 'create_venrey_cast'])

  const jobMap = new Map<number, Array<{ job_type: string; status: string }>>()
  for (const j of jobs ?? []) {
    const arr = jobMap.get(j.submission_id) ?? []
    arr.push({ job_type: j.job_type, status: j.status })
    jobMap.set(j.submission_id, arr)
  }

  const submissions = subs.map(s => ({
    id: s.id,
    brand: s.brand,
    area_id: s.area_id,
    jobs: jobMap.get(s.id) ?? [],
  }))

  return NextResponse.json({ submissions })
}
