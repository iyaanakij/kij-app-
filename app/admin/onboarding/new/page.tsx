'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { AREAS } from '@/lib/types'

export default function OnboardingNewPage() {
  const router = useRouter()
  useEffect(() => { document.title = 'アンケートURL発行 | KIJ管理' }, [])
  const [brand, setBrand] = useState<'M' | 'E' | ''>('')
  const [areaId, setAreaId] = useState<number>(0)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ token: string; id: number } | null>(null)
  const [copied, setCopied] = useState(false)

  async function handleCreate() {
    if (!brand || !areaId) { alert('ブランドとエリアを選択してください'); return }
    setLoading(true)
    const res = await fetch('/api/admin/onboarding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brand, area_id: areaId }),
    })
    const d = await res.json()
    setLoading(false)
    if (d.error) { alert(`作成失敗: ${d.error}`); return }
    setResult(d)
  }

  const castUrl = result ? `${typeof window !== 'undefined' ? window.location.origin : ''}/cast/onboarding/${result.token}` : ''

  function handleCopy() {
    navigator.clipboard.writeText(castUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.push('/admin/onboarding')} className="text-gray-400 hover:text-gray-600 text-sm">← 一覧に戻る</button>
      </div>

      <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-6">アンケートURL発行</h1>

      {!result ? (
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">ブランド</label>
            <div className="flex gap-3">
              {(['M', 'E'] as const).map(b => (
                <button
                  key={b}
                  onClick={() => setBrand(b)}
                  className={`flex-1 py-3 rounded-xl border-2 font-bold transition-colors ${
                    brand === b
                      ? 'border-pink-500 bg-pink-50 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300'
                      : 'border-gray-200 text-gray-600 dark:border-gray-600 dark:text-gray-400'
                  }`}
                >
                  {b === 'M' ? 'M性感倶楽部' : '癒したくて'}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">エリア</label>
            <div className="grid grid-cols-2 gap-2">
              {AREAS.map(a => (
                <button
                  key={a.id}
                  onClick={() => setAreaId(a.id)}
                  className={`py-2.5 rounded-xl border-2 text-sm font-medium transition-colors ${
                    areaId === a.id
                      ? 'border-pink-500 bg-pink-50 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300'
                      : 'border-gray-200 text-gray-600 dark:border-gray-600 dark:text-gray-400'
                  }`}
                >
                  {a.name}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={handleCreate}
            disabled={loading || !brand || !areaId}
            className="w-full bg-pink-500 hover:bg-pink-600 disabled:bg-gray-300 text-white font-bold py-3 rounded-xl transition-colors mt-2"
          >
            {loading ? '作成中...' : 'URLを発行する'}
          </button>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow p-6 space-y-4">
          <div className="flex items-center gap-2 text-green-600">
            <span className="text-2xl">✅</span>
            <span className="font-bold">URL発行完了</span>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400">以下のURLをキャストにLINEで送ってください。</p>
          <div className="bg-gray-50 dark:bg-gray-700 rounded-xl p-3 break-all text-xs text-gray-700 dark:text-gray-300 font-mono">
            {castUrl}
          </div>
          <button
            onClick={handleCopy}
            className="w-full bg-gray-800 hover:bg-gray-900 text-white font-bold py-3 rounded-xl transition-colors"
          >
            {copied ? 'コピーしました！' : 'URLをコピー'}
          </button>
          <div className="flex gap-2 pt-2">
            <button
              onClick={() => { setResult(null); setBrand(''); setAreaId(0) }}
              className="flex-1 border border-gray-300 text-gray-700 dark:text-gray-300 py-2 rounded-xl text-sm"
            >
              もう1件発行
            </button>
            <button
              onClick={() => router.push(`/admin/onboarding/${result.id}`)}
              className="flex-1 bg-pink-500 text-white py-2 rounded-xl text-sm font-medium"
            >
              案件を見る
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
