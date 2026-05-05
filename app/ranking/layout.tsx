import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'ランキング | KIJ 管理システム',
}

export default function RankingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
