/**
 * (authed) layout · envolve TODAS as rotas protegidas com AppShell.
 *
 * Substitui os 6 layouts duplicados (dashboard/conversas/prompts/midia/
 * templates/configuracoes) que cada um chamava AppHeader. Agora 1 shell
 * canonico · sidebar + thin header + user menu.
 */

import { AppShell } from '@/components/AppShell'

export default function AuthedLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>
}
