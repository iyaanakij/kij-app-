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

type RecipientDetail = {
  id: number
  is_test: boolean
  email: string
  name: string | null
  sent_at: string | null
  opened_at: string | null
  open_count: number
  first_clicked_at: string | null
  click_count: number
}

type LinkClick = { url: string; count: number }

type CampaignDetail = { recipients: RecipientDetail[]; link_clicks: LinkClick[] }

type LpSignup = {
  id: number
  email: string
  coupon_code: string
  confirmation_sent_at: string | null
  confirmation_error: string | null
  matched_phone: string | null
  matched_at: string | null
  created_at: string
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
  const [detail, setDetail] = useState<CampaignDetail | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const s = campaign.recipient_stats

  const toggleDetail = async () => {
    if (detailOpen) { setDetailOpen(false); return }
    setDetailOpen(true)
    if (detail) return
    setDetailLoading(true)
    const res = await fetch(`/api/admin/mail-campaigns?campaign_detail=${campaign.id}`)
    const json = await res.json()
    setDetailLoading(false)
    if (res.ok) setDetail(json)
  }

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
        <button
          onClick={toggleDetail}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700"
        >
          {detailOpen ? '詳細を閉じる' : '詳細を見る'}
        </button>
      </div>
      {s.tests > 0 && <p className="mt-1 text-xs text-gray-400">テスト送信 {s.tests}件</p>}
      {message && <p className="mt-2 text-xs text-green-600">{message}</p>}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      {campaign.error_message && <p className="mt-2 text-xs text-red-600">{campaign.error_message}</p>}

      {detailOpen && (
        <div className="mt-3 rounded-md border border-gray-200 bg-gray-50 p-3">
          {detailLoading && <p className="text-xs text-gray-400">読み込み中...</p>}
          {detail && (
            <>
              <div className="mb-3">
                <p className="mb-1 text-xs font-semibold text-gray-600">リンク別クリック数</p>
                {detail.link_clicks.length === 0 ? (
                  <p className="text-xs text-gray-400">クリックはまだありません</p>
                ) : (
                  <div className="space-y-1">
                    {detail.link_clicks.map(lc => (
                      <div key={lc.url} className="flex items-center justify-between gap-2 text-xs">
                        <span className="truncate text-gray-600" title={lc.url}>{lc.url}</span>
                        <span className="shrink-0 font-semibold text-gray-800">{lc.count}回</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold text-gray-600">受信者別状況（{detail.recipients.length}件）</p>
                <div className="max-h-72 overflow-y-auto rounded border border-gray-200 bg-white">
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 bg-gray-100 text-gray-500">
                      <tr>
                        <th className="px-2 py-1 font-medium">宛先</th>
                        <th className="px-2 py-1 font-medium">送信</th>
                        <th className="px-2 py-1 font-medium">開封</th>
                        <th className="px-2 py-1 font-medium">クリック</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.recipients.map(r => (
                        <tr key={r.id} className="border-t border-gray-100">
                          <td className="max-w-[220px] truncate px-2 py-1">
                            {r.name ?? '名前なし'} / {r.email}
                            {r.is_test && <span className="ml-1 rounded bg-yellow-100 px-1 text-[10px] text-yellow-700">test</span>}
                          </td>
                          <td className="px-2 py-1 text-gray-500">{r.sent_at ? new Date(r.sent_at).toLocaleString('ja-JP') : '—'}</td>
                          <td className="px-2 py-1 text-gray-500">{r.opened_at ? `${new Date(r.opened_at).toLocaleString('ja-JP')} (${r.open_count}回)` : '—'}</td>
                          <td className="px-2 py-1 text-gray-500">{r.first_clicked_at ? `${new Date(r.first_clicked_at).toLocaleString('ja-JP')} (${r.click_count}回)` : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function LpSignupsSection() {
  const [signups, setSignups] = useState<LpSignup[]>([])
  const [loaded, setLoaded] = useState(false)
  const [redeemPhone, setRedeemPhone] = useState('')
  const [redeemCode, setRedeemCode] = useState('')
  const [redeemBusy, setRedeemBusy] = useState(false)
  const [redeemMessage, setRedeemMessage] = useState<string | null>(null)
  const [redeemError, setRedeemError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/lp-signups?limit=50')
    const json = await res.json()
    setLoaded(true)
    if (res.ok) setSignups(json.signups ?? [])
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => { load() }, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  const remove = async (id: number) => {
    if (!window.confirm('この登録を削除しますか？')) return
    await fetch(`/api/admin/lp-signups/${id}`, { method: 'DELETE' })
    await load()
  }

  const redeem = async () => {
    setRedeemBusy(true)
    setRedeemMessage(null)
    setRedeemError(null)
    const res = await fetch('/api/admin/lp-signups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'redeem', coupon_code: redeemCode, phone: redeemPhone }),
    })
    const json = await res.json()
    setRedeemBusy(false)
    if (!res.ok) { setRedeemError(json.error ?? '紐付けに失敗しました'); return }
    setRedeemMessage(
      json.previously_matched_phone
        ? `紐付けました（以前は ${json.previously_matched_phone} に紐付いていました）`
        : '紐付けました'
    )
    setRedeemPhone('')
    setRedeemCode('')
    await load()
  }

  return (
    <section className="mt-6">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-bold text-gray-800">LP登録リード（/group/discount/）</h2>
        <button onClick={load} className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-700">更新</button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-md border border-gray-200 bg-white p-3">
        <span className="text-xs text-gray-500">クーポン紐付け：</span>
        <input
          type="text"
          value={redeemPhone}
          onChange={(e) => setRedeemPhone(e.target.value)}
          className="w-40 rounded-md border border-gray-300 px-3 py-1.5 text-sm"
          placeholder="電話番号"
        />
        <input
          type="text"
          value={redeemCode}
          onChange={(e) => setRedeemCode(e.target.value)}
          className="w-32 rounded-md border border-gray-300 px-3 py-1.5 text-sm font-mono"
          placeholder="クーポンコード"
        />
        <button
          onClick={redeem}
          disabled={redeemBusy || !redeemPhone || !redeemCode}
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          紐付け
        </button>
        {redeemMessage && <p className="w-full text-xs text-green-600">{redeemMessage}</p>}
        {redeemError && <p className="w-full text-xs text-red-600">{redeemError}</p>}
      </div>

      {!loaded && <p className="rounded-md border border-gray-200 bg-white p-4 text-sm text-gray-500">読み込み中...</p>}
      {loaded && signups.length === 0 && (
        <p className="rounded-md border border-gray-200 bg-white p-4 text-sm text-gray-500">登録はありません</p>
      )}
      {signups.length > 0 && (
        <div className="overflow-x-auto rounded-md border border-gray-200 bg-white">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-100 text-gray-500">
              <tr>
                <th className="px-2 py-1 font-medium">メール</th>
                <th className="px-2 py-1 font-medium">クーポンコード</th>
                <th className="px-2 py-1 font-medium">確認メール</th>
                <th className="px-2 py-1 font-medium">紐付け</th>
                <th className="px-2 py-1 font-medium">登録日時</th>
                <th className="px-2 py-1 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {signups.map(s => (
                <tr key={s.id} className="border-t border-gray-100">
                  <td className="max-w-[220px] truncate px-2 py-1">{s.email}</td>
                  <td className="px-2 py-1 font-mono">{s.coupon_code}</td>
                  <td className="px-2 py-1 text-gray-500">
                    {s.confirmation_sent_at
                      ? new Date(s.confirmation_sent_at).toLocaleString('ja-JP')
                      : s.confirmation_error ? <span className="text-red-600">失敗</span> : '—'}
                  </td>
                  <td className="px-2 py-1 text-gray-500">{s.matched_phone ?? '—'}</td>
                  <td className="px-2 py-1 text-gray-500">{new Date(s.created_at).toLocaleString('ja-JP')}</td>
                  <td className="px-2 py-1">
                    <button onClick={() => remove(s.id)} className="text-red-600 hover:underline">削除</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
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

      <LpSignupsSection />
    </main>
  )
}
