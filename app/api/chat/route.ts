import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const tools: Anthropic.Tool[] = [
  {
    name: 'get_available_staff',
    description: '指定した日付・時間に出勤していて空いているキャストの一覧を取得する',
    input_schema: {
      type: 'object' as const,
      properties: {
        date: { type: 'string', description: 'YYYY-MM-DD形式の日付。省略時は今日' },
        time: { type: 'number', description: 'HHMM形式の時刻（例: 1800）。省略時は現在時刻' },
        store_id: { type: 'number', description: 'エリアID（1:成田, 2:千葉, 3:西船橋, 4:錦糸町）' },
      },
      required: [],
    },
  },
  {
    name: 'search_staff',
    description: 'キャストのプロフィールをキーワードで検索する（体型・年齢・特徴など）',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: '検索キーワード（例: スレンダー、20代）' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_staff_schedule',
    description: '特定のキャストの出勤スケジュールを取得する',
    input_schema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'キャスト名' },
        date: { type: 'string', description: 'YYYY-MM-DD形式の日付。省略時は今日' },
      },
      required: ['name'],
    },
  },
]

function formatTime(t: number) {
  const h = Math.floor(t)
  const m = Math.round((t - h) * 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

async function getAvailableStaff(date?: string, time?: number, storeId?: number) {
  const targetDate = date ?? new Date().toISOString().slice(0, 10)
  const now = new Date()
  const targetTime = time ?? parseInt(`${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`)

  let query = supabase
    .from('shifts')
    .select('staff_id, start_time, end_time, store_id, staff(name, notes), stores(name)')
    .eq('date', targetDate)
    .eq('status', 'normal')

  if (storeId) query = query.eq('store_id', storeId)
  const { data: shifts } = await query
  if (!shifts || shifts.length === 0) return []

  const timeDecimal = Math.floor(targetTime / 100) + (targetTime % 100) / 60
  const onShift = shifts.filter(s => s.start_time <= timeDecimal && s.end_time > timeDecimal)

  const { data: reservations } = await supabase
    .from('reservations')
    .select('staff_id, time, course_duration')
    .eq('date', targetDate)
    .not('staff_id', 'is', null)

  const busyStaffIds = new Set(
    (reservations ?? [])
      .filter(r => {
        if (!r.time || !r.course_duration) return false
        return targetTime >= r.time && targetTime < r.time + r.course_duration
      })
      .map(r => r.staff_id)
  )

  return onShift
    .filter(s => !busyStaffIds.has(s.staff_id))
    .map(s => ({
      name: (s.staff as unknown as { name: string; notes: string } | null)?.name,
      notes: (s.staff as unknown as { name: string; notes: string } | null)?.notes,
      store: (s.stores as unknown as { name: string } | null)?.name,
      start_time: formatTime(s.start_time),
      end_time: formatTime(s.end_time),
    }))
}

async function searchStaff(query: string) {
  const { data } = await supabase
    .from('staff')
    .select('name, notes')
    .ilike('notes', `%${query}%`)
    .limit(10)
  return data ?? []
}

async function getStaffSchedule(name: string, date?: string) {
  const targetDate = date ?? new Date().toISOString().slice(0, 10)
  const { data: staff } = await supabase.from('staff').select('id, name').ilike('name', `%${name}%`).single()
  if (!staff) return null
  const { data: shifts } = await supabase
    .from('shifts')
    .select('date, start_time, end_time, stores(name)')
    .eq('staff_id', staff.id)
    .eq('date', targetDate)
    .eq('status', 'normal')
  return {
    name: staff.name,
    shifts: (shifts ?? []).map(s => ({
      store: (s.stores as unknown as { name: string } | null)?.name,
      start_time: formatTime(s.start_time),
      end_time: formatTime(s.end_time),
    })),
  }
}

export async function POST(req: NextRequest) {
  const { messages } = await req.json()

  const systemPrompt = `あなたはデリバリーヘルスのお客様対応アシスタントです。
お客様の質問に対して、出勤状況やキャストのプロフィールを参照して丁寧にご案内します。
ツールで取得した情報のみを使って回答し、不確かな情報は答えないでください。
敬語で親しみやすくお答えください。料金・コースの詳細は「お電話にてご確認ください」と案内してください。
今日の日付: ${new Date().toISOString().slice(0, 10)}`

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: systemPrompt,
      tools,
      messages,
    })

    if (response.stop_reason === 'tool_use') {
      const toolResults: Anthropic.MessageParam = {
        role: 'user',
        content: await Promise.all(
          response.content
            .filter(b => b.type === 'tool_use')
            .map(async block => {
              const b = block as Anthropic.ToolUseBlock
              let result: unknown

              if (b.name === 'get_available_staff') {
                const input = b.input as { date?: string; time?: number; store_id?: number }
                result = await getAvailableStaff(input.date, input.time, input.store_id)
              } else if (b.name === 'search_staff') {
                result = await searchStaff((b.input as { query: string }).query)
              } else if (b.name === 'get_staff_schedule') {
                const input = b.input as { name: string; date?: string }
                result = await getStaffSchedule(input.name, input.date)
              }

              return {
                type: 'tool_result' as const,
                tool_use_id: b.id,
                content: JSON.stringify(result),
              }
            })
        ),
      }

      const finalResponse = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: systemPrompt,
        tools,
        messages: [...messages, { role: 'assistant', content: response.content }, toolResults],
      })

      const text = finalResponse.content.find(b => b.type === 'text')
      return NextResponse.json({ reply: (text as Anthropic.TextBlock)?.text ?? '' })
    }

    const text = response.content.find(b => b.type === 'text')
    return NextResponse.json({ reply: (text as Anthropic.TextBlock)?.text ?? '' })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('Anthropic API error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
