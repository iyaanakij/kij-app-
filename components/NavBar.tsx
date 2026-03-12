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
    <nav className="fixed top-0 left-0 right-0 z-50 bg-gray-900 text-white shadow-lg">
      <div className="flex items-center h-16 px-4 gap-6">
        <div className="font-bold text-lg text-white shrink-0">KIJ 管理</div>
        <div className="flex gap-1 flex-wrap">
          {navItems.map((item) => {
            const active = pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                  active
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-300 hover:bg-gray-700 hover:text-white'
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
