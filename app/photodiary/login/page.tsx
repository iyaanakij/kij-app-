'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const LINE_LOGIN_URL =
  `https://access.line.me/oauth2/v2.1/authorize?` +
  new URLSearchParams({
    response_type: 'code',
    client_id: '2009450708',
    redirect_uri: 'https://kij-app.vercel.app/api/line/callback',
    state: 'login_diary',
    scope: 'profile openid',
  }).toString()

const LINE_ERROR_MESSAGES: Record<string, string> = {
  line_cancelled:  'LINEログインがキャンセルされました',
  line_failed:     'LINEログインに失敗しました',
  line_not_linked: 'このLINEアカウントは未連携です。メールでログイン後にLINE連携を行ってください',
  session_failed:  'セッション作成に失敗しました',
  not_logged_in:   'ログインが必要です',
}

function LoginForm() {
  const router = useRouter()
  const params = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const errKey = params.get('error')
    if (errKey) setError(LINE_ERROR_MESSAGES[errKey] ?? 'エラーが発生しました')
  }, [params])

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return
      const { getCurrentUser } = await import('@/lib/auth')
      const u = await getCurrentUser()
      if (u?.role === 'cast') router.replace('/photodiary/post')
    })
  }, [router])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError('メールアドレスまたはパスワードが正しくありません')
      setLoading(false)
      return
    }
    router.replace('/photodiary/post')
  }

  return (
    <div className="bg-white rounded-2xl shadow-lg p-6 space-y-5">
      <h1 className="text-lg font-bold text-gray-800 text-center">ログイン</h1>

      {/* LINEログイン */}
      <a
        href={LINE_LOGIN_URL}
        className="flex items-center justify-center gap-2.5 w-full bg-[#06C755] hover:bg-[#05b34c] text-white font-bold py-3 rounded-xl transition-colors shadow-sm"
      >
        <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white">
          <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.630 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63h2.386c.349 0 .63.285.63.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63.349 0 .631.285.631.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.281.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" />
        </svg>
        LINEでログイン
      </a>

      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-gray-200" />
        <span className="text-xs text-gray-400">または</span>
        <div className="flex-1 h-px bg-gray-200" />
      </div>

      <form onSubmit={handleLogin} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1.5">メールアドレス</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
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
            required
            className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 bg-gray-50"
            placeholder="••••••••"
          />
        </div>
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-2.5 rounded-xl">
            {error}
          </div>
        )}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-pink-500 hover:bg-pink-600 text-white font-bold py-3 rounded-xl transition-colors disabled:opacity-50 shadow-sm"
        >
          {loading ? 'ログイン中...' : 'メールでログイン'}
        </button>
      </form>
      <p className="text-center text-xs text-gray-400 pt-1">
        アカウントをお持ちでない方は{' '}
        <a href="/photodiary/register" className="text-pink-500 underline">新規登録</a>
      </p>
    </div>
  )
}

export default function PhotoDiaryLoginPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 to-purple-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-3xl font-bold text-pink-500 tracking-wide">写メ日記</div>
          <div className="text-gray-500 text-sm mt-1">キャスト投稿ページ</div>
        </div>
        <Suspense fallback={<div className="bg-white rounded-2xl shadow-lg p-6 text-center text-gray-400 text-sm">読み込み中...</div>}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  )
}
