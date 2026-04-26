/**
 * Layout autenticado · wrapper com AppHeader.
 * Route group `(authed)` agrupa todas pages que precisam header sem afetar URL.
 *
 * Mirror Lara · cada feature (dashboard/templates/...) tinha layout proprio
 * com AppHeader; aqui consolida em 1 layout pai.
 */

import { AppHeader } from '@/components/AppHeader'
import { MiraFooter } from '@/components/MiraFooter'

export default function AuthedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col h-screen w-full overflow-hidden bg-[hsl(var(--chat-bg))] text-[hsl(var(--foreground))]">
      <AppHeader />
      <div className="flex flex-1 min-h-0">{children}</div>
      <MiraFooter />
    </div>
  )
}
