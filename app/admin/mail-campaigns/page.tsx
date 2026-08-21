'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

type Preview = {
  filter_months: number
  count: number
  capped_by_default: boolean
  max_recipients: number
  sample: Array<{ phone: string; email: string; name: string | null; last_visited_at: string }>
}

type Campaign = {
  id: number
  subject: string
  filter_months: number
  status: 'draft' | 'queued' | 'sending' | 'sent' | 'failed'
  error_message: string | null
  created_at: string
  queued_at: string | null
  sent_at: string | null
  recipient_stats: { total: number; sent: number; opened: number; clicked: number; tests: number }
}

const STATUS_LABEL: Record<Campaign['status'], string> = {
  draft: '下書き',
  queued: '待機中',
  sending: '配信中',
  sent: '完了',
  failed: '失敗',
}

function pct(numerator: number, denominator: number) {
  if (!denominator) return '0.0%'
  return `${((numerator / denominator) * 100).toFixed(1)}%`
}

function CampaignRow({ campaign, onChanged }: { campaign: Campaign; onChanged: () => void }) {
  const [testEmail, setTestEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const s = campaign.recipient_stats

  const sendTest = async () => {
    setBusy(true)
    setError(null)
    setMessage(null)
    const res = await fetch('/api/admin/mail-campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'test_send', campaign_id: campaign.id, test_email: testEmail }),
    })
    const json = await res.json()
    setBusy(false)
    if (!res.ok) { setError(json.error ?? 'テスト送信に失敗しました'); return }
    setMessage('テスト送信しました')
    onChanged()
  }

  const queueCampaign = async () => {
    setBusy(true)
    setError(null)
    setMessage(null)
    const res = await fetch('/api/admin/mail-campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'queue_campaign', campaign_id: campaign.id, confirm_live_send: true }),
    })
    const json = await res.json()
    setBusy(false)
    if (!res.ok) { setError(json.error ?? 'キュー投入に失敗しました'); return }
    setMessage('配信キューへ投入しました')
    onChanged()
  }

  return (
    <div className="rounded-md border border-gray-200 bg-white px-3 py-3 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">#{campaign.id}</span>
            <span className="text-xs text-gray-500">{STATUS_LABEL[campaign.status]}</span>
            <span className="text-xs text-gray-400">{campaign.filter_months}ヶ月</span>
          </div>
          <p className="mt-1 truncate font-medium text-gray-800">{campaign.subject}</p>
          <p className="mt-1 text-xs text-gray-400">{new Date(campaign.created_at).toLocaleString('ja-JP')}</p>
        </div>
        <div className="grid grid-cols-4 gap-3 text-right text-xs">
          <div><div className="font-semibold text-gray-800">{s.total}</div><div className="text-gray-400">対象</div></div>
          <div><div className="font-semibold text-gray-800">{s.sent}</div><div className="text-gray-400">送信</div></div>
          <div><div className="font-semibold text-gray-800">{pct(s.opened, s.sent)}</div><div className="text-gray-400">開封</div></div>
          <div><div className="font-semibold text-gray-800">{pct(s.clicked, s.sent)}</div><div className="text-gray-400">クリック</div></div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          type="email"
          value={testEmail}
          onChange={(e) => setTestEmail(e.target.value)}
          className="w-64 rounded-md border border-gray-300 px-3 py-1.5 text-sm"
          placeholder="test@example.com"
        />
        <button
          onClick={sendTest}
          disabled={busy || !testEmail}
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          自分宛てテスト送信
        </button>
        {campaign.status === 'draft' && (
          <button
            onClick={queueCampaign}
            disabled={busy}
            className="rounded-lg border border-red-300 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-700 disabled:opacity-50"
          >
            実配信キューへ投入
          </button>
        )}
      </div>
      {s.tests > 0 && <p className="mt-1 text-xs text-gray-400">テスト送信 {s.tests}件</p>}
      {message && <p className="mt-2 text-xs text-green-600">{message}</p>}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      {campaign.error_message && <p className="mt-2 text-xs text-red-600">{campaign.error_message}</p>}
    </div>
  )
}

