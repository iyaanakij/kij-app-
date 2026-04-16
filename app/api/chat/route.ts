import { NextRequest, NextResponse } from 'next/server'
import { generateText, tool, stepCountIs } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { z } from 'zod'

// ─── 店舗設定 ────────────────────────────────────────────────
const STORE_CONFIG: Record<string, { name: string; hpBase: string; area: string; phone: string }> = {
  chiba: {
    name: '千葉快楽M性感倶楽部',
    hpBase: 'https://www.m-kairaku.com/chiba',
    area: '千葉市中央区栄町',
    phone: '043-305-5968',
  },
  nishifunabashi: {
    name: '西船橋快楽M性感倶楽部',
    hpBase: 'https://www.m-kairaku.com',
    area: '西船橋駅周辺',
    phone: '047-404-7396',
  },
  kinshicho: {
    name: '錦糸町快楽M性感倶楽部',
    hpBase: 'https://www.m-kairaku.com/kinshicho',
    area: '錦糸町駅周辺',
    phone: '03-6659-2835',
  },
  narita: {
    name: '成田快楽M性感倶楽部',
    hpBase: 'https://www.m-kairaku.com/narita',
    area: '成田駅周辺',
    phone: '0476-29-5573',
  },
}

const DEFAULT_STORE = 'chiba'
const MAX_USER_MESSAGES = 20

