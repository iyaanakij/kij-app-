'use client'

import { useEffect, useState, useCallback, useRef } from 'react'

type Brand = 'M' | 'E'

type JobResult = {
  dry_run?: boolean
  by_account?: Record<string, { ok: boolean; reason?: string; scheduled_at?: string }>
}

type Job = {
  id: number
  brand: Brand
  title: string
  status: 'pending' | 'running' | 'done' | 'error'
  result: JobResult | null
  error_message: string | null
  created_at: string
  updated_at: string
}

const ACCOUNT_LABELS: Record<string, string> = {
  iya_narita: '癒したくて 成田',
  iya_chiba: '癒したくて 千葉',
  iya_funabashi: '癒したくて 西船橋',
  iya_kinshicho: '癒したくて 錦糸町',
  mka_narita: '快楽M性感倶楽部 成田',
  mka_chiba: '快楽M性感倶楽部 千葉',
  mka_funabashi: '快楽M性感倶楽部 西船橋',
  mka_kinshicho: '快楽M性感倶楽部 錦糸町',
}

const STATUS_LABEL: Record<Job['status'], string> = {
  pending: '待機中',
  running: '処理中',
  done: '完了',
  error: 'エラー',
}

const STATUS_COLOR: Record<Job['status'], string> = {
  pending: 'text-gray-500',
  running: 'text-blue-600',
  done: 'text-green-600',
  error: 'text-red-600',
}

function isTerminal(status: Job['status']) {
  return status === 'done' || status === 'error'
}

function BrandForm({
  brand,
  label,
  onSubmitted,
}: {
  brand: Brand
  label: string
  onSubmitted: () => void
}) {
  const [title, setTitle] = useState('')
  const [bodyHtml, setBodyHtml] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handleImageChange = (file: File | null) => {
    setImageFile(file)
    setImagePreviewUrl(file ? URL.createObjectURL(file) : null)
  }

  const handleSubmit = async () => {
    setError(null)
    setSuccess(false)
    if (!title.trim() || !bodyHtml.trim() || !imageFile) {
      setError('タイトル・本文・画像はすべて必須です')
      return
    }
    setSubmitting(true)
    const formData = new FormData()
    formData.set('brand', brand)
    formData.set('title', title.trim())
    formData.set('body_html', bodyHtml)
    formData.set('image', imageFile)

    const res = await fetch('/api/admin/vanilla-blog', { method: 'POST', body: formData })
    const json = await res.json()
    setSubmitting(false)
    if (!res.ok) { setError(json.error ?? '投稿依頼に失敗しました'); return }

    setSuccess(true)
    setTitle('')
    setBodyHtml('')
    handleImageChange(null)
    onSubmitted()
  }

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4">
      <h2 className="text-sm font-bold text-gray-800 mb-3">{label}</h2>

      <div className="space-y-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">タイトル（150字以内）</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={150}
            className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm"
            placeholder="例: お仕事内容について、正直にお話しします"
          />
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">画像（縦300×横300推奨・500KB以内）</label>
          <input
            type="file"
            accept="image/jpeg,image/png"
            onChange={(e) => handleImageChange(e.target.files?.[0] ?? null)}
            className="text-sm"
          />
          {imagePreviewUrl && (
            <img src={imagePreviewUrl} alt="preview" className="mt-2 w-24 h-24 object-cover rounded border border-gray-200" />
          )}
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">本文（HTML）</label>
          <textarea
            value={bodyHtml}
            onChange={(e) => setBodyHtml(e.target.value)}
            rows={10}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-xs font-mono"
            placeholder="<p>...</p>"
          />
        </div>

        {bodyHtml.trim() && (
          <div>
            <label className="block text-xs text-gray-500 mb-1">プレビュー</label>
            <div
              className="rounded-md border border-gray-200 px-3 py-2 text-sm max-h-64 overflow-y-auto"
              dangerouslySetInnerHTML={{ __html: bodyHtml }}
            />
          </div>
        )}

        {error && <p className="text-xs text-red-600">{error}</p>}
        {success && <p className="text-xs text-green-600">投稿依頼を作成しました。ワーカーの反映をお待ちください。</p>}

        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-50"
        >
          {submitting ? '送信中...' : `${label}を4店舗へ一括投稿予約`}
        </button>
      </div>
    </section>
  )
}

