/**
 * /partnerships · REPLICA 1:1 do `js/b2b/ui/b2b-list.ui.js`.
 *
 * Strings, classes CSS, agrupamento e behavior identicos ao original.
 * Filtro via URL: ?filter=active|inactive|prospects (mapeado pra
 * status[] como o _state.filter do antigo).
 *
 * Eventos do original mapeados pra navegacao Next (provisorio · serao
 * substituidos por overlay quando b2b-detail.ui.js + b2b-form.ui.js
 * forem migrados):
 *   b2b:open-detail {id}        → /partnerships/[id]
 *   b2b:open-form {mode:'new'}  → /estudio/cadastrar
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

export const dynamic = 'force-dynamic'

type FilterKind = 'active' | 'inactive' | 'prospects'

interface PageProps {
  searchParams: Promise<{ filter?: string; status?: string }>
}

function resolveFilter(raw: string | undefined): FilterKind {
  if (raw === 'inactive') return 'inactive'
  if (raw === 'prospects' || raw === 'prospect') return 'prospects'
  return 'active'
}

function applyFilter(items: B2BPartnershipDTO[], filter: FilterKind): B2BPartnershipDTO[] {
  if (filter === 'active') {
    return items.filter((p) => ['contract', 'active', 'review'].includes(p.status))
  }
  if (filter === 'inactive') {
    return items.filter((p) => ['paused', 'closed'].includes(p.status))
  }
  return items.filter((p) => ['prospect', 'dna_check'].includes(p.status))
}

export default async function PartnershipsPage({ searchParams }: PageProps) {
  const params = await searchParams
  // Compat backward · ?status=active vira ?filter=active
  const rawFilter = params.filter || params.status
  const filter = resolveFilter(rawFilter)

  const { ctx, repos } = await loadMiraServerContext()
  const all = await repos.b2bPartnerships.list(ctx.clinic_id, {})
  const items = applyFilter(all, filter)

  return (
    <main className="flex-1 overflow-y-auto custom-scrollbar bg-[var(--b2b-bg-0)]">
      <div className="b2b-page-container">
        {/* === Head: count + actions === */}
        <div className="b2b-list-head">
          <div className="b2b-list-count">
            {items.length} {countNoun(items.length, filter)}
          </div>
          <div className="b2b-list-head-acts">
            {filter === 'active' && (
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
          <div className="b2b-empty">{emptyMessage(filter)}</div>
        ) : (
          <ListBody items={items} filter={filter} />
        )}
      </div>
    </main>
  )
}

function countNoun(n: number, filter: FilterKind): string {
  if (filter === 'active') return n === 1 ? 'parceria ativa' : 'parcerias ativas'
  if (filter === 'inactive')
    return n === 1 ? 'parceria pausada ou encerrada' : 'parcerias pausadas ou encerradas'
  return n === 1 ? 'prospect' : 'prospects'
}

function emptyMessage(filter: FilterKind): string {
  if (filter === 'active') return 'Nenhuma parceria ativa ainda. Clique em "Nova parceria" pra começar.'
  if (filter === 'inactive') return 'Nenhuma parceria pausada ou encerrada.'
  return 'Sem prospects na fila.'
}

function ListBody({ items, filter }: { items: B2BPartnershipDTO[]; filter: FilterKind }) {
  let groups: Record<string, B2BPartnershipDTO[]>
  let getHeader: (k: string) => string

  if (filter === 'active') {
    groups = groupByTier(items)
    getHeader = (k) => (k === 'untiered' ? 'Sem tier' : `Tier ${k}`)
  } else if (filter === 'inactive') {
    groups = groupByStatus(items)
    getHeader = (k) => statusLabel(k)
  } else {
    groups = groupByPillar(items)
    getHeader = (k) => k.charAt(0).toUpperCase() + k.slice(1)
  }

  const keys = Object.keys(groups).filter((k) => groups[k].length > 0)

  return (
    <>
      {keys.map((k) => (
        <div key={k} className="b2b-group">
          <div className="b2b-group-hdr">
            {getHeader(k)} · {groups[k].length}
          </div>
          {groups[k].map((p) => (
            <Row key={p.id} p={p} />
          ))}
        </div>
      ))}
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
          {p.tier != null && <span className="b2b-pill b2b-pill-tier">T{p.tier}</span>}
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
