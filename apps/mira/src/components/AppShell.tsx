/**
 * AppShell · orquestrador server do (authed) layout.
 *
 * Substitui o antigo AppHeader (que era 3 linhas sticky empilhadas) por
 * um shell de 2 colunas:
 *
 *   ┌──────┬─────────────────────────────────────────────────────────┐
 *   │ side │ AppHeaderThin (search + bell + novo · 60px)             │
 *   │ bar  ├─────────────────────────────────────────────────────────┤
 *   │ 56px │ AppSubtabs (eyebrow + chips · 36px)                     │
 *   │      ├─────────────────────────────────────────────────────────┤
 *   │      │ children (page content · scroll proprio)                 │
 *   └──────┴─────────────────────────────────────────────────────────┘
 *
 * Faz auth + carrega profile + parcerias compactas pra Quick Search +
 * insights pra NotificationsBell + counts pra sub-tabs/sidebar badges.
 * Todos os fetches sao defensivos · qualquer erro vira fallback vazio
 * sem quebrar a render.
 *
 * Mobile (<md): sidebar oculta · drawer hamburger no AppHeaderThin.
 *
 * Insights bell + counts continuam fluindo via props · server → client.
 * QuickSearch (modal CTRL+K) renderiza fora do grid · fixed inset-0
 * quando aberto.
 */

import { Suspense } from 'react'
import { cookies } from 'next/headers'
import { createServerClient, resolveClinicContext } from '@clinicai/supabase'
import {
  ProfileRepository,
  B2BPartnershipRepository,
  B2BInsightsRepository,
  B2BApplicationRepository,
  B2BAnalyticsRepository,
  B2BMetricsV2Repository,
  type CriticalAlert,
  type Insight,
  type InsightKind,
  type InsightSeverity,
} from '@clinicai/repositories'
import { QuickSearch, type QuickPartner } from './QuickSearch'
import { AppSidebar } from './AppSidebar'
import { AppSubtabs } from './AppSubtabs'
import { MobileNavDrawer, MobileMenuButton } from './MobileNavDrawer'
import { B2BHero } from './B2BHero'
import { SearchHint } from './SearchHint'
import { NotificationsBell } from './NotificationsBell'
import { NewMenu } from './NewMenu'
import type { SubtabCounts } from './nav/sections'
import { buildSystemInsights } from '@/lib/system-insights'

/**
 * Skeleton minimalista pro Suspense fallback dos componentes que usam
 * useSearchParams (AppSubtabs · obrigatorio Suspense em Next.js 16).
 */
function SubtabsSkeleton() {
  return (
    <div className="shrink-0 h-9 border-b border-[#C9A96E]/15 bg-[#0F0D0A]" />
  )
}