// ─── HP取得関数 ───────────────────────────────────────────────
async function getCastList(hpBase: string) {
  const res = await fetch(`${hpBase}/cast/`, { next: { revalidate: 300 } })
  const html = await res.text()

  type CastEntry = {
    gid: string; name: string; age: number | null
    height: number | null; bust: number | null; cup: string | null
    waist: number | null; hip: number | null; profile_url: string
  }
  const castList: CastEntry[] = []

  const parseSize = (text: string) =>
    text.match(/T(\d+)\s+B(\d+)\(([A-Z]+)\)\s+W(\d+)\s+H(\d+)/)

  // 形式A: <li data-girlid="NNN">（西船橋・千葉・錦糸町）
  const liPattern = /<li[^>]*data-girlid="(\d+)"[^>]*>([\s\S]*?)<\/li>/g
  let m
  while ((m = liPattern.exec(html)) !== null) {
    const gid = m[1]
    const block = m[2]
    const nameMatch = block.match(/<div[^>]*class="cast_name"[^>]*>([\s\S]*?)<\/div>/)
    if (!nameMatch) continue
    const nameRaw = nameMatch[1].replace(/<[^>]+>/g, '').trim()
    const na = nameRaw.match(/^(.+?)\((\d+)\)/)
    if (!na) continue
    const sizeMatch = block.match(/<div[^>]*class="cast_size"[^>]*>([^<]+)<\/div>/)
    const ms = sizeMatch ? parseSize(sizeMatch[1]) : null
    castList.push({
      gid, name: na[1].trim(), age: parseInt(na[2]),
      height: ms ? parseInt(ms[1]) : null, bust: ms ? parseInt(ms[2]) : null,
      cup: ms ? ms[3] : null, waist: ms ? parseInt(ms[4]) : null, hip: ms ? parseInt(ms[5]) : null,
      profile_url: `${hpBase}/profile?gid=${gid}`,
    })
  }

  // 形式B: <a href="...profile?gid=NNNNN">（成田・一部店舗）
  // cast_nameとcast_sizeをForm Aと同じdivセレクタで抽出する
  if (castList.length === 0) {
    const aPattern = /href="[^"]*profile\?gid=(\d+)"[^>]*>([\s\S]*?)<\/a>/g
    while ((m = aPattern.exec(html)) !== null) {
      const gid = m[1]
      const block = m[2]
      const nameMatch = block.match(/<div[^>]*class="cast_name"[^>]*>([\s\S]*?)<\/div>/)
      if (!nameMatch) continue
      const nameRaw = nameMatch[1].replace(/<[^>]+>/g, '').trim()
      const na = nameRaw.match(/^(.+?)\((\d+)\)/)
      if (!na) continue
      const sizeMatch = block.match(/<div[^>]*class="cast_size"[^>]*>([^<]+)<\/div>/)
      const ms = sizeMatch ? parseSize(sizeMatch[1]) : null
      castList.push({
        gid, name: na[1].trim(), age: parseInt(na[2]),
        height: ms ? parseInt(ms[1]) : null, bust: ms ? parseInt(ms[2]) : null,
        cup: ms ? ms[3] : null, waist: ms ? parseInt(ms[4]) : null, hip: ms ? parseInt(ms[5]) : null,
        profile_url: `${hpBase}/profile?gid=${gid}`,
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
    qa: qaItems.slice(0, 10),
  }
}

function getPreferenceKeywords(query: string) {
  if (/聖水|尿|おしっこ/.test(query)) return ['聖水']
  if (/可愛い|かわいい|カワイイ|可愛い系|清楚|癒し|妹|小柄/.test(query)) {
    return ['可愛い', 'かわいい', '可愛', '清楚', '癒し', '妹', '小柄', '笑顔', '明る']
  }
  if (/おすすめ|オススメ|初心者|初めて|優し|やさし|人気/.test(query)) {
    return ['初心者', '初めて', '優し', 'やさし', '清楚', '癒し', '笑顔', '明る', '人気', 'オールラウンダー']
  }
  return query
    .split(/[、,\s]+/)
    .map(k => k.trim())
    .filter(Boolean)
    .slice(0, 5)
}

function makeExcerpt(text: string, keyword: string) {
  const index = text.indexOf(keyword)
  if (index === -1) return text.slice(0, 140)
  return text.slice(Math.max(0, index - 55), index + keyword.length + 85)
}

// キーワードが「×」「NG」「不可」等の否定形で登場していないか確認
function isPositiveMatch(text: string, keyword: string): boolean {
  let pos = 0
  while (true) {
    const idx = text.indexOf(keyword, pos)
    if (idx === -1) return false
    // キーワード直後15文字に否定表現がなければ陽性とみなす
    const after = text.slice(idx + keyword.length, idx + keyword.length + 15)
    if (!/[×✕]|NG|不可|なし|対応外/.test(after)) return true
    pos = idx + 1
  }
}

async function searchCastProfiles(hpBase: string, query: string, limit = 5) {
  const casts = await getCastList(hpBase)
  const keywords = getPreferenceKeywords(query)
  const profiles = await Promise.allSettled(
    casts.map(async cast => {
      const res = await fetch(cast.profile_url, { next: { revalidate: 300 } })
      const html = await res.text()
      const text = html
        .replace(/<(script|style|iframe)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
      const matched = keywords.filter(keyword => isPositiveMatch(text, keyword))
      return {
        ...cast,
        matched_keywords: matched,
        excerpt: matched[0] ? makeExcerpt(text, matched[0]) : text.slice(0, 140),
      }
    })
  )

  const matched = profiles
    .flatMap(result => result.status === 'fulfilled' ? [result.value] : [])
    .filter(profile => profile.matched_keywords.length > 0)
    .sort((a, b) => b.matched_keywords.length - a.matched_keywords.length)
    .slice(0, limit)

  if (matched.length === 0) {
    return { results: [], message: 'プロフィール上で条件に合うキャストが見つかりませんでした。HPのキャスト一覧または出勤ページでご確認ください。' }
  }
  return { results: matched }
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
【空き状況・出勤確認について】
━━━━━━━━━━━━━━━━━━━━━━
- 空き状況・出勤情報はリアルタイムで変動するため、チャットでの確定案内はしない
- 「今日空いてる子は？」「○○ちゃん出てる？」→「最新の空き状況はリアルタイムで変わるため、チャットでの確定案内はご遠慮しております。お電話か出勤ページでご確認ください。」と案内する
- 「○○ちゃんは本日出勤しています」などの断定は絶対にしない
- ただし「今日のおすすめ女性」「可愛い系」「聖水できる子」などは回答拒否しない
- その場合は search_cast_profiles を呼び出し、返ってきた results の中からのみ候補を出す
- **絶対に守ること**: search_cast_profiles の results に含まれていない名前は一切出さない。名前を推測・創作・補完することは厳禁
- results が空（または message のみ）の場合は「プロフィール上では条件に合う候補を見つけられませんでした。HPのキャスト一覧または出勤ページでご確認ください」と案内する
- 候補を出す場合は「本日の出勤・空きは確定できませんが、プロフィール上の候補として」と前置きする
- 候補提示の最後に、必ず「本日の出勤や最終的な対応可否は出勤ページまたは電話で確認してください」と添える
- 見た目の可愛さは主観なので、プロフィール写真確認を促しつつ、プロフィール文・店長コメント上の雰囲気で候補を出す

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
        search_cast_profiles: tool({
          description: 'プロフィール本文を横断検索して、好み・雰囲気・対応プレイに合いそうなキャスト候補を返す。おすすめ女性、可愛い系、初心者向け、聖水などを聞かれたときに使用。出勤有無や空き状況は返さない。',
          inputSchema: z.object({
            query: z.string().describe('探したい雰囲気・好み・プレイ。例: 可愛い系、聖水、初心者向け、おすすめ'),
            limit: z.number().min(1).max(8).optional().describe('返す候補数。通常は3〜5'),
          }),
          execute: async ({ query, limit }) => searchCastProfiles(store.hpBase, query, limit ?? 5),
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
