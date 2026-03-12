import type { Metadata } from 'next'
import './globals.css'
import NavBar from '@/components/NavBar'

export const metadata: Metadata = {
  title: 'KIJ 管理システム',
  description: '風俗店管理システム',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ja">
      <body className="antialiased bg-slate-100 min-h-screen">
        <NavBar />
        <main className="pt-14 max-w-[1800px] mx-auto px-0">{children}</main>
      </body>
    </html>
  )
}
