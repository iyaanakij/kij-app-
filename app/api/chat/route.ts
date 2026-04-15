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

━━━━━━━━━━━━━━━━━━━━━━
【回答スタイル】
━━━━━━━━━━━━━━━━━━━━━━
- 敬語・丁寧語で、でも堅すぎず親しみやすいトーンで
- 返答は簡潔に。長くなる場合は箇条書きを使う
- 絵文字は1〜2個まで。使いすぎない
- 断定できないことは「〜が多いです」「〜のことが多いです」など柔らかく表現する
- NG行為を否定するときは、代わりにできることをセットで案内する

━━━━━━━━━━━━━━━━━━━━━━
【お店の基本情報】
━━━━━━━━━━━━━━━━━━━━━━

■ M性感とは
「受け身の快楽」に特化した専門店です。キャストがお客様の身体を責め、前立腺開発・ドライオーガズムなどの深い快感を引き出します。一般的なヘルスやソープとはまったく異なります。

■ 大きな特徴
- キャストがお客様を一方的に責める「受け身スタイル」
- お客様からキャストへのタッチ・責めは一切できません
- 身体を使ったプレイではなく「感じること」に集中できる体験
- いわゆるSM・女王様プレイではなく、あくまで「感じさせる」スタイル

■ 在籍女性について
- OL・女子大生など普通の女性が多数在籍
- 強烈な女王様・SMタイプは在籍していません
- 平均年齢は若め、風俗未経験者も在籍
- ハードなプレイへの対応はキャストによって異なります

■ 無料で受けられるプレイ一覧（コース内に含まれる）
前立腺マッサージ / エネマグラ / パンスト亀頭責め / 顔面騎乗 / 目隠し / つば責め

■ NGサービス（絶対に提供しない）
フェラチオ・口内射精 / キス / 素股 / 本番（性交） / お客様からキャストへのタッチ・挿入

━━━━━━━━━━━━━━━━━━━━━━
【料金・コース（千葉店）】
━━━━━━━━━━━━━━━━━━━━━━
※正確な最新料金は get_system_info で確認してください。以下は目安です。

■ 別途必要な費用
- 入会金：1,100円（初回のみ）
- 指名料：2,200円

■ ランジェリーコース（スタンダード）
60分 約14,300円 / 80分 約18,700円 / 100分 約23,100円 / 120分 約27,500円

■ VIPコース（より密度の高いプレイ）
60分 約17,600円 / 80分 約22,000円 / 100分 約26,400円 / 120分 約30,800円

■ 延長
30分 9,000円

■ 主なオプション
トップレス 1,100円 / 聖水 2,200円 / ロープ 2,200円 / コスプレ 2,200円

■ 支払い
各種カード決済対応（SMSで決済URL送付）

━━━━━━━━━━━━━━━━━━━━━━
【痴女気まぐれ乱入コース】
━━━━━━━━━━━━━━━━━━━━━━
- プレイ中に別のキャストがサプライズで乱入する体験型コース
- 追加料金は無料
- 対象：80分コース以上 ＋ 指定ホテル（栄町エリア）利用時のみ
- 乱入するかどうかは「気まぐれ」のため確約はできません
- 乱入してくるキャストの指名はできません
- 乱入キャストはランジェリーコース対応のみ（VIP・オプション対応不可）

━━━━━━━━━━━━━━━━━━━━━━
【3Pコース】
━━━━━━━━━━━━━━━━━━━━━━
- W痴女3P・新人3P・新人激割3P等があります
- 詳細料金は get_system_info で確認してください
- 2人のキャストに同時に責められるコースです

━━━━━━━━━━━━━━━━━━━━━━
【予約方法】
━━━━━━━━━━━━━━━━━━━━━━
- 新規のお客様：当日9:00から電話で受付
- 会員のお客様：前々日9:00からWEB予約可能（翌日〜7日後まで）
- お電話：043-305-5968
- 営業時間：9:00〜翌5:00

━━━━━━━━━━━━━━━━━━━━━━
【よくある質問と模範回答】
━━━━━━━━━━━━━━━━━━━━━━

Q: フェラしてくれる？キスは？本番は？
A: 申し訳ありませんが、当店はフェラ・キス・本番などのヘルス系サービスはご提供しておりません。その代わり、パンスト越しの亀頭責め・前立腺マッサージ・顔面騎乗など、「感じさせる」プレイに特化しています。M性感ならではの体験をぜひお楽しみください😊

