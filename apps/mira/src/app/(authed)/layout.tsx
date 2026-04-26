/**
 * Layout autenticado · wrapper com AppShell (sidebar + thin header + subtabs).
 *
 * Refactor 2026-04-26 · fathers viraram SIDEBAR vertical (56px sticky esq).
 * Linha 1 do antigo AppNav (chips horizontais) morreu · ganha-se 1 linha de
 * altura no viewport. Quick Actions (busca, sino, +Novo) ficam num thin header
 * (~60px). Sub-tabs continuam em faixa horizontal · agora com largura full
 * (sidebar fica fora do flow).
 *
 * Estrutura final (md+):
 *   ┌──────┬─────────────────────────────────────────────────────────┐
 *   │      │ AppHeaderThin · 60px · search + bell + novo             │
 *   │ side ├─────────────────────────────────────────────────────────┤
 *   │ bar  │ AppSubtabs · 36px · eyebrow + chips                     │
 *   │ 56px ├─────────────────────────────────────────────────────────┤
 *   │      │ GlobalInsightsBanner · so se ha critical/warning        │
 *   │      ├─────────────────────────────────────────────────────────┤
 *   │      │ {children} · scroll proprio (overflow-y-auto)            │
 *   └──────┴─────────────────────────────────────────────────────────┘
 *   ┌────────────────────────────────────────────────────────────────┐
 *   │ MiraFooter (full-width)                                        │
 *   └────────────────────────────────────────────────────────────────┘
 *
 * Mobile (<md): sidebar oculta · botao hamburger no thin header abre drawer.
 *
 * GLOBAL INSIGHTS BANNER · 2026-04-26 (item #5):
 * InsightsBanner renderiza em TODA pagina authed (nao mais so /dashboard).
 * Posicao · entre AppSubtabs e {children} (dentro da coluna direita do shell)
 * pra ficar coerente com a faixa de sub-tabs e nao "vazar" pra cima da
 * sidebar.
 */

import { Suspense } from 'react'
import { AppShell } from '@/components/AppShell'
import { MiraFooter } from '@/components/MiraFooter'
import { loadMiraServerContext } from '@/lib/server-context'
import type { Insight } from '@clinicai/repositories'
import { InsightsBanner } from './dashboard/InsightsBanner'

/**
 * Server Component dedicado · fetch insights globais e renderiza
 * InsightsBanner abaixo dos sub-tabs.
 *
 * Defensive · qualquer erro vira [] (banner some). Suspense permite que
 * o restante da page renderize sem esperar o fetch terminar.
 */
async function GlobalInsightsBanner() {
  let insights: Insight[] = []
  try {
    const { repos } = await loadMiraServerContext()
    const res = await repos.b2bInsights.global().catch(() => null)
    insights = res?.insights ?? []
  } catch {
    return null
  }
  if (!insights.length) return null
  return (
    <div className="shrink-0 z-10 px-5 pt-2 pb-1 border-b border-[#C9A96E]/15 bg-[#0F0D0A]">
      <InsightsBanner insights={insights} />
    </div>
  )
}

export default function AuthedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col h-screen w-full overflow-hidden bg-[hsl(var(--chat-bg))] text-[hsl(var(--foreground))]">
      <AppShell>
        {/* Banner global · entre sub-tabs e conteudo */}
        <Suspense fallback={null}>
          <GlobalInsightsBanner />
        </Suspense>
        <main className="flex-1 min-h-0 overflow-y-auto">{children}</main>
      </AppShell>
      <MiraFooter />
    </div>
  )
}
