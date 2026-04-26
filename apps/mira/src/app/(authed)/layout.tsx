/**
 * Layout autenticado · wrapper com AppHeader.
 * Route group `(authed)` agrupa todas pages que precisam header sem afetar URL.
 *
 * Mirror Lara · cada feature (dashboard/templates/...) tinha layout proprio
 * com AppHeader; aqui consolida em 1 layout pai.
 *
 * GLOBAL INSIGHTS BANNER · 2026-04-26 (item #5):
 * InsightsBanner agora renderiza em TODA pagina authed (nao mais so /dashboard).
 * Sticky abaixo de AppNav row 3 (sub-tabs). Fetch dedicado server-side via
 * GlobalInsightsBanner — usa o mesmo InsightsBanner client component que ja
 * existia em /dashboard. Banner so aparece se ha insight critical/warning.
 */

import { Suspense } from 'react'
import { AppHeader } from '@/components/AppHeader'
import { MiraFooter } from '@/components/MiraFooter'
import { loadMiraServerContext } from '@/lib/server-context'
import type { Insight } from '@clinicai/repositories'
import { InsightsBanner } from './dashboard/InsightsBanner'

/**
 * Server Component dedicado · fetch insights globais e renderiza
 * InsightsBanner sticky logo abaixo do AppHeader (3 rows).
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
    // Sem contexto · auth invalida ou sem clinica selecionada · banner some
    return null
  }
  if (!insights.length) return null
  // Renderiza como flex sibling do AppHeader · automaticamente fica
  // "abaixo de row 3" sem precisar position:sticky (o scroll vive no
  // <main> filho, com overflow-y-auto). z-10 pra ficar acima do conteudo
  // se houver elementos com transform.
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
      <AppHeader />
      {/* Banner global · stick abaixo do AppNav (header sticky com 3 rows ~132px) */}
      <Suspense fallback={null}>
        <GlobalInsightsBanner />
      </Suspense>
      <div className="flex flex-1 min-h-0">{children}</div>
      <MiraFooter />
    </div>
  )
}
