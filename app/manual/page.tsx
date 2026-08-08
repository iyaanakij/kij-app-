const pageLinks = [
  { href: '/sales-goal', label: '売上目標', use: '月間目標・損益分岐の進捗を見る' },
  { href: '/reservations', label: '予約管理', use: 'CS3予約の当日確認、メモ、給与計算の確認' },
  { href: '/operations', label: '稼働ボード', use: '出勤中キャストの受付状況、CP4/Venreyのリアルタイム更新' },
  { href: '/shift', label: 'シフト管理', use: '出勤予定、申請管理、寮利用表示の確認' },
  { href: '/ranking', label: 'ランキング', use: '月次の指名・売上・稼働率の確認' },
  { href: '/dorm', label: '寮管理', use: '成田店の部屋割り、利用予定、清掃メモの管理' },
  { href: '/women-info', label: '女性情報', use: 'NG、対応可否、交通費、連絡方法などの現場メモ' },
  { href: '/staff', label: 'キャスト', use: '在籍、アカウント、入店アンケート、外部登録状態の確認' },
  { href: '/photodiary', label: '写メ日記', use: '写メ日記の閲覧、投稿管理への導線確認' },
  { href: '/hotels', label: 'ホテル料金', use: 'ホテル料金・利用条件の現場確認' },
  { href: '/admin/dashboard', label: 'システム状態', use: '同期・cron・外部反映の異常確認' },
]

const storeRows = [
  ['成田', '1', '5', '111702'],
  ['千葉', '2', '6', '111703'],
  ['西船橋', '3', '7', '111701'],
  ['錦糸町', '4', '8', '111704'],
]

const dailyFlow = [
  {
    title: '営業前',
    items: ['シフト管理で当日の出勤を確認', '予約管理でCS3予約の取り込み状況を確認', 'システム状態で赤い警告が出ていないか確認'],
  },
  {
    title: '予約受付時',
    items: ['CS3で予約を登録', '予約管理で反映を確認', '必要に応じて女性情報のNG・交通費・対応条件を確認'],
  },
  {
    title: '接客中・接客後',
    items: ['稼働ボードで次回受付時刻を判断', 'リアルタイム一括更新でCP4とVenreyへ反映', 'ご予約満了にする場合も稼働ボードから更新'],
  },
  {
    title: '営業後',
    items: ['予約管理の件数・給与計算を確認', '売上目標とランキングで日次の進捗を確認', '翌日のシフト・寮利用を確認'],
  },
]

const systemNotes = [
  ['予約データ', 'CS3予約デーモンがSupabaseへ同期し、予約管理・稼働ボード・売上系画面で使う。'],
  ['シフトデータ', 'CS3出勤申請をshift-syncが取り込み、シフト管理と外部サイト反映の基礎データにする。'],
  ['外部反映', 'VPS上のshift-syncがCP4、Venrey、HP系の反映を担当する。現場操作は主に稼働ボードから行う。'],
  ['管理画面', 'Next.jsアプリをVercelで運用。ページ閲覧は管理ログインで保護される。'],
]

const warnings = [
  'CS3側の登録内容が正で、管理画面は同期後の確認・補助操作として扱う。',
  'CP4/Venreyの反映異常は、まずシステム状態と稼働ボードの結果表示を見る。',
  'Venreyはキャストの出勤終了時刻を超える接客終了時刻を選べない制約がある。',
  '女性情報は現場運用メモなので、消す前に本当に不要な情報か確認する。',
  '管理・操作系APIの直接アクセス認証は未解消の既知課題。URLや内部情報を外部共有しない。',
]

function SectionTitle({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="mb-4">
      <div className="text-xs font-bold tracking-wide text-blue-600 dark:text-blue-300">{eyebrow}</div>
      <h2 className="mt-1 text-xl font-bold text-gray-900 dark:text-gray-100">{title}</h2>
    </div>
  )
}

