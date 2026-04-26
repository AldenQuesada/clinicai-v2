/**
 * Mira · AppHeader · 2 niveis sticky no topo (SECTION + sub-tabs).
 *
 * Server Component que faz auth + carrega profile + parcerias compactas
 * pra Quick Search. Toda a UI do nav (SECTIONS · sub-tabs · active state)
 * vive em AppNav (Client Component) que usa usePathname() — antes a
 * deteccao tentava ler `headers().get('x-pathname')` mas o middleware
 * Next.js 16 nao injeta esses headers, deixando "Geral" sempre marcado.
 *
 * Quick actions sempre visiveis: + Voucher, + Parceria, busca CTRL+K.
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
  type Insight,
} from '@clinicai/repositories'
import { QuickSearch, type QuickPartner } from './QuickSearch'
import { AppNav, type SubtabCounts } from './AppNav'
import { buildSystemInsights } from '@/lib/system-insights'

const PAINEL_URL =
  process.env.NEXT_PUBLIC_PAINEL_URL || 'https://painel.miriandpaula.com.br'

export async function AppHeader() {
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
  if (!user) return null

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
      const [partners, insightsRes, pendingApplications, analyticsBlob] = await Promise.all([
        partnerRepo.list(ctx.clinic_id, {}).catch(() => []),
        insightsRepo.global().catch(() => null),
        applicationsRepo.countPending().catch(() => 0),
        analyticsRepo.get(30).catch(() => null),
      ])
      quickPartners = partners.map((p) => ({
        id: p.id,
        name: p.name,
        slug: p.slug ?? null,
        status: p.status ?? null,
        pillar: p.pillar ?? null,
      }))
      // Merge: insights por parceria (RPC) + system insights sinteticos.
      // System insights vem antes na lista pra aparecer agrupado por severity
      // no sino (ja que ordena por severity > score).
      const sysInsights = buildSystemInsights({
        data: analyticsBlob,
        pendingApplications,
      })
      insights = [...sysInsights, ...(insightsRes?.insights ?? [])]

      // Counts in-memory · zero query extra (partners ja fetched)
      const byStatus = (s: string) =>
        partners.filter((p) => p.status === s).length
      counts = {
        insights: insights.length,
        active: byStatus('active'),
        prospects: byStatus('prospect') + byStatus('dna_check'),
        inactive: byStatus('paused') + byStatus('closed'),
        candidaturas: pendingApplications,
        // candidatos · scout repo nao tem count direto, deixar undefined
      }
    }
  } catch {
    // Header degradado · ok, render mesmo assim
  }

  const displayName = firstName || user.email?.split('@')[0] || 'Usuário'
  const initials = (firstName || user.email || 'U').slice(0, 1).toUpperCase()

  return (
    <>
      <QuickSearch partners={quickPartners} />
      {/* Suspense necessario · AppNav usa useSearchParams() */}
      <Suspense fallback={<div className="h-22 border-b border-[#C9A96E]/15 bg-[#0F0D0A]" />}>
        <AppNav
          user={{
            displayName,
            initials,
            role,
            panelUrl: PAINEL_URL,
          }}
          insights={insights}
          counts={counts}
        />
      </Suspense>
    </>
  )
}
