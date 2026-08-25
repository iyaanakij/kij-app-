'use client'

import { useCallback, useEffect, useState } from 'react'
import NavBar from '@/components/NavBar'

type ReservationRequest = {
  id: number
  customer_id: string
  desired_date: string
  desired_time_range: string | null
  area: string | null
  brand: string | null
  cast_preference: string | null
  course_preference: string | null
  notes: string | null
  status: 'pending' | 'confirmed' | 'declined'
  staff_response_note: string | null
  created_at: string
}

type Coupon = {
  id: number
  customer_id: string
  code: string
  title: string
  discount_type: 'fixed_amount' | 'percentage'
  discount_value: number
  status: 'issued' | 'redeemed' | 'expired'
  issued_at: string
  redeemed_at: string | null
  expires_at: string | null
}

const STATUS_LABEL: Record<ReservationRequest['status'], string> = {
  pending: '未対応',
  confirmed: '確定',
  declined: '不可',
}

function RequestRow({ req, onChanged }: { req: ReservationRequest; onChanged: () => void }) {
  const [note, setNote] = useState(req.staff_response_note ?? '')
  const [busy, setBusy] = useState(false)

  const updateStatus = async (status: 'confirmed' | 'declined') => {
    setBusy(true)
    await fetch('/api/admin/customer-portal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update_request_status', request_id: req.id, status, staff_response_note: note }),
    })
    setBusy(false)
    onChanged()
  }

  return (
    <tr className="border-b">
      <td className="p-2">{req.desired_date}{req.desired_time_range ? ` ${req.desired_time_range}` : ''}</td>
      <td className="p-2">{req.brand ?? '-'} / {req.area ?? '-'}</td>
      <td className="p-2">{req.course_preference ?? '-'}</td>
      <td className="p-2">{req.cast_preference ?? '-'}</td>
      <td className="p-2 max-w-xs whitespace-pre-wrap">{req.notes ?? ''}</td>
      <td className="p-2">
        <span className={
          req.status === 'pending' ? 'text-orange-600' : req.status === 'confirmed' ? 'text-green-600' : 'text-gray-400'
        }>{STATUS_LABEL[req.status]}</span>
      </td>
      <td className="p-2">
        <input
          className="border rounded px-1 py-0.5 text-sm w-40"
          placeholder="スタッフメモ"
          value={note}
          onChange={e => setNote(e.target.value)}
        />
      </td>
      <td className="p-2 whitespace-nowrap">
        <button disabled={busy} onClick={() => updateStatus('confirmed')} className="text-sm px-2 py-1 bg-green-600 text-white rounded mr-1 disabled:opacity-50">確定</button>
        <button disabled={busy} onClick={() => updateStatus('declined')} className="text-sm px-2 py-1 bg-gray-400 text-white rounded disabled:opacity-50">不可</button>
      </td>
    </tr>
  )
}

export default function CustomerPortalAdminPage() {
  const [requests, setRequests] = useState<ReservationRequest[]>([])
  const [coupons, setCoupons] = useState<Coupon[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [redeemCode, setRedeemCode] = useState('')
  const [redeemMessage, setRedeemMessage] = useState<string | null>(null)
  const [redeemBusy, setRedeemBusy] = useState(false)

  useEffect(() => {
    document.title = 'マイページ連携 | KIJ管理'
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const res = await fetch('/api/admin/customer-portal')
    const json = await res.json()
    setLoading(false)
    if (!res.ok) { setError(json.error ?? '取得に失敗しました'); return }
    setRequests(json.requests ?? [])
    setCoupons(json.coupons ?? [])
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => { load() }, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  const redeem = async () => {
    const code = redeemCode.trim()
    if (!code) return
    setRedeemBusy(true)
    setRedeemMessage(null)
    const res = await fetch('/api/admin/customer-portal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'redeem_coupon', coupon_code: code }),
    })
    const json = await res.json()
    setRedeemBusy(false)
    if (!res.ok) { setRedeemMessage(`エラー: ${json.error ?? '不明なエラー'}`); return }
    setRedeemMessage('クーポンを使用済みにしました')
    setRedeemCode('')
    load()
  }

  const pending = requests.filter(r => r.status === 'pending')
  const resolved = requests.filter(r => r.status !== 'pending')

  return (
    <div>
      <NavBar />
      <main className="max-w-6xl mx-auto p-4 space-y-8">
        <h1 className="text-xl font-bold">顧客マイページ連携</h1>
        {error && <p className="text-red-600">{error}</p>}
        {loading && <p className="text-gray-500">読み込み中...</p>}

        <section>
          <h2 className="font-semibold mb-2">予約リクエスト（未対応 {pending.length}件）</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-100 text-left">
                  <th className="p-2">希望日時</th>
                  <th className="p-2">ブランド/エリア</th>
                  <th className="p-2">コース</th>
                  <th className="p-2">指名</th>
                  <th className="p-2">備考</th>
                  <th className="p-2">状態</th>
                  <th className="p-2">メモ</th>
                  <th className="p-2">操作</th>
                </tr>
              </thead>
              <tbody>
                {pending.map(r => <RequestRow key={r.id} req={r} onChanged={load} />)}
              </tbody>
            </table>
          </div>

          {resolved.length > 0 && (
            <details className="mt-4">
              <summary className="cursor-pointer text-gray-600">対応済み（{resolved.length}件）</summary>
              <table className="w-full text-sm border-collapse mt-2">
                <tbody>
                  {resolved.map(r => <RequestRow key={r.id} req={r} onChanged={load} />)}
                </tbody>
              </table>
            </details>
          )}
        </section>

        <section>
          <h2 className="font-semibold mb-2">クーポン店頭利用</h2>
          <div className="flex items-center gap-2 mb-2">
            <input
              className="border rounded px-2 py-1 text-sm"
              placeholder="クーポンコード"
              value={redeemCode}
              onChange={e => setRedeemCode(e.target.value)}
            />
            <button disabled={redeemBusy} onClick={redeem} className="px-3 py-1 bg-blue-600 text-white rounded text-sm disabled:opacity-50">使用済みにする</button>
            {redeemMessage && <span className="text-sm">{redeemMessage}</span>}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-100 text-left">
                  <th className="p-2">コード</th>
                  <th className="p-2">内容</th>
                  <th className="p-2">状態</th>
                  <th className="p-2">発行日</th>
                  <th className="p-2">有効期限</th>
                </tr>
              </thead>
              <tbody>
                {coupons.map(c => (
                  <tr key={c.id} className="border-b">
                    <td className="p-2 font-mono">{c.code}</td>
                    <td className="p-2">{c.title}</td>
                    <td className="p-2">{c.status === 'issued' ? '未使用' : c.status === 'redeemed' ? '使用済み' : '失効'}</td>
                    <td className="p-2">{c.issued_at?.slice(0, 10)}</td>
                    <td className="p-2">{c.expires_at?.slice(0, 10) ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  )
}
