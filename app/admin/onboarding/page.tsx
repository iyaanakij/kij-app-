'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { OnboardingSubmission, OnboardingStatus } from '@/lib/types'
import { AREAS } from '@/lib/types'

const STATUS_LABEL: Record<OnboardingStatus, string> = {
  pending_cast: 'URL発行済み',
  submitted:    '回答済み',
  approved:     '承認済み',
  rejected:     '却下',
}
const STATUS_COLOR: Record<OnboardingStatus, string> = {
  pending_cast: 'bg-gray-100 text-gray-600',
  submitted:    'bg-yellow-100 text-yellow-700',
  approved:     'bg-green-100 text-green-700',
  rejected:     'bg-red-100 text-red-600',
}

export default function OnboardingListPage() {
  const router = useRouter()
  const [submissions, setSubmissions] = useState<OnboardingSubmission[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { document.title = 'オンボーディング管理 | KIJ管理' }, [])

  useEffect(() => {
    fetch('/api/admin/onboarding')
      .then(r => r.json())
      .then(d => { setSubmissions(d.submissions ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const areaName = (id: number) => AREAS.find(a => a.id === id)?.name ?? id

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100">オンボーディング管理</h1>
        <button
          onClick={() => router.push('/admin/onboarding/new')}
          className="bg-pink-500 hover:bg-pink-600 text-white text-sm font-bold px-4 py-2 rounded-xl transition-colors"
        >
          + URLを発行
        </button>
      </div>

      {loading ? (
        <p className="text-gray-400 text-sm">読み込み中...</p>
      ) : submissions.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow p-8 text-center text-gray-400 text-sm">
          まだ案件がありません
        </div>
      ) : (
        <div className="space-y-2">
          {submissions.map(s => (
            <button
              key={s.id}
              onClick={() => router.push(`/admin/onboarding/${s.id}`)}
              className="w-full text-left bg-white dark:bg-gray-800 rounded-xl shadow-sm hover:shadow transition-shadow px-4 py-3 flex items-center gap-4"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-bold text-gray-800 dark:text-gray-100 truncate">
                    {s.normalized_data?.stage_name ?? '（未入力）'}
                  </span>
                  <span className="text-xs text-gray-500 shrink-0">
                    {s.brand === 'M' ? 'M性感' : '癒したくて'} {areaName(s.area_id)}
                  </span>
                </div>
                <p className="text-xs text-gray-400">
                  発行: {new Date(s.created_at).toLocaleDateString('ja-JP')}
                  {s.submitted_at && `　回答: ${new Date(s.submitted_at).toLocaleDateString('ja-JP')}`}
                </p>
              </div>
              <span className={`shrink-0 text-xs px-2 py-1 rounded-full font-medium ${STATUS_COLOR[s.status]}`}>
                {STATUS_LABEL[s.status]}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
