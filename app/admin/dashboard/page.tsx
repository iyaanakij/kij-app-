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

const STATUS_COLOR = {
  OK:   { bg: 'bg-green-100',  text: 'text-green-800',  border: 'border-green-300',  dot: 'bg-green-500'  },
  WARN: { bg: 'bg-yellow-100', text: 'text-yellow-800', border: 'border-yellow-300', dot: 'bg-yellow-500' },
  CRIT: { bg: 'bg-red-100',    text: 'text-red-800',    border: 'border-red-300',    dot: 'bg-red-500'    },
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

export default function DashboardPage() {
  const router = useRouter()
  const [logs, setLogs] = useState<HealthLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedLog, setSelectedLog] = useState<HealthLog | null>(null)
  const [hours, setHours] = useState(24)

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    setError('')
    const res = await fetch(`/api/admin/health-check?hours=${hours}`)
    if (!res.ok) {
      setError(`取得失敗 (${res.status})`)
      setLoading(false)
      return
    }
    const json = await res.json()
    setLogs(json.logs || [])
    if (json.logs?.length > 0 && !selectedLog) setSelectedLog(json.logs[0])
    setLoading(false)
  }, [hours, selectedLog])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  const latest = logs[0] ?? null

  // 直近24hのステータスを時系列で並べる（古い順）
  const timeline = [...logs].reverse()

  // 表示するチェック詳細（selectedLog か latest）
  const detailLog = selectedLog ?? latest

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ヘッダー */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/admin/publish-rules')}
            className="text-gray-400 hover:text-gray-600 text-sm"
          >
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
            onClick={() => { setSelectedLog(null); fetchLogs() }}
            disabled={loading}
            className="text-sm bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg disabled:opacity-50"
          >
            {loading ? '読込中...' : '更新'}
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
            {error}
          </div>
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
              <div className="text-right text-sm text-gray-600">
                <div className="font-medium">最終チェック</div>
                <div>{formatJst(latest.checked_at)}（{minutesAgo(latest.checked_at)}）</div>
              </div>
            </div>

            {/* WARN/CRIT のメッセージをここに表示 */}
            {latest.status !== 'OK' && (
              <div className="mt-4 space-y-1.5">
                {latest.checks
                  .filter(c => c.level !== 'OK')
                  .map((c, i) => (
                    <div key={i} className={`text-sm px-3 py-2 rounded-lg ${STATUS_COLOR[c.level].bg} ${STATUS_COLOR[c.level].text} border ${STATUS_COLOR[c.level].border}`}>
                      <span className="font-semibold">[{c.level}] {c.name}:</span> {c.message}
                    </div>
                  ))}
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
            <h2 className="text-sm font-semibold text-gray-600 mb-3">
              ステータス履歴（{logs.length}件）
            </h2>
            <div className="space-y-1 overflow-y-auto max-h-[480px]">
              {timeline.map(log => (
                <button
                  key={log.id}
                  onClick={() => setSelectedLog(log)}
                  className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors ${
                    detailLog?.id === log.id
                      ? 'bg-blue-50 border border-blue-200'
                      : 'hover:bg-gray-50'
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

          {/* チェック詳細 */}
          <div className="md:col-span-2 bg-white rounded-xl border border-gray-200 p-4">
            <h2 className="text-sm font-semibold text-gray-600 mb-3">
              {detailLog ? (
                <>チェック詳細 — {formatJst(detailLog.checked_at)}</>
              ) : 'チェック詳細'}
            </h2>
            {detailLog ? (
              <div className="space-y-2">
                {detailLog.checks.map((c, i) => (
                  <div
                    key={i}
                    className={`flex flex-col gap-0.5 px-3 py-2.5 rounded-lg border text-sm ${STATUS_COLOR[c.level].bg} ${STATUS_COLOR[c.level].border}`}
                  >
                    <div className="flex items-center gap-2">
                      <StatusBadge status={c.level} />
                      <span className="font-medium text-gray-800">{c.name}</span>
                    </div>
                    <p className={`text-xs leading-relaxed pl-1 ${STATUS_COLOR[c.level].text} break-all`}>
                      {c.message}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400 text-center py-8">左のタイムラインから選択してください</p>
            )}
          </div>
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
                  { name: 'Venrey sync', interval: '10分ごと',     log: 'sync.log' },
                  { name: 'CP4 apply',   interval: '10分ごと（:05〜）', log: 'cp4-apply.log' },
                  { name: 'CP4 freetext', interval: '10分ごと（:00,:10,:20...）', log: 'cp4-freetext.log' },
                  { name: '新規キャスト確認', interval: '1時間ごと',   log: 'new-cast-check.log' },
                  { name: 'Venrey dump', interval: '毎日 04:00 JST', log: 'venrey-dump.log' },
                  { name: 'CP4 キャストdump', interval: '毎日 03:00 JST', log: 'cp4-cast-dump.log' },
                  { name: 'daily cast-fill', interval: '毎日 05:00 JST', log: 'daily-cast-fill.log' },
                  { name: 'health-check', interval: '15分ごと',     log: 'health-check.log' },
                  { name: 'retention cleanup', interval: '毎日 03:30 JST', log: 'retention-cleanup.log' },
                  { name: '週次レポート', interval: '月曜 08:00 JST', log: 'analytics-report.log' },
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
