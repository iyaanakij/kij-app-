import { NextRequest, NextResponse } from 'next/server'
import { generateText, tool, stepCountIs } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { unstable_cache } from 'next/cache'
import { z } from 'zod'
import { lookupSheetOptions } from '@/lib/cast-sheet-data'

// ─── 型定義 ──────────────────────────────────────────────────
type StoreKey = 'chiba' | 'nishifunabashi' | 'kinshicho' | 'narita'

type CastEntry = {
  gid: string; name: string; age: number | null
  height: number | null; bust: number | null; cup: string | null
  waist: number | null; hip: number | null
  profile_url: string; image_url: string | null
}

type CastOptions = {
  vip: boolean | null; holyWater: boolean | null; rope: boolean | null
  topless: boolean | null; stockings: boolean | null
  mixedBath: boolean | null; privateCosplay: boolean | null
}

type CastSearchDoc = {
  gid: string; store: StoreKey; name: string; age: number | null
  height: number | null; bust: number | null; cup: string | null
  waist: number | null; hip: number | null
  profileUrl: string; imageUrl: string | null
  managerComment: string; castComment: string; searchableText: string
  categoryTags: string[]
  reasons: string[]
  options: CastOptions
}

// ─── 店舗設定 ────────────────────────────────────────────────
const STORE_CONFIG: Record<string, { name: string; hpBase: string; area: string; phone: string }> = {
  chiba:          { name: '千葉快楽M性感倶楽部',   hpBase: 'https://www.m-kairaku.com/chiba',     area: '千葉市中央区栄町', phone: '043-305-5968' },
  nishifunabashi: { name: '西船橋快楽M性感倶楽部', hpBase: 'https://www.m-kairaku.com',           area: '西船橋駅周辺',     phone: '047-404-7396' },
  kinshicho:      { name: '錦糸町快楽M性感倶楽部', hpBase: 'https://www.m-kairaku.com/kinshicho', area: '錦糸町駅周辺',     phone: '03-6659-2835' },
  narita:         { name: '成田快楽M性感倶楽部',   hpBase: 'https://www.m-kairaku.com/narita',    area: '成田駅周辺',       phone: '0476-29-5573' },
}

const DEFAULT_STORE = 'chiba'
const MAX_USER_MESSAGES = 20

// ─── 検索定数 ────────────────────────────────────────────────
const CATEGORY_DICT: Record<string, string[]> = {
  cute:      ['可愛い', 'かわいい', '愛嬌', '笑顔', '明るい', '小柄', '妹', 'キュート'],
  beautiful: ['綺麗', '美人', '上品', '大人っぽい', '落ち着い', '洗練', '清潔感'],
  clean:     ['清楚', '癒し', '優しい', '穏やか', 'やわらか', 'ふんわり'],
  sexy:      ['色気', '艶', '妖艶', '濃厚', 'しっとり', 'セクシー'],
  beginner:  ['初心者', '初めて', '優しい', '丁寧', '安心', 'オールラウンダー', '気さく'],
}

const OPTION_KEYWORDS: Record<keyof CastOptions, string[]> = {
  vip:            ['VIP', 'ビップ'],
  holyWater:      ['聖水'],
  rope:           ['ロープ'],
  topless:        ['トップレス'],
  stockings:      ['パンスト', 'ストッキング'],
  mixedBath:      ['混浴', '入浴'],
  privateCosplay: ['コスプレ'],
}

const NEGATION = /[×✕✗]|NG|不可|なし|対応外/

