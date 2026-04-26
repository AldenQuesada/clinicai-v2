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
import { LogOut } from 'lucide-react'
import { logoutAction } from '@/app/login/actions'
import { SearchHint } from './SearchHint'
import { NotificationsBell } from './NotificationsBell'
import { NewMenu } from './NewMenu'
import type { Insight } from '@clinicai/repositories'

type SubTab = {
  href: string
  label: string
  available: boolean
}

/**
 * Cluster de sub-tabs com label de grupo (eyebrow champagne).
 * Ex: section "Geral" tem 3 grupos · OPERAR / ATRAIR / ENCERRAR.
 */
type SubTabGroup = {
  groupLabel: string
  subtabs: SubTab[]
}

type Section = {
  key: 'geral' | 'disparos' | 'analytics' | 'config'
  label: string
  defaultHref: string
  match: string[]
  /** Sub-tabs flat · usado por sections que NAO tem grupos. */
  subtabs?: SubTab[]
  /** Sub-tabs agrupados por estrategia · render com eyebrow + separator. */
  subtabGroups?: SubTabGroup[]
}

/** Helper · achata todos os sub-tabs de uma section em uma lista. */
function flattenSubtabs(section: Section): SubTab[] {
  if (section.subtabGroups) {
    return section.subtabGroups.flatMap((g) => g.subtabs)
  }
  return section.subtabs ?? []
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
      '/insights',
      '/b2b/candidatos',
      '/b2b/candidaturas',
      '/b2b/mapa',
      '/b2b/saude',
    ],
    // Sub-tabs agrupados por estrategia (decidido com Alden 2026-04-26):
    //   OPERAR · carteira viva (uso diario)
    //   ATRAIR · pipeline de entrada (semanal)
    //   ENCERRAR · saida e historico (mensal)
    subtabGroups: [
      {
        groupLabel: 'Operar',
        subtabs: [
          { href: '/insights', label: 'Insights', available: true },
          { href: '/partnerships?filter=active', label: 'Ativas', available: true },
          { href: '/b2b/saude', label: 'Saúde', available: true },
          { href: '/b2b/mapa', label: 'Mapa', available: true },
          { href: '/semana/gaps', label: 'Gaps do plano', available: true },
        ],
      },
      {
        groupLabel: 'Atrair',
        subtabs: [
          { href: '/b2b/candidatos', label: 'Candidatos', available: true },
          { href: '/b2b/candidaturas', label: 'Candidaturas', available: true },
          { href: '/partnerships?filter=prospects', label: 'Prospects', available: true },
        ],
      },
      {
        groupLabel: 'Encerrar',
        subtabs: [
          { href: '/semana/encerramentos', label: 'Encerramentos', available: true },
          { href: '/partnerships?filter=inactive', label: 'Inativas', available: true },
        ],
      },
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
    // Sub-tabs agrupados por estrategia (decidido com Alden 2026-04-26):
    //   VISÃO  · zoom-out (resumo executivo)
    //   FUNIL  · pipeline operacional (crescimento → retorno)
    //   IMAGEM · feedback qualitativo (percepção da marca + NPS)
    subtabGroups: [
      {
        groupLabel: 'Visão',
        subtabs: [
          { href: '/b2b/analytics', label: 'Visão geral', available: true },
        ],
      },
      {
        groupLabel: 'Funil',
        subtabs: [
          { href: '/b2b/analytics/crescimento', label: 'Crescimento', available: true },
          { href: '/b2b/analytics/parceiros', label: 'Parceiros', available: true },
          { href: '/b2b/analytics/conversao', label: 'Conversão', available: true },
          { href: '/b2b/analytics/retorno', label: 'Retorno', available: true },
        ],
      },
      {
        groupLabel: 'Imagem',
        subtabs: [
          { href: '/b2b/analytics/imagem', label: 'Imagem', available: true },
          { href: '/b2b/nps', label: 'NPS', available: true },
        ],
      },
    ],
  },
  {
    key: 'config',
    label: 'Configurações',
    defaultHref: '/configuracoes?tab=overview',
    match: ['/b2b/config', '/configuracoes', '/estudio'],
    // Sub-tabs agrupados por frequencia de uso (decidido com Alden 2026-04-26):
    //   DIA-A-DIA · uso diario (overview, saude, auditoria, logs)
    //   OPERAR    · ajustes recorrentes (padroes, rotinas, admins)
    //   SETUP     · configurado uma vez (canais, profissionais)
    //   META      · governanca + about (LGPD, sobre)
    // Cadastrar parceria (acao) vive no Quick Action "+ Parceria" no topo
    subtabGroups: [
      {
        groupLabel: 'Dia-a-dia',
        subtabs: [
          { href: '/configuracoes?tab=overview', label: 'Visão geral', available: true },
          { href: '/b2b/config/saude', label: 'Saúde', available: true },
          { href: '/b2b/config/auditoria', label: 'Auditoria', available: true },
          { href: '/b2b/config/tiers', label: 'Tiers', available: true },
          { href: '/b2b/config/funnel', label: 'Funnel', available: true },
          { href: '/configuracoes?tab=logs', label: 'Logs', available: true },
        ],
      },
      {
        groupLabel: 'Operar',
        subtabs: [
          { href: '/b2b/config/padroes', label: 'Padrões', available: true },
          { href: '/b2b/config/rotinas', label: 'Rotinas', available: true },
          { href: '/b2b/config/admins', label: 'Admins', available: true },
        ],
      },
      {
        groupLabel: 'Setup',
        subtabs: [
          { href: '/configuracoes?tab=channels', label: 'Canais', available: true },
          { href: '/configuracoes?tab=professionals', label: 'Profissionais', available: true },
        ],
      },
      {
        groupLabel: 'Meta',
        subtabs: [
          { href: '/estudio/lgpd', label: 'LGPD', available: true },
          { href: '/b2b/config/sobre', label: 'Sobre', available: true },
        ],
      },
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
  const all = flattenSubtabs(section)

  const exact = all.find((t) => t.href === fullPath)
  if (exact) return exact

  const byPath = all.find((t) => {
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

/**
 * Counts injetados nos sub-tabs · "Ativas · 10". Mapeia chave logica pra
 * count. AppHeader (server) calcula in-memory das parcerias ja fetched.
 */
export type SubtabCounts = {
  insights?: number
  active?: number
  prospects?: number
  inactive?: number
  candidatos?: number
  candidaturas?: number
}

/**
 * Resolve count pra um sub-tab pelo seu href. Match defensivo · undefined
 * se nao tem count pra esse href.
 */
function countForHref(href: string, counts: SubtabCounts): number | undefined {
  if (href === '/insights') return counts.insights
  if (href === '/partnerships?filter=active') return counts.active
  if (href === '/partnerships?filter=prospects') return counts.prospects
  if (href === '/partnerships?filter=inactive') return counts.inactive
  if (href === '/b2b/candidatos') return counts.candidatos
  if (href === '/b2b/candidaturas') return counts.candidaturas
  return undefined
}

export function AppNav({
  user,
  insights = [],
  counts = {},
}: {
  user: AppNavUser
  insights?: Insight[]
  counts?: SubtabCounts
}) {
  const pathname = usePathname() || '/dashboard'
  const searchParams = useSearchParams()
  const searchString = searchParams ? searchParams.toString() : ''

  const activeSection = detectActiveSection(pathname)
  const activeSubtab = detectActiveSubtab(pathname, searchString, activeSection)

  return (
    <header className="shrink-0 border-b border-[#C9A96E]/15 bg-[#0F0D0A] z-20 sticky top-0">
      {/* ──────────────────────────────────────────────────────────────
         ROW 1 · APP CHROME · brand legacy (eyebrow + title Cormorant)
         + search + sino + Novo + user. Mirror legacy b2b-shell.ui.js
         _renderHeader · texto 1:1.
         ────────────────────────────────────────────────────────────── */}
      <div
        className="flex items-center gap-5 px-5 py-3 border-b border-white/5"
        style={{ minHeight: 76 }}
      >
        {/* Brand · 2 linhas (eyebrow + Cormorant title) */}
        <Link
          href="/dashboard"
          className="flex flex-col leading-tight shrink-0 group"
          title="Mira · Programa de parcerias B2B"
        >
          <span
            style={{
              fontSize: 9,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '3px',
              color: '#C9A96E',
              fontFamily: 'Inter, system-ui, sans-serif',
            }}
          >
            Círculo Mirian de Paula
          </span>
          <span
            style={{
              fontFamily: '"Cormorant Garamond", Georgia, serif',
              fontWeight: 300,
              fontSize: 22,
              lineHeight: 1.05,
              color: '#F5F0E8',
              marginTop: 2,
            }}
            className="group-hover:text-[#DFC5A0] transition-colors"
          >
            Programa de{' '}
            <em style={{ fontStyle: 'italic', color: '#C9A96E' }}>parcerias B2B</em>
          </span>
        </Link>

        {/* Busca · centro */}
        <div className="flex-1 flex justify-center">
          <SearchHint />
        </div>

        {/* Direita · sino + Novo + user */}
        <div className="flex items-center gap-2 shrink-0">
          <NotificationsBell insights={insights} />
          <NewMenu />

          <div className="flex items-center gap-2 pl-3 border-l border-white/10">
            <div className="w-7 h-7 rounded-md bg-white/5 border border-white/10 text-[#F5F0E8] flex items-center justify-center text-[11px] font-semibold">
              {user.initials}
            </div>
            <div className="hidden sm:flex flex-col leading-tight">
              <span className="text-[12px] font-medium text-[#F5F0E8]">
                {user.displayName}
              </span>
              {user.role && (
                <span
                  className="text-[9px] uppercase text-[#6B7280]"
                  style={{ letterSpacing: '1.5px' }}
                >
                  {user.role}
                </span>
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

      {/* ──────────────────────────────────────────────────────────────
         ROW 2 · SECTIONS · 4 tags principais (Geral/Disparos/Analytics/Config)
         Mirror legacy: proper case, sem box, gold underline ativo, sem CTA
         externo na direita.
         ────────────────────────────────────────────────────────────── */}
      <div className="h-11 flex items-center px-5 border-b border-white/5">
        <nav className="flex items-center gap-2">
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
      </div>

      {/* ──────────────────────────────────────────────────────────────
         ROW 3 · SUB-TABS · contextual da section ativa
         Sections com subtabGroups renderizam com eyebrow champagne por
         grupo + separador vertical. Sections com subtabs flat caem no
         mesmo render anterior (compat com Disparos/Analytics/Config).
         ────────────────────────────────────────────────────────────── */}
      <div className="h-9 flex items-center px-5 overflow-x-auto custom-scrollbar">
        {activeSection.subtabGroups ? (
          <nav className="flex items-center gap-3">
            {activeSection.subtabGroups.map((group, gi) => (
              <span key={group.groupLabel} className="flex items-center gap-1">
                {gi > 0 && (
                  <span
                    className="mx-2 h-4 w-px bg-[#C9A96E]/20 shrink-0"
                    aria-hidden="true"
                  />
                )}
                <span
                  className="text-[9px] uppercase font-semibold text-[#C9A96E]/70 mr-2 shrink-0"
                  style={{ letterSpacing: '2px' }}
                >
                  {group.groupLabel}
                </span>
                {group.subtabs.map((t) => (
                  <SubLink
                    key={t.href}
                    tab={t}
                    active={activeSubtab?.href === t.href}
                    count={countForHref(t.href, counts)}
                  />
                ))}
              </span>
            ))}
          </nav>
        ) : (
          <nav className="flex items-center gap-1">
            {(activeSection.subtabs ?? []).map((t) => (
              <SubLink
                key={t.href}
                tab={t}
                active={activeSubtab?.href === t.href}
                count={countForHref(t.href, counts)}
              />
            ))}
          </nav>
        )}
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
  // Mirror legacy 1:1 · proper case, sem box, sem uppercase, gold underline ativo
  return (
    <Link
      href={href}
      className={`px-3 py-2 text-[14px] font-medium transition-colors border-b-2 ${
        active
          ? 'text-[#C9A96E] border-[#C9A96E]'
          : 'text-[#9CA3AF] hover:text-[#F5F0E8] border-transparent'
      }`}
      style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
    >
      {children}
    </Link>
  )
}

function SubLink({
  tab,
  active,
  count,
}: {
  tab: SubTab
  active: boolean
  count?: number
}) {
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
      {typeof count === 'number' && count > 0 ? (
        <span className="ml-1 text-[#C9A96E] opacity-80">· {count}</span>
      ) : null}
    </Link>
  )
}

