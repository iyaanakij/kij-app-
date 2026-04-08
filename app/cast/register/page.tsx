'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

function getLineRegisterUrl(staffId: number) {
  return `https://access.line.me/oauth2/v2.1/authorize?` +
    new URLSearchParams({
      response_type: 'code',
      client_id: process.env.NEXT_PUBLIC_LINE_LOGIN_CHANNEL_ID ?? '2009450638',
      redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/line/callback`,
      state: `register:${staffId}`,
      scope: 'profile openid',
    }).toString()
}

function RegisterForm() {
  const router = useRouter()
  const params = useSearchParams()
  const [staffList, setStaffList] = useState<{ id: number; name: string }[]>([])
  const [selectedStaffId, setSelectedStaffId] = useState<number | ''>('')
  const [searchQuery, setSearchQuery] = useState('')
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showEmail, setShowEmail] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const errKey = params.get('error')
    if (errKey === 'register_failed') setError('登録に失敗しました。もう一度お試しください')
    if (errKey === 'already_registered') setError('このLINEアカウントはすでに登録されています')
  }, [params])

  useEffect(() => {
    // 未登録スタッフのみ取得
    supabase.from('staff').select('id, name').order('name').then(async ({ data: allStaff }) => {
      if (!allStaff) return
      const { data: roles } = await supabase.from('user_roles').select('staff_id').eq('role', 'cast')
      const registeredIds = new Set((roles ?? []).map((r: { staff_id: number }) => r.staff_id))
      setStaffList(allStaff.filter(s => !registeredIds.has(s.id)))
    })
  }, [])

  const handleEmailRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedStaffId) { setError('名前を選択してください'); return }
    if (!email || !password) { setError('メールとパスワードを入力してください'); return }
    setSaving(true)
    setError('')
    const { createClient } = await import('@supabase/supabase-js')
    const tempClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    const { data, error: signUpError } = await tempClient.auth.signUp({ email, password })
    if (signUpError || !data.user) {
      setError(signUpError?.message ?? '登録に失敗しました')
      setSaving(false)
      return
    }
    await supabase.from('user_roles').upsert({
      id: data.user.id,
      role: 'cast',
      staff_id: selectedStaffId,
    })
    router.replace('/cast/shift')
  }

  return (
    <div className="bg-white rounded-2xl shadow-lg p-6 space-y-5">
      <h1 className="text-lg font-bold text-gray-800 text-center">アカウント登録</h1>

      {/* 名前選択（検索付き） */}
      <div className="relative">
        <label className="block text-xs font-semibold text-gray-500 mb-1.5">あなたの名前</label>
        <div
          className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm bg-gray-50 cursor-pointer flex items-center justify-between"
          onClick={() => setDropdownOpen(v => !v)}
        >
          <span className={selectedStaffId ? 'text-gray-800' : 'text-gray-400'}>
            {selectedStaffId ? staffList.find(s => s.id === selectedStaffId)?.name : '選択してください'}
          </span>
          <span className="text-gray-400 text-xs">{dropdownOpen ? '▲' : '▼'}</span>
        </div>
        {dropdownOpen && (
          <div className="absolute z-20 w-full bg-white border border-gray-200 rounded-xl shadow-lg mt-1 overflow-hidden">
            <div className="p-2 border-b border-gray-100">
              <input
                type="text"
                autoFocus
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="名前で検索..."
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-400 bg-gray-50"
              />
            </div>
            <div className="max-h-48 overflow-y-auto">
              {staffList.filter(s => s.name.includes(searchQuery)).length === 0 ? (
                <div className="px-4 py-3 text-sm text-gray-400 text-center">見つかりません</div>
              ) : (
                staffList.filter(s => s.name.includes(searchQuery)).map(s => (
                  <div
                    key={s.id}
                    className={`px-4 py-3 text-sm cursor-pointer hover:bg-pink-50 transition-colors ${selectedStaffId === s.id ? 'bg-pink-50 text-pink-600 font-bold' : 'text-gray-700'}`}
                    onClick={() => { setSelectedStaffId(s.id); setDropdownOpen(false); setSearchQuery('') }}
                  >
                    {s.name}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* LINEで登録 */}
      <a
        href={selectedStaffId ? getLineRegisterUrl(selectedStaffId) : '#'}
        onClick={e => { if (!selectedStaffId) { e.preventDefault(); setError('先に名前を選択してください') } }}
        className="flex items-center justify-center gap-2.5 w-full bg-[#06C755] hover:bg-[#05b34c] text-white font-bold py-3 rounded-xl transition-colors shadow-sm"
      >
        <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white">
          <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63h2.386c.349 0 .63.285.63.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63.349 0 .631.285.631.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.281.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" />
        </svg>
        LINEで登録
      </a>

      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-gray-200" />
        <span className="text-xs text-gray-400">または</span>
        <div className="flex-1 h-px bg-gray-200" />
      </div>

      {/* メール登録（任意） */}
      {!showEmail ? (
        <button
          onClick={() => setShowEmail(true)}
          className="w-full text-sm text-gray-400 hover:text-gray-600 py-2 transition-colors"
        >
          メールアドレスで登録する
        </button>
      ) : (
        <form onSubmit={handleEmailRegister} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">メールアドレス</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 bg-gray-50"
              placeholder="example@email.com"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">パスワード</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 bg-gray-50"
              placeholder="8文字以上"
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="w-full bg-pink-500 hover:bg-pink-600 text-white font-bold py-3 rounded-xl transition-colors disabled:opacity-50 shadow-sm"
          >
            {saving ? '登録中...' : 'メールで登録'}
          </button>
        </form>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-2.5 rounded-xl">
          {error}
        </div>
      )}

      <p className="text-center text-xs text-gray-400">
        すでにアカウントをお持ちの方は{' '}
        <a href="/cast/login" className="text-pink-500 underline">ログイン</a>
      </p>
    </div>
  )
}

export default function CastRegisterPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 to-purple-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-3xl font-bold text-pink-500 tracking-wide">KIJ</div>
          <div className="text-gray-500 text-sm mt-1">キャストマイページ</div>
        </div>
        <Suspense fallback={<div className="bg-white rounded-2xl shadow-lg p-6 text-center text-gray-400 text-sm">読み込み中...</div>}>
          <RegisterForm />
        </Suspense>
      </div>
    </div>
  )
}
