import './globals.css'
import type { Metadata, Viewport } from 'next'

export const viewport: Viewport = {
  themeColor: '#6b21a8',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
}

export const metadata: Metadata = {
  title: 'Ritsumei Time',
  description: '立命館大学 デジタル時間割 (PWA)',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Ritsumei Time',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ja">
      <body>
        <main className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 dark:from-slate-900 dark:via-slate-800 dark:to-indigo-950">
          {children}
        </main>
      </body>
    </html>
  )
}
