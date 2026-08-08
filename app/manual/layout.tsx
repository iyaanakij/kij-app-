import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '現場マニュアル | KIJ 管理システム',
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
