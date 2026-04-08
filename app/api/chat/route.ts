import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { generateText, tool, stepCountIs } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { z } from 'zod'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ─── 店舗設定 ────────────────────────────────────────────────
const STORE_CONFIG: Record<string, { name: string; hpBase: string; storeId: number }> = {
  chiba: {
    name: '千葉快楽M性感倶楽部',
    hpBase: 'https://www.m-kairaku.com/chiba',
    storeId: 2,
  },
  nishifunabashi: {
    name: '西船橋快楽M性感倶楽部',
    hpBase: 'https://www.m-kairaku.com',
    storeId: 3,
  },
  kinshicho: {
    name: '錦糸町快楽M性感倶楽部',
    hpBase: 'https://www.m-kairaku.com/kinshicho',
    storeId: 4,
  },
  narita: {
    name: '成田快楽M性感倶楽部',
    hpBase: 'https://www.m-kairaku.com/narita',
    storeId: 1,
  },
}

const DEFAULT_STORE = 'chiba'
const MAX_USER_MESSAGES = 20

// ─── HP取得関数 ───────────────────────────────────────────────
async function getCastList(hpBase: string) {
  const res = await fetch(`${hpBase}/cast/`, { next: { revalidate: 300 } })
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

  const liPattern = /<li[^>]*data-girlid="(\d+)"[^>]*>([\s\S]*?)<\/li>/g
  let match
  while ((match = liPattern.exec(html)) !== null) {
    const gid = match[1]
    const block = match[2]

    const nameMatch = block.match(/<div[^>]*class="cast_name"[^>]*>([\s\S]*?)<\/div>/)
    if (!nameMatch) continue
    const nameRaw = nameMatch[1].replace(/<[^>]+>/g, '').trim()
    const nameAgeMatch = nameRaw.match(/^(.+?)\((\d+)\)/)
    if (!nameAgeMatch) continue

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
      profile_url: `${hpBase}/profile?gid=${gid}`,
    })
  }

  return castList
}

async function getCastProfile(hpBase: string, gid: string) {
  const res = await fetch(`${hpBase}/profile?gid=${gid}`, { next: { revalidate: 300 } })
  const html = await res.text()

  const stripTags = (s: string) => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()

  const managerMatch = html.match(/店長[からのメッセージ]*[\s\S]*?<[^>]+>([\s\S]*?)<\/(?:div|p|td)>/i)
  const managerComment = managerMatch ? stripTags(managerMatch[1]) : null

  const castMatch = html.match(/キャストより[\s\S]*?<[^>]+>([\s\S]*?)<\/(?:div|p|td)>/i)
  const castComment = castMatch ? stripTags(castMatch[1]) : null

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
    profile_url: `${hpBase}/profile?gid=${gid}`,
    manager_comment: managerComment,
    cast_comment: castComment,
    qa: qaItems.slice(0, 10),
  }
}

async function fetchPageText(url: string): Promise<string> {
  const res = await fetch(url, { next: { revalidate: 3600 } })
  const html = await res.text()
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

async function getSystemInfo(hpBase: string) {
  const text = await fetchPageText(`${hpBase}/system/`)
  const start = text.indexOf('基本システム')
  const end = text.indexOf('PAGE TOP')
  if (start === -1) return text.slice(0, 3000)
  return text.slice(start, end !== -1 ? end : start + 3000).trim()
}

async function getFirstTimerInfo(hpBase: string) {
  const text = await fetchPageText(`${hpBase}/first/`)
  const start = text.indexOf('前立腺を開発し')
  const end = text.indexOf('PAGE TOP')
  if (start === -1) return text.slice(0, 3000)
  return text.slice(start, end !== -1 ? end : start + 3000).trim()
}

// ─── Supabase取得関数 ─────────────────────────────────────────
function formatTime(t: number) {
  const h = Math.floor(t)
  const m = Math.round((t - h) * 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

async function getAvailableStaff(storeId: number, date?: string, time?: number) {
  const targetDate = date ?? new Date().toISOString().slice(0, 10)
  const now = new Date()
  const targetTime = time ?? parseInt(`${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`)

  const { data: shifts } = await supabase
    .from('shifts')
    .select('staff_id, start_time, end_time, staff(name)')
    .eq('date', targetDate)
    .eq('status', 'normal')
    .eq('store_id', storeId)

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
      start_time: formatTime(s.start_time),
      end_time: formatTime(s.end_time),
    }))
}

