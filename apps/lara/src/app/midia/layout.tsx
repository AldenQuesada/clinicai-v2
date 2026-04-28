import { Metadata } from 'next'
import { AppHeader } from '@/components/AppHeader'

export const metadata: Metadata = {
  title: 'Mídias · Lara · Clinica AI',
}

export default function MediaLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col h-screen w-full overflow-hidden bg-[hsl(var(--chat-bg))] text-[hsl(var(--foreground))]">
      <AppHeader />
      <div className="flex flex-1 min-h-0">{children}</div>
    </div>
  )
}
