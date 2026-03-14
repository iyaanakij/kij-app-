'use client'

import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function LineAuthPage() {
  const router = useRouter()
  const params = useSearchParams()

  useEffect(() => {
    const at = params.get('at')
    const rt = params.get('rt')
    if (!at || !rt) { router.replace('/cast/login?error=line_failed'); return }

    supabase.auth.setSession({ access_token: at, refresh_token: rt }).then(({ error }) => {
      if (error) router.replace('/cast/login?error=session_failed')
      else router.replace('/cast/shift')
    })
  }, [params, router])

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 to-purple-50 flex items-center justify-center">
      <div className="text-gray-500 text-sm">LINEログイン処理中...</div>
    </div>
  )
}
