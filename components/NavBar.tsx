'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { useTheme } from 'next-themes'

const navItems = [
  { href: '/sales-goal', label: '売上目標' },
  { href: '/reservations', label: '予約管理' },
  { href: '/operations', label: '稼働ボード' },
  { href: '/shift', label: 'シフト管理' },
  { href: '/ranking', label: 'ランキング' },
  { href: '/dorm', label: '寮管理' },
  { href: '/women-info', label: '女性情報' },
  { href: '/staff', label: 'キャスト' },
  { href: '/hotels', label: 'ホテル料金' },
  { href: '/manual', label: 'マニュアル' },
]

// 外部公開ページ・投稿系ツールは「ツール」プルダウンにまとめる
const TOOL_ITEMS = [
  { href: '/cast/login', label: 'キャストページ', external: true, dot: 'bg-pink-400' },
  { href: '/photodiary', label: '写メ日記', external: false, dot: 'bg-blue-400' },
  { href: '/photodiary/login', label: '写メ日記投稿', external: true, dot: 'bg-purple-400' },
  { href: '/chat', label: 'チャット', external: true, dot: 'bg-green-400' },
  { href: '/admin/vanilla-blog', label: 'バニラブログ', external: false, dot: 'bg-rose-400' },
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
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="4"/>
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>
        </svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>
        </svg>
      )}
    </button>
  )
}

export default function NavBar() {
  const pathname = usePathname()
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isToolsOpen, setIsToolsOpen] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)
  const toolsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => { setIsMenuOpen(false); setIsToolsOpen(false) }, 0)
    return () => window.clearTimeout(timer)
  }, [pathname])

  useEffect(() => {
    fetch('/api/admin/onboarding/pending-count')
      .then(r => r.json())
      .then(d => setPendingCount(d.count ?? 0))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!isToolsOpen) return
    function handleClickOutside(e: MouseEvent) {
      if (toolsRef.current && !toolsRef.current.contains(e.target as Node)) setIsToolsOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isToolsOpen])

  if (pathname.startsWith('/cast') || pathname.startsWith('/photodiary') || pathname.startsWith('/chat')) return null

  return (
    <>
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-gray-200 shadow-sm dark:bg-gray-950 dark:border-gray-700 dark:shadow-lg text-gray-900 dark:text-white">
        <div className="flex items-center h-14 px-4 md:px-5 gap-4 md:gap-6">
          {/* Logo */}
          <div className="font-bold text-base tracking-wide shrink-0">
            <span className="text-blue-600 dark:text-blue-400">KIJ</span>
            <span className="text-gray-800 dark:text-gray-200 ml-1">管理</span>
          </div>

          {/* Desktop: separator + nav items */}
          <div className="w-px h-6 bg-gray-200 dark:bg-gray-700 shrink-0 hidden md:block" />
          <div className="hidden md:flex gap-1 flex-wrap">
            {navItems.map((item) => {
              const active = pathname.startsWith(item.href)
              const showBadge = item.href === '/staff' && pendingCount > 0
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`relative px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${
                    active
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100'
                  }`}
                >
                  {item.label}
                  {showBadge && (
                    <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-0.5 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center font-bold leading-none">
                      {pendingCount}
                    </span>
                  )}
                </Link>
              )
            })}
          </div>

          {/* Desktop: right side */}
          <div className="ml-auto hidden md:flex items-center gap-2">
            <div className="relative" ref={toolsRef}>
              <button
                onClick={() => setIsToolsOpen((v) => !v)}
                className={`flex items-center gap-1 px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  isToolsOpen
                    ? 'bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100'
                }`}
              >
                ツール
                <svg
                  xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
                  fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                  className={`transition-transform ${isToolsOpen ? 'rotate-180' : ''}`}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              {isToolsOpen && (
                <div className="absolute right-0 mt-2 w-48 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg py-1.5 overflow-hidden">
                  {TOOL_ITEMS.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      target={item.external ? '_blank' : undefined}
                      rel={item.external ? 'noopener noreferrer' : undefined}
                      onClick={() => setIsToolsOpen(false)}
                      className="flex items-center gap-2 px-3.5 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${item.dot} shrink-0`}></span>
                      {item.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
            <Link
              href="/admin/dashboard"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                pathname.startsWith('/admin')
                  ? 'bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-600/40 dark:text-orange-100 dark:border-orange-500/60'
                  : 'bg-orange-50 text-orange-500 hover:bg-orange-100 border-orange-200 dark:bg-orange-600/20 dark:text-orange-300 dark:hover:bg-orange-600/40 dark:border-orange-600/30'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-orange-400 inline-block"></span>
              システム状態
            </Link>
            <ThemeToggle />
          </div>

          {/* Mobile: right side (theme toggle + hamburger) */}
          <div className="ml-auto flex md:hidden items-center gap-2">
            <ThemeToggle />
            <button
              onClick={() => setIsMenuOpen(true)}
              className="w-9 h-9 flex items-center justify-center rounded-full text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 transition-colors"
              aria-label="メニューを開く"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile drawer */}
      {isMenuOpen && (
        <div className="fixed inset-0 z-[60] md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setIsMenuOpen(false)} />
          <div className="absolute top-0 right-0 h-full w-72 bg-white dark:bg-gray-950 shadow-2xl flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between h-14 px-5 border-b border-gray-200 dark:border-gray-700 shrink-0">
              <div className="font-bold text-base">
                <span className="text-blue-600 dark:text-blue-400">KIJ</span>
                <span className="text-gray-800 dark:text-gray-200 ml-1">管理</span>
              </div>
              <button
                onClick={() => setIsMenuOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                aria-label="メニューを閉じる"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* Nav items + quick links */}
            <div className="flex flex-col px-3 py-3 gap-0.5 overflow-y-auto flex-1">
              {navItems.map((item) => {
                const active = pathname.startsWith(item.href)
                const showBadge = item.href === '/staff' && pendingCount > 0
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setIsMenuOpen(false)}
                    className={`relative flex items-center px-4 py-3 rounded-xl text-sm font-medium transition-colors ${
                      active
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                    }`}
                  >
                    {item.label}
                    {showBadge && (
                      <span className="ml-2 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center font-bold leading-none">
                        {pendingCount}
                      </span>
                    )}
                  </Link>
                )
              })}

              <div className="my-2 border-t border-gray-200 dark:border-gray-700" />

              <div className="px-4 pt-1 pb-1 text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">ツール</div>
              {TOOL_ITEMS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  target={item.external ? '_blank' : undefined}
                  rel={item.external ? 'noopener noreferrer' : undefined}
                  onClick={() => setIsMenuOpen(false)}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  <span className={`w-2 h-2 rounded-full ${item.dot} shrink-0`}></span>
                  {item.label}
                </Link>
              ))}

              <div className="my-2 border-t border-gray-200 dark:border-gray-700" />

              <Link
                href="/admin/dashboard"
                onClick={() => setIsMenuOpen(false)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  pathname.startsWith('/admin')
                    ? 'bg-orange-100 dark:bg-orange-600/20 text-orange-700 dark:text-orange-300'
                    : 'text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-600/10'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-orange-400 shrink-0"></span>
                システム状態
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
