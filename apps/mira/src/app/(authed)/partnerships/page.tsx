/**
 * /partnerships · REPLICA visual do `js/b2b/ui/b2b-list.ui.js` legado
 * (https://painel.miriandpaula.com.br/b2b-partners.html?tab=active).
 *
 * Estrutura espelha 1:1 o `_renderShell()` + `_renderBody()` do legado:
 *   - Tabs (Ativas / Prospects / Inativas) — reflete ?tab=
 *   - Filtros bar (search + pillar) — ?q=, ?pillar=
 *   - Head: count + acoes (Exportar CSV · placeholder, + Nova parceria)
 *   - Body: grouped rows (por tier/status/pillar conforme tab)
 *
 * Strings PT-BR identicas ao b2b-list.ui.js:
 *   - "X parcerias ativas" / "X parcerias pausadas ou encerradas" / "X prospects"
 *   - 'Nenhuma parceria ativa ainda. Clique em "Nova parceria" pra começar.'
 *   - 'Nenhuma parceria pausada ou encerrada.'
 *   - 'Sem prospects na fila.'
 *
 * Compat backward de URL:
 *   ?tab=active           (preferido · espelha legado)
 *   ?filter=active        (compat · AppNav usa esse)
 *   ?status=active        (compat antigo)
 *
 * ADR-028 · clinic_id explicito via loadMiraServerContext().
 * ADR-012 · UI nunca toca supabase.from direto · usa repos.b2bPartnerships.list.
 */

import Link from 'next/link'
import { loadMiraServerContext } from '@/lib/server-context'
import {
  statusLabel,
  typeLabel,
  groupByTier,
  groupByPillar,
  groupByStatus,
} from '@/lib/b2b-ui-helpers'
import type { B2BPartnershipDTO } from '@clinicai/repositories'
import { EmptyState } from '@clinicai/ui'
import { PartnershipsTabsBar, type TabId } from './PartnershipsTabsBar'
import { PartnershipsFiltersBar } from './PartnershipsFiltersBar'
import { PartnershipsScoutBudget } from './PartnershipsScoutBudget'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{
    tab?: string
    filter?: string
    status?: string
    pillar?: string
    q?: string
  }>
}

function resolveTab(raw: string | undefined): TabId {
  if (raw === 'inactive') return 'inactive'
  if (raw === 'prospects' || raw === 'prospect') return 'prospects'
  return 'active'
}

/**
 * Smart filters do QuickSearch. Retorna o slug se for um smart filter
 * conhecido · null caso contrario (ai vira tab). Ver components/QuickSearch.
 */
type SmartFilterSlug =
  | 'risk'
  | 'vouchers-expiring'
  | 'no-voucher-60d'
  | 'nps-pending'

function resolveSmartFilter(raw: string | undefined): SmartFilterSlug | null {
  if (
    raw === 'risk' ||
    raw === 'vouchers-expiring' ||
    raw === 'no-voucher-60d' ||
    raw === 'nps-pending'
  ) {
    return raw
  }
  return null
}

const SMART_FILTER_LABELS: Record<SmartFilterSlug, string> = {
  risk: 'Parcerias em risco',
  'vouchers-expiring': 'Vouchers expirando 7d',
  'no-voucher-60d': 'Sem voucher 60d',
  'nps-pending': 'NPS pendente',
}

function applyTabFilter(items: B2BPartnershipDTO[], tab: TabId): B2BPartnershipDTO[] {
  if (tab === 'active') {
    return items.filter((p) => ['contract', 'active', 'review'].includes(p.status))
  }
  if (tab === 'inactive') {
    return items.filter((p) => ['paused', 'closed'].includes(p.status))
  }
  return items.filter((p) => ['prospect', 'dna_check'].includes(p.status))
}

function applyPillar(items: B2BPartnershipDTO[], pillar: string): B2BPartnershipDTO[] {
  if (!pillar) return items
  return items.filter((p) => (p.pillar || 'outros') === pillar)
}

function applyQuery(items: B2BPartnershipDTO[], q: string): B2BPartnershipDTO[] {
  if (!q) return items
  const needle = q.trim().toLowerCase()
  if (!needle) return items
  return items.filter((p) => {
    const name = (p.name || '').toLowerCase()
    const contact = (p.contactName || '').toLowerCase()
    return name.includes(needle) || contact.includes(needle)
  })
}

function countNoun(n: number, tab: TabId): string {
  if (tab === 'active') return n === 1 ? 'parceria ativa' : 'parcerias ativas'
  if (tab === 'inactive')
    return n === 1 ? 'parceria pausada ou encerrada' : 'parcerias pausadas ou encerradas'
  return n === 1 ? 'prospect' : 'prospects'
}

