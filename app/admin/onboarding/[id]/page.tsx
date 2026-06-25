'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import type { OnboardingSubmission, OnboardingJob, OnboardingJobType, OnboardingJobStatus, NormalizedOnboardingData, PublishRuleSummary } from '@/lib/types'
import { AREAS } from '@/lib/types'

const JOB_LABEL: Record<OnboardingJobType, string> = {
  create_staff:         'キャスト登録（新規）',
  link_existing_staff:  '既存スタッフへの紐付け',
  create_women_info:    '女性情報登録',
  create_publish_rule:  'publish_rules作成',
  create_cp4_profile:   'CP4プロフィール登録',
  create_venrey_cast:   'Venreyキャスト登録',
  resolve_external_ids: '外部ID補完',
}

const STORE_LABEL: Record<number, string> = {
  1: '成田M', 2: '千葉M', 3: '西船橋M', 4: '錦糸町M',
  5: '成田E', 6: '千葉E', 7: '西船橋E', 8: '錦糸町E',
}

type StaffCandidate = { id: number; name: string; store_ids: number[] }
const JOB_STATUS_LABEL: Record<OnboardingJobStatus, string> = {
  pending:          '待機中',
  running:          '実行中',
  succeeded:        '完了',
  failed:           '失敗',
  failed_retryable: 'リトライ待ち',
  needs_manual:     '手動対応',
  skipped:          'スキップ',
}
const JOB_STATUS_COLOR: Record<OnboardingJobStatus, string> = {
  pending:          'bg-gray-100 text-gray-600',
  running:          'bg-blue-100 text-blue-700',
  succeeded:        'bg-green-100 text-green-700',
  failed:           'bg-red-100 text-red-600',
  failed_retryable: 'bg-orange-100 text-orange-700',
  needs_manual:     'bg-yellow-100 text-yellow-700',
  skipped:          'bg-gray-100 text-gray-400',
}

const ND_FIELDS: { key: keyof NormalizedOnboardingData; label: string; brand?: 'M' | 'E'; multiline?: boolean }[] = [
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
  { key: 'm_personality',      label: '性格',             brand: 'M', multiline: true },
  { key: 'm_charm',            label: 'チャームポイント',  brand: 'M', multiline: true },
  { key: 'm_preferred_type',   label: '好みのM男性タイプ', brand: 'M', multiline: true },
  { key: 'm_smoking',          label: '喫煙',             brand: 'M' },
  { key: 'm_stress_relief',    label: 'ストレス解消法',    brand: 'M', multiline: true },
  { key: 'm_favorite_word',    label: '好きな言葉',        brand: 'M' },
  { key: 'm_trigger',          label: 'きっかけ',          brand: 'M', multiline: true },
  { key: 'm_chijo_moment',     label: '痴女だと思う瞬間',  brand: 'M', multiline: true },
  { key: 'm_sadist_level',     label: 'S度レベル',         brand: 'M' },
  { key: 'm_favorite_scenario', label: '好きなシチュ',     brand: 'M', multiline: true },
  { key: 'm_favorite_toy',     label: '好きなおもちゃ',    brand: 'M' },
  { key: 'm_specialty_play',   label: '得意プレイ',        brand: 'M', multiline: true },
  { key: 'm_challenge_play',   label: '挑戦したいプレイ',  brand: 'M', multiline: true },
  { key: 'm_meaning',          label: 'M性感の意味',       brand: 'M', multiline: true },
  { key: 'm_message',          label: 'メッセージ',        brand: 'M', multiline: true },
  // E専用
  { key: 'e_hobby',            label: '趣味・特技',        brand: 'E', multiline: true },
  { key: 'e_personality',      label: '性格',              brand: 'E', multiline: true },
  { key: 'e_charm',            label: 'チャームポイント',   brand: 'E', multiline: true },
  { key: 'e_smoking',          label: '喫煙',              brand: 'E' },
  { key: 'e_drinking',         label: '飲酒',              brand: 'E' },
  { key: 'e_favorite_media',   label: '好きな映画・本',     brand: 'E' },
  { key: 'e_relationships',    label: '交際経験人数',       brand: 'E' },
  { key: 'e_exciting_moment',  label: 'ドキッとする瞬間',   brand: 'E', multiline: true },
  { key: 'e_massage_experience', label: 'マッサージ経験',   brand: 'E' },
  { key: 'e_specialty_play',   label: '得意性感プレイ',     brand: 'E', multiline: true },
  { key: 'e_care',             label: '接客の心掛け',       brand: 'E', multiline: true },
  { key: 'e_message',          label: 'メッセージ',         brand: 'E', multiline: true },
]

