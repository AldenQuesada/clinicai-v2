'use client'

/**
 * AppNav · Client Component que renderiza Father row (4 SECTIONS) + sub-tabs.
 *
 * Detecta seção/sub-tab ativa via `usePathname()` + `useSearchParams()` —
 * substitui a tentativa anterior de ler `headers().get('x-pathname')` no
 * Server Component (que caia em fallback /dashboard porque o middleware
 * nao injeta esses headers em Next.js 16, deixando "Geral" sempre marcado).
 */

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { LogOut, ExternalLink, Plus } from 'lucide-react'
import { logoutAction } from '@/app/login/actions'
import { SearchHint } from './SearchHint'

type SubTab = {
  href: string
  label: string
  available: boolean
}

type Section = {
  key: 'geral' | 'disparos' | 'analytics' | 'config'
  label: string
  defaultHref: string
  subtabs: SubTab[]
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
      '/b2b/saude',
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
    // Esq→dir: zoom-out (resumo) → zoom-in (deep operacional) → feedback
    subtabs: [
      { href: '/b2b/analytics', label: 'Visão geral', available: true },
      { href: '/b2b/analytics/crescimento', label: 'Crescimento', available: true },
      { href: '/b2b/analytics/parceiros', label: 'Parceiros', available: true },
      { href: '/b2b/analytics/retorno', label: 'Retorno', available: true },
      { href: '/b2b/analytics/imagem', label: 'Imagem', available: true },
      { href: '/b2b/nps', label: 'NPS', available: true },
    ],
  },
  {
    key: 'config',
    label: 'Configurações',
    defaultHref: '/configuracoes?tab=overview',
    match: ['/b2b/config', '/configuracoes', '/estudio'],
    // Ordem ESQ→DIR · uso diario → setup raro
    // (1) day-1 / operacional · (2) recorrente · (3) configura-uma-vez · (4) meta
    subtabs: [
      // (1) day-1 · entra todo dia
      { href: '/configuracoes?tab=overview', label: 'Visão geral', available: true },
      { href: '/b2b/config/saude', label: 'Saúde', available: true },
      { href: '/b2b/config/auditoria', label: 'Auditoria', available: true },
      { href: '/configuracoes?tab=logs', label: 'Logs', available: true },
      // (2) recorrente · vai usar de vez em quando
      // Cadastrar parceria (acao) vive no Quick Action "+ Parceria" no topo
      { href: '/b2b/config/padroes', label: 'Padrões', available: true },
      // (3) configura-uma-vez · setup inicial
      { href: '/b2b/config/admins', label: 'Admins', available: true },
      { href: '/configuracoes?tab=channels', label: 'Canais', available: true },
      { href: '/configuracoes?tab=professionals', label: 'Profissionais', available: true },
      { href: '/estudio/lgpd', label: 'LGPD', available: true },
      // (4) meta
      { href: '/b2b/config/sobre', label: 'Sobre', available: true },
    ],
  },
]

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
  // Match mais especifico primeiro (mais segmentos no path "matched")
  let best: { section: Section; len: number } | null = null
  for (const s of SECTIONS) {
    for (const m of s.match) {
      if (pathname === m || pathname.startsWith(m + '/')) {
        const len = m.split('/').length
        if (!best || len > best.len) best = { section: s, len }
      }
    }
  }
  if (best) return best.section
  if (LEGACY_PATHS.some((p) => pathname.startsWith(p))) return SECTIONS[0]
  return SECTIONS[0]
}

function detectActiveSubtab(
  pathname: string,
  searchParams: string,
  section: Section,
): SubTab | null {
  const fullPath = searchParams ? `${pathname}?${searchParams}` : pathname

  const exact = section.subtabs.find((t) => t.href === fullPath)
  if (exact) return exact

  const byPath = section.subtabs.find((t) => {
    const tabPath = t.href.split('?')[0]
    return pathname === tabPath || pathname.startsWith(tabPath + '/')
  })
  if (byPath) {
    if (byPath.href.includes('?') && !searchParams) return null
    return byPath
  }
  return null
}

export type AppNavUser = {
  displayName: string
  initials: string
  role: string
  panelUrl: string
}

export function AppNav({ user }: { user: AppNavUser }) {
  const pathname = usePathname() || '/dashboard'
  const searchParams = useSearchParams()
  const searchString = searchParams ? searchParams.toString() : ''

  const activeSection = detectActiveSection(pathname)
  const activeSubtab = detectActiveSubtab(pathname, searchString, activeSection)

  return (
    <header className="shrink-0 border-b border-[#C9A96E]/15 bg-[#0F0D0A] z-20 sticky top-0">
      {/* Father row · brand + 4 sections + quick actions + user */}
      <div className="h-13 flex items-center justify-between px-5 border-b border-white/5">
        <Link
          href={activeSection.defaultHref}
          className="flex items-center gap-3 group shrink-0"
        >
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

        <div className="flex items-center gap-2">
          <SearchHint />

          <QuickAction href="/vouchers/novo" label="Voucher" />
          <QuickAction href="/estudio/cadastrar" label="Parceria" />

          <Link
            href={user.panelUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden lg:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-white/10 text-[10px] uppercase tracking-[1px] text-[#9CA3AF] hover:text-[#C9A96E] hover:border-[#C9A96E]/40 transition-colors"
          >
            Painel CRM
            <ExternalLink className="w-3 h-3" />
          </Link>

          <div className="flex items-center gap-2 pl-3 border-l border-white/10">
            <div className="w-7 h-7 rounded-md bg-white/5 border border-white/10 text-[#F5F0E8] flex items-center justify-center text-[11px] font-semibold">
              {user.initials}
            </div>
            <div className="hidden sm:flex flex-col leading-tight">
              <span className="text-[12px] font-medium text-[#F5F0E8]">
                {user.displayName}
              </span>
              {user.role && (
                <span className="eyebrow text-[#6B7280]">{user.role}</span>
              )}
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

      {/* Sub-tabs row · pertencem ao Father ativo */}
      <div className="h-9 flex items-center px-5 overflow-x-auto custom-scrollbar">
        <span className="eyebrow mr-4 shrink-0">{activeSection.label}</span>
        <nav className="flex items-center gap-1">
          {activeSection.subtabs.map((t) => (
            <SubLink
              key={t.href}
              tab={t}
              active={activeSubtab?.href === t.href}
            />
          ))}
        </nav>
      </div>
    </header>
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