// ─── HP取得関数 ───────────────────────────────────────────────
async function getCastList(hpBase: string): Promise<CastEntry[]> {
  const res = await fetch(`${hpBase}/cast/`, { next: { revalidate: 300 } })
  const html = await res.text()
  const castList: CastEntry[] = []

  const parseSize = (text: string) =>
    text.match(/T(\d+)\s+B(\d+)\(([A-Z]+)\)\s+W(\d+)\s+H(\d+)/)

  // 形式A: <li data-girlid="NNN">（西船橋・千葉・錦糸町）
  const liPattern = /<li[^>]*data-girlid="(\d+)"[^>]*>([\s\S]*?)<\/li>/g
  let m
  while ((m = liPattern.exec(html)) !== null) {
    const gid = m[1]; const block = m[2]
    const nameMatch = block.match(/<div[^>]*class="cast_name"[^>]*>([\s\S]*?)<\/div>/)
    if (!nameMatch) continue
    const nameRaw = nameMatch[1].replace(/<[^>]+>/g, '').trim()
    const na = nameRaw.match(/^(.+?)\((\d+)\)/)
    if (!na) continue
    const sizeMatch = block.match(/<div[^>]*class="cast_size"[^>]*>([^<]+)<\/div>/)
    const ms = sizeMatch ? parseSize(sizeMatch[1]) : null
    const imgMatch = block.match(/<img[^>]*src="([^"]+)"/)
    castList.push({
      gid, name: na[1].trim(), age: parseInt(na[2]),
      height: ms ? parseInt(ms[1]) : null, bust: ms ? parseInt(ms[2]) : null,
      cup: ms ? ms[3] : null, waist: ms ? parseInt(ms[4]) : null, hip: ms ? parseInt(ms[5]) : null,
      profile_url: `${hpBase}/profile?gid=${gid}`,
      image_url: imgMatch ? `https:${imgMatch[1]}` : null,
    })
  }

  // 形式B: <a href="...profile?gid=NNNNN">（成田・一部店舗）
  if (castList.length === 0) {
    const aPattern = /href="[^"]*profile\?gid=(\d+)"[^>]*>([\s\S]*?)<\/a>/g
    while ((m = aPattern.exec(html)) !== null) {
      const gid = m[1]; const block = m[2]
      const nameMatch = block.match(/<div[^>]*class="cast_name"[^>]*>([\s\S]*?)<\/div>/)
      if (!nameMatch) continue
      const nameRaw = nameMatch[1].replace(/<[^>]+>/g, '').trim()
      const na = nameRaw.match(/^(.+?)\((\d+)\)/)
      if (!na) continue
      const sizeMatch = block.match(/<div[^>]*class="cast_size"[^>]*>([^<]+)<\/div>/)
      const ms = sizeMatch ? parseSize(sizeMatch[1]) : null
      const imgMatch = block.match(/<img[^>]*src="([^"]+)"/)
      castList.push({
        gid, name: na[1].trim(), age: parseInt(na[2]),
        height: ms ? parseInt(ms[1]) : null, bust: ms ? parseInt(ms[2]) : null,
        cup: ms ? ms[3] : null, waist: ms ? parseInt(ms[4]) : null, hip: ms ? parseInt(ms[5]) : null,
        profile_url: `${hpBase}/profile?gid=${gid}`,
        image_url: imgMatch ? `https:${imgMatch[1]}` : null,
      })
    }
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

  // option_check_left / option_check_right div からオプション可否を抽出（最優先）
  const optionTable: Partial<CastOptions> = {}
  const optPattern = /option_check_left[^>]*>([\s\S]*?)<\/div>[\s\S]*?option_check_right[^>]*>([\s\S]*?)<\/div>/g
  let optMatch
  while ((optMatch = optPattern.exec(html)) !== null) {
    const label = optMatch[1].replace(/<[^>]+>/g, '').trim()
    const val   = optMatch[2].replace(/<[^>]+>/g, '').trim()
    const bool  = /[○◎]/.test(val) ? true : /[×✗]/.test(val) ? false : null
    if (bool === null) continue
    if (/ロープ/.test(label))                           optionTable.rope           = bool
    else if (/トップレス/.test(label))                  optionTable.topless        = bool
    else if (/混浴/.test(label))                        optionTable.mixedBath      = bool
    else if (/聖水/.test(label))                        optionTable.holyWater      = bool
    else if (/パンスト|ストッキング/.test(label))        optionTable.stockings      = bool
    else if (/私物コスプレ/.test(label))                optionTable.privateCosplay = bool
    else if (/^VIP$|VIPコース/.test(label))             optionTable.vip            = bool
  }

  return {
    gid,
    profile_url: `${hpBase}/profile?gid=${gid}`,
    manager_comment: managerComment,
    cast_comment: castComment,
    qa: qaItems.slice(0, 15),
    option_table: optionTable,
  }
}

