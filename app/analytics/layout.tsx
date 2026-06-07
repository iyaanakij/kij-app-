import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'ウェブ解析レポート | KIJ 管理システム',
}

export default function AnalyticsLayout({ children }: { children: React.ReactNode }) {
  return children
}
