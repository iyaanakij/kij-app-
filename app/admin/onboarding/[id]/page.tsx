'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import type { OnboardingSubmission, OnboardingJob, OnboardingJobType, OnboardingJobStatus, NormalizedOnboardingData } from '@/lib/types'
import { AREAS } from '@/lib/types'

const JOB_LABEL: Record<OnboardingJobType, string> = {
  create_staff:        'スタッフ登録',
  create_women_info:   '女性情報登録',
  create_publish_rule: 'publish_rules作成',
  create_cp4_profile:  'CP4プロフィール登録',
  create_venrey_cast:  'Venreyキャスト登録',
}
const JOB_STATUS_LABEL: Record<OnboardingJobStatus, string> = {
  pending:      '待機中',
  running:      '実行中',
  succeeded:    '完了',
  failed:       '失敗',
  needs_manual: '手動対応',
}
const JOB_STATUS_COLOR: Record<OnboardingJobStatus, string> = {
  pending:      'bg-gray-100 text-gray-600',
  running:      'bg-blue-100 text-blue-700',
  succeeded:    'bg-green-100 text-green-700',
  failed:       'bg-red-100 text-red-600',
  needs_manual: 'bg-yellow-100 text-yellow-700',
}

const ND_FIELDS: { key: keyof NormalizedOnboardingData; label: string; brand?: 'M' | 'E' }[] = [
  { key: 'stage_name',         label: '源氏名' },
  { key: 'real_name',          label: 'お名前' },
  { key: 'join_date',          label: '入店予定日' },
  { key: 'age',                label: '年齢' },
  { key: 'height',             label: '身長' },
  { key: 'bust',               label: 'バスト（カップ）' },
  { key: 'bust_cm',            label: 'バスト（cm）' },
  { key: 'waist',              label: 'ウエスト（cm）' },
  { key: 'hip',                label: 'ヒップ' },
  { key: 'zodiac',             label: '星座' },
  { key: 'blood_type',         label: '血液型' },
  { key: 'tattoo',             label: 'TATTOO' },
  { key: 'ng_area',            label: 'NGエリア' },
  { key: 'contact_method',     label: '連絡方法' },
  // M専用
  { key: 'm_personality',      label: '性格',             brand: 'M' },
  { key: 'm_charm',            label: 'チャームポイント',  brand: 'M' },
  { key: 'm_preferred_type',   label: '好みのM男性タイプ', brand: 'M' },
  { key: 'm_smoking',          label: '喫煙',             brand: 'M' },
  { key: 'm_stress_relief',    label: 'ストレス解消法',    brand: 'M' },
  { key: 'm_favorite_word',    label: '好きな言葉',        brand: 'M' },
  { key: 'm_trigger',          label: 'きっかけ',          brand: 'M' },
  { key: 'm_sadist_level',     label: 'S度レベル',         brand: 'M' },
  { key: 'm_favorite_scenario', label: '好きなシチュ',     brand: 'M' },
  { key: 'm_favorite_toy',     label: '好きなおもちゃ',    brand: 'M' },
  { key: 'm_specialty_play',   label: '得意プレイ',        brand: 'M' },
  { key: 'm_challenge_play',   label: '挑戦したいプレイ',  brand: 'M' },
  { key: 'm_meaning',          label: 'M性感の意味',       brand: 'M' },
  { key: 'm_message',          label: 'メッセージ',        brand: 'M' },
  // E専用
  { key: 'e_hobby',            label: '趣味・特技',        brand: 'E' },
  { key: 'e_personality',      label: '性格',              brand: 'E' },
  { key: 'e_charm',            label: 'チャームポイント',   brand: 'E' },
  { key: 'e_smoking',          label: '喫煙',              brand: 'E' },
  { key: 'e_drinking',         label: '飲酒',              brand: 'E' },
  { key: 'e_favorite_media',   label: '好きな映画・本',     brand: 'E' },
  { key: 'e_relationships',    label: '交際経験人数',       brand: 'E' },
  { key: 'e_exciting_moment',  label: 'ドキッとする瞬間',   brand: 'E' },
  { key: 'e_massage_experience', label: 'マッサージ経験',   brand: 'E' },
  { key: 'e_specialty_play',   label: '得意性感プレイ',     brand: 'E' },
  { key: 'e_care',             label: '接客の心掛け',       brand: 'E' },
  { key: 'e_message',          label: 'メッセージ',         brand: 'E' },
]

