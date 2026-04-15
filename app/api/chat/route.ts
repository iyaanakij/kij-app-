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

function getNearbyHotels() {
  return [
    { name: 'ホテルパーマン',         recommendation: '★一番人気', note: '清潔感があってリーズナブル。最初の1軒におすすめ' },
    { name: 'ホテルガーネット',        recommendation: '★おすすめ', note: '清潔感あり・コスパ良好' },
    { name: 'ホテルセンチュリー',      recommendation: '★おすすめ', note: '清潔感あり・コスパ良好' },
    { name: 'Nホテル',                recommendation: '高級志向向け', note: '清潔感◎だが料金やや高め' },
    { name: 'ホテルセンチュリーアネックス', recommendation: '中間グレード', note: '料金は中間だが駅から少し遠め' },
    { name: 'ホテルピーコック',        recommendation: '', note: '' },
    { name: 'ビバリーヒルズ',          recommendation: '', note: '' },
  ]
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

// JST時刻を返す（Vercelサーバーは UTC なので +9時間）
function nowJST(): Date {
  return new Date(Date.now() + 9 * 60 * 60 * 1000)
}

async function getAvailableStaff(storeId: number, date?: string, time?: number) {
  const jst = nowJST()
  const targetDate = date ?? jst.toISOString().slice(0, 10)
  const targetTime = time ?? parseInt(
    `${String(jst.getUTCHours()).padStart(2, '0')}${String(jst.getUTCMinutes()).padStart(2, '0')}`
  )

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
        // r.time は HHMM整数、r.course_duration は分 → decimal時間で比較
        const startDecimal = Math.floor(r.time / 100) + (r.time % 100) / 60
        const endDecimal = startDecimal + r.course_duration / 60
        return timeDecimal >= startDecimal && timeDecimal < endDecimal
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
  const targetDate = date ?? nowJST().toISOString().slice(0, 10)
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

  const systemPrompt = `あなたは${store.name}の自動応答アシスタントです。
有人対応・予約確定・空き確認はできません。サービス説明・不安解消・予約方法のご案内を担当します。

【役割】
- サービス内容・プレイ内容の説明
- 初めての方への案内（流れ・雰囲気・よくある不安の解消）
- 料金・コース・オプションの案内
- キャストのタイプ紹介（HPのプロフィール情報をもとに）
- 予約方法・アクセスの案内
- 電話・出勤ページへの誘導

【空き状況・出勤確認について】
空き状況・出勤スケジュールは、リアルタイムで変動するためチャットでは確定案内を行っていません。
- 「今日空いてる子は？」「○○ちゃん今日出てる？」などの質問には、確定案内をせず以下のように誘導してください：
  「最新の空き状況はリアルタイムで変わるため、チャットでの確定案内はご遠慮しております。お急ぎの場合はお電話でご確認ください。ご希望の女性が本日出勤しているかは出勤ページでもご確認いただけます。」
- 絶対に「○○ちゃんは本日出勤しています」「今は空いています」などの断定案内はしないこと

【ツール使用方針】
- get_cast_list / get_cast_profile：キャストのタイプや雰囲気を紹介する際に使用（出勤有無の案内には使わない）
- get_system_info：料金・コース・予約方法の質問に使用
- get_first_timer_info：初めての方への案内・サービス内容の説明に使用

【店舗所在地】
- 千葉店（${store.name}）は千葉市中央区栄町エリアに位置します

【ラブホテル案内】
近隣ラブホテルについて質問された場合は get_nearby_hotels ツールで取得した情報をもとに案内してください。
- 「最新情報はハピホテでご確認ください」と添えること

【注意】
- 敬語で親しみやすくお答えください
- 不確かな情報は答えないでください
- 有人対応・予約確定・空き状況の確定案内はできない旨を丁寧に伝えてください`

  try {
    const { text } = await generateText({
      model: anthropic('claude-haiku-4-5'),
      system: systemPrompt,
      messages,
      stopWhen: stepCountIs(5),
      tools: {
        get_cast_list: tool({
          description: 'HPからキャスト一覧を取得する。名前・年齢・身長・スリーサイズ・カップサイズが含まれる。好みのタイプを探す際に使用。出勤有無の案内には使わない。',
          inputSchema: z.object({}),
          execute: async () => getCastList(store.hpBase),
        }),
        get_cast_profile: tool({
          description: '特定キャストの詳細プロフィールをHPから取得する。Q&A・店長コメント・サービス内容が含まれる。出勤有無の案内には使わない。',
          inputSchema: z.object({
            gid: z.string().describe('キャストのgid（get_cast_listで取得）'),
          }),
          execute: async ({ gid }) => getCastProfile(store.hpBase, gid),
        }),
        get_system_info: tool({
          description: '料金システム・コース料金・オプション料金・予約方法などをHPから取得する。料金・値段・コースについて質問されたときに使用。',
          inputSchema: z.object({}),
          execute: async () => getSystemInfo(store.hpBase),
        }),
        get_first_timer_info: tool({
          description: 'お店の説明・サービス内容・遊び方・無料プレイ一覧をHPから取得する。初めての方への案内や、どんなお店か・何ができるかを説明するときに使用。',
          inputSchema: z.object({}),
          execute: async () => getFirstTimerInfo(store.hpBase),
        }),
        get_nearby_hotels: tool({
          description: '千葉店近隣（千葉市中央区）のラブホテル一覧をハピホテから取得する。千葉店利用時にラブホテルを聞かれたときのみ使用。',
          inputSchema: z.object({}),
          execute: async () => {
            if (storeKey !== 'chiba') return { error: '他店舗ではラブホテル案内に対応していません' }
            return getNearbyHotels()
          },
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
