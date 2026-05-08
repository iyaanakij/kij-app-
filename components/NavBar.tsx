'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { STORES } from '@/lib/types'

const navItems = [
  { href: '/reservations', label: '予約管理' },
  { href: '/operations', label: '稼働ボード' },
  { href: '/shift', label: 'シフト管理' },
  { href: '/ranking', label: 'ランキング' },
  { href: '/dorm', label: '寮管理' },
  { href: '/women-info', label: '女性情報' },
  { href: '/staff', label: 'スタッフ' },
  { href: '/photodiary', label: '写メ日記' },
]

function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    const timer = window.setTimeout(() => setMounted(true), 0)
    return () => window.clearTimeout(timer)
  }, [])
  if (!mounted) return <div className="w-8 h-8" />

  const isDark = theme === 'dark'
  return (
    <button
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-200 hover:bg-gray-800 dark:hover:bg-gray-700 transition-colors"
      title={isDark ? 'ライトモードに切替' : 'ダークモードに切替'}
    >
      {isDark ? (
        // 太陽アイコン
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="4"/>
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>
        </svg>
      ) : (
        // 月アイコン
        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>
        </svg>
      )}
    </button>
  )
}

export default function NavBar() {
  const pathname = usePathname()
  const [storeName, setStoreName] = useState<string>('')

  useEffect(() => {
    const update = () => {
      const saved = localStorage.getItem('kij_store')
      if (saved) {
        const store = STORES.find(s => s.id === Number(saved))
        setStoreName(store?.name ?? '')
      } else {
        setStoreName('')
      }
    }
    update()
    window.addEventListener('kij_store_changed', update)
    return () => window.removeEventListener('kij_store_changed', update)
  }, [pathname])

  if (pathname.startsWith('/cast') || pathname.startsWith('/photodiary') || pathname.startsWith('/chat')) return null

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-gray-200 shadow-sm dark:bg-gray-950 dark:border-gray-700 dark:shadow-lg text-gray-900 dark:text-white">
      <div className="flex items-center h-14 px-5 gap-6">
        <div className="font-bold text-base tracking-wide shrink-0">
          <span className="text-blue-600 dark:text-blue-400">KIJ</span>
          <span className="text-gray-800 dark:text-gray-200 ml-1">管理</span>
        </div>
        <div className="w-px h-6 bg-gray-200 dark:bg-gray-700 shrink-0" />
        <div className="flex gap-1 flex-wrap">
          {navItems.map((item) => {
            const active = pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  active
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100'
                }`}
              >
                {item.label}
              </Link>
            )
          })}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Link
            href="/cast/login"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-pink-50 text-pink-500 hover:bg-pink-100 border border-pink-200 dark:bg-pink-600/20 dark:text-pink-300 dark:hover:bg-pink-600/40 dark:border-pink-600/30 transition-colors"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-pink-400 inline-block"></span>
            キャストページ
          </Link>
          <Link
            href="/photodiary/login"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-purple-50 text-purple-500 hover:bg-purple-100 border border-purple-200 dark:bg-purple-600/20 dark:text-purple-300 dark:hover:bg-purple-600/40 dark:border-purple-600/30 transition-colors"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-purple-400 inline-block"></span>
            写メ日記投稿
          </Link>
          <Link
            href="/chat"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-green-50 text-green-600 hover:bg-green-100 border border-green-200 dark:bg-green-600/20 dark:text-green-300 dark:hover:bg-green-600/40 dark:border-green-600/30 transition-colors"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block"></span>
            チャット
          </Link>
          <Link
            href="/admin/publish-rules"
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              pathname.startsWith('/admin')
                ? 'bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-600/40 dark:text-orange-100 dark:border-orange-500/60'
                : 'bg-orange-50 text-orange-500 hover:bg-orange-100 border-orange-200 dark:bg-orange-600/20 dark:text-orange-300 dark:hover:bg-orange-600/40 dark:border-orange-600/30'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-orange-400 inline-block"></span>
            配信ルール
          </Link>
          {storeName && (
            <div className="flex items-center gap-1.5 bg-gray-100 dark:bg-gray-800 px-3 py-1 rounded-full">
              <span className="w-2 h-2 rounded-full bg-green-400 inline-block"></span>
              <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">{storeName}</span>
            </div>
          )}
          <ThemeToggle />
        </div>
      </div>
    </nav>
  )
}