// ─── オプション抽出（ソース優先順位付き）────────────────────
function extractOptions(
  qa: { question: string; answer: string }[],
  managerComment: string,
  castComment: string,
): CastOptions {
  function checkOption(keywords: string[]): boolean | null {
    // Priority 1: Q&AのquestionにKW → answerが正解ソース
    for (const { question, answer } of qa) {
      for (const kw of keywords) {
        if (question.includes(kw)) {
          return !NEGATION.test(answer)
        }
      }
    }
    // Priority 2: Q&A answerのみ → false検出のみ（true は返さない）
    for (const { answer } of qa) {
      for (const kw of keywords) {
        const idx = answer.indexOf(kw)
        if (idx === -1) continue
        const after = answer.slice(idx + kw.length, idx + kw.length + 15)
        if (NEGATION.test(after)) return false
      }
    }
    // Priority 3: 自由文（コメント）→ false検出のみ
    for (const text of [managerComment, castComment]) {
      for (const kw of keywords) {
        const idx = text.indexOf(kw)
        if (idx === -1) continue
        const after = text.slice(idx + kw.length, idx + kw.length + 15)
        if (NEGATION.test(after)) return false
      }
    }
    return null  // 言及なし = 不明
  }

  return {
    vip:            checkOption(OPTION_KEYWORDS.vip),
    holyWater:      checkOption(OPTION_KEYWORDS.holyWater),
    rope:           checkOption(OPTION_KEYWORDS.rope),
    topless:        checkOption(OPTION_KEYWORDS.topless),
    stockings:      checkOption(OPTION_KEYWORDS.stockings),
    mixedBath:      checkOption(OPTION_KEYWORDS.mixedBath),
    privateCosplay: checkOption(OPTION_KEYWORDS.privateCosplay),
  }
}

// 優先順位: シートマスタ > HP option_table（div構造）> Q&A fallback
// シートにある項目(rope/holyWater/privateCosplay)はシート値を最優先。
// シートにない項目(vip/topless/stockings/mixedBath)はHP div→Q&Aで補完。
function mergeOptions(
  sheet: { holyWater: boolean | null; rope: boolean | null; privateCosplay: boolean | null },
  table: Partial<CastOptions>,
  fallback: CastOptions,
): CastOptions {
  return {
    vip:            table.vip            ?? fallback.vip,
    holyWater:      sheet.holyWater      ?? table.holyWater      ?? fallback.holyWater,
    rope:           sheet.rope           ?? table.rope           ?? fallback.rope,
    topless:        table.topless        ?? fallback.topless,
    stockings:      table.stockings      ?? fallback.stockings,
    mixedBath:      table.mixedBath      ?? fallback.mixedBath,
    privateCosplay: sheet.privateCosplay ?? table.privateCosplay ?? fallback.privateCosplay,
  }
}

// ─── タグ・理由抽出 ──────────────────────────────────────────
function extractTags(searchableText: string): string[] {
  return Object.entries(CATEGORY_DICT)
    .filter(([, keywords]) => keywords.some(kw => searchableText.includes(kw)))
    .map(([category]) => category)
}

function extractReasons(searchableText: string): string[] {
  return [...new Set(
    Object.values(CATEGORY_DICT).flat().filter(kw => searchableText.includes(kw))
  )]
}

// ─── 検索ドキュメント構築 ────────────────────────────────────
async function buildSearchDoc(cast: CastEntry, store: StoreKey): Promise<CastSearchDoc> {
  const hpBase = STORE_CONFIG[store].hpBase
  const profile = await getCastProfile(hpBase, cast.gid)
  const managerComment = profile.manager_comment ?? ''
  const castComment = profile.cast_comment ?? ''
  const searchableText = [
    managerComment,
    castComment,
    ...profile.qa.map(q => `${q.question} ${q.answer}`),
  ].join(' ')

  return {
    gid: cast.gid,
    store,
    name: cast.name,
    age: cast.age,
    height: cast.height,
    bust: cast.bust,
    cup: cast.cup,
    waist: cast.waist,
    hip: cast.hip,
    profileUrl: cast.profile_url,
    imageUrl: cast.image_url,
    managerComment,
    castComment,
    searchableText,
    categoryTags: extractTags(searchableText),
    reasons: extractReasons(searchableText),
    // シートマスタ > HP div(option_table) > Q&A の優先順でオプションを確定
    options: mergeOptions(
      lookupSheetOptions(store, cast.name),
      profile.option_table,
      extractOptions(profile.qa, managerComment, castComment),
    ),
  }
}

// ─── キャストインデックス（unstable_cache 30分） ─────────────
const buildCastIndex = unstable_cache(
  async (store: StoreKey): Promise<CastSearchDoc[]> => {
    const hpBase = STORE_CONFIG[store].hpBase
    const casts = await getCastList(hpBase)
    const results = await Promise.allSettled(
      casts.map(cast => buildSearchDoc(cast, store))
    )
    return results.flatMap(r => r.status === 'fulfilled' ? [r.value] : [])
  },
  ['cast-index-v3'],
  { revalidate: 1800 }
)

