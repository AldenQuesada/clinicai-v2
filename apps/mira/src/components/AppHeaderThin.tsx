'use client'

/**
 * AppHeaderThin · header thin de ~60px no topo do conteudo (a direita
 * da sidebar). Substitui a "linha 1" do AppNav antigo que tinha
 * brand + sub-tabs + quick actions empilhados.
 *
 * Componentes:
 *   - MobileMenuButton (so md-down) · abre drawer
 *   - QuickSearch trigger (SearchHint) · ocupa centro
 *   - NotificationsBell · sino com insights
 *   - NewMenu · "+ Novo"
 *
 * Decisao 2026-04-26 · brand title (Cormorant "Programa de parcerias B2B")
 * SUMIU dessa header (vive no MiraFooter agora). Pedido Alden · "ganha-se
 * altura" e brand vai pro rodape pra dar peso simbolico. So o monograma
 * "M" continua no topo da sidebar.
 *
 * Avatar/logout vivem na sidebar (rodape) · NAO duplicados aqui.
 */

import type { Insight } from '@clinicai/repositories'
import { SearchHint } from './SearchHint'
import { NotificationsBell } from './NotificationsBell'
import { NewMenu } from './NewMenu'
import { MobileMenuButton } from './MobileNavDrawer'

export function AppHeaderThin({ insights = [] }: { insights?: Insight[] }) {
  return (
    <header
      className="shrink-0 flex items-center gap-3 px-4 md:px-5 border-b border-[#C9A96E]/15 bg-[#0F0D0A] z-20"
      style={{ minHeight: 60 }}
    >
      {/* Mobile-only · hamburger drawer trigger */}
      <MobileMenuButton />

      {/* Busca · centro · grow flex */}
      <div className="flex-1 flex justify-center min-w-0">
        <SearchHint />
      </div>

      {/* Quick Actions · sino + Novo */}
      <div className="flex items-center gap-2 shrink-0">
        <NotificationsBell insights={insights} />
        <NewMenu />
      </div>
    </header>
  )
}
