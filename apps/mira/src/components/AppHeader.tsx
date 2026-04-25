/**
 * Mira · AppHeader · 2 niveis sticky no topo (SECTION + sub-tabs).
 *
 * Hierarquia CANONICA replicada 1:1 do clinic-dashboard b2b-shell.ui.js:
 *   1. Geral          · Ativas / Prospects / Candidatos / Candidaturas /
 *                       Inativas / Mapa / Saude / Gaps / Encerramentos
 *   2. Disparos       · Templates / Segmento
 *   3. Analytics      · Overview / NPS
 *   4. Configurações  · Admins / Padroes / Saude / Auditoria / Sobre
 *
 * Cada sub-tab aponta pra rota Next existente (quando ja foi migrada) OU
 * marca "em breve" pra rotas que ainda precisam ser portadas do antigo.
 *
 * Quick actions sempre visiveis: + Voucher, + Parceria, busca CTRL+K.
 */

import Link from 'next/link'
import { cookies, headers } from 'next/headers'
import { createServerClient, resolveClinicContext } from '@clinicai/supabase'
import { ProfileRepository, B2BPartnershipRepository } from '@clinicai/repositories'
import { LogOut, ExternalLink, Plus, Search } from 'lucide-react'
import { logoutAction } from '@/app/login/actions'
import { QuickSearch, type QuickPartner } from './QuickSearch'
import { SearchHint } from './SearchHint'

const PAINEL_URL = process.env.NEXT_PUBLIC_PAINEL_URL || 'https://painel.miriandpaula.com.br'

type SubTab = {
  href: string
  label: string
  available: boolean // false = stub "em breve"
}

type Section = {
  key: 'geral' | 'disparos' | 'analytics' | 'config'
  label: string
  defaultHref: string
  subtabs: SubTab[]
  /** Prefixos de pathname que pertencem a esta section */
  match: string[]
}

const SECTIONS: Section[] = [
  {
    key: 'geral',
    label: 'Geral',
    defaultHref: '/partnerships',
    match: [
      '/partnerships',
      '/dashboard',
      '/hoje',
      '/semana',
      '/vouchers',
      '/b2b/candidatos',
      '/b2b/candidaturas',
      '/b2b/mapa',
    ],
    subtabs: [
      { href: '/partnerships?filter=active', label: 'Ativas', available: true },
      { href: '/partnerships?filter=prospects', label: 'Prospects', available: true },
      { href: '/b2b/candidatos', label: 'Candidatos', available: true },
      { href: '/b2b/candidaturas', label: 'Candidaturas', available: true },
      { href: '/partnerships?filter=inactive', label: 'Inativas', available: true },
      { href: '/b2b/mapa', label: 'Mapa', available: true },
      { href: '/b2b/saude', label: 'Saúde', available: true },
      { href: '/semana/gaps', label: 'Gaps do plano', available: true },
      { href: '/semana/encerramentos', label: 'Encerramentos', available: true },
    ],
  },
  {
    key: 'disparos',
    label: 'Disparos',
    defaultHref: '/b2b/disparos',
    match: ['/b2b/disparos', '/templates', '/b2b/segmento'],
    subtabs: [
      { href: '/b2b/disparos', label: 'Templates', available: true },
      { href: '/b2b/segmento', label: 'Segmento', available: true },
    ],
  },
  {
    key: 'analytics',
    label: 'Analytics',
    defaultHref: '/b2b/analytics',
    match: ['/b2b/analytics', '/analytics', '/semana/relatorios', '/b2b/nps'],
    subtabs: [
      { href: '/b2b/analytics', label: 'Overview', available: true },
      { href: '/b2b/nps', label: 'NPS', available: true },
    ],
  },
  {
    key: 'config',
    label: 'Configurações',
    defaultHref: '/configuracoes?tab=professionals',
    match: ['/configuracoes', '/estudio'],
    subtabs: [
      { href: '/configuracoes?tab=professionals', label: 'Admins', available: true },
      { href: '/estudio/padroes', label: 'Padrões', available: true },
      { href: '/configuracoes?tab=overview', label: 'Saúde', available: true },
      { href: '/configuracoes?tab=logs', label: 'Auditoria', available: true },
      { href: '/estudio/sobre', label: 'Sobre', available: true },
    ],
  },
]

