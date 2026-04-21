'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { STORES } from '@/lib/types'

const navItems = [
  { href: '/reservations', label: '予約管理' },
  { href: '/operations', label: '稼働ボード' },
  { href: '/shift', label: 'シフト管理' },
  { href: '/staff', label: 'スタッフ' },
  { href: '/photodiary', label: '写メ日記' },
]

export default function NavBar() {
  const pathname = usePathname()
  if (pathname.startsWith('/cast') || pathname.startsWith('/photodiary') || pathname.startsWith('/chat')) return null
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

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-gray-950 text-white shadow-lg border-b border-gray-700">
      <div className="flex items-center h-14 px-5 gap-6">
        <div className="font-bold text-base tracking-wide shrink-0">
          <span className="text-blue-400">KIJ</span>
          <span className="text-gray-200 ml-1">管理</span>
        </div>
        <div className="w-px h-6 bg-gray-700 shrink-0" />
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
                    : 'text-gray-400 hover:bg-gray-800 hover:text-gray-100'
                }`}
              >
                {item.label}
              </Link>
            )
          })}
        </div>
        <div className="ml-auto flex items-center gap-3">
          <Link
            href="/cast/login"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-pink-600/20 text-pink-300 hover:bg-pink-600/40 hover:text-pink-100 border border-pink-600/30 transition-colors"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-pink-400 inline-block"></span>
            キャストページ
          </Link>
          <Link
            href="/photodiary/login"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-purple-600/20 text-purple-300 hover:bg-purple-600/40 hover:text-purple-100 border border-purple-600/30 transition-colors"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-purple-400 inline-block"></span>
            写メ日記投稿
          </Link>
          <Link
            href="/chat"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-green-600/20 text-green-300 hover:bg-green-600/40 hover:text-green-100 border border-green-600/30 transition-colors"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block"></span>
            チャット
          </Link>
          <Link
            href="/admin/publish-rules"
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              pathname.startsWith('/admin')
                ? 'bg-orange-600/40 text-orange-100 border-orange-500/60'
                : 'bg-orange-600/20 text-orange-300 hover:bg-orange-600/40 hover:text-orange-100 border-orange-600/30'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-orange-400 inline-block"></span>
            配信ルール
          </Link>
          {storeName && (
            <div className="flex items-center gap-1.5 bg-gray-800 px-3 py-1 rounded-full">
              <span className="w-2 h-2 rounded-full bg-green-400 inline-block"></span>
              <span className="text-xs font-semibold text-gray-200">{storeName}</span>
            </div>
          )}
        </div>
      </div>
    </nav>
  )
}