// ─── 検索ロジック ────────────────────────────────────────────
function resolveQuery(query: string): { keywords: string[]; requiredOptions: Partial<CastOptions> } {
  // キャスト固有スキル系オプション（search_cast_profiles で候補を探す）
  if (/聖水|尿|おしっこ/.test(query))         return { keywords: [], requiredOptions: { holyWater: true } }
  if (/パンスト|ストッキング/.test(query))    return { keywords: [], requiredOptions: { stockings: true } }
  // 制度系オプション（system-first）: まず制度説明し、明示候補があれば補足として提示
  if (/ロープ/.test(query))                   return { keywords: [], requiredOptions: { rope: true } }
  if (/トップレス/.test(query))               return { keywords: [], requiredOptions: { topless: true } }
  if (/混浴/.test(query))                     return { keywords: [], requiredOptions: { mixedBath: true } }
  // カテゴリ指定
  if (/可愛い|かわいい|カワイイ|妹|小柄|愛嬌/.test(query))   return { keywords: CATEGORY_DICT.cute,     requiredOptions: {} }
  if (/綺麗|美人|上品|大人っぽい|エレガント/.test(query))     return { keywords: CATEGORY_DICT.beautiful, requiredOptions: {} }
  if (/清楚|癒し|穏やか|やさし/.test(query))                 return { keywords: CATEGORY_DICT.clean,     requiredOptions: {} }
  if (/色気|セクシー|艶|妖艶/.test(query))                   return { keywords: CATEGORY_DICT.sexy,      requiredOptions: {} }
  if (/おすすめ|初心者|初めて|人気/.test(query))             return { keywords: CATEGORY_DICT.beginner,  requiredOptions: {} }
  // フォールバック: queryをそのままキーワードに
  return {
    keywords: query.split(/[、,\s]+/).map(k => k.trim()).filter(Boolean).slice(0, 5),
    requiredOptions: {},
  }
}

function simpleHash(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

function scoreDoc(doc: CastSearchDoc, keywords: string[]): number {
  if (keywords.length === 0) return 0
  let score = 0
  for (const kw of keywords) {
    if (doc.managerComment.includes(kw)) score += 2
    if (doc.castComment.includes(kw))    score += 2
    if (doc.searchableText.includes(kw)) score += 1
  }
  return score
}

async function searchCastProfiles(storeKey: string, query: string, limit = 5) {
  const store = (Object.keys(STORE_CONFIG).includes(storeKey) ? storeKey : DEFAULT_STORE) as StoreKey
  const docs = await buildCastIndex(store)
  const { keywords, requiredOptions } = resolveQuery(query)

  // オプション条件フィルタ（false=非対応明記のみ除外、null=不明は通過）
  const filtered = docs.filter(doc =>
    Object.entries(requiredOptions).every(([k, v]) => {
      if (v !== true) return true
      return doc.options[k as keyof CastOptions] === true
    })
  )

  // スコアリング（keywords=[]のオプション専用クエリは全員0点でシャッフルへ）
  const scored = filtered
    .map(doc => ({ doc, score: scoreDoc(doc, keywords) }))
    .filter(x => keywords.length === 0 || x.score > 0)

  if (scored.length === 0) {
    return { candidates: [], message: 'プロフィール上で条件に合うキャストが見つかりませんでした。HPのキャスト一覧または出勤ページでご確認ください。' }
  }

  // スコア降順 + 同点帯は日替わりシードでシャッフル
  const dateStr = new Date().toISOString().slice(0, 10)
  const seedNum = simpleHash(`${dateStr}-${query}`)
  const sorted = [...scored]
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      return simpleHash(a.doc.gid + seedNum) - simpleHash(b.doc.gid + seedNum)
    })
    .slice(0, limit)
    .map(x => x.doc)

  return {
    candidates: sorted.map(doc => ({
      name: doc.name,
      age: doc.age,
      height: doc.height,
      profileUrl: doc.profileUrl,
    })),
  }
}

// ─── その他取得関数 ───────────────────────────────────────────
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
    { name: 'ホテルパーマン',             recommendation: '★一番人気', note: '清潔感があってリーズナブル。最初の1軒におすすめ' },
    { name: 'ホテルガーネット',            recommendation: '★おすすめ', note: '清潔感あり・コスパ良好' },
    { name: 'ホテルセンチュリー',          recommendation: '★おすすめ', note: '清潔感あり・コスパ良好' },
    { name: 'Nホテル',                    recommendation: '高級志向向け', note: '清潔感◎だが料金やや高め' },
    { name: 'ホテルセンチュリーアネックス', recommendation: '中間グレード', note: '料金は中間だが駅から少し遠め' },
    { name: 'ホテルピーコック',            recommendation: '', note: '' },
    { name: 'ビバリーヒルズ',              recommendation: '', note: '' },
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

