'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

function LoginForm() {
  const router = useRouter()
  const params = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (params.get('error') === 'not_logged_in') setError('ログインが必要です')
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
          {loading ? 'ログイン中...' : 'ログイン'}
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
