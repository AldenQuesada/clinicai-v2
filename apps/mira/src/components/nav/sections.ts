/**
 * Mira · navegacao · contrato unico de SECTIONS + sub-tabs.
 *
 * Extraido do AppNav.tsx (que era 1 componente monolitico de ~330 linhas)
 * em 2026-04-26 quando os fathers (Geral/Disparos/Analytics/Configuracoes)
 * viraram SIDEBAR vertical (esquerda · 56px) e os sub-tabs ficaram numa
 * faixa horizontal independente. Sidebar e sub-tabs leem o MESMO catalogo
 * daqui · zero divergencia possivel.
 *
 * Decisoes 2026-04-26 (preservadas do AppNav original):
 *   - Geral · 3 grupos (Operar/Atrair/Encerrar) com eyebrow champagne
 *   - Disparos · flat (2 sub-tabs · sem grupos) pra evitar double-nav
 *     com CommClient interno
 *   - Analytics · 3 grupos (Visao/Funil/Imagem)
 *   - Config · 3 grupos (Dia-a-dia/Setup/Meta) com fusoes Tiers+Funnel
 *     e LGPD+Sobre
 *
 * Server-side: NotificationsBell e NewMenu sao montados pelo AppHeaderThin
 * (Quick Actions thin row). Sidebar so navega · nao executa acao.
 */

import type { LucideIcon } from 'lucide-react'
import { Home, MessageSquare, BarChart3, Settings } from 'lucide-react'

export type SubTab = {
  href: string
  label: string
  available: boolean
}

/**
 * Cluster de sub-tabs com label de grupo (eyebrow champagne).
 * Ex: section "Geral" tem 3 grupos · OPERAR / ATRAIR / ENCERRAR.
 */
export type SubTabGroup = {
  groupLabel: string
  subtabs: SubTab[]
}

export type SectionKey = 'geral' | 'disparos' | 'analytics' | 'config'

export type Section = {
  key: SectionKey
  label: string
  /** Lucide icon usado na sidebar vertical (56px). */
  icon: LucideIcon
  defaultHref: string
  /** Path prefixes que ativam essa section (mais especifico ganha). */
  match: string[]
  /** Sub-tabs flat · usado por sections que NAO tem grupos. */
  subtabs?: SubTab[]
  /** Sub-tabs agrupados por estrategia · render com eyebrow + separator. */
  subtabGroups?: SubTabGroup[]
}

/** Helper · achata todos os sub-tabs de uma section em uma lista. */
export function flattenSubtabs(section: Section): SubTab[] {
  if (section.subtabGroups) {
    return section.subtabGroups.flatMap((g) => g.subtabs)
  }
  return section.subtabs ?? []
}

export const SECTIONS: Section[] = [
  {
    key: 'geral',
    label: 'Geral',
    icon: Home,
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
    icon: MessageSquare,
    defaultHref: '/b2b/disparos',
    match: ['/b2b/disparos', '/templates', '/b2b/segmento'],
    // Decisao 2026-04-26 · manter FLAT (2 sub-tabs · sem grupos):
    //   - "Sequencias" ja existe como tab INTERNA dentro de /b2b/disparos
    //     (CommClient · Eventos/Templates/Sequencias/Historico/Config), logo
    //     adicionar "Sequencias" no AppNav-level criaria double-nav e
    //     conflito de URL (CommClient nao deep-linka pra tab interna).
    //   - 2 itens nao precisam de grupo — sub-tabs flat ficam visualmente
    //     limpos (mirror /b2b/saude e /b2b/mapa em Geral · operar/atrair).
    subtabs: [
      { href: '/b2b/disparos', label: 'Templates', available: true },
      { href: '/b2b/segmento', label: 'Segmento', available: true },
    ],
  },
  {
    key: 'analytics',
    label: 'Analytics',
    icon: BarChart3,
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
    icon: Settings,
    defaultHref: '/configuracoes?tab=overview',
    match: ['/b2b/config', '/configuracoes', '/estudio'],
    // Sub-tabs agrupados por frequencia de uso (decidido com Alden 2026-04-26):
    //   DIA-A-DIA · uso diario (overview, regras, playbooks, automacao, logs)
    //   SETUP     · configurado uma vez (canais, pessoas)
    //   META      · governanca + about (fundidos em /b2b/config/meta)
    subtabGroups: [
      {
        groupLabel: 'Dia-a-dia',
        subtabs: [
          { href: '/configuracoes?tab=overview', label: 'Visão geral', available: true },
          { href: '/b2b/config/regras', label: 'Regras', available: true },
          { href: '/b2b/config/playbooks', label: 'Playbooks', available: true },
          { href: '/configuracoes?tab=automacao', label: 'Automação', available: true },
          { href: '/configuracoes?tab=logs', label: 'Logs', available: true },
        ],
      },
      {
        groupLabel: 'Setup',
        subtabs: [
          { href: '/configuracoes?tab=channels', label: 'Canais', available: true },
          { href: '/configuracoes?tab=pessoas', label: 'Pessoas', available: true },
          { href: '/configuracoes?tab=docs-legais', label: 'Documentos legais', available: true },
        ],
      },
      {
        groupLabel: 'Meta',
        subtabs: [
          { href: '/b2b/config/meta', label: 'Meta', available: true },
        ],
      },
    ],
  },
]

export const LEGACY_PATHS = [
  '/hoje',
  '/semana/comentarios',
  '/semana/renovacoes',
  '/estudio/cadastrar',
  '/estudio/combos',
  '/estudio/lgpd',
  '/vouchers/novo',
  '/vouchers/bulk',
]

export function detectActiveSection(pathname: string): Section {
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

export function detectActiveSubtab(
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
export function countForHref(
  href: string,
  counts: SubtabCounts,
): number | undefined {
  if (href === '/insights') return counts.insights
  if (href === '/partnerships?filter=active') return counts.active
  if (href === '/partnerships?filter=prospects') return counts.prospects
  if (href === '/partnerships?filter=inactive') return counts.inactive
  if (href === '/b2b/candidatos') return counts.candidatos
  if (href === '/b2b/candidaturas') return counts.candidaturas
  return undefined
}

/**
 * Score de urgencia da section · usado pra mostrar badge vermelho no icone
 * da sidebar. Conta apenas insights criticos relevantes pra section.
 *
 * Regra simples (2026-04-26):
 *   - Geral · soma critical+warning insights + candidaturas pendentes
 *   - Disparos · 0 (sem alerta direto)
 *   - Analytics · 0 (NPS/saude vai pelo sino global)
 *   - Config · 0
 *
 * Se Alden quiser refinar (ex: marcar Config quando ha admin novo p/ aprovar),
 * adicionar caso aqui · facil de evoluir.
 */
export function urgencyForSection(
  key: SectionKey,
  counts: SubtabCounts,
  urgentInsights: number,
): number {
  if (key === 'geral') return urgentInsights + (counts.candidaturas ?? 0)
  return 0
}
