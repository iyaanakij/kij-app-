import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'プロフィール登録フォーム',
  description: '入店時プロフィール登録フォームです',
}

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return children
}
