import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const HP_BASE = 'https://www.m-kairaku.com'

const tools: Anthropic.Tool[] = [
  {
    name: 'get_cast_list',
    description: 'HPからキャスト一覧を取得する。名前・年齢・身長・スリーサイズ・カップサイズが含まれる。好みのタイプを探す際に使用。',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_cast_profile',
    description: '特定キャストの詳細プロフィールをHPから取得する。Q&A・店長コメント・サービス内容が含まれる。',
    input_schema: {
      type: 'object' as const,
      properties: {
        gid: { type: 'string', description: 'キャストのgid（get_cast_listで取得）' },
      },
      required: ['gid'],
    },
  },
  {
    name: 'get_available_staff',
    description: '指定した日付・時間に出勤していて空いているキャストの一覧を取得する',
    input_schema: {
      type: 'object' as const,
      properties: {
        date: { type: 'string', description: 'YYYY-MM-DD形式の日付。省略時は今日' },
        time: { type: 'number', description: 'HHMM形式の時刻（例: 1800）。省略時は現在時刻' },
      },
      required: [],
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

// HPのキャスト一覧を取得・パース
async function getCastList() {
  const res = await fetch(`${HP_BASE}/cast/`, { next: { revalidate: 300 } })
  const html = await res.text()

  const castList: {
    gid: string
    name: string
    age: number | null
    height: number | null
    bust: number | null
    cup: string | null
    waist: number | null
    hip: number | null
    profile_url: string
  }[] = []

  // <li class="cast_thumb_column" data-girlid="XXXXX"> ブロックを抽出
  const liPattern = /<li[^>]*data-girlid="(\d+)"[^>]*>([\s\S]*?)<\/li>/g
  let match
  while ((match = liPattern.exec(html)) !== null) {
    const gid = match[1]
    const block = match[2]

    // <div class="cast_name">名前(年齢)</div>
    const nameMatch = block.match(/<div[^>]*class="cast_name"[^>]*>([\s\S]*?)<\/div>/)
    if (!nameMatch) continue
    const nameRaw = nameMatch[1].replace(/<[^>]+>/g, '').trim()
    const nameAgeMatch = nameRaw.match(/^(.+?)\((\d+)\)/)
    if (!nameAgeMatch) continue

    // <div class="cast_size">T159 B87(D) W58 H87</div>
    const sizeMatch = block.match(/<div[^>]*class="cast_size"[^>]*>([^<]+)<\/div>/)
    const measureMatch = sizeMatch?.[1].match(/T(\d+)\s+B(\d+)\(([A-Z]+)\)\s+W(\d+)\s+H(\d+)/)

    castList.push({
      gid,
      name: nameAgeMatch[1].trim(),
      age: parseInt(nameAgeMatch[2]),
      height: measureMatch ? parseInt(measureMatch[1]) : null,
      bust: measureMatch ? parseInt(measureMatch[2]) : null,
      cup: measureMatch ? measureMatch[3] : null,
      waist: measureMatch ? parseInt(measureMatch[4]) : null,
      hip: measureMatch ? parseInt(measureMatch[5]) : null,
      profile_url: `${HP_BASE}/profile?gid=${gid}`,
    })
  }

  return castList
}

// 特定キャストの詳細プロフィールを取得・パース
async function getCastProfile(gid: string) {
  const res = await fetch(`${HP_BASE}/profile?gid=${gid}`, { next: { revalidate: 300 } })
  const html = await res.text()

  // テキストを抽出するヘルパー
  const stripTags = (s: string) => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()

  // 店長コメント
  const managerMatch = html.match(/店長[からのメッセージ]*[\s\S]*?<[^>]+>([\s\S]*?)<\/(?:div|p|td)>/i)
  const managerComment = managerMatch ? stripTags(managerMatch[1]) : null

  // キャストコメント
  const castMatch = html.match(/キャストより[\s\S]*?<[^>]+>([\s\S]*?)<\/(?:div|p|td)>/i)
  const castComment = castMatch ? stripTags(castMatch[1]) : null

  // Q&Aセクション（星座・血液型・趣味など）
  const qaItems: { question: string; answer: string }[] = []
  const qaPattern = /<(?:th|dt)[^>]*>([\s\S]*?)<\/(?:th|dt)>[\s\S]*?<(?:td|dd)[^>]*>([\s\S]*?)<\/(?:td|dd)>/g
  let qaMatch
  while ((qaMatch = qaPattern.exec(html)) !== null) {
    const q = stripTags(qaMatch[1])
    const a = stripTags(qaMatch[2])
    if (q && a && q.length < 30) qaItems.push({ question: q, answer: a })
  }

  return {
    gid,
    profile_url: `${HP_BASE}/profile?gid=${gid}`,
    manager_comment: managerComment,
    cast_comment: castComment,
    qa: qaItems.slice(0, 10),
  }
}

function formatTime(t: number) {
  const h = Math.floor(t)
  const m = Math.round((t - h) * 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

async function getAvailableStaff(date?: string, time?: number) {
  const targetDate = date ?? new Date().toISOString().slice(0, 10)
  const now = new Date()
  const targetTime = time ?? parseInt(`${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`)

  const { data: shifts } = await supabase
    .from('shifts')
    .select('staff_id, start_time, end_time, store_id, staff(name), stores(name)')
    .eq('date', targetDate)
    .eq('status', 'normal')

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
      name: (s.staff as unknown as { name: string } | null)?.name,
      store: (s.stores as unknown as { name: string } | null)?.name,
      start_time: formatTime(s.start_time),
      end_time: formatTime(s.end_time),
    }))
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

  const systemPrompt = `あなたは西船橋の風俗店「癒し」のお客様対応アシスタントです。
お客様の好みやご要望に合わせて、最適なキャストをご紹介します。
- キャスト情報はget_cast_listツールでHPから取得してください
- 好みを聞いてキャストを絞り込む際は、年齢・身長・スリーサイズ・カップなどで比較してください
- 詳細が必要な場合はget_cast_profileで個別プロフィールを取得してください
- 出勤状況はget_available_staffで確認できます
- 敬語で親しみやすくお答えください
- 料金・コース詳細は「お電話にてご確認ください」と案内してください
- 不確かな情報は答えないでください
今日の日付: ${new Date().toISOString().slice(0, 10)}`

  try {
    let currentMessages = [...messages]

    // ツール呼び出しのループ（最大5回）
    for (let i = 0; i < 5; i++) {
      const response = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: systemPrompt,
        tools,
        messages: currentMessages,
      })

      if (response.stop_reason !== 'tool_use') {
        const text = response.content.find(b => b.type === 'text')
        return NextResponse.json({ reply: (text as Anthropic.TextBlock)?.text ?? '' })
      }

      // ツール実行
      const toolResults: Anthropic.ToolResultBlockParam[] = await Promise.all(
        response.content
          .filter(b => b.type === 'tool_use')
          .map(async block => {
            const b = block as Anthropic.ToolUseBlock
            let result: unknown

            if (b.name === 'get_cast_list') {
              result = await getCastList()
            } else if (b.name === 'get_cast_profile') {
              result = await getCastProfile((b.input as { gid: string }).gid)
            } else if (b.name === 'get_available_staff') {
              const input = b.input as { date?: string; time?: number }
              result = await getAvailableStaff(input.date, input.time)
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
      )

      currentMessages = [
        ...currentMessages,
        { role: 'assistant' as const, content: response.content },
        { role: 'user' as const, content: toolResults },
      ]
    }

    return NextResponse.json({ reply: '申し訳ありません、処理に失敗しました。' })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('Anthropic API error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