function emptyMessage(tab: TabId, hasFilters: boolean): string {
  if (hasFilters) return 'Nenhuma parceria bate com os filtros aplicados.'
  if (tab === 'active') return 'Nenhuma parceria ativa ainda. Clique em "Nova parceria" pra começar.'
  if (tab === 'inactive') return 'Nenhuma parceria pausada ou encerrada.'
  return 'Sem prospects na fila.'
}

function emptyTitle(tab: TabId, hasFilters: boolean): string {
  if (hasFilters) return 'Nada por aqui'
  if (tab === 'active') return 'Sem parcerias ativas'
  if (tab === 'inactive') return 'Sem parcerias pausadas'
  return 'Sem prospects na fila'
}

export default async function PartnershipsPage({ searchParams }: PageProps) {
  const params = await searchParams
  // Smart filter (QuickSearch) tem prioridade sobre tab quando bate · resto
  // mantem precedence antiga · tab > filter > status.
  const smartFilter = resolveSmartFilter(params.filter)
  const rawTab = params.tab || (smartFilter ? undefined : params.filter) || params.status
  const tab = resolveTab(rawTab)
  const pillar = (params.pillar || '').trim()
  const q = (params.q || '').trim()
  const hasFilters = pillar.length > 0 || q.length > 0 || smartFilter != null

  const { ctx, repos } = await loadMiraServerContext()
  const all = await repos.b2bPartnerships.list(ctx.clinic_id, {})

  // Smart filter primeiro · pode forcar conjunto de IDs OU filtrar in-memory.
  // Cada query helper e defensiva (catch · fallback all-allowed).
  let allowedIds: Set<string> | null = null
  if (smartFilter === 'risk') {
    // health_color in (red, yellow) · ja temos no DTO, filtra in-memory.
    allowedIds = new Set(
      all
        .filter((p) => p.healthColor === 'red' || p.healthColor === 'yellow')
        .map((p) => p.id),
    )
  } else if (smartFilter === 'vouchers-expiring') {
    const ids = await repos.b2bVouchers
      .listPartnershipsWithExpiringVouchers(ctx.clinic_id, 7)
      .catch(() => [] as string[])
    allowedIds = new Set(ids)
  } else if (smartFilter === 'no-voucher-60d') {
    const lastIssuedMap = await repos.b2bVouchers
      .lastIssuedAtByPartnership(ctx.clinic_id)
      .catch(() => new Map<string, string>())
    const cutoffMs = Date.now() - 60 * 24 * 60 * 60 * 1000
    allowedIds = new Set(
      all
        .filter((p) => {
          // So parcerias ativas/contract/review · prospects nao deveriam
          // emitir voucher ainda
          if (!['active', 'contract', 'review'].includes(p.status)) return false
          const last = lastIssuedMap.get(p.id)
          if (!last) return true // nunca emitiu = parado
          return new Date(last).getTime() < cutoffMs
        })
        .map((p) => p.id),
    )
  } else if (smartFilter === 'nps-pending') {
    const sinceIso = new Date(
      Date.now() - 90 * 24 * 60 * 60 * 1000,
    ).toISOString()
    const responded = await repos.b2bNps
      .respondedPartnershipIdsSince(sinceIso)
      .catch(() => new Set<string>())
    allowedIds = new Set(
      all
        .filter((p) => p.status === 'active' && !responded.has(p.id))
        .map((p) => p.id),
    )
  }

  const afterSmart =
    allowedIds == null ? all : all.filter((p) => allowedIds!.has(p.id))
  const afterTab = applyTabFilter(afterSmart, tab)
  const afterPillar = applyPillar(afterTab, pillar)
  const items = applyQuery(afterPillar, q)

  return (
    <main className="flex-1 overflow-y-auto custom-scrollbar bg-[var(--b2b-bg-0)]">
      <div className="b2b-page-container">
        <PartnershipsScoutBudget />

        <PartnershipsTabsBar active={tab} />

        <PartnershipsFiltersBar initialQuery={q} initialPillar={pillar} />

        {/* Smart filter banner · ativo quando ?filter=<slug> bate */}
        {smartFilter ? (
          <div className="flex items-center gap-3 rounded-md border border-[#C9A96E]/30 bg-[#C9A96E]/8 px-3 py-2 text-xs text-[#F5F0E8]">
            <span className="font-mono uppercase tracking-[2px] text-[10px] text-[#C9A96E]">
              filtro
            </span>
            <span className="font-medium">{SMART_FILTER_LABELS[smartFilter]}</span>
            <Link
              href="/partnerships"
              className="ml-auto text-[10px] uppercase tracking-[1.5px] text-[#9CA3AF] hover:text-[#C9A96E]"
            >
              Limpar
            </Link>
          </div>
        ) : null}

        {/* === Head: count + actions (espelha b2b-list.ui.js _renderShell) === */}
        <div className="b2b-list-head">
          <div className="b2b-list-count">
            {items.length} {countNoun(items.length, tab)}
          </div>
          <div className="b2b-list-head-acts">
            {tab === 'active' && (
              <button
                type="button"
                className="b2b-btn"
                title="Baixar planilha CSV com todas as parcerias"
                disabled
              >
                Exportar CSV
              </button>
            )}
            <Link href="/estudio/cadastrar" className="b2b-btn b2b-btn-primary">
              + Nova parceria
            </Link>
          </div>
        </div>

        {/* === Body: empty state OR grouped rows === */}
        {items.length === 0 ? (
          <EmptyState
            variant="partnerships"
            title={emptyTitle(tab, hasFilters)}
            message={emptyMessage(tab, hasFilters)}
            action={
              !hasFilters && tab === 'active'
                ? { label: 'Nova parceria', href: '/estudio/cadastrar' }
                : undefined
            }
          />
        ) : (
          <ListBody items={items} tab={tab} />
        )}
      </div>
    </main>
  )
}

