import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  const { data, error } = await sb
    .from('onboarding_submissions')
    .select('id, token, brand, area_id, status, submitted_at, approved_at, staff_id, admin_notes, created_at, normalized_data')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ submissions: data })
}

export async function POST(request: NextRequest) {
  const body = await request.json() as { brand?: string; area_id?: number }
  const { brand, area_id } = body

  if ((brand !== 'M' && brand !== 'E') || !area_id || area_id < 1 || area_id > 4) {
    return NextResponse.json({ error: 'brand(M/E)とarea_id(1-4)は必須です' }, { status: 400 })
  }

  const token = randomBytes(16).toString('hex')

  const { data, error } = await sb
    .from('onboarding_submissions')
    .insert({ token, brand, area_id, status: 'pending_cast' })
    .select('id, token')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ id: data.id, token: data.token })
}
