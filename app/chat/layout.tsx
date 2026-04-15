import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: '快楽M性感倶楽部 自動応答ガイド',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  interactiveWidget: 'resizes-content',
}

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return children
}
