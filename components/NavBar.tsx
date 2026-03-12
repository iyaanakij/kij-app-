'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const navItems = [
  { href: '/reservations', label: '予約管理' },
  { href: '/operations', label: '稼働ボード' },
  { href: '/shift', label: 'シフト管理' },
  { href: '/staff', label: 'スタッフ' },
]

export default function NavBar() {
  const pathname = usePathname()

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
      </div>
    </nav>
  )
}