function JobRow({ job }: { job: Job }) {
  const byAccount = job.result?.by_account ?? {}
  const accountEntries = Object.entries(byAccount)

  return (
    <div className="rounded-md border border-gray-200 px-3 py-2 text-xs">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 font-mono">{job.brand}</span>
          <span className="truncate text-gray-700">{job.title}</span>
        </div>
        <span className={`shrink-0 font-medium ${STATUS_COLOR[job.status]}`}>
          {STATUS_LABEL[job.status]}
          {job.result?.dry_run ? '（dry-run）' : ''}
        </span>
      </div>
      {job.error_message && <p className="mt-1 text-red-600">{job.error_message}</p>}
      {accountEntries.length > 0 && (
        <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5">
          {accountEntries.map(([siteId, r]) => (
            <div key={siteId} className={r.ok ? 'text-green-700' : 'text-red-700'}>
              {r.ok ? '✓' : '✗'} {ACCOUNT_LABELS[siteId] ?? siteId}
              {r.scheduled_at ? ` (${r.scheduled_at})` : ''}
              {!r.ok && r.reason ? `: ${r.reason}` : ''}
            </div>
          ))}
        </div>
      )}
      <p className="mt-1 text-[10px] text-gray-400">{new Date(job.created_at).toLocaleString('ja-JP')}</p>
    </div>
  )
}

export default function VanillaBlogPage() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    document.title = 'バニラ店長ブログ投稿 | KIJ管理'
  }, [])

  const loadJobs = useCallback(async () => {
    const res = await fetch('/api/admin/vanilla-blog?limit=10')
    const json = await res.json()
    if (res.ok) setJobs(json.jobs ?? [])
    return json.jobs as Job[] | undefined
  }, [])

  const stopPoll = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }

  const startPoll = useCallback(() => {
    stopPoll()
    pollRef.current = setInterval(async () => {
      const latest = await loadJobs()
      if (latest && latest.every((j) => isTerminal(j.status))) stopPoll()
    }, 3000)
  }, [loadJobs])

  useEffect(() => {
    (async () => {
      setLoading(true)
      await loadJobs()
      setLoading(false)
    })()
    return () => stopPoll()
  }, [loadJobs])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-400 text-sm">
        読み込み中...
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-800">バニラ店長ブログ投稿</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            M版/E版それぞれ入力すると、対応する4店舗へ自動でログイン・投稿予約します（固定8区分の時間帯）
          </p>
        </div>
        <a
          href="/admin/dashboard"
          className="shrink-0 flex items-center gap-1.5 text-xs text-gray-500 hover:text-blue-600 border border-gray-200 hover:border-blue-300 rounded-lg px-3 py-2 bg-white transition-colors"
        >
          <span className="text-base leading-none">📊</span>
          システム状態
        </a>
      </div>

      <div className="space-y-4">
        <BrandForm brand="M" label="快楽M性感倶楽部（M版）" onSubmitted={startPoll} />
        <BrandForm brand="E" label="癒したくて（E版）" onSubmitted={startPoll} />
      </div>

      <section className="mt-6">
        <h2 className="text-sm font-bold text-gray-800 mb-2">直近の投稿依頼</h2>
        <div className="space-y-2">
          {jobs.length === 0 && <p className="text-xs text-gray-400">まだ投稿依頼はありません</p>}
          {jobs.map((job) => <JobRow key={job.id} job={job} />)}
        </div>
      </section>
    </div>
  )
}