/**
 * Labels ricos por tier · so usado quando tab='active' (groupByTier).
 * Inline aqui pra evitar poluir b2b-ui-helpers com strings exclusivas
 * desta page.
 */
const TIER_META: Record<string, { title: string; subtitle: string; desc: string; cls: string }> = {
  '1': {
    title: 'Tier 1',
    subtitle: 'Premium',
    desc: 'Parcerias estratégicas, mais investimento.',
    cls: 'b2b-group-tier-1',
  },
  '2': {
    title: 'Tier 2',
    subtitle: 'Padrão',
    desc: 'Operação recorrente, equilíbrio.',
    cls: 'b2b-group-tier-2',
  },
  '3': {
    title: 'Tier 3',
    subtitle: 'Apoio',
    desc: 'Boca-a-boca, baixo custo.',
    cls: 'b2b-group-tier-3',
  },
  untiered: {
    title: 'Sem tier',
    subtitle: '',
    desc: 'Ainda não classificadas.',
    cls: 'b2b-group-untiered',
  },
}

interface GroupMeta {
  title: string
  subtitle?: string
  desc?: string
  cls?: string
}

function ListBody({ items, tab }: { items: B2BPartnershipDTO[]; tab: TabId }) {
  let groups: Record<string, B2BPartnershipDTO[]>
  let getMeta: (k: string) => GroupMeta

  if (tab === 'active') {
    groups = groupByTier(items)
    getMeta = (k) => {
      const m = TIER_META[k]
      return m
        ? { title: m.title, subtitle: m.subtitle, desc: m.desc, cls: m.cls }
        : { title: k }
    }
  } else if (tab === 'inactive') {
    groups = groupByStatus(items)
    getMeta = (k) => ({ title: statusLabel(k) })
  } else {
    groups = groupByPillar(items)
    getMeta = (k) => ({ title: k.charAt(0).toUpperCase() + k.slice(1) })
  }

  const keys = Object.keys(groups).filter((k) => groups[k].length > 0)

  return (
    <>
      {keys.map((k) => {
        const meta = getMeta(k)
        const groupCls = meta.cls ? `b2b-group ${meta.cls}` : 'b2b-group'
        const titleText = meta.subtitle ? `${meta.title} · ${meta.subtitle}` : meta.title
        return (
          <div key={k} className={groupCls}>
            <div className="b2b-group-hdr">
              <span className="b2b-group-hdr-title">{titleText}</span>
              <span className="b2b-group-hdr-count">
                {groups[k].length}{' '}
                {groups[k].length === 1 ? 'parceria' : 'parcerias'}
              </span>
              {meta.desc && <span className="b2b-group-hdr-desc">{meta.desc}</span>}
            </div>
            {groups[k].map((p) => (
              <Row key={p.id} p={p} />
            ))}
          </div>
        )
      })}
    </>
  )
}

function Row({ p }: { p: B2BPartnershipDTO }) {
  const dnaScore = p.dnaScore != null ? p.dnaScore.toFixed(1) : '—'
  const health = p.healthColor || 'unknown'

  return (
    <Link href={`/partnerships/${p.id}`} className="b2b-row">
      <span
        className="b2b-health"
        data-health={health}
        title={`Saúde: ${health}`}
      />
      <div className="b2b-row-body">
        <div className="b2b-row-top">
          <span className="b2b-row-name">{p.name}</span>
          {!!p.tier && <span className="b2b-pill b2b-pill-tier">T{p.tier}</span>}
          <span className={`b2b-pill b2b-pill-${p.pillar || 'outros'}`}>
            {p.pillar || 'outros'}
          </span>
          <span className="b2b-pill b2b-pill-type">{typeLabel(p.type)}</span>
        </div>
        <div className="b2b-row-meta">
          <span>{statusLabel(p.status)}</span>
          <span>DNA {dnaScore}/10</span>
          {p.contactName && <span>{p.contactName}</span>}
        </div>
      </div>
    </Link>
  )
}