// ─── API Route ────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const storeKey = searchParams.get('store') ?? DEFAULT_STORE
  const store = STORE_CONFIG[storeKey] ?? STORE_CONFIG[DEFAULT_STORE]

  const { messages: rawMessages } = await req.json()

  const userMessageCount = (rawMessages as { role: string }[]).filter(m => m.role === 'user').length
  if (userMessageCount > MAX_USER_MESSAGES) {
    return NextResponse.json({ reply: 'ご利用ありがとうございました。お電話またはWEB予約からもご予約いただけます。' })
  }

  // 直近10件のみ送信（古い履歴を切り捨ててトークン節約）
  const HISTORY_LIMIT = 10
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const messages = (rawMessages as any[]).slice(-HISTORY_LIMIT)

  const systemPrompt = `あなたは${store.name}の自動応答AIです。予約確定・空き確認・有人対応は不可。サービス案内・不安解消を担当します。敬語で親しみやすく、簡潔に。絵文字は1〜2個まで。

【M性感とは】キャストがお客様を一方的に責める「受け身の快楽」専門店。前立腺・エネマグラ・パンスト責め・顔面騎乗・目隠し・つば責めがコースに含まれる。お客様からキャストへのタッチ・責めは一切不可。SM・女王様スタイルとは異なる。

【NGサービス】フェラ / キス / 素股 / 本番 / お客様からのタッチ・挿入（提供不可と案内し、代わりにできることをセットで案内）

【料金目安（${store.name}）】
・入会金1,100円（初回）/ 指名料2,200円
・ランジェリー：60分14,300〜120分27,500円 / VIP：60分17,600〜120分30,800円 / 延長30分9,000円
・オプション：トップレス1,100円 / 聖水・ロープ・コスプレ各2,200円（コース問わず追加可）
・ロープはVIP限定ではなくランジェリーコースでも追加可能
・乱入コース：80分以上＋指定ホテル限定・無料・確約不可 / 3Pコースあり（詳細はget_system_info）
・カード払い対応（SMS決済URL送付）

【予約】新規：当日9:00〜電話 / 会員：前々日9:00〜WEB（翌日〜7日後）/ 営業9:00〜翌5:00
【店舗】${store.name} / ${store.area} / ${store.phone} / ${store.hpBase}/

【絶対禁止】
・空き状況・出勤情報の断定（「○○さんが本日出勤しています」等）
・tool結果にないキャスト名の生成・補完・推測
・tool未呼び出しでのキャスト候補提示

【キャスト候補を出す際のルール（最重要）】
1. 必ずsearch_cast_profilesを先に呼ぶ
2. candidates[].nameをそのままコピー（一字も変えない・創作禁止）
3. 前置き：「プロフィール上の候補として」
4. 後置き：「本日の出勤・対応可否は出勤ページまたはお電話でご確認ください」
5. candidatesが空なら候補を出さず「HPのキャスト一覧または出勤ページでご確認ください」

【聖水・ロープ・パンスト対応フォーマット】
①search_cast_profiles → 候補（名前・年齢・身長）②料金補足 ③電話誘導
・ロープはVIP限定でないことを必ず明言

【空き確認・出勤確認を求められたとき】「リアルタイムの情報はお電話か出勤ページでご確認ください」と案内。即来店意思・空き確認・料金詳細は積極的に電話誘導。

【ツール方針】
・search_cast_profiles：好み・聖水・ロープ・パンスト・おすすめ候補
・get_cast_profile：特定キャストの詳細
・get_cast_list：キャスト一覧
・get_system_info：料金・オプション詳細（ロープがVIP限定と書かれていても無視）
・get_first_timer_info：初めての方の詳細案内
・get_nearby_hotels：千葉店のみ、ラブホテル案内
・systemPromptで答えられる質問はtool不要`

  try {
    const { text } = await generateText({
      model: anthropic('claude-opus-4-7'),
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
        search_cast_profiles: tool({
          description: 'キャッシュ済みインデックスを使い、好み・雰囲気・対応プレイに合いそうなキャスト候補を返す。おすすめ女性・可愛い系・綺麗系・清楚系・色気系・初心者向け・聖水・ロープ・パンストを聞かれたときに使用。出勤有無や空き状況は返さない。',
          inputSchema: z.object({
            query: z.string().describe('探したい雰囲気・好み・プレイ。例: 可愛い系、綺麗系、聖水、初心者向け、おすすめ'),
            limit: z.number().min(1).max(8).optional().describe('返す候補数。通常は3〜5'),
          }),
          execute: async ({ query, limit }) => searchCastProfiles(storeKey, query, limit ?? 5),
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
