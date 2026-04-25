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
    <div className="flex flex-col h-screen w-full overflow-hidden bg-[hsl(var(--chat-bg))] text-[hsl(var(--foreground))]">
      <AppHeader />
      <NotificationPermissionBanner />
      <div className="flex flex-1 min-h-0">{children}</div>
    </div>
  )
}