export async function AppShell({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies()
  const supabase = createServerClient({
    getAll: () => cookieStore.getAll(),
    setAll: (cookiesToSet) => {
      cookiesToSet.forEach(({ name, value, options }) => {
        cookieStore.set(name, value, options)
      })
    },
  })

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    // Sem auth · render so children (login redirect lida em outro lugar).
    return <>{children}</>
  }

  let firstName = ''
  let role = ''
  try {
    const profiles = new ProfileRepository(supabase)
    const profile = await profiles.getById(user.id)
    firstName = profile?.firstName ?? ''
    role = profile?.role ?? ''
  } catch {
    // ignore
  }

  // Pre-fetch parcerias compactas pra Quick Search + insights pra
  // NotificationsBell + applications pending pra contagem · todos defensivos.
  let quickPartners: QuickPartner[] = []
  let insights: Insight[] = []
  let counts: SubtabCounts = {}
  try {
    const ctx = await resolveClinicContext(supabase)
    if (ctx) {
      const partnerRepo = new B2BPartnershipRepository(supabase)
      const insightsRepo = new B2BInsightsRepository(supabase)
      const applicationsRepo = new B2BApplicationRepository(supabase)
      const analyticsRepo = new B2BAnalyticsRepository(supabase)
      const metricsRepo = new B2BMetricsV2Repository(supabase)
      const [
        partners,
        insightsRes,
        pendingApplications,
        analyticsBlob,
        criticalAlerts,
      ] = await Promise.all([
        partnerRepo.list(ctx.clinic_id, {}).catch(() => []),
        insightsRepo.global().catch(() => null),
        applicationsRepo.countPending().catch(() => 0),
        analyticsRepo.get(30).catch(() => null),
        metricsRepo.criticalAlerts().catch((): CriticalAlert[] => []),
      ])
      quickPartners = partners.map((p) => ({
        id: p.id,
        name: p.name,
        slug: p.slug ?? null,
        status: p.status ?? null,
        pillar: p.pillar ?? null,
      }))
      // Merge: insights por parceria (RPC) + system insights sinteticos +
      // critical_alerts (antes ficavam no banner sticky em /b2b/analytics).
      const sysInsights = buildSystemInsights({
        data: analyticsBlob,
        pendingApplications,
      })
      const alertInsights: Insight[] = criticalAlerts.map((a) => {
        const sev: InsightSeverity =
          a.severity === 'critical'
            ? 'critical'
            : a.severity === 'warning'
              ? 'warning'
              : a.severity === 'celebrate'
                ? 'success'
                : 'info'
        return {
          kind: 'high_impact' as InsightKind,
          severity: sev,
          title: a.partnership_name || 'Alerta',
          message: a.suggested_action
            ? `${a.message} → ${a.suggested_action}`
            : a.message,
          partnership_id: a.partnership_id || '',
          partnership_name: a.partnership_name || 'Sistema',
          action_url: a.partnership_id
            ? `/partnerships/${a.partnership_id}`
            : '/b2b/analytics',
          score: sev === 'critical' ? 88 : sev === 'warning' ? 55 : 30,
        }
      })
      insights = [...sysInsights, ...alertInsights, ...(insightsRes?.insights ?? [])]

      // Counts in-memory · zero query extra (partners ja fetched)
      const byStatus = (s: string) =>
        partners.filter((p) => p.status === s).length
      counts = {
        insights: insights.length,
        active: byStatus('active'),
        prospects: byStatus('prospect') + byStatus('dna_check'),
        inactive: byStatus('paused') + byStatus('closed'),
        candidaturas: pendingApplications,
      }
    }
  } catch {
    // Header degradado · ok, render mesmo assim
  }

  const displayName = firstName || user.email?.split('@')[0] || 'Usuário'
  const initials = (firstName || user.email || 'U').slice(0, 1).toUpperCase()
  const sidebarUser = { displayName, initials, role }

  // Urgentes (critical+warning) · usado pelo badge da sidebar/drawer
  const urgentInsights = insights.filter(
    (i) => i.severity === 'critical' || i.severity === 'warning',
  ).length

  return (
    <>
      {/* QuickSearch modal · fora do grid (fixed inset-0 quando aberto) */}
      <QuickSearch partners={quickPartners} />

      {/* Mobile drawer · fora do grid · controlado por custom event */}
      <MobileNavDrawer
        user={sidebarUser}
        counts={counts}
        urgentInsights={urgentInsights}
      />

      <div className="flex flex-1 min-h-0 w-full">
        {/* Sidebar · md+ · 56px sticky esquerda */}
        <AppSidebar
          user={sidebarUser}
          counts={counts}
          urgentInsights={urgentInsights}
        />

        {/* Coluna direita · B2BHero (esquerda) + actions (direita) numa
            linha so · subtabs · content. AppHeaderThin removido (pedido
            Alden 2026-04-26 · ganha 1 linha de altura). */}
        <div className="flex flex-col flex-1 min-w-0">
          <B2BHero>
            <MobileMenuButton />
            <SearchHint />
            <NotificationsBell insights={insights} />
            <NewMenu />
          </B2BHero>
          <Suspense fallback={<SubtabsSkeleton />}>
            <AppSubtabs counts={counts} />
          </Suspense>
          {children}
        </div>
      </div>
    </>
  )
}