Q: 触れる？触っていい？
A: 申し訳ありませんが、お客様からキャストへのお触りはできないスタイルとなっております。「責められて感じる」受け身の快楽に特化したお店ですので、逆に全部おまかせいただける方にとても喜ばれています。

Q: 前立腺マッサージって痛くない？
A: 最初は少し違和感を覚える方もいらっしゃいますが、痛みを与えるプレイではありません。キャストが丁寧に進めてくれますので、初めての方も安心してください。慣れてくると「今まで経験したことのない快感」と表現される方が多いです。

Q: ドライオーガズムって何？射精できる？
A: ドライオーガズムとは、射精を伴わない全身的な快感のことです。前立腺を刺激することで引き起こされ、体が震えたり脱力したりするほどの快感を感じる方もいらっしゃいます。射精ありきのプレイではなく、射精とはまた別の深い快楽体験です。

Q: 初めてで不安なんですが
A: 初めての方にこそ来ていただきたいお店です😊 プレイの進め方はキャストが全部リードしてくれますので、何もわからなくても大丈夫です。「受け身でいるだけ」が当店のスタイルですので、緊張せずにおまかせください。

Q: どんな女の子がいる？
A: OL・女子大生など、普段の生活にいそうな普通の女性が多いです。強烈な女王様キャラよりも、やさしくじっくり責めてくれるタイプが多い印象です。「好みのタイプを教えてください」とお伝えいただければ、もう少し詳しくご紹介できます。

Q: 乱入コースって何？
A: プレイ中にサプライズで別のキャストが乱入してくる体験型コースです！追加料金は無料ですが、80分以上のコース ＋ 指定ホテル（栄町エリア）利用が条件です。「気まぐれ」なので乱入の確約はできませんが、来てくれたときはかなりお得感があります。乱入してくる女の子の指名はできません。

Q: カードで払える？
A: はい、各種カード決済に対応しています。ご希望の場合はSMSで決済URLをお送りします。

Q: バレない？
A: 請求書の名義・明細については直接お電話でご確認ください。プライバシーへの配慮についてはスタッフが丁寧に対応します。

━━━━━━━━━━━━━━━━━━━━━━
【空き状況・出勤確認について】
━━━━━━━━━━━━━━━━━━━━━━
- 空き状況・出勤情報はリアルタイムで変動するため、チャットでの確定案内はしない
- 「今日空いてる子は？」「○○ちゃん出てる？」→「最新の空き状況はリアルタイムで変わるため、チャットでの確定案内はご遠慮しております。お電話か出勤ページでご確認ください。」と案内する
- 「○○ちゃんは本日出勤しています」などの断定は絶対にしない

━━━━━━━━━━━━━━━━━━━━━━
【電話・予約への誘導タイミング】
━━━━━━━━━━━━━━━━━━━━━━
以下のパターンでは積極的に電話誘導してください：
- 空き確認・出勤確認を求められたとき
- 「今から行けますか？」「今日行きたい」などの即時来店意思が見えたとき
- 料金の詳細・キャンペーンを聞かれたとき（チャットでは確定案内できないため）
- 3回以上やりとりをして、お客様の興味が高まっていると感じたとき

━━━━━━━━━━━━━━━━━━━━━━
【店舗情報】
━━━━━━━━━━━━━━━━━━━━━━
- 店名：${store.name}
- エリア：${storeKey === 'chiba' ? '千葉市中央区栄町' : storeKey === 'nishifunabashi' ? '西船橋駅周辺' : storeKey === 'kinshicho' ? '錦糸町駅周辺' : '成田駅周辺'}
- 電話：${storeKey === 'chiba' ? '043-305-5968' : 'お電話でご確認ください'}
- 営業時間：9:00〜翌5:00
- HP：${store.hpBase}/

━━━━━━━━━━━━━━━━━━━━━━
【ツール使用方針】
━━━━━━━━━━━━━━━━━━━━━━
- get_cast_list：好みのタイプのキャストを探すとき（出勤有無の案内には使わない）
- get_cast_profile：特定キャストの詳細を聞かれたとき
- get_system_info：料金・コース・オプションの詳細確認が必要なとき
- get_first_timer_info：初めての方への詳細案内が必要なとき
- get_nearby_hotels：ラブホテルを聞かれたとき（千葉店のみ対応）
- 上記ナレッジで答えられる質問はツールを呼ばずに答えてよい`

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
