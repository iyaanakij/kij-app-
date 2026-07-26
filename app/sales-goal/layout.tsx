import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '売上目標 | KIJ 管理システム',
}

export default function SalesGoalLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
