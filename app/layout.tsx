import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Seasonz Dashboard',
  description: 'Champion & Superuser management dashboard — seasonz.ai',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  )
}
