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

export default async function PartnershipsPage({ searchParams }: PageProps) {
  const params = await searchParams
  // tab > filter > status (precedence ordering)
  const rawTab = params.tab || params.filter || params.status
  const tab = resolveTab(rawTab)
  const pillar = (params.pillar || '').trim()
  const q = (params.q || '').trim()
  const hasFilters = pillar.length > 0 || q.length > 0

  const { ctx, repos } = await loadMiraServerContext()
  const all = await repos.b2bPartnerships.list(ctx.clinic_id, {})
  const afterTab = applyTabFilter(all, tab)
  const afterPillar = applyPillar(afterTab, pillar)
  const items = applyQuery(afterPillar, q)

  return (
    <main className="flex-1 overflow-y-auto custom-scrollbar bg-[var(--b2b-bg-0)]">
      <div className="b2b-page-container">
        <PartnershipsScoutBudget />

        <PartnershipsTabsBar active={tab} />

        <PartnershipsFiltersBar initialQuery={q} initialPillar={pillar} />

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
          <div className="b2b-empty">{emptyMessage(tab, hasFilters)}</div>
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
