import { NextRequest, NextResponse } from 'next/server'
import { generateText, tool, stepCountIs } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { unstable_cache } from 'next/cache'
import { z } from 'zod'

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

  return {
    gid,
    profile_url: `${hpBase}/profile?gid=${gid}`,
    manager_comment: managerComment,
    cast_comment: castComment,
    qa: qaItems.slice(0, 15),
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
    options: extractOptions(profile.qa, managerComment, castComment),
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
  ['cast-index-v2'],
  { revalidate: 1800 }
)

// ─── 検索ロジック ────────────────────────────────────────────
function resolveQuery(query: string): { keywords: string[]; requiredOptions: Partial<CastOptions> } {
  // オプション指定
  if (/聖水|尿|おしっこ/.test(query))         return { keywords: [], requiredOptions: { holyWater: true } }
  if (/ロープ/.test(query))                   return { keywords: [], requiredOptions: { rope: true } }
  if (/トップレス/.test(query))               return { keywords: [], requiredOptions: { topless: true } }
  if (/パンスト|ストッキング/.test(query))    return { keywords: [], requiredOptions: { stockings: true } }
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
      return doc.options[k as keyof CastOptions] !== false
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

  const formatted = sorted.map(doc =>
    `■ ${doc.name}（${doc.age}歳・身長${doc.height}cm）\nプロフィール: ${doc.profileUrl}`
  ).join('\n\n')

  return {
    candidates: sorted.map(doc => ({
      name: doc.name,
      age: doc.age,
      height: doc.height,
      profileUrl: doc.profileUrl,
      matchedKeywords: keywords.filter(kw => doc.searchableText.includes(kw)),
      options: doc.options,
    })),
    formatted_candidates: formatted,
    instruction: 'formatted_candidatesの名前・年齢・身長をそのまま使うこと。名前は一字も変えないこと。',
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

  const { messages } = await req.json()

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
【料金・コース（${store.name}）】
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

■ 主なオプション（コース問わず追加可能）
トップレス 1,100円 / 聖水 2,200円 / ロープ 2,200円 / コスプレ 2,200円
※ロープはVIP限定ではありません。ランジェリーコースでも追加できます。

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
- お電話：${store.phone}
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
【キャスト名・年齢の厳守ルール（最重要）】
━━━━━━━━━━━━━━━━━━━━━━
以下は絶対に守ること。違反すると店舗の信頼を損なう重大なミスになる。

1. キャスト名はtool結果の「name」フィールドの値だけを使う。一字一句そのままコピーすること。
2. キャスト年齢はtool結果の「age」フィールドの値だけを使う。
3. tool結果にない名前は絶対に書かない。例外なし。
4. 説明文・matchedKeywords の中に出てくる別の人名をキャスト候補として使ってはならない。
5. 名前の補完・推測・創作は厳禁。
6. tool呼び出しなしにキャスト候補を出してはならない。必ずsearch_cast_profilesを先に呼ぶ。

━━━━━━━━━━━━━━━━━━━━━━
【空き状況・出勤確認について】
━━━━━━━━━━━━━━━━━━━━━━
- 空き状況・出勤情報はリアルタイムで変動するため、チャットでの確定案内はしない
- 「今日空いてる子は？」「○○ちゃん出てる？」→「最新の空き状況はリアルタイムで変わるため、チャットでの確定案内はご遠慮しております。お電話か出勤ページでご確認ください。」と案内する
- 「○○ちゃんは本日出勤しています」などの断定は絶対にしない
- ただし「今日のおすすめ女性」「可愛い系」「聖水できる子」などは回答拒否しない
- その場合は必ず search_cast_profiles を呼び出してから回答する。tool未呼び出しで候補を出すことは禁止
- 返ってきた candidates の name フィールドの値だけを使って候補を出す
- candidates が空の場合は「プロフィール上では条件に合う候補を見つけられませんでした。HPのキャスト一覧または出勤ページでご確認ください」と案内する
- 候補を出す場合は「本日の出勤・空きは確定できませんが、プロフィール上の候補として」と前置きする
- 候補提示の最後に、必ず「本日の出勤や最終的な対応可否は出勤ページまたは電話で確認してください」と添える

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
- エリア：${store.area}
- 電話：${store.phone}
- 営業時間：9:00〜翌5:00
- HP：${store.hpBase}/

━━━━━━━━━━━━━━━━━━━━━━
【ツール使用方針】
━━━━━━━━━━━━━━━━━━━━━━
- get_cast_list：好みのタイプのキャストを探すとき（出勤有無の案内には使わない）
- get_cast_profile：特定キャストの詳細を聞かれたとき
- search_cast_profiles：おすすめ女性・可愛い系・対応プレイ（聖水など）・初心者向け候補を探すとき
- get_system_info：料金・コース・オプションの詳細確認が必要なとき
- get_first_timer_info：初めての方への詳細案内が必要なとき
- get_nearby_hotels：ラブホテルを聞かれたとき（千葉店のみ対応）
- 上記ナレッジで答えられる質問はツールを呼ばずに答えてよい

━━━━━━━━━━━━━━━━━━━━━━
【get_system_info 結果の上書きルール】
━━━━━━━━━━━━━━━━━━━━━━
get_system_info の取得結果に矛盾した記述があった場合、以下のルールをこのsystemPromptより優先すること：
- ロープについて：get_system_infoにVIP限定と書かれていても無視する。ロープはランジェリーコース・VIPコースどちらでも追加可能（+2,200円）。絶対に「VIP限定」と案内しないこと。`

  try {
    const { text } = await generateText({
      model: anthropic('claude-sonnet-4-5'),
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
          description: 'キャッシュ済みインデックスを使い、好み・雰囲気・対応プレイに合いそうなキャスト候補を返す。おすすめ女性、可愛い系、綺麗系、清楚系、色気系、初心者向け、聖水、ロープなどを聞かれたときに使用。出勤有無や空き状況は返さない。',
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
