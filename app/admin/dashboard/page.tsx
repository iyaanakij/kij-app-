'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'

type CheckItem = {
  level: 'OK' | 'WARN' | 'CRIT'
  name: string
  message: string
}

type HealthLog = {
  id: number
  checked_at: string
  status: 'OK' | 'WARN' | 'CRIT'
  checks: CheckItem[]
}

type ActionJob = {
  id: string
  action: string
  status: 'pending' | 'running' | 'succeeded' | 'failed' | 'skipped'
  requested_by: string | null
  requested_at: string
  started_at: string | null
  finished_at: string | null
  result: { output?: string; verify_status?: string } | null
  error: string | null
}

// チェック名の日本語
const NAME_JA: Record<string, string> = {
  'approved-latest':       'CS3承認データ',
  'venrey-apply':          'Venrey反映',
  'cp4-apply':             'HP掲載（CP4）',
  'cp4-clear-summary':     'HP削除候補',
  'log:venrey-sync':       'ログ：Venrey同期',
  'log:cp4-apply':         'ログ：HP反映',
  'log:new-cast-check':    'ログ：新規キャスト確認',
  'log:retention-cleanup': 'ログ：ファイル整理',
  'log:manual-freetext':        'ログ：CP4リアルタイム更新（手動）',
  'log:manual-freetext-venrey': 'ログ：Venreyリアルタイム更新（手動）',
  'cp4-lock-meta':         'HP反映処理の実行状態',
  'playwright-residue':    'ブラウザプロセス残留',
  'memory':                'VPSメモリ',
  'disk':                  'ディスク使用量',
}

type Category = 'SELF_RECOVERABLE' | 'RETRYABLE_BUT_ESCALATE' | 'ENGINEER_REQUIRED' | 'EXTERNAL_SERVICE_ISSUE'

type CheckGuideEntry = {
  category: Category
  summary: string        // 店舗向け一言状態
  operatorAction: string // 店舗が取るべき行動
  action?: string
  actionLabel?: string
}

// エラー時のガイドと復旧アクション（カテゴリ付き）
const CHECK_GUIDE: Record<string, CheckGuideEntry> = {
  'approved-latest': {
    category: 'SELF_RECOVERABLE',
    summary: 'CS3の出勤承認データが取得できていません',
    operatorAction: '復旧ボタンを押してください。15分後に改善しない場合は報告してください。',
    action: 'cs3_relogin_a',
    actionLabel: 'Venrey同期を復旧',
  },
  'venrey-apply': {
    category: 'RETRYABLE_BUT_ESCALATE',
    summary: 'Venreyへの出勤反映でエラーが発生しています',
    operatorAction: '復旧ボタンを押してください。失敗したら担当者に報告してください。',
    action: 'cs3_relogin_a',
    actionLabel: 'Venrey同期を復旧',
  },
  'cp4-apply': {
    category: 'RETRYABLE_BUT_ESCALATE',
    summary: 'HPへの出勤反映でエラーが発生しています',
    operatorAction: '復旧ボタンを押してください。失敗したら担当者に報告してください。',
    action: 'cs3_relogin_b',
    actionLabel: 'HP同期を復旧',
  },
  'cp4-clear-summary': {
    category: 'ENGINEER_REQUIRED',
    summary: 'HP削除候補のデータに異常があります',
    operatorAction: '店舗では対応できません。このページの報告文を担当者に送ってください。',
  },
  'log:venrey-sync': {
    category: 'RETRYABLE_BUT_ESCALATE',
    summary: 'Venrey同期のログにエラーが記録されています',
    operatorAction: '復旧ボタンを押してください。失敗したら担当者に報告してください。',
    action: 'cs3_relogin_a',
    actionLabel: 'Venrey同期を復旧',
  },
  'log:cp4-apply': {
    category: 'RETRYABLE_BUT_ESCALATE',
    summary: 'HP反映のログにエラーが記録されています',
    operatorAction: '復旧ボタンを押してください。失敗したら担当者に報告してください。',
    action: 'cs3_relogin_b',
    actionLabel: 'HP同期を復旧',
  },
  'log:new-cast-check': {
    category: 'RETRYABLE_BUT_ESCALATE',
    summary: '新規キャスト確認でエラーが発生しています',
    operatorAction: '復旧ボタンを押してください。失敗したら担当者に報告してください。',
    action: 'cs3_relogin_c',
    actionLabel: '新規キャスト取得を復旧',
  },
  'log:retention-cleanup': {
    category: 'ENGINEER_REQUIRED',
    summary: 'ファイル自動整理でエラーが発生しています',
    operatorAction: '店舗では対応できません。このページの報告文を担当者に送ってください。',
  },
  'log:manual-freetext': {
    category: 'ENGINEER_REQUIRED',
    summary: '/operationsのCP4リアルタイム一括更新でエラーが発生しています',
    operatorAction: '店舗では対応できません。このページの報告文を担当者に送ってください。',
  },
  'log:manual-freetext-venrey': {
    category: 'ENGINEER_REQUIRED',
    summary: '/operationsのVenreyリアルタイム一括更新でエラーが発生しています',
    operatorAction: '店舗では対応できません。このページの報告文を担当者に送ってください。',
  },
  'cp4-lock-meta': {
    category: 'ENGINEER_REQUIRED',
    summary: 'HP反映処理が長時間実行されたままフリーズしている可能性があります',
    operatorAction: '店舗では対応できません。このページの報告文を担当者に送ってください。',
  },
  'playwright-residue': {
    category: 'ENGINEER_REQUIRED',
    summary: 'ブラウザプロセスが残留しており、次回の処理に影響する可能性があります',
    operatorAction: '店舗では対応できません。このページの報告文を担当者に送ってください。',
  },
  'memory': {
    category: 'ENGINEER_REQUIRED',
    summary: 'VPSの空きメモリが少なく、ブラウザ処理が不安定になる可能性があります',
    operatorAction: '店舗では対応できません。このページの報告文を担当者に送ってください。',
  },
  'disk': {
    category: 'ENGINEER_REQUIRED',
    summary: 'VPSのディスク使用量が上限に近づいています',
    operatorAction: '店舗では対応できません。このページの報告文を担当者に送ってください。',
  },
}

