'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

function RegisterForm() {
  const router = useRouter()
  const [staffList, setStaffList] = useState<{ id: number; name: string }[]>([])
  const [selectedStaffId, setSelectedStaffId] = useState<number | ''>('')
  const [searchQuery, setSearchQuery] = useState('')
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.from('staff').select('id, name').order('name').then(async ({ data: allStaff }) => {
      if (!allStaff) return
      const { data: roles } = await supabase.from('user_roles').select('staff_id').eq('role', 'cast')
      const registeredIds = new Set((roles ?? []).map((r: { staff_id: number }) => r.staff_id))
      setStaffList(allStaff.filter(s => !registeredIds.has(s.id)))
    })
  }, [])

  const handleRegister = async (e: React.FormEvent) => {
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
    router.replace('/photodiary/post')
  }

  return (
    <div className="bg-white rounded-2xl shadow-lg p-6 space-y-5">
      <h1 className="text-lg font-bold text-gray-800 text-center">アカウント登録</h1>

      {/* 名前選択 */}
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

      <form onSubmit={handleRegister} className="space-y-4">
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
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-2.5 rounded-xl">
            {error}
          </div>
        )}
        <button
          type="submit"
          disabled={saving}
          className="w-full bg-pink-500 hover:bg-pink-600 text-white font-bold py-3 rounded-xl transition-colors disabled:opacity-50 shadow-sm"
        >
          {saving ? '登録中...' : '登録する'}
        </button>
      </form>

      <p className="text-center text-xs text-gray-400">
        すでにアカウントをお持ちの方は{' '}
        <a href="/photodiary/login" className="text-pink-500 underline">ログイン</a>
      </p>
    </div>
  )
}

export default function PhotoDiaryRegisterPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 to-purple-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-3xl font-bold text-pink-500 tracking-wide">写メ日記</div>
          <div className="text-gray-500 text-sm mt-1">キャスト投稿ページ</div>
        </div>
        <Suspense fallback={<div className="bg-white rounded-2xl shadow-lg p-6 text-center text-gray-400 text-sm">読み込み中...</div>}>
          <RegisterForm />
        </Suspense>
      </div>
    </div>
  )
}
