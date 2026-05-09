import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '女性情報 | KIJ 管理システム',
}

export default function WomenInfoLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
