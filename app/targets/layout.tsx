import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '目標 | KIJ 管理システム',
}

export default function TargetsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