export default function OnboardingDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [sub, setSub] = useState<OnboardingSubmission | null>(null)
  const [jobs, setJobs] = useState<OnboardingJob[]>([])
  const [nd, setNd] = useState<NormalizedOnboardingData | null>(null)
  const [adminNotes, setAdminNotes] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [approving, setApproving] = useState(false)
  const [rejecting, setRejecting] = useState(false)

  useEffect(() => {
    fetch(`/api/admin/onboarding/${id}`)
      .then(r => r.json())
      .then(d => {
        setSub(d.submission)
        setJobs(d.jobs ?? [])
        setNd(d.submission?.normalized_data ?? null)
        setAdminNotes(d.submission?.admin_notes ?? '')
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [id])

  async function handleSave() {
    setSaving(true)
    await fetch(`/api/admin/onboarding/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ normalized_data: nd, admin_notes: adminNotes }),
    })
    setSaving(false)
  }

  async function handleApprove() {
    if (!confirm('承認すると自動でスタッフ登録・女性情報登録が実行されます。よろしいですか？')) return
    setApproving(true)
    const res = await fetch(`/api/admin/onboarding/${id}/approve`, { method: 'POST' })
    const d = await res.json()
    setApproving(false)
    if (d.error) { alert(`承認失敗: ${d.error}`); return }
    window.location.reload()
  }

  async function handleReject() {
    if (!confirm('この案件を却下しますか？')) return
    setRejecting(true)
    await fetch(`/api/admin/onboarding/${id}/reject`, { method: 'POST' })
    setRejecting(false)
    router.push('/admin/onboarding')
  }

  if (loading) return <div className="p-8 text-gray-400 text-sm">読み込み中...</div>
  if (!sub) return <div className="p-8 text-red-500 text-sm">案件が見つかりません</div>

  const area = AREAS.find(a => a.id === sub.area_id)
  const isEditable = sub.status === 'submitted' || sub.status === 'pending_cast'
  const castUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/cast/onboarding/${sub.token}`

  const ndValue = (k: keyof NormalizedOnboardingData): string => {
    const v = nd?.[k]
    if (Array.isArray(v)) return v.join('、')
    if (typeof v === 'boolean') return v ? '可能' : '対応不可'
    return String(v ?? '')
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.push('/admin/onboarding')} className="text-gray-400 hover:text-gray-600 text-sm">← 一覧</button>
      </div>

      {/* ヘッダー */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow p-5 mb-4">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-1">
              {nd?.stage_name ?? '（未入力）'}
            </h1>
            <p className="text-sm text-gray-500">
              {sub.brand === 'M' ? 'M性感倶楽部' : '癒したくて'} {area?.name}
              　発行: {new Date(sub.created_at).toLocaleDateString('ja-JP')}
            </p>
          </div>
          <span className={`text-xs px-3 py-1 rounded-full font-medium ${
            sub.status === 'approved' ? 'bg-green-100 text-green-700' :
            sub.status === 'submitted' ? 'bg-yellow-100 text-yellow-700' :
            sub.status === 'rejected' ? 'bg-red-100 text-red-600' :
            'bg-gray-100 text-gray-600'
          }`}>
            {sub.status === 'pending_cast' ? 'URL発行済み' :
             sub.status === 'submitted' ? '回答済み' :
             sub.status === 'approved' ? '承認済み' : '却下'}
          </span>
        </div>

        {sub.status === 'pending_cast' && (
          <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-xl">
            <p className="text-xs text-gray-500 mb-1">キャスト用URL</p>
            <p className="text-xs font-mono text-gray-700 dark:text-gray-300 break-all">{castUrl}</p>
          </div>
        )}

        {sub.status === 'submitted' && (
          <div className="flex gap-2 mt-4">
            <button
              onClick={handleApprove}
              disabled={approving}
              className="flex-1 bg-green-500 hover:bg-green-600 disabled:bg-gray-300 text-white font-bold py-2.5 rounded-xl text-sm transition-colors"
            >
              {approving ? '処理中...' : '✅ 承認して登録する'}
            </button>
            <button
              onClick={handleReject}
              disabled={rejecting}
              className="px-4 border border-red-300 text-red-500 hover:bg-red-50 rounded-xl text-sm transition-colors"
            >
              却下
            </button>
          </div>
        )}
      </div>

      {/* ジョブ状態（承認後） */}
      {jobs.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow p-5 mb-4">
          <h2 className="font-bold text-gray-700 dark:text-gray-200 mb-3">登録状況</h2>
          <div className="space-y-2">
            {jobs.map(j => (
              <div key={j.id} className="flex items-center justify-between">
                <span className="text-sm text-gray-700 dark:text-gray-300">{JOB_LABEL[j.job_type]}</span>
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${JOB_STATUS_COLOR[j.status]}`}>
                  {JOB_STATUS_LABEL[j.status]}
                </span>
              </div>
            ))}
          </div>
          {sub.staff_id && (
            <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
              <a
                href={`/staff`}
                className="text-sm text-pink-600 hover:text-pink-700 font-medium"
              >
                → スタッフページで確認する
              </a>
            </div>
          )}
        </div>
      )}

      {/* 回答内容 */}
      {nd && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow p-5 mb-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-gray-700 dark:text-gray-200">回答内容</h2>
            {isEditable && (
              <button
                onClick={handleSave}
                disabled={saving}
                className="text-sm bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 px-3 py-1.5 rounded-lg transition-colors"
              >
                {saving ? '保存中...' : '保存'}
              </button>
            )}
          </div>
          <div className="space-y-3">
            {ND_FIELDS.filter(f => !f.brand || f.brand === sub.brand).map(f => {
              const val = ndValue(f.key)
              if (!val && !isEditable) return null
              return (
                <div key={f.key}>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">{f.label}</p>
                  {isEditable ? (
                    f.key === 'ng_options' ? (
                      <p className="text-sm text-gray-800 dark:text-gray-200">{val || '—'}</p>
                    ) : (
                      <input
                        type="text"
                        value={typeof nd[f.key] === 'string' ? nd[f.key] as string : val}
                        onChange={e => setNd(prev => prev ? { ...prev, [f.key]: e.target.value } : prev)}
                        className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-2.5 py-1.5 dark:bg-gray-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-pink-400"
                      />
                    )
                  ) : (
                    <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap">{val || '—'}</p>
                  )}
                </div>
              )
            })}
            {/* NGオプション */}
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">NGオプション</p>
              <p className="text-sm text-gray-800 dark:text-gray-200">
                {nd.ng_options && nd.ng_options.length > 0 ? nd.ng_options.join('、') : '特になし'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 管理者メモ */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow p-5">
        <h2 className="font-bold text-gray-700 dark:text-gray-200 mb-3">管理者メモ</h2>
        <textarea
          value={adminNotes}
          onChange={e => setAdminNotes(e.target.value)}
          rows={4}
          placeholder="内部メモ（キャストには見えません）"
          className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2 dark:bg-gray-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-pink-400 resize-none"
        />
        <button
          onClick={handleSave}
          disabled={saving}
          className="mt-2 text-sm bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 px-3 py-1.5 rounded-lg transition-colors"
        >
          {saving ? '保存中...' : 'メモを保存'}
        </button>
      </div>
    </div>
  )
}
