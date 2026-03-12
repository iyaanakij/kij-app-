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
      <body className="antialiased bg-gray-100 min-h-screen">
        <NavBar />
        <main className="pt-16">{children}</main>
      </body>
    </html>
  )
}