const CATEGORY_LABEL: Record<Category, { label: string; bg: string; text: string }> = {
  SELF_RECOVERABLE:        { label: '店舗で復旧可',   bg: 'bg-blue-100',   text: 'text-blue-700' },
  RETRYABLE_BUT_ESCALATE:  { label: '復旧→失敗で報告', bg: 'bg-orange-100', text: 'text-orange-700' },
  ENGINEER_REQUIRED:       { label: '報告のみ',        bg: 'bg-gray-200',   text: 'text-gray-700' },
  EXTERNAL_SERVICE_ISSUE:  { label: '外部サービス障害', bg: 'bg-purple-100', text: 'text-purple-700' },
}

// アクション名の日本語
const ACTION_JA: Record<string, string> = {
  cs3_relogin_a:   'Venrey同期を復旧（CS3再ログイン）',
  cs3_relogin_b:   'HP同期を復旧（CS3再ログイン）',
  cs3_relogin_c:   '新規キャスト取得を復旧（CS3再ログイン）',
  health_check_now: 'ヘルスチェックを今すぐ実行',
}

function translateName(name: string) {
  return NAME_JA[name] ?? name
}

function translateMessage(name: string, msg: string) {
  if (name === 'approved-latest') {
    const m = msg.match(/fresh age=(\d+)m/)
    if (m) return `正常（${m[1]}分前に更新）`
    const s = msg.match(/stale.*age=(\d+)m/)
    if (s) return `データが古い（${s[1]}分前、40分超で警告）`
    if (msg.includes('missing')) return 'ファイルが見つかりません'
  }
  if (name === 'venrey-apply' || name === 'cp4-apply') {
    if (msg.includes('result file not found')) return '結果ファイルなし'
    const stale = msg.match(/stale.*age=(\d+)m/)
    if (stale) return `結果が古い（${stale[1]}分前）`
    const ng = msg.match(/has ng=(\d+) manual=(\d+)/)
    if (ng) return `エラー ${ng[1]}件 / 手動対応 ${ng[2]}件`
    const warn = msg.match(/transient site_errors=(\d+) transient_skipped=(\d+)/)
    if (warn) return `一時エラー ${warn[1]}件 / スキップ ${warn[2]}件`
    const ok = msg.match(/ok summary=(\{.*\})/)
    if (ok) {
      try {
        const s = JSON.parse(ok[1])
        return `正常（処理 ${s.total ?? '-'}件、エラー ${s.ng ?? 0}件）`
      } catch { return '正常' }
    }
  }
  if (name === 'cp4-clear-summary') {
    if (msg.includes('missing cp4-clear-latest-summary.json')) return 'ファイルなし'
    const cand = msg.match(/candidates=(\d+)/)
    if (cand && msg.includes('hard-stop')) return `異常フラグあり — ${msg}`
    if (cand && msg.includes('exceeds max')) return `削除候補が上限超（${cand[1]}件）`
    if (cand) return `削除候補 ${cand[1]}件（正常）`
  }
  if (name.startsWith('log:')) {
    if (msg.includes('no fatal/error markers in tail')) return 'エラーなし'
    const errCnt = msg.match(/has (\d+) error markers/)
    if (errCnt) {
      const last = msg.match(/last="(.{0,100})"/)
      return `エラー ${errCnt[1]}件 — ${last ? last[1] : ''}`
    }
    const stale = msg.match(/stale age=(\d+)m/)
    if (stale) return `ログが古い（${stale[1]}分前）`
    if (msg.includes('missing')) return 'ログファイルなし'
  }
  if (name === 'cp4-lock-meta') {
    if (msg === 'no active lock') return '実行中の処理なし（正常）'
    const active = msg.match(/active: (\S+) pid=\d+ age=(\d+)m/)
    if (active) return `${active[1]} が実行中（${active[2]}分経過）`
    const held = msg.match(/lock held (\d+)m >= \d+m by (\S+)/)
    if (held) return `${held[2]} が ${held[1]}分間フリーズ中（異常）`
    const stale = msg.match(/stale meta: pid=(\d+) not alive/)
    if (stale) return `ロックファイルが残留しています（プロセス pid=${stale[1]} は終了済み）`
    if (msg.includes('invalid startedAt')) return 'メタデータが破損しています'
  }
  if (name === 'playwright-residue') {
    if (msg.includes('procs_ok')) {
      const mb = msg.match(/RSS total=(\d+)MB/)
      return `正常（RSS合計 ${mb ? mb[1] : '-'}MB）`
    }
    const rss = msg.match(/RSS total=(\d+)MB/)
    const agedRss = msg.match(/RSS aged=(\d+)MB total=(\d+)MB/)
    const residual = msg.match(/(\d+) residual procs \((.+)\)/)
    const parts: string[] = []
    if (agedRss) parts.push(`5分超RSS ${agedRss[1]}MB（合計 ${agedRss[2]}MB）`)
    if (rss) parts.push(`RSS合計 ${rss[1]}MB`)
    if (residual) parts.push(`長時間残留 ${residual[1]}件: ${residual[2]}`)
    return parts.join(' / ') || msg
  }
  if (name === 'disk') {
    const pct = msg.match(/disk usage (\d+)%/)
    if (pct) return `使用率 ${pct[1]}%`
  }
  if (name === 'memory') {
    const mem = msg.match(/available=(\d+)MB total=(\d+)MB used=(\d+)%/)
    if (mem) return `空き ${mem[1]}MB / 合計 ${mem[2]}MB（使用率 ${mem[3]}%）`
    if (msg.includes('/proc/meminfo not found')) return 'メモリ情報を取得できません'
    if (msg.includes('cannot parse')) return 'メモリ情報を解析できません'
  }
  return msg
}