async function getStaffSchedule(storeId: number, name: string, date?: string) {
  const targetDate = date ?? new Date().toISOString().slice(0, 10)
  const { data: staff } = await supabase.from('staff').select('id, name').ilike('name', `%${name}%`).single()
  if (!staff) return null
  const { data: shifts } = await supabase
    .from('shifts')
    .select('date, start_time, end_time')
    .eq('staff_id', staff.id)
    .eq('date', targetDate)
    .eq('status', 'normal')
    .eq('store_id', storeId)
  return {
    name: staff.name,
    shifts: (shifts ?? []).map(s => ({
      start_time: formatTime(s.start_time),
      end_time: formatTime(s.end_time),
    })),
  }
}

// ─── API Route ────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const storeKey = searchParams.get('store') ?? DEFAULT_STORE
  const store = STORE_CONFIG[storeKey] ?? STORE_CONFIG[DEFAULT_STORE]

  const { messages } = await req.json()

  // 会話長レート制限
  const userMessageCount = (messages as { role: string }[]).filter(m => m.role === 'user').length
  if (userMessageCount > MAX_USER_MESSAGES) {
    return NextResponse.json({ reply: 'ご利用ありがとうございました。お電話またはWEB予約からもご予約いただけます。' })
  }

  const systemPrompt = `あなたは${store.name}のお客様対応アシスタントです。
お客様の好みやご要望に合わせて、最適なキャストをご紹介し、ご利用のご案内をします。
- キャスト情報はget_cast_listツールでHPから取得してください
- 好みを聞いてキャストを絞り込む際は、年齢・身長・スリーサイズ・カップなどで比較してください
- 詳細が必要な場合はget_cast_profileで個別プロフィールを取得してください
- 出勤状況はget_available_staffで確認できます
- 料金・コース・オプション・予約方法についてはget_system_infoで取得してください
- お店の説明・サービス内容・遊び方・初めての方へのご案内はget_first_timer_infoで取得してください
- 敬語で親しみやすくお答えください
- 不確かな情報は答えないでください
今日の日付: ${new Date().toISOString().slice(0, 10)}`

  try {
    const { text } = await generateText({
      model: anthropic('claude-haiku-4.5'),
      system: systemPrompt,
      messages,
      stopWhen: stepCountIs(5),
      tools: {
        get_cast_list: tool({
          description: 'HPからキャスト一覧を取得する。名前・年齢・身長・スリーサイズ・カップサイズが含まれる。好みのタイプを探す際に使用。',
          parameters: z.object({}),
          execute: async (_: Record<string, never>) => getCastList(store.hpBase),
        }),
        get_cast_profile: tool({
          description: '特定キャストの詳細プロフィールをHPから取得する。Q&A・店長コメント・サービス内容が含まれる。',
          parameters: z.object({
            gid: z.string().describe('キャストのgid（get_cast_listで取得）'),
          }),
          execute: async ({ gid }) => getCastProfile(store.hpBase, gid),
        }),
        get_available_staff: tool({
          description: '指定した日付・時間に出勤していて空いているキャストの一覧を取得する',
          parameters: z.object({
            date: z.string().optional().describe('YYYY-MM-DD形式の日付。省略時は今日'),
            time: z.number().optional().describe('HHMM形式の時刻（例: 1800）。省略時は現在時刻'),
          }),
          execute: async ({ date, time }) => getAvailableStaff(store.storeId, date, time),
        }),
        get_staff_schedule: tool({
          description: '特定のキャストの出勤スケジュールを取得する',
          parameters: z.object({
            name: z.string().describe('キャスト名'),
            date: z.string().optional().describe('YYYY-MM-DD形式の日付。省略時は今日'),
          }),
          execute: async ({ name, date }) => getStaffSchedule(store.storeId, name, date),
        }),
        get_system_info: tool({
          description: '料金システム・コース料金・オプション料金・予約方法などをHPから取得する。料金・値段・コースについて質問されたときに使用。',
          parameters: z.object({}),
          execute: async (_: Record<string, never>) => getSystemInfo(store.hpBase),
        }),
        get_first_timer_info: tool({
          description: 'お店の説明・サービス内容・遊び方・無料プレイ一覧をHPから取得する。初めての方への案内や、どんなお店か・何ができるかを説明するときに使用。',
          parameters: z.object({}),
          execute: async (_: Record<string, never>) => getFirstTimerInfo(store.hpBase),
        }),
      },
    })

    return NextResponse.json({ reply: text })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('AI SDK error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
