import { Metadata } from 'next'
import { AppHeader } from '@/components/AppHeader'

export const metadata: Metadata = {
  title: 'Prompts · Lara · Clinica AI',
}

export default function PromptsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col h-screen w-full overflow-hidden bg-[var(--b2b-bg-0)] text-[var(--b2b-text)]">
      <AppHeader />
      <div className="flex flex-1 min-h-0">{children}</div>
    </div>
  )
}
