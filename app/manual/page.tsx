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

// 実務で使っていないため「ツール」プルダウンから一旦除外中(2026-08-27、components/NavBar.tsx)。ページ自体は残存
const hiddenToolLinks = [
  { href: '/cast/login', label: 'キャストページ' },
  { href: '/photodiary', label: '写メ日記' },
  { href: '/photodiary/login', label: '写メ日記投稿' },
  { href: '/chat', label: 'チャット' },
  { href: '/admin/customer-portal', label: 'マイページ連携' },
]

const storeRows = [
  ['成田', '1', '5', '111702'],
  ['千葉', '2', '6', '111703'],
  ['西船橋', '3', '7', '111701'],
  ['錦糸町', '4', '8', '111704'],
]

const syncRows = [
  {
    name: 'CS3予約同期',
    frequency: '常駐',
    owner: 'systemd',
    detail: 'CS3の予約情報をSupabaseへ同期し、予約管理・稼働ボード・売上系画面の元データにする。VPSのkij-reservation-daemon.serviceで自動起動・再起動。',
    log: '/var/log/shift-sync/daemon.log',
  },
  {
    name: 'Venreyシフト同期',
    frequency: '10分ごと',
    owner: 'run-sync.sh',
    detail: 'CS3承認シフトをもとにVenrey即姫・接客一括更新へ出勤予定を反映する。A系CS3アカウントを使用。',
    log: '/var/log/shift-sync/sync.log',
  },
  {
    name: 'CP4/HPシフト同期',
    frequency: '10分ごと (:05系)',
    owner: 'run-cp4-apply.sh',
    detail: 'CS3承認シフトをCASTPRO4へ掲載し、不要になった掲載の自動削除確認とSupabase shifts同期も同じ流れで実行する。B系CS3アカウントを使用。',
    log: '/var/log/shift-sync/cp4-apply.log',
  },
  {
    name: 'CP4受付時刻自動更新',
    frequency: '10分ごと (:00系)',
    owner: 'run-cp4-freetext.sh',
    detail: '当日出勤中キャストのCP4フリーテキスト欄を現在時刻ベースに更新する。終了60分以内は「ご予約満了」にする。未来時刻が入っている場合は上書きしない。',
    log: '/var/log/shift-sync/cp4-freetext.log',
  },
  {
    name: 'リアルタイム一括更新 CP4',
    frequency: '1分ごと',
    owner: '92-manual-freetext-worker.js',
    detail: '/operationsの時計ボタンで作ったジョブを処理し、指定した次回受付時刻または「ご予約満了」をCP4へ反映する。',
    log: '/var/log/shift-sync/manual-freetext-worker.log',
  },
  {
    name: 'リアルタイム一括更新 Venrey',
    frequency: '1分ごと',
    owner: '93-manual-freetext-venrey-worker.js',
    detail: '同じジョブをVenrey側でも処理する。通常時は接客終了時刻、満了時は受付終了ステータスへ反映する。',
    log: '/var/log/shift-sync/manual-freetext-venrey-worker.log',
  },
  {
    name: 'Venrey受付終了自動化',
    frequency: '10分ごと (:03系)',
    owner: '94-venrey-auto-fully-booked.js',
    detail: 'シフト終了60分以内のキャストをVenrey側で自動的に受付終了へ変更する。Venrey本体同期と同じロックを共有し、競合時は次回へ回る。',
    log: '/var/log/shift-sync/venrey-auto-fully-booked.log',
  },
  {
    name: '入店アンケート登録処理',
    frequency: '1分ごと',
    owner: '82-onboarding-worker.js',
    detail: '承認後のCP4/Venrey新規登録ジョブを処理する。外部ID補完は83番スクリプトが担当する。',
    log: '/var/log/shift-sync/onboarding-worker.log',
  },
  {
    name: '新規キャストID補完',
    frequency: '1時間ごと',
    owner: 'run-new-cast-check.sh',
    detail: 'CS3/CP4/Venrey側のキャスト一覧を確認し、publish_rulesの外部ID不足を補完する。長時間残るID補完待ちはon-demand dumpで再確認する。',
    log: '/var/log/shift-sync/new-cast-check.log',
  },
  {
    name: 'health-check',
    frequency: '15分ごと',
    owner: '90-health-check.js',
    detail: '同期ログ、ジョブ滞留、CP4ロック、Playwright残留、メモリ、publish_rules ID不足などをOK/WARN/CRITで監視する。',
    log: '/var/log/shift-sync/health-check.log',
  },
]