export default function OnboardingDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [sub, setSub] = useState<OnboardingSubmission | null>(null)
  const [jobs, setJobs] = useState<OnboardingJob[]>([])
  const [nd, setNd] = useState<NormalizedOnboardingData | null>(null)
  const [adminNotes, setAdminNotes] = useState('')
  const [cp4GidInput, setCp4GidInput] = useState('')
  const [venreyIdInput, setVenreyIdInput] = useState('')
  const [staffCandidates, setStaffCandidates] = useState<StaffCandidate[]>([])
  const [staffSearch, setStaffSearch] = useState('')
  const [staffSearchResults, setStaffSearchResults] = useState<StaffCandidate[]>([])
  const [staffSearching, setStaffSearching] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const [selectedStaff, setSelectedStaff] = useState<StaffCandidate | null>(null)
  const [publishRules, setPublishRules] = useState<PublishRuleSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [approving, setApproving] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [jobActing, setJobActing] = useState<number | null>(null)

  useEffect(() => { document.title = '入店アンケート詳細 | KIJ管理' }, [])

  useEffect(() => {
    fetch(`/api/admin/onboarding/${id}`)
      .then(r => r.json())
      .then(d => {
        setSub(d.submission)
        setJobs(d.jobs ?? [])
        setNd(d.submission?.normalized_data ?? null)
        setAdminNotes(d.submission?.admin_notes ?? '')
        setCp4GidInput(d.submission?.cp4_gid ?? '')
        setVenreyIdInput(d.submission?.venrey_cast_id ?? '')
        setStaffCandidates(d.staffCandidates ?? [])
        setPublishRules(d.publishRules ?? [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [id])

  useEffect(() => {
    if (!staffSearch.trim()) { setStaffSearchResults([]); setShowDropdown(false); return }
    const timer = setTimeout(async () => {
      setStaffSearching(true)
      const res = await fetch(`/api/admin/staff/search?q=${encodeURIComponent(staffSearch)}`)
      const data = await res.json()
      setStaffSearchResults(data)
      setShowDropdown(true)
      setStaffSearching(false)
    }, 300)
    return () => clearTimeout(timer)
  }, [staffSearch])

  async function handleSave() {
    setSaving(true)
    await fetch(`/api/admin/onboarding/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ normalized_data: nd, admin_notes: adminNotes }),
    })
    setSaving(false)
  }

  async function handleApprove(mode: 'create' | 'link', staffId?: number) {
    const msg = mode === 'link'
      ? `staff_id=${staffId} に紐付けて承認します。よろしいですか？`
      : '新規スタッフとして承認します。よろしいですか？'
    if (!confirm(msg)) return
    setApproving(true)
    const res = await fetch(`/api/admin/onboarding/${id}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mode === 'link' ? { mode, staff_id: staffId } : { mode }),
    })
    const d = await res.json()
    setApproving(false)
    if (d.error) { alert(`承認失敗: ${d.error}`); return }
    window.location.reload()
  }

  async function handleSaveExternalIds() {
    setSaving(true)
    await fetch(`/api/admin/onboarding/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cp4_gid: cp4GidInput, venrey_cast_id: venreyIdInput }),
    })
    setSaving(false)
  }

  async function handleJobAction(jobId: number, action: 'retry' | 'skip') {
    setJobActing(jobId)
    const res = await fetch(`/api/admin/onboarding/${id}/jobs/${jobId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    })
    const d = await res.json()
    setJobActing(null)
    if (d.error) { alert(`操作失敗: ${d.error}`); return }
    setJobs(prev => prev.map(j => j.id === jobId ? { ...j, status: d.status } : j))
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
          <div className="mt-4 space-y-3">
            {/* 既存スタッフ候補 */}
            {staffCandidates.length > 0 && (
              <div className="border border-yellow-200 bg-yellow-50 dark:bg-yellow-900/20 dark:border-yellow-700 rounded-xl p-3">
                <p className="text-xs font-medium text-yellow-700 dark:text-yellow-400 mb-2">⚠ 同名スタッフが見つかりました。重複登録に注意してください。</p>
                <div className="space-y-2">
                  {staffCandidates.map(c => (
                    <div key={c.id} className="flex items-center justify-between bg-white dark:bg-gray-800 rounded-lg px-3 py-2">
                      <div>
                        <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{c.name}</span>
                        <span className="text-xs text-gray-400 ml-2">id={c.id}</span>
                        <span className="text-xs text-gray-500 ml-2">
                          {c.store_ids.map(sid => STORE_LABEL[sid]).join('・')}
                        </span>
                      </div>
                      <button
                        onClick={() => handleApprove('link', c.id)}
                        disabled={approving}
                        className="text-xs bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 text-white font-bold px-3 py-1.5 rounded-lg transition-colors"
                      >
                        {approving ? '処理中...' : 'この人に紐付けて承認'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* スタッフ検索コンボボックス */}
            <div className="relative">
              {selectedStaff ? (
                <div className="flex items-center gap-2">
                  <div className="flex-1 flex items-center gap-2 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-lg px-3 py-2">
                    <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{selectedStaff.name}</span>
                    <span className="text-xs text-gray-500">{selectedStaff.store_ids.map(sid => STORE_LABEL[sid]).join('・')}</span>
                  </div>
                  <button
                    onClick={() => { setSelectedStaff(null); setStaffSearch('') }}
                    className="text-xs text-gray-400 hover:text-gray-600 px-2"
                  >
                    ✕
                  </button>
                  <button
                    onClick={() => handleApprove('link', selectedStaff.id)}
                    disabled={approving}
                    className="text-sm bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 text-white font-bold px-3 py-2 rounded-lg transition-colors whitespace-nowrap"
                  >
                    {approving ? '処理中...' : '紐付けて承認'}
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <input
                    type="text"
                    value={staffSearch}
                    onChange={e => { setStaffSearch(e.target.value); setSelectedStaff(null) }}
                    onFocus={() => { if (staffSearchResults.length > 0) setShowDropdown(true) }}
                    onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                    placeholder={staffSearching ? '検索中...' : 'スタッフ名で検索して紐付け'}
                    className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 dark:bg-gray-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-400"
                  />
                  {showDropdown && staffSearchResults.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl shadow-lg overflow-hidden">
                      {staffSearchResults.map(s => (
                        <button
                          key={s.id}
                          onMouseDown={() => { setSelectedStaff(s); setStaffSearch(s.name); setShowDropdown(false) }}
                          className="w-full text-left px-3 py-2.5 hover:bg-blue-50 dark:hover:bg-blue-900/30 flex items-center justify-between"
                        >
                          <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{s.name}</span>
                          <span className="text-xs text-gray-400">{s.store_ids.map(sid => STORE_LABEL[sid]).join('・')}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {showDropdown && staffSearchResults.length === 0 && staffSearch && !staffSearching && (
                    <div className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl shadow-lg px-3 py-2.5">
                      <span className="text-sm text-gray-400">該当なし</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 新規作成 / 却下 */}
            <div className="flex gap-2">
              <button
                onClick={() => handleApprove('create')}
                disabled={approving}
                className="flex-1 bg-green-500 hover:bg-green-600 disabled:bg-gray-300 text-white font-bold py-2.5 rounded-xl text-sm transition-colors"
              >
                {approving ? '処理中...' : '✅ 新規スタッフとして承認'}
              </button>
              <button
                onClick={handleReject}
                disabled={rejecting}
                className="px-4 border border-red-300 text-red-500 hover:bg-red-50 rounded-xl text-sm transition-colors"
              >
                却下
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ジョブ状態（承認後） */}
      {jobs.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow p-5 mb-4">
          <h2 className="font-bold text-gray-700 dark:text-gray-200 mb-3">登録状況</h2>
          <div className="space-y-3">
            {jobs.filter(j => j.job_type !== 'resolve_external_ids').map(j => (
              <div key={j.id}>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-700 dark:text-gray-300">{JOB_LABEL[j.job_type]}</span>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${JOB_STATUS_COLOR[j.status]}`}>
                      {JOB_STATUS_LABEL[j.status]}
                    </span>
                    {(j.status === 'failed_retryable' || j.status === 'needs_manual' || j.status === 'failed') && (
                      <button
                        onClick={() => handleJobAction(j.id, 'retry')}
                        disabled={jobActing === j.id}
                        className="text-xs px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg transition-colors disabled:opacity-50"
                      >
                        再実行
                      </button>
                    )}
                    {(j.status === 'pending' || j.status === 'failed_retryable' || j.status === 'needs_manual') && (
                      <button
                        onClick={() => handleJobAction(j.id, 'skip')}
                        disabled={jobActing === j.id}
                        className="text-xs px-2 py-1 bg-gray-50 hover:bg-gray-100 text-gray-600 rounded-lg transition-colors disabled:opacity-50"
                      >
                        スキップ
                      </button>
                    )}
                  </div>
                </div>
                {j.error_message && (
                  <p className="text-xs text-red-500 mt-1 ml-0 font-mono break-all">{j.error_message.slice(0, 200)}</p>
                )}
              </div>
            ))}
          </div>

          {/* 外部ID手入力パネル */}
          {sub.status === 'approved' && (
            <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">外部ID（手入力）</p>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <label className="text-xs text-gray-600 dark:text-gray-400 w-28 shrink-0">CP4 gid</label>
                  <input
                    type="text"
                    value={cp4GidInput}
                    onChange={e => setCp4GidInput(e.target.value)}
                    placeholder="例: 00744"
                    className="flex-1 text-xs border border-gray-200 dark:border-gray-600 rounded-lg px-2.5 py-1.5 dark:bg-gray-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-pink-400 font-mono"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-gray-600 dark:text-gray-400 w-28 shrink-0">Venrey cast_id</label>
                  <input
                    type="text"
                    value={venreyIdInput}
                    onChange={e => setVenreyIdInput(e.target.value)}
                    placeholder="例: 4335668"
                    className="flex-1 text-xs border border-gray-200 dark:border-gray-600 rounded-lg px-2.5 py-1.5 dark:bg-gray-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-pink-400 font-mono"
                  />
                </div>
                <button
                  onClick={handleSaveExternalIds}
                  disabled={saving}
                  className="text-xs bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 px-3 py-1.5 rounded-lg transition-colors"
                >
                  {saving ? '保存中...' : '外部IDを保存'}
                </button>
              </div>
            </div>
          )}

          {sub.staff_id && (
            <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
              <a
                href={`/staff`}
                className="text-sm text-pink-600 hover:text-pink-700 font-medium"
              >
                → キャストページで確認する
              </a>
            </div>
          )}
        </div>
      )}

      {/* シフト反映ステータス */}
      {sub.status === 'approved' && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow p-5 mb-4">
          <h2 className="font-bold text-gray-700 dark:text-gray-200 mb-3">シフト反映ステータス</h2>

          {/* CS3 ID補完 */}
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm text-gray-600 dark:text-gray-400">CS3 ID補完</span>
            {sub.cs3_lookup_status === 'matched' ? (
              <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-700 font-medium">✓ 補完済み</span>
            ) : sub.cs3_lookup_status === 'no_match' ? (
              <div className="text-right">
                <span className="text-xs px-2 py-1 rounded-full bg-yellow-100 text-yellow-700 font-medium">CS3未一致</span>
                <p className="text-xs text-gray-400 mt-1">試行{sub.cs3_lookup_attempts ?? 0}回・CS3出勤申請待ち</p>
              </div>
            ) : sub.cs3_lookup_status === 'ambiguous' ? (
              <div className="text-right">
                <span className="text-xs px-2 py-1 rounded-full bg-orange-100 text-orange-600 font-medium">⚠ CS3名重複</span>
                {sub.cs3_lookup_error && <p className="text-xs text-gray-400 mt-1">{sub.cs3_lookup_error}</p>}
              </div>
            ) : (
              <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-500">未チェック</span>
            )}
          </div>

          {/* publish_rules 有効化状況 */}
          {publishRules.length > 0 ? (
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">配信ルール（{publishRules.filter(r => r.enabled).length}/{publishRules.length}件有効）</p>
              <div className="space-y-1">
                {publishRules.map(pr => {
                  const hasIds = !!(pr.cp4_gid && pr.venrey_cast_id)
                  return (
                    <div key={pr.site_id} className="flex items-center justify-between">
                      <span className="text-xs font-mono text-gray-500">{pr.site_id}</span>
                      {pr.enabled ? (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">有効</span>
                      ) : hasIds ? (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-600">ID揃い・有効化待ち</span>
                      ) : (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">ID待ち</span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <p className="text-xs text-gray-400">配信ルールはまだ作成されていません</p>
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
              const fieldValue = typeof nd[f.key] === 'string' ? nd[f.key] as string : val
              return (
                <div key={f.key}>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">{f.label}</p>
                  {isEditable ? (
                    f.key === 'ng_options' ? (
                      <p className="text-sm text-gray-800 dark:text-gray-200">{val || '—'}</p>
                    ) : f.multiline ? (
                      <textarea
                        value={fieldValue}
                        onChange={e => setNd(prev => prev ? { ...prev, [f.key]: e.target.value } : prev)}
                        rows={3}
                        className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-2.5 py-1.5 dark:bg-gray-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-pink-400 resize-y"
                      />
                    ) : (
                      <input
                        type="text"
                        value={fieldValue}
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
