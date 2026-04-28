import { Metadata } from 'next'
import { AppHeader } from '@/components/AppHeader'
import { NotificationPermissionBanner } from '@/components/NotificationPermissionBanner'

export const metadata: Metadata = {
  title: 'Conversas · Lara · Clinica AI',
}

export default function ConversasLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    // Layout: header + banner permissão (se aplicável) + chat full-height
    <div className="flex flex-col h-screen w-full overflow-hidden bg-[var(--b2b-bg-0)] text-[var(--b2b-text)]">
      <AppHeader />
      <NotificationPermissionBanner />
      <div className="flex flex-1 min-h-0">{children}</div>
    </div>
  )
}