const systemNotes = [
  ['予約データ', 'CS3予約デーモンがSupabaseへ直接同期する。画面上の予約本体はCS3同期データを表示し、予約管理・稼働ボード・売上目標・ランキングの元データになる。'],
  ['シフトデータ', 'CS3承認シフトをshift-syncが取得し、Venrey、CP4、Supabase shiftsへ分けて反映する。ローカルPCではなくVPS側のcronが主系。'],
  ['外部反映', 'CP4系とVenrey系は別ワーカー・別ロックで動く。CP4はWordPress内のCASTPRO4 iframe、VenreyはVenrey管理画面をPlaywrightで操作する。'],
  ['管理画面', 'Next.jsアプリをVercelで運用。ページ閲覧は管理ログインで保護されるが、管理API単体の認証再適用は既知課題として残っている。'],
]

const detailCards = [
  {
    title: 'リアルタイム更新の優先順位',
    body: '稼働ボードから入れた未来時刻は、CP4自動更新が追いつくまで上書きされない。実時刻がその時刻に追いつくと、10分ごとの自動更新が通常運用へ戻す。',
  },
  {
    title: 'ご予約満了の扱い',
    body: 'CP4へは「ご予約満了」をそのまま書き込む。Venreyでは終了時刻入力ではなく受付終了ステータスへ変換する。',
  },
  {
    title: 'ID補完待ち',
    body: '新規キャストや外部ID未取得の行は、1時間ごとのnew-cast-checkと必要時のon-demand dumpで補完する。画面上は「ID補完待ち」として扱う。',
  },
  {
    title: 'publish_rulesキャッシュ',
    body: 'publish_rulesはVPS側で最大1時間キャッシュされる。DBを直接直した直後に反映されない場合は、キャッシュ残りの可能性がある。',
  },
  {
    title: 'ロックと競合',
    body: 'CP4系は共通ロック、Venrey系も共通ロックを持つ。処理が重なると片方はスキップまたは次回cronへ回るため、短時間の遅れは即異常とは限らない。',
  },
  {
    title: '異常確認の順番',
    body: 'まずシステム状態のOK/WARN/CRITを見る。次に対象ログ、稼働ボードの更新結果、対象キャストのpublish_rules外部IDを確認する。',
  },
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
                店舗スタッフと管理者が、予約・シフト・外部サイト反映のつながりを確認するための全体仕様です。
                各画面の役割、同期頻度、反映までの待ち時間、異常時に見る場所をまとめています。
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
          <SectionTitle eyebrow="SYNC" title="同期・自動処理一覧" />
          <div className="overflow-x-auto rounded-md border border-gray-200 dark:border-gray-700">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="bg-gray-100 text-xs text-gray-600 dark:bg-gray-900 dark:text-gray-300">
                <tr>
                  <th className="px-3 py-2">処理</th>
                  <th className="px-3 py-2">頻度</th>
                  <th className="px-3 py-2">本体</th>
                  <th className="px-3 py-2">内容</th>
                  <th className="px-3 py-2">ログ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {syncRows.map(row => (
                  <tr key={row.name} className="align-top">
                    <td className="whitespace-nowrap px-3 py-3 font-bold text-gray-900 dark:text-gray-100">{row.name}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-gray-800 dark:text-gray-200">{row.frequency}</td>
                    <td className="whitespace-nowrap px-3 py-3 font-mono text-xs text-gray-700 dark:text-gray-300">{row.owner}</td>
                    <td className="px-3 py-3 leading-6 text-gray-700 dark:text-gray-300">{row.detail}</td>
                    <td className="whitespace-nowrap px-3 py-3 font-mono text-xs text-gray-600 dark:text-gray-400">{row.log}</td>
                  </tr>
                ))}
              </tbody>
            </table>
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

          <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <SectionTitle eyebrow="DETAILS" title="細かい仕様メモ" />
            <div className="grid gap-3 sm:grid-cols-2">
              {detailCards.map(card => (
                <div key={card.title} className="rounded-md border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900">
                  <div className="text-sm font-bold text-gray-900 dark:text-gray-100">{card.title}</div>
                  <div className="mt-1 text-sm leading-6 text-gray-600 dark:text-gray-300">{card.body}</div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <section className="mt-5 rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/40">
          <div className="text-xs font-bold tracking-wide text-gray-400 dark:text-gray-500">HIDDEN</div>
          <h2 className="mt-1 text-sm font-bold text-gray-500 dark:text-gray-400">非表示中のツール</h2>
          <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">
            実務で使っていないため「ツール」プルダウンから一旦外している画面。ページ自体は残っているので、直接開ける。
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {hiddenToolLinks.map(link => (
              <a
                key={link.href}
                href={link.href}
                className="rounded border border-gray-300 bg-white px-2.5 py-1 text-xs text-gray-500 transition-colors hover:border-gray-400 hover:text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:border-gray-600 dark:hover:text-gray-200"
              >
                {link.label}
              </a>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
