import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import type { NormalizedOnboardingData } from '@/lib/types'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  const { data, error } = await sb
    .from('onboarding_submissions')
    .select('id, brand, area_id, status, raw_answers')
    .eq('token', token)
    .single()

  if (error || !data) return NextResponse.json({ error: '無効なURLです' }, { status: 404 })
  return NextResponse.json(data)
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  const { data: sub, error: findErr } = await sb
    .from('onboarding_submissions')
    .select('id, status, brand, area_id')
    .eq('token', token)
    .single()

  if (findErr || !sub) return NextResponse.json({ error: '無効なURLです' }, { status: 404 })
  if (sub.status !== 'pending_cast') {
    return NextResponse.json({ error: '既に送信済みです' }, { status: 400 })
  }

  const raw_answers = await request.json() as Record<string, unknown>
  const normalized_data = buildNormalizedData(sub.brand as 'M' | 'E', raw_answers)

  const { error } = await sb
    .from('onboarding_submissions')
    .update({
      raw_answers,
      normalized_data,
      status: 'submitted',
      submitted_at: new Date().toISOString(),
    })
    .eq('id', sub.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

function buildNormalizedData(brand: 'M' | 'E', r: Record<string, unknown>): NormalizedOnboardingData {
  const str = (k: string) => (typeof r[k] === 'string' ? (r[k] as string).trim() : undefined) || undefined
  const nd: NormalizedOnboardingData = {
    stage_name: String(r['stage_name'] ?? '').trim(),
    real_name: str('real_name'),
    join_date: str('join_date'),
    age: str('age'),
    height: str('height'),
    bust: str('bust'),
    bust_cm: str('bust_cm'),
    waist: str('waist'),
    hip: str('hip'),
    zodiac: str('zodiac'),
    blood_type: str('blood_type'),
    ng_area: str('ng_area'),
    ng_options: Array.isArray(r['ng_options']) ? r['ng_options'] as string[] : [],
    contact_method: str('contact_method'),
    request_ok: r['request_ok'] === '可能' ? true : r['request_ok'] === '対応不可' ? false : undefined,
    tattoo: str('tattoo'),
  }
  if (brand === 'M') {
    nd.m_trigger = str('m_trigger')
    nd.m_personality = str('m_personality')
    nd.m_charm = str('m_charm')
    nd.m_preferred_type = str('m_preferred_type')
    nd.m_smoking = str('m_smoking')
    nd.m_stress_relief = str('m_stress_relief')
    nd.m_favorite_word = str('m_favorite_word')
    nd.m_sadist_level = str('m_sadist_level')
    nd.m_favorite_scenario = str('m_favorite_scenario')
    nd.m_favorite_toy = str('m_favorite_toy')
    nd.m_specialty_play = str('m_specialty_play')
    nd.m_challenge_play = str('m_challenge_play')
    nd.m_meaning = str('m_meaning')
    nd.m_message = str('m_message')
  } else {
    nd.e_hobby = str('e_hobby')
    nd.e_personality = str('e_personality')
    nd.e_charm = str('e_charm')
    nd.e_smoking = str('e_smoking')
    nd.e_drinking = str('e_drinking')
    nd.e_favorite_media = str('e_favorite_media')
    nd.e_relationships = str('e_relationships')
    nd.e_exciting_moment = str('e_exciting_moment')
    nd.e_massage_experience = str('e_massage_experience')
    nd.e_specialty_play = str('e_specialty_play')
    nd.e_care = str('e_care')
    nd.e_message = str('e_message')
  }
  return nd
}