// Sub-tabs LEGADAS que ainda existem como rota mas nao fazem parte da
// hierarquia canonica · ficam acessiveis via URL direta mas nao aparecem
// no menu (evita confusao). Listadas aqui pra detectActiveSection saber
// que pertencem a Geral por default.
const LEGACY_PATHS = [
  '/hoje',
  '/semana/comentarios',
  '/semana/renovacoes',
  '/estudio/cadastrar',
  '/estudio/combos',
  '/estudio/lgpd',
  '/vouchers/novo',
  '/vouchers/bulk',
]

function detectActiveSection(pathname: string): Section {
  for (const s of SECTIONS) {
    for (const m of s.match) {
      if (pathname === m || pathname.startsWith(m + '/')) return s
    }
  }
  // Legacy paths default to Geral
  if (LEGACY_PATHS.some((p) => pathname.startsWith(p))) return SECTIONS[0]
  return SECTIONS[0] // default Geral
}

function detectActiveSubtab(
  pathname: string,
  searchParams: string,
  section: Section,
): SubTab | null {
  const fullPath = searchParams ? `${pathname}?${searchParams}` : pathname

  // Match exato (com query) primeiro
  const exact = section.subtabs.find((t) => t.href === fullPath)
  if (exact) return exact

  // Match por pathname puro (ignora query) · ex: /partnerships/[id] casa /partnerships
  const byPath = section.subtabs.find((t) => {
    const tabPath = t.href.split('?')[0]
    return pathname === tabPath || pathname.startsWith(tabPath + '/')
  })
  if (byPath) {
    // Pra rotas com query, so vira ativo se nao houver query NA URL atual
    // (ex: /configuracoes sem ?tab=overview nao casa "Saude" porque ambiguo)
    if (byPath.href.includes('?') && !searchParams) return null
    return byPath
  }
  return null
}

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

  const { data: { user } } = await supabase.auth.getUser()
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

  // Pre-fetch parcerias compactas pra Quick Search · zero N+1, 1 query
  let quickPartners: QuickPartner[] = []
  try {
    const ctx = await resolveClinicContext(supabase)
    if (ctx) {
      const partnerRepo = new B2BPartnershipRepository(supabase)
      const all = await partnerRepo.list(ctx.clinic_id, {})
      quickPartners = all.map((p) => ({
        id: p.id,
        name: p.name,
        slug: p.slug ?? null,
        status: p.status ?? null,
        pillar: p.pillar ?? null,
      }))
    }
  } catch {
    // Quick search degradado pra apenas acoes · ok
  }

  const displayName = firstName || user.email?.split('@')[0] || 'Usuário'
  const initials = (firstName || user.email || 'U').slice(0, 1).toUpperCase()

  const headerStore = await headers()
  const rawPath =
    headerStore.get('x-invoke-path') ?? headerStore.get('x-pathname') ?? '/dashboard'
  const url = new URL(rawPath, 'http://x')
  const pathname = url.pathname
  const searchParams = url.searchParams.toString()

  const activeSection = detectActiveSection(pathname)
  const activeSubtab = detectActiveSubtab(pathname, searchParams, activeSection)

  return (
    <>
    <QuickSearch partners={quickPartners} />
    <header className="shrink-0 border-b border-[#C9A96E]/15 bg-[#0F0D0A] z-20 sticky top-0">
      {/* === Father row · 3 sections + brand + quick actions + user === */}
      <div className="h-13 flex items-center justify-between px-5 border-b border-white/5">
        {/* Brand */}
        <Link href={activeSection.defaultHref} className="flex items-center gap-3 group shrink-0">
          <div className="w-8 h-8 rounded-md bg-[#C9A96E]/15 border border-[#C9A96E]/35 flex items-center justify-center">
            <span className="font-display text-[#C9A96E] text-base leading-none">M</span>
          </div>
          <div className="flex flex-col leading-tight">
            <span className="font-display text-[15px] text-[#F5F0E8] group-hover:text-[#C9A96E] transition-colors">
              Mira
            </span>
            <span className="eyebrow text-[#9CA3AF]">Parcerias B2B</span>
          </div>
        </Link>

        {/* 3 Father sections · centro */}
        <nav className="flex items-center gap-1">
          {SECTIONS.map((s) => (
            <FatherLink
              key={s.key}
              href={s.defaultHref}
              active={s.key === activeSection.key}
            >
              {s.label}
            </FatherLink>
          ))}
        </nav>

        {/* Quick actions + user */}
        <div className="flex items-center gap-2">
          <SearchHint />

          <QuickAction href="/vouchers/novo" label="Voucher" />
          <QuickAction href="/estudio/cadastrar" label="Parceria" />

          <Link
            href={PAINEL_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden lg:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-white/10 text-[10px] uppercase tracking-[1px] text-[#9CA3AF] hover:text-[#C9A96E] hover:border-[#C9A96E]/40 transition-colors"
          >
            Painel CRM
            <ExternalLink className="w-3 h-3" />
          </Link>

          <div className="flex items-center gap-2 pl-3 border-l border-white/10">
            <div className="w-7 h-7 rounded-md bg-white/5 border border-white/10 text-[#F5F0E8] flex items-center justify-center text-[11px] font-semibold">
              {initials}
            </div>
            <div className="hidden sm:flex flex-col leading-tight">
              <span className="text-[12px] font-medium text-[#F5F0E8]">{displayName}</span>
              {role && <span className="eyebrow text-[#6B7280]">{role}</span>}
            </div>
            <form action={logoutAction}>
              <button
                type="submit"
                title="Sair"
                className="p-1.5 rounded text-[#9CA3AF] hover:text-[#FCA5A5] hover:bg-white/5 transition-colors cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* === Sub-tabs row · pertencem ao Father ativo === */}
      <div className="h-9 flex items-center px-5 overflow-x-auto custom-scrollbar">
        <span className="eyebrow mr-4 shrink-0">{activeSection.label}</span>
        <nav className="flex items-center gap-1">
          {activeSection.subtabs.map((t) => (
            <SubLink key={t.href} tab={t} active={activeSubtab?.href === t.href} />
          ))}
        </nav>
      </div>
    </header>
    </>
  )
}

function FatherLink({
  href,
  active,
  children,
}: {
  href: string
  active: boolean
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      className={`px-4 py-1.5 rounded-md text-[12px] font-semibold uppercase tracking-[1.5px] transition-colors ${
        active
          ? 'bg-[#C9A96E]/15 text-[#C9A96E] border border-[#C9A96E]/30'
          : 'text-[#9CA3AF] hover:text-[#F5F0E8] hover:bg-white/5 border border-transparent'
      }`}
    >
      {children}
    </Link>
  )
}

function SubLink({ tab, active }: { tab: SubTab; active: boolean }) {
  if (!tab.available) {
    return (
      <span
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] text-[#6B7280] cursor-not-allowed"
        title="Em breve"
      >
        {tab.label}
        <span className="text-[8px] uppercase tracking-[1px] px-1 py-px rounded bg-white/5 text-[#6B7280]">
          em breve
        </span>
      </span>
    )
  }
  return (
    <Link
      href={tab.href}
      className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
        active
          ? 'text-[#C9A96E] border-b-2 border-[#C9A96E] rounded-none'
          : 'text-[#9CA3AF] hover:text-[#F5F0E8] hover:bg-white/5'
      }`}
    >
      {tab.label}
    </Link>
  )
}

function QuickAction({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded text-[11px] font-semibold uppercase tracking-[1px] bg-[#C9A96E]/12 border border-[#C9A96E]/30 text-[#C9A96E] hover:bg-[#C9A96E]/20 transition-colors"
    >
      <Plus className="w-3 h-3" />
      {label}
    </Link>
  )
}