export default function MailCampaignsPage() {
  const [filterMonths, setFilterMonths] = useState(6)
  const [subject, setSubject] = useState('')
  const [bodyHtml, setBodyHtml] = useState('')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    document.title = 'メルマガ配信 | KIJ管理'
  }, [])

  const canCreate = useMemo(() => {
    return subject.trim() && bodyHtml.trim() && preview && preview.count > 0 && !preview.capped_by_default
  }, [subject, bodyHtml, preview])

  const loadCampaigns = useCallback(async () => {
    const res = await fetch('/api/admin/mail-campaigns?limit=20')
    const json = await res.json()
    if (res.ok) setCampaigns(json.campaigns ?? [])
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => { loadCampaigns() }, 0)
    return () => window.clearTimeout(timer)
  }, [loadCampaigns])

  const loadPreview = async () => {
    setLoading(true)
    setError(null)
    setMessage(null)
    const res = await fetch(`/api/admin/mail-campaigns?preview_months=${filterMonths}`)
    const json = await res.json()
    setLoading(false)
    if (!res.ok) { setError(json.error ?? 'プレビュー取得に失敗しました'); return }
    setPreview(json.preview)
  }

  const createDraft = async () => {
    setLoading(true)
    setError(null)
    setMessage(null)
    const res = await fetch('/api/admin/mail-campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'create_draft',
        subject,
        body_html: bodyHtml,
        filter_months: filterMonths,
      }),
    })
    const json = await res.json()
    setLoading(false)
    if (!res.ok) { setError(json.error ?? '下書き作成に失敗しました'); return }
    setMessage(`下書き #${json.campaign_id} を作成しました`)
    setSubject('')
    setBodyHtml('')
    setPreview(null)
    await loadCampaigns()
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">メルマガ配信</h1>
          <p className="mt-1 text-sm text-gray-500">CS3顧客台帳と最終利用日から対象を固定します</p>
        </div>
        <button
          onClick={loadCampaigns}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700"
        >
          更新
        </button>
      </div>

      <section className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="grid gap-4 md:grid-cols-[220px_1fr]">
          <div>
            <label className="mb-1 block text-xs text-gray-500">直近利用期間</label>
            <select
              value={filterMonths}
              onChange={(e) => { setFilterMonths(Number(e.target.value)); setPreview(null) }}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              {[1, 2, 3, 6, 9, 12, 18, 24].map(m => <option key={m} value={m}>{m}ヶ月以内</option>)}
            </select>
            <button
              onClick={loadPreview}
              disabled={loading}
              className="mt-2 w-full rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              対象をプレビュー
            </button>
          </div>

          <div className="grid gap-3">
            <div>
              <label className="mb-1 block text-xs text-gray-500">件名</label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-500">本文 HTML</label>
              <textarea
                value={bodyHtml}
                onChange={(e) => setBodyHtml(e.target.value)}
                rows={10}
                className="w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-xs"
              />
            </div>
          </div>
        </div>

        {preview && (
          <div className="mt-4 rounded-md border border-gray-200 bg-gray-50 p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <span className="font-semibold text-gray-900">{preview.count}</span>
                <span className="ml-1 text-gray-500">件</span>
                {preview.capped_by_default && (
                  <span className="ml-3 text-red-600">安全上限 {preview.max_recipients} 件を超過</span>
                )}
              </div>
              <button
                onClick={createDraft}
                disabled={loading || !canCreate}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                下書き作成
              </button>
            </div>
            {preview.sample.length > 0 && (
              <div className="mt-2 grid gap-1 text-xs text-gray-500 md:grid-cols-2">
                {preview.sample.slice(0, 6).map(r => (
                  <div key={`${r.phone}-${r.email}`} className="truncate">
                    {r.name ?? '名前なし'} / {r.email} / {new Date(r.last_visited_at).toLocaleDateString('ja-JP')}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {message && <p className="mt-3 text-sm text-green-600">{message}</p>}
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </section>

      <section className="mt-6">
        <h2 className="mb-3 text-sm font-bold text-gray-800">キャンペーン</h2>
        <div className="space-y-3">
          {campaigns.map(c => <CampaignRow key={c.id} campaign={c} onChanged={loadCampaigns} />)}
          {campaigns.length === 0 && <p className="rounded-md border border-gray-200 bg-white p-4 text-sm text-gray-500">キャンペーンはありません</p>}
        </div>
      </section>
    </main>
  )
}