const STATUS_COLOR = {
  OK:   { bg: 'bg-green-100',  text: 'text-green-800',  border: 'border-green-300',  dot: 'bg-green-500'  },
  WARN: { bg: 'bg-yellow-100', text: 'text-yellow-800', border: 'border-yellow-300', dot: 'bg-yellow-500' },
  CRIT: { bg: 'bg-red-100',    text: 'text-red-800',    border: 'border-red-300',    dot: 'bg-red-500'    },
}

const JOB_STATUS_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  pending:   { bg: 'bg-gray-100',   text: 'text-gray-600',  label: '待機中' },
  running:   { bg: 'bg-blue-100',   text: 'text-blue-700',  label: '実行中' },
  succeeded: { bg: 'bg-green-100',  text: 'text-green-700', label: '成功' },
  failed:    { bg: 'bg-red-100',    text: 'text-red-700',   label: '失敗' },
  skipped:   { bg: 'bg-gray-100',   text: 'text-gray-500',  label: 'スキップ' },
}

function StatusBadge({ status }: { status: 'OK' | 'WARN' | 'CRIT' }) {
  const c = STATUS_COLOR[status]
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${c.bg} ${c.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {status}
    </span>
  )
}

function CategoryBadge({ category }: { category: Category }) {
  const c = CATEGORY_LABEL[category]
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${c.bg} ${c.text}`}>
      {c.label}
    </span>
  )
}

function buildReportText(log: HealthLog, lastOkAt: string | null, jobs: ActionJob[]): string {
  const jst = (iso: string) => new Date(iso).toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })

  const issues = log.checks.filter(c => c.level !== 'OK')
  const autoJob = jobs.find(j => j.requested_by === 'auto')
  const autoResult = autoJob
    ? (autoJob.status === 'succeeded' ? '成功' : autoJob.status === 'failed' ? '失敗' : '実行中')
    : 'なし'

  const lines: string[] = [
    '【障害報告】',
    `状態: ${log.status}`,
    `検出時刻: ${jst(log.checked_at)}`,
    `最終正常確認: ${lastOkAt ? jst(lastOkAt) : '不明'}`,
    '',
  ]

  for (const c of issues) {
    const guide = CHECK_GUIDE[c.name]
    lines.push(`■ ${translateName(c.name)}`)
    lines.push(`  状態: ${c.level}`)
    if (guide) {
      lines.push(`  分類: ${CATEGORY_LABEL[guide.category].label}`)
      lines.push(`  内容: ${guide.summary}`)
      lines.push(`  詳細: ${translateMessage(c.name, c.message)}`)
    } else {
      lines.push(`  詳細: ${translateMessage(c.name, c.message)}`)
    }
    lines.push('')
  }

  lines.push(`自動復旧: ${autoResult}`)
  const needsEngineer = issues.some(c => {
    const g = CHECK_GUIDE[c.name]
    return !g || g.category === 'ENGINEER_REQUIRED'
  })
  lines.push(`技術対応: ${needsEngineer ? '必要' : '不要（復旧ボタンで対応可）'}`)

  return lines.join('\n')
}

function formatJst(iso: string) {
  return new Date(iso).toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function minutesAgo(iso: string) {
  const diff = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (diff < 1) return '今'
  if (diff < 60) return `${diff}分前`
  const h = Math.floor(diff / 60)
  if (h < 24) return `${h}時間前`
  return `${Math.floor(h / 24)}日前`
}

function getRecoveryLabel(job: ActionJob, latest: HealthLog | null) {
  if (!latest || latest.status !== 'OK' || !job.finished_at) return null
  if (new Date(latest.checked_at).getTime() < new Date(job.finished_at).getTime()) return null
  return job.requested_by === 'auto' ? '自動復旧' : '手動復旧'
}

export default function DashboardPage() {
  const router = useRouter()
  const [logs, setLogs] = useState<HealthLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedLog, setSelectedLog] = useState<HealthLog | null>(null)
  const [hours, setHours] = useState(24)
  const [jobs, setJobs] = useState<ActionJob[]>([])
  const [submitting, setSubmitting] = useState<string | null>(null)
  const [submitMsg, setSubmitMsg] = useState('')
  const [copied, setCopied] = useState(false)

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    setError('')
    const res = await fetch(`/api/admin/health-check?hours=${hours}`)
    if (!res.ok) { setError(`取得失敗 (${res.status})`); setLoading(false); return }
    const json = await res.json()
    setLogs(json.logs || [])
    if (json.logs?.length > 0 && !selectedLog) setSelectedLog(json.logs[0])
    setLoading(false)
  }, [hours, selectedLog])

  const fetchJobs = useCallback(async () => {
    const res = await fetch('/api/admin/actions')
    if (!res.ok) return
    const json = await res.json()
    setJobs(json.jobs || [])
  }, [])

  useEffect(() => { document.title = 'システムダッシュボード | KIJ管理' }, [])
  useEffect(() => { fetchLogs() }, [fetchLogs])
  useEffect(() => { fetchJobs() }, [fetchJobs])

  // pending/running ジョブがあれば10秒ごとに自動更新
  useEffect(() => {
    const hasPending = jobs.some(j => j.status === 'pending' || j.status === 'running')
    if (!hasPending) return
    const timer = setInterval(fetchJobs, 10000)
    return () => clearInterval(timer)
  }, [jobs, fetchJobs])

  const submitAction = async (action: string) => {
    setSubmitting(action)
    setSubmitMsg('')
    const res = await fetch('/api/admin/actions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    })
    const json = await res.json()
    if (!res.ok) {
      setSubmitMsg(json.error || 'エラーが発生しました')
    } else {
      setSubmitMsg('受付済み。1〜2分後に結果が反映されます。')
      await fetchJobs()
    }
    setSubmitting(null)
  }

  const latest = logs[0] ?? null
  const timeline = logs.slice(0, 100)
  const detailLog = selectedLog ?? latest
  const detailIssues = detailLog?.checks.filter(c => c.level !== 'OK') ?? []
  const detailOkChecks = detailLog?.checks.filter(c => c.level === 'OK') ?? []
  const detailCounts = detailLog
    ? {
        crit: detailLog.checks.filter(c => c.level === 'CRIT').length,
        warn: detailLog.checks.filter(c => c.level === 'WARN').length,
        ok: detailLog.checks.filter(c => c.level === 'OK').length,
      }
    : { crit: 0, warn: 0, ok: 0 }

  const lastOkAt = logs.find(l => l.status === 'OK')?.checked_at ?? null

  const copyReport = () => {
    if (!latest) return
    const text = buildReportText(latest, lastOkAt, jobs)
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ヘッダー */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/admin/publish-rules')} className="text-gray-400 hover:text-gray-600 text-sm">
            ← 配信ルール
          </button>
          <span className="text-gray-300">/</span>
          <h1 className="text-lg font-bold text-gray-800">システムダッシュボード</h1>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={hours}
            onChange={e => { setHours(Number(e.target.value)); setSelectedLog(null) }}
            className="text-sm border border-gray-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-400"
          >
            <option value={6}>直近6時間</option>
            <option value={24}>直近24時間</option>
            <option value={72}>直近3日</option>
          </select>
          <button
            onClick={() => { setSelectedLog(null); fetchLogs(); fetchJobs() }}
            disabled={loading}
            className="text-sm bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg disabled:opacity-50"
          >
            {loading ? '読込中...' : '更新'}
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>
        )}

        {/* 現在のステータス */}
        {latest && (
          <div className={`rounded-xl border p-5 ${STATUS_COLOR[latest.status].bg} ${STATUS_COLOR[latest.status].border}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <StatusBadge status={latest.status} />
                <span className={`text-2xl font-bold ${STATUS_COLOR[latest.status].text}`}>
                  {latest.status === 'OK' ? '正常稼働中' : latest.status === 'WARN' ? '要注意' : '異常検知'}
                </span>
              </div>
              <div className="flex items-center gap-3">
                {latest.status !== 'OK' && (
                  <button
                    onClick={copyReport}
                    className="text-xs font-semibold bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    {copied ? '✅ コピーしました' : '📋 報告文をコピー'}
                  </button>
                )}
                <div className="text-right text-sm text-gray-600">
                  <div className="font-medium">最終チェック</div>
                  <div>{formatJst(latest.checked_at)}（{minutesAgo(latest.checked_at)}）</div>
                </div>
              </div>
            </div>
            {latest.status !== 'OK' && (
              <div className="mt-4 space-y-2">
                {latest.checks.filter(c => c.level !== 'OK').map((c, i) => {
                  const guide = CHECK_GUIDE[c.name]
                  return (
                    <div key={i} className={`rounded-lg border px-3 py-2.5 ${STATUS_COLOR[c.level].bg} ${STATUS_COLOR[c.level].border}`}>
                      <div className="flex items-center gap-2 flex-wrap">
                        <StatusBadge status={c.level} />
                        <span className={`text-sm font-semibold ${STATUS_COLOR[c.level].text}`}>{translateName(c.name)}</span>
                        {guide && <CategoryBadge category={guide.category} />}
                      </div>
                      {guide && (
                        <p className="mt-1 text-xs text-gray-700 pl-1">{guide.summary}</p>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {!latest && !loading && (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-500 text-sm">
            データがありません。health-checkがまだ一度も実行されていないか、VPSからのSupabase書き込みが未設定です。
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* タイムライン */}
          <div className="md:col-span-1 bg-white rounded-xl border border-gray-200 p-4">
            <h2 className="text-sm font-semibold text-gray-600 mb-3">ステータス履歴（{logs.length}件）</h2>
            <div className="space-y-1 overflow-y-auto max-h-[480px]">
              {timeline.map(log => (
                <button
                  key={log.id}
                  onClick={() => setSelectedLog(log)}
                  className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors ${
                    detailLog?.id === log.id ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_COLOR[log.status].dot}`} />
                  <span className="text-gray-700 flex-1">{formatJst(log.checked_at)}</span>
                  <span className={`font-semibold ${STATUS_COLOR[log.status].text}`}>{log.status}</span>
                </button>
              ))}
              {logs.length === 0 && !loading && (
                <p className="text-xs text-gray-400 text-center py-4">データなし</p>
              )}
            </div>
          </div>

          {/* チェック詳細 + エラーガイド */}
          <div className="md:col-span-2 bg-white rounded-xl border border-gray-200 p-4">
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-sm font-semibold text-gray-600">
                {detailLog ? <>チェック詳細 — {formatJst(detailLog.checked_at)}</> : 'チェック詳細'}
              </h2>
              {detailLog && (
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="rounded-full bg-red-50 px-2 py-0.5 font-semibold text-red-700">異常 {detailCounts.crit}</span>
                  <span className="rounded-full bg-yellow-50 px-2 py-0.5 font-semibold text-yellow-700">注意 {detailCounts.warn}</span>
                  <span className="rounded-full bg-green-50 px-2 py-0.5 font-semibold text-green-700">正常 {detailCounts.ok}</span>
                </div>
              )}
            </div>
            {submitMsg && (
              <div className="mb-3 text-xs px-3 py-2 rounded-lg bg-blue-50 text-blue-700 border border-blue-200">
                {submitMsg}
              </div>
            )}
            {detailLog ? (
              <div className="space-y-4">
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-xs font-semibold text-gray-500">対応が必要な項目</h3>
                    <span className="text-xs text-gray-400">{detailIssues.length}件</span>
                  </div>
                  {detailIssues.length > 0 ? (
                    <div className="space-y-2">
                      {detailIssues.map((c, i) => {
                        const guide = CHECK_GUIDE[c.name]
                        return (
                          <div
                            key={`${c.name}-${i}`}
                            className={`flex flex-col gap-1.5 px-3 py-2.5 rounded-lg border text-sm ${STATUS_COLOR[c.level].bg} ${STATUS_COLOR[c.level].border}`}
                          >
                            <div className="flex items-center gap-2 flex-wrap">
                              <StatusBadge status={c.level} />
                              <span className="font-medium text-gray-800">{translateName(c.name)}</span>
                              {guide && <CategoryBadge category={guide.category} />}
                            </div>

                            <p className={`text-xs leading-relaxed pl-1 ${STATUS_COLOR[c.level].text} break-all`}>
                              {translateMessage(c.name, c.message)}
                            </p>

                            {guide && (
                              <div className="mt-0.5 pl-1 space-y-1.5">
                                <div className="text-xs bg-white/70 rounded px-2 py-2 leading-relaxed space-y-0.5">
                                  <p className="text-gray-500 font-medium">店舗の対応</p>
                                  <p className="text-gray-700">{guide.operatorAction}</p>
                                </div>
                                {guide.action && (
                                  <button
                                    onClick={() => submitAction(guide.action!)}
                                    disabled={submitting === guide.action}
                                    className="text-xs font-semibold bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-3 py-1.5 rounded-lg disabled:opacity-50 transition-colors"
                                  >
                                    {submitting === guide.action ? '送信中...' : `🔄 ${guide.actionLabel}`}
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="rounded-lg border border-green-100 bg-green-50 px-3 py-2 text-xs font-medium text-green-700">
                      対応が必要な項目はありません。
                    </div>
                  )}
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-xs font-semibold text-gray-500">正常項目</h3>
                    <span className="text-xs text-gray-400">{detailOkChecks.length}件</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {detailOkChecks.map((c, i) => (
                      <div key={`${c.name}-${i}`} className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className="h-2 w-2 shrink-0 rounded-full bg-green-500" />
                          <span className="min-w-0 flex-1 truncate text-xs font-semibold text-gray-700">{translateName(c.name)}</span>
                        </div>
                        <p className="mt-1 truncate text-xs text-gray-500">{translateMessage(c.name, c.message)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-400 text-center py-8">左のタイムラインから選択してください</p>
            )}
          </div>
        </div>

        {/* 復旧操作履歴 */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-600">復旧操作の履歴</h2>
            <button onClick={fetchJobs} className="text-xs text-gray-400 hover:text-gray-600">更新</button>
          </div>
          {jobs.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-4">操作履歴なし</p>
          ) : (
            <div className="space-y-2">
              {jobs.slice(0, 10).map(job => {
                const s = JOB_STATUS_STYLE[job.status] ?? JOB_STATUS_STYLE.skipped
                const isAuto = job.requested_by === 'auto'
                const recoveryLabel = getRecoveryLabel(job, latest)
                return (
                  <div key={job.id} className="flex items-start gap-3 text-xs border border-gray-100 rounded-lg px-3 py-2.5">
                    <div className="flex flex-col gap-1 shrink-0 items-start">
                      {recoveryLabel ? (
                        <>
                          <span className="px-2 py-0.5 rounded-full font-semibold bg-green-100 text-green-700">
                            復旧済み
                          </span>
                          <span className={`px-2 py-0.5 rounded-full font-semibold ${isAuto ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                            {recoveryLabel}
                          </span>
                        </>
                      ) : (
                        <>
                          <span className={`px-2 py-0.5 rounded-full font-semibold ${s.bg} ${s.text}`}>
                            {s.label}
                          </span>
                          <span className={`px-2 py-0.5 rounded-full font-semibold ${isAuto ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-500'}`}>
                            {isAuto ? '自動' : '手動'}
                          </span>
                        </>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-800">{ACTION_JA[job.action] ?? job.action}</div>
                      {job.error && (
                        <div className="text-red-600 mt-0.5 break-all">{job.error}</div>
                      )}
                    </div>
                    <div className="shrink-0 text-gray-400 text-right">
                      <div>{formatJst(job.requested_at)}</div>
                      {job.finished_at && (
                        <div className={job.status === 'succeeded' ? 'text-green-600' : 'text-red-500'}>
                          {minutesAgo(job.finished_at)}に{job.status === 'succeeded' ? '完了' : '失敗'}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* cronスケジュール早見表 */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h2 className="text-sm font-semibold text-gray-600 mb-3">cronスケジュール一覧</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="py-2 pr-4 font-semibold text-gray-500 whitespace-nowrap">処理</th>
                  <th className="py-2 pr-4 font-semibold text-gray-500 whitespace-nowrap">周期</th>
                  <th className="py-2 font-semibold text-gray-500">ログ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {[
                  { name: 'Venrey sync',      interval: '10分ごと',              log: 'sync.log' },
                  { name: 'HP掲載（CP4）',    interval: '10分ごと（:05〜）',     log: 'cp4-apply.log' },
                  { name: 'HPリアルタイム更新（自動）', interval: '10分ごと（:00,:10...）', log: 'cp4-freetext.log' },
                  { name: 'CP4リアルタイム更新（手動）', interval: '1分ごと',              log: 'manual-freetext-worker.log' },
                  { name: 'Venreyリアルタイム更新（手動）', interval: '1分ごと',            log: 'manual-freetext-venrey-worker.log' },
                  { name: '新規キャスト確認', interval: '1時間ごと',             log: 'new-cast-check.log' },
                  { name: 'Venreyダンプ更新', interval: '毎日 04:00 JST',        log: 'venrey-dump.log' },
                  { name: 'HPキャストダンプ', interval: '毎日 03:00 JST',        log: 'cp4-cast-dump.log' },
                  { name: 'キャスト一括更新', interval: '毎日 05:00 JST',        log: 'daily-cast-fill.log' },
                  { name: 'ヘルスチェック',   interval: '15分ごと',              log: 'health-check.log' },
                  { name: 'ファイル自動整理', interval: '毎日 03:30 JST',        log: 'retention-cleanup.log' },
                  { name: '週次解析レポート', interval: '月曜 08:00 JST',        log: 'analytics-report.log' },
                ].map(row => (
                  <tr key={row.name}>
                    <td className="py-2 pr-4 text-gray-800 font-medium whitespace-nowrap">{row.name}</td>
                    <td className="py-2 pr-4 text-gray-600 whitespace-nowrap">{row.interval}</td>
                    <td className="py-2 text-gray-400 font-mono">{row.log}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  )
}
