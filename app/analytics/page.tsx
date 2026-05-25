'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface PeriodRange {
  startDate: string
  endDate: string
}

interface Report {
  id: number
  report_date: string
  report_type: string
  summary: string
  raw_data: {
    // 新形式: ga4/searchConsole別の期間
    period?: {
      ga4?: PeriodRange
      searchConsole?: PeriodRange
      previous?: { ga4?: PeriodRange; searchConsole?: PeriodRange }
      // 旧形式互換
      startDate?: string
      endDate?: string
    }
    ga4?: Record<string, { current: GA4Summary; previous: GA4Summary }>
  }
  created_at: string
}

interface GA4Summary {
  sessions: number
  users: number
  pageviews: number
  bounceRate: number
  avgDuration: number
  events: number
}

function formatDate(d: string) {
  return d.replace(/-/g, '/').slice(2)
}

function pctChange(curr: number, prev: number) {
  if (!prev) return null
  const p = Math.round((curr - prev) / prev * 100)
  return p
}

function PctBadge({ curr, prev }: { curr: number; prev: number }) {
  const p = pctChange(curr, prev)
  if (p === null) return null
  const color = p >= 0 ? 'text-green-600' : 'text-red-500'
  return <span className={`text-xs ${color} ml-1`}>{p >= 0 ? '+' : ''}{p}%</span>
}

function MarkdownContent({ text }: { text: string }) {
  const lines = text.split('\n')
  return (
    <div className="space-y-1">
      {lines.map((line, i) => {
        if (line.startsWith('# '))  return <h1 key={i} className="text-lg font-bold mt-4 mb-2">{line.slice(2)}</h1>
        if (line.startsWith('## ')) return <h2 key={i} className="text-base font-bold mt-3 mb-1 text-gray-800">{line.slice(3)}</h2>
        if (line.startsWith('### ')) return <h3 key={i} className="text-sm font-semibold mt-2 text-gray-700">{line.slice(4)}</h3>
        if (line.startsWith('| ') && line.includes('|')) {
          if (line.match(/^\|[-| ]+\|$/)) return null
          const cells = line.split('|').filter((_, ci) => ci > 0 && ci < line.split('|').length - 1)
          const isHeader = lines[i + 1]?.match(/^\|[-| ]+\|$/)
          return (
            <div key={i} className={`grid text-xs ${isHeader ? 'font-semibold bg-gray-100' : 'border-b border-gray-100'}`}
              style={{ gridTemplateColumns: `repeat(${cells.length}, minmax(0, 1fr))` }}>
              {cells.map((c, ci) => <div key={ci} className="px-2 py-1 break-words">{c.trim().replace(/\*\*/g, '')}</div>)}
            </div>
          )
        }
        if (line.startsWith('- ') || line.startsWith('* ')) {
          return <p key={i} className="text-sm pl-3 text-gray-700">• {line.slice(2).replace(/\*\*(.*?)\*\*/g, '$1')}</p>
        }
        if (line.startsWith('**') && line.endsWith('**')) {
          return <p key={i} className="text-sm font-semibold text-gray-800">{line.replace(/\*\*/g, '')}</p>
        }
        if (line.trim() === '' || line === '---') return <div key={i} className="h-1" />
        return <p key={i} className="text-sm text-gray-700 leading-relaxed">{line.replace(/\*\*(.*?)\*\*/g, '$1')}</p>
      })}
    </div>
  )
}

export default function AnalyticsPage() {
  const [reports, setReports] = useState<Report[]>([])
  const [selected, setSelected] = useState<Report | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('analytics_reports')
      .select('*')
      .order('report_date', { ascending: false })
      .limit(12)
      .then(({ data }) => {
        if (data && data.length > 0) {
          setReports(data as Report[])
          setSelected(data[0] as Report)
        }
        setLoading(false)
      })
  }, [])

  if (loading) return <div className="p-6 text-gray-500 text-sm">読み込み中...</div>

  if (reports.length === 0) {
    return (
      <div className="p-6">
        <h1 className="text-lg font-bold mb-2">ウェブ解析レポート</h1>
        <p className="text-sm text-gray-500">レポートがまだありません。VPSで analytics-report.js を実行してください。</p>
      </div>
    )
  }

  const ga4 = selected?.raw_data?.ga4
  const period = selected?.raw_data?.period

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-bold">ウェブ解析レポート</h1>
        <select
          className="text-sm border rounded px-2 py-1"
          value={selected?.id}
          onChange={e => setSelected(reports.find(r => r.id === Number(e.target.value)) ?? null)}
        >
          {reports.map(r => (
            <option key={r.id} value={r.id}>
              {r.report_date} ({r.report_type})
            </option>
          ))}
        </select>
      </div>

      {period && (
        <p className="text-xs text-gray-500 mb-4">
          {period.ga4
            ? <>GA4: {formatDate(period.ga4.startDate)} 〜 {formatDate(period.ga4.endDate)}　SC: {formatDate(period.searchConsole!.startDate)} 〜 {formatDate(period.searchConsole!.endDate)}</>
            : <>集計期間: {formatDate(period.startDate!)} 〜 {formatDate(period.endDate!)}</>
          }
        </p>
      )}

      {/* GA4 店舗別サマリー */}
      {ga4 && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-2">店舗別セッション数</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {Object.entries(ga4).map(([name, data]) => (
              <div key={name} className="bg-white border rounded p-3">
                <div className="text-xs text-gray-500 mb-1 truncate">{name}</div>
                <div className="text-xl font-bold">{data.current.sessions.toLocaleString()}</div>
                <PctBadge curr={data.current.sessions} prev={data.previous.sessions} />
                <div className="text-xs text-gray-400 mt-1">
                  直帰 {data.current.bounceRate}%
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AI分析レポート */}
      <div className="bg-white border rounded p-4">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">AI分析レポート</h2>
        <MarkdownContent text={selected?.summary ?? ''} />
      </div>
    </div>
  )
}