export default function ManualPage() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-gray-900">
      <div className="mx-auto max-w-7xl px-4 py-6 md:px-6 md:py-8">
        <header className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800 md:p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="text-sm font-bold text-blue-600 dark:text-blue-300">KIJ管理ツール</div>
              <h1 className="mt-1 text-2xl font-bold text-gray-950 dark:text-gray-50 md:text-3xl">現場マニュアル・設計仕様</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-gray-600 dark:text-gray-300">
                店舗スタッフが日々の予約、出勤、受付状況、女性情報、外部サイト反映を迷わず扱うための全体仕様です。
                開発用の詳細手順ではなく、現場で見るべき画面と判断順をまとめています。
              </p>
            </div>
            <div className="shrink-0 rounded-md bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 dark:bg-blue-900/30 dark:text-blue-200">
              最終更新: 2026-08-08
            </div>
          </div>
        </header>

        <div className="mt-6 grid gap-5 lg:grid-cols-[1.5fr_1fr]">
          <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <SectionTitle eyebrow="PAGE MAP" title="画面の役割" />
            <div className="grid gap-3 md:grid-cols-2">
              {pageLinks.map(page => (
                <a
                  key={page.href}
                  href={page.href}
                  className="block rounded-md border border-gray-200 bg-gray-50 p-3 transition-colors hover:border-blue-300 hover:bg-blue-50 dark:border-gray-700 dark:bg-gray-900 dark:hover:border-blue-500 dark:hover:bg-blue-950/40"
                >
                  <div className="text-sm font-bold text-gray-900 dark:text-gray-100">{page.label}</div>
                  <div className="mt-1 text-xs leading-5 text-gray-600 dark:text-gray-300">{page.use}</div>
                </a>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <SectionTitle eyebrow="STORES" title="店舗・ID対応" />
            <div className="overflow-hidden rounded-md border border-gray-200 dark:border-gray-700">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-100 text-xs text-gray-600 dark:bg-gray-900 dark:text-gray-300">
                  <tr>
                    <th className="px-3 py-2">エリア</th>
                    <th className="px-3 py-2">M</th>
                    <th className="px-3 py-2">E</th>
                    <th className="px-3 py-2">CS3</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {storeRows.map(row => (
                    <tr key={row[0]}>
                      {row.map(cell => (
                        <td key={cell} className="px-3 py-2 text-gray-800 dark:text-gray-200">{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs leading-5 text-gray-600 dark:text-gray-300">
              M性感俱楽部はstore_id 1-4、癒したくてはstore_id 5-8。CS3はE店IDでM/E両ブランドの予約を管理し、
              nomination_typeの先頭文字でブランドを判定します。
            </p>
          </section>
        </div>

        <section className="mt-5 rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <SectionTitle eyebrow="DAILY FLOW" title="日次運用フロー" />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {dailyFlow.map((block, index) => (
              <div key={block.title} className="rounded-md border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">{index + 1}</div>
                  <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">{block.title}</h3>
                </div>
                <ul className="mt-3 space-y-2 text-sm leading-6 text-gray-700 dark:text-gray-300">
                  {block.items.map(item => <li key={item}>・{item}</li>)}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <SectionTitle eyebrow="SYSTEM" title="データ連携の考え方" />
            <div className="space-y-3">
              {systemNotes.map(([label, body]) => (
                <div key={label} className="rounded-md border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900">
                  <div className="text-sm font-bold text-gray-900 dark:text-gray-100">{label}</div>
                  <div className="mt-1 text-sm leading-6 text-gray-600 dark:text-gray-300">{body}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-amber-200 bg-amber-50 p-5 shadow-sm dark:border-amber-700 dark:bg-amber-900/20">
            <SectionTitle eyebrow="CAUTION" title="現場で迷いやすい点" />
            <ul className="space-y-3 text-sm leading-6 text-amber-950 dark:text-amber-100">
              {warnings.map(item => <li key={item}>・{item}</li>)}
            </ul>
          </section>
        </div>
      </div>
    </div>
  )
}
