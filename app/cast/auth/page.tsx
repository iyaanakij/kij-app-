'use client'

import { useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

function AuthHandler() {
  const router = useRouter()
  const params = useSearchParams()

  useEffect(() => {
    const hash = params.get('hash')
    if (!hash) { router.replace('/cast/login?error=session_failed'); return }

    supabase.auth.verifyOtp({ token_hash: hash, type: 'email' }).then(({ error }) => {
      if (error) {
        router.replace('/cast/login?error=session_failed')
      } else {
        router.replace('/cast/shift')
      }
    })
  }, [params, router])

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 to-purple-50 flex items-center justify-center">
      <div className="text-gray-400 animate-pulse text-sm">認証中...</div>
    </div>
  )
}

export default function CastAuthPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-pink-50 to-purple-50 flex items-center justify-center">
        <div className="text-gray-400 animate-pulse text-sm">認証中...</div>
      </div>
    }>
      <AuthHandler />
    </Suspense>
  )
}
