'use client'

/**
 * LeadsClient · port 1:1 do clinic-dashboard "page-leads-all".
 *
 * Layout:
 *   ┌────────────────────────────────────────────────────────────────────┐
 *   │ Toggle: [Tabela] [7 Dias] [Evolução]                                │
 *   │ KPI badge horizontal: [N LEADS · 🔴 hot · 🟡 warm · 🔵 cold]        │
 *   │ Tabs: [Todos] [Hoje] [Semana] [Mês] [Período]                       │
 *   │ [Search nome/telefone]                                              │
 *   │ Card ESTRATÉGICO: [Temperatura ▼] [Tags ▼] [Queixas ▼]              │
 *   │ Tabela 7 colunas: # · Nome+Tel · Temp · Tags · Queixas · Ativo · Ações
 *   │ [Carregar mais]                                                     │
 *   └────────────────────────────────────────────────────────────────────┘
 *
 * KPIs reativos · recalculam local quando muda período/temp/tag/search.
 */

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import {
  Phone,
  Trash2,
  Edit3,
  Calendar,
  Search,
  Construction,
  Thermometer,
  AlertTriangle,
  Download,
  Plus,
  Check,
  ArrowRight,
  ArrowLeft,
} from 'lucide-react'
import type {
  Funnel,
  LeadDTO,
  LeadSource,
  LeadSourceType,
  LeadTemperature,
} from '@clinicai/repositories'
import { createLeadAction, softDeleteLeadAction, type NewLeadInput } from './actions'
import { BulkActionBar } from './_components/bulk-action-bar'

type ViewMode = 'table' | 'seven_days' | 'evolution'
type Period = 'all' | 'today' | 'week' | 'month' | 'custom'

interface Props {
  rows: LeadDTO[]
  total: number
  page: number
  pageSize: number
  canEdit: boolean
  canDelete: boolean
  canCreate: boolean
}

export function LeadsClient({
  rows,
  total,
  page,
  pageSize,
  canEdit,
  canDelete,
  canCreate,
}: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()

  const [view, setView] = useState<ViewMode>('table')
  const [search, setSearch] = useState((searchParams.get('q') || '').toString())
  const [confirmDelete, setConfirmDelete] = useState<LeadDTO | null>(null)
  const [showNewLead, setShowNewLead] = useState(false)
  const [toast, setToast] = useState<{ msg: string; tone: 'ok' | 'err' } | null>(null)
  // BLOCO 3.4B · seleção múltipla
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const periodFromUrl: Period =
    (searchParams.get('period') as Period | null) || 'all'
  const tempFromUrl = searchParams.get('temp') || ''
  const tagFromUrl = searchParams.get('tag') || ''
  const queixaFromUrl = searchParams.get('queixa') || ''
  const dateFromUrl = searchParams.get('from') || ''
  const dateToUrl = searchParams.get('to') || ''

  function showToast(msg: string, tone: 'ok' | 'err' = 'ok') {
    setToast({ msg, tone })
    setTimeout(() => setToast(null), 3000)
  }

  function updateUrl(updates: Record<string, string | null>) {
    const sp = new URLSearchParams(searchParams.toString())
    for (const [k, v] of Object.entries(updates)) {
      if (v === null || v === '') sp.delete(k)
      else sp.set(k, v)
    }
    sp.delete('page')
    startTransition(() => {
      router.replace(`${pathname}?${sp.toString()}`, { scroll: false })
    })
  }

  function gotoPage(next: number) {
    const sp = new URLSearchParams(searchParams.toString())
    if (next <= 1) sp.delete('page')
    else sp.set('page', String(next))
    startTransition(() => {
      router.replace(`${pathname}?${sp.toString()}`, { scroll: false })
    })
  }

  // Filtros aplicados client-side em cima das rows do server
  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((l) => {
      if (q) {
        const hay = `${l.name || ''} ${l.phone || ''} ${l.email || ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      if (queixaFromUrl) {
        const queixas = l.queixasFaciais || []
        if (!queixas.some((q2) => q2.toLowerCase().includes(queixaFromUrl.toLowerCase())))
          return false
      }
      return true
    })
  }, [rows, search, queixaFromUrl])

  // KPIs reativos · contagem por temperatura sobre filtros aplicados
  const kpi = useMemo(() => {
    let hot = 0
    let warm = 0
    let cold = 0
    for (const l of filteredRows) {
      if (l.temperature === 'hot') hot++
      else if (l.temperature === 'warm') warm++
      else cold++
    }
    return { total: filteredRows.length, hot, warm, cold }
  }, [filteredRows])

  // Tags únicas pra select (do recordset atual)
  const allTags = useMemo(() => {
    const set = new Set<string>()
    for (const l of rows) for (const t of l.tags || []) set.add(t)
    return Array.from(set).sort()
  }, [rows])

  // Queixas únicas pra select (do recordset atual)
  const allQueixas = useMemo(() => {
    const set = new Set<string>()
    for (const l of rows) {
      for (const q of l.queixasFaciais || []) set.add(q)
    }
    return Array.from(set).sort()
  }, [rows])

  // Filtro de tag aplicado em cima de filteredRows
  const tagFiltered = useMemo(() => {
    if (!tagFromUrl) return filteredRows
    return filteredRows.filter((l) => (l.tags || []).includes(tagFromUrl))
  }, [filteredRows, tagFromUrl])

  // Filtro de temperature aplicado em cima
  const finalRows = useMemo(() => {
    if (!tempFromUrl) return tagFiltered
    return tagFiltered.filter((l) => l.temperature === tempFromUrl)
  }, [tagFiltered, tempFromUrl])

  // BLOCO 3.4B · reset selection quando rows mudam (paginação / filtros)
  const rowIdsKey = useMemo(() => finalRows.map((l) => l.id).join('|'), [finalRows])
  useEffect(() => {
    setSelectedIds(new Set())
  }, [rowIdsKey])

  const selectableIds = useMemo(
    () => finalRows.filter((l) => !l.deletedAt).map((l) => l.id),
    [finalRows],
  )
  const allSelected =
    selectableIds.length > 0 && selectableIds.every((id) => selectedIds.has(id))
  const someSelected = selectableIds.some((id) => selectedIds.has(id)) && !allSelected

  function toggleLead(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAllVisible() {
    setSelectedIds((prev) => {
      if (allSelected) {
        const next = new Set(prev)
        for (const id of selectableIds) next.delete(id)
        return next
      }
      const next = new Set(prev)
      for (const id of selectableIds) next.add(id)
      return next
    })
  }

  function clearSelection() {
    setSelectedIds(new Set())
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  function exportCsv() {
    const headers = ['Nome', 'Telefone', 'Email', 'Funnel', 'Fase', 'Temperatura', 'Tags', 'Queixas', 'Score', 'Última resposta']
    const lines = [headers.join(',')]
    for (const l of finalRows) {
      const queixas = l.queixasFaciais || [].join(' / ')
      const row = [
        l.name || '',
        l.phone || '',
        l.email || '',
        l.funnel || '',
        l.phase || '',
        l.temperature || '',
        (l.tags || []).join(' / '),
        queixas,
        String(l.leadScore || 0),
        l.lastResponseAt || '',
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(',')
      lines.push(row)
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `leads_${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
  }

  return (
    <div>
      {/* ── Toolbar topo · Toggle de view + Botões ──────────────────── */}
      <div
        style={{
          display: 'flex',
          gap: 16,
          alignItems: 'center',
          flexWrap: 'wrap',
          marginBottom: 20,
        }}
      >
        {/* View toggle */}
        <div
          role="tablist"
          style={{
            display: 'inline-flex',
            background: 'var(--b2b-bg-1)',
            border: '1px solid var(--b2b-border)',
            borderRadius: 6,
            padding: 3,
          }}
        >
          {(['table', 'seven_days', 'evolution'] as ViewMode[]).map((v) => {
            const active = view === v
            const label = v === 'table' ? 'Tabela' : v === 'seven_days' ? '7 Dias' : 'Evolução'
            return (
              <button
                key={v}
                type="button"
                role="tab"
                onClick={() => setView(v)}
                style={{
                  padding: '6px 14px',
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: 0.6,
                  textTransform: 'uppercase',
                  border: 'none',
                  cursor: 'pointer',
                  background: active ? 'var(--b2b-champagne)' : 'transparent',
                  color: active ? 'var(--b2b-bg-0)' : 'var(--b2b-text-dim)',
                  borderRadius: 4,
                  transition: 'all 0.15s',
                }}
              >
                {label}
              </button>
            )
          })}
        </div>

        {/* KPI badge horizontal · reativo aos filtros */}
        <KpiBadge {...kpi} />

        <div style={{ flex: 1 }} />

        {/* Botões direita */}
        <button
          type="button"
          onClick={exportCsv}
          className="b2b-btn"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <Download size={12} /> Exportar
        </button>
        {canCreate && (
          <button
            type="button"
            onClick={() => setShowNewLead(true)}
            className="b2b-btn b2b-btn-primary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Plus size={12} /> Novo lead
          </button>
        )}
      </div>

      {view === 'seven_days' && (
        <div
          className="luxury-card"
          style={{
            padding: '32px 24px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 14,
          }}
        >
          <div
            className="font-display"
            style={{ fontSize: 20, color: 'var(--b2b-ivory)' }}
          >
            Kanban <em>7 Dias</em>
          </div>
          <p
            className="font-display"
            style={{
              fontStyle: 'italic',
              color: 'var(--b2b-text-muted)',
              fontSize: 14,
              maxWidth: 480,
            }}
          >
            Pipeline read-only · stages avançam automaticamente todo dia às 00:00.
            A visão fica em rota própria para preservar foco operacional.
          </p>
          <a
            href="/crm/kanban/seven-days"
            className="b2b-btn b2b-btn-primary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            Abrir Kanban 7 Dias →
          </a>
        </div>
      )}

      {view === 'evolution' && (
        <div
          className="luxury-card"
          style={{
            padding: '32px 24px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 14,
          }}
        >
          <Construction size={28} style={{ color: 'var(--b2b-champagne)' }} />
          <div className="font-display" style={{ fontSize: 20, color: 'var(--b2b-ivory)' }}>
            Kanban <em>Evolução</em>
          </div>
          <p
            className="font-display"
            style={{
              fontStyle: 'italic',
              color: 'var(--b2b-text-muted)',
              fontSize: 14,
              maxWidth: 480,
            }}
          >
            Pipeline drag-drop · arraste leads entre stages comportamentais.
            Disponível em rota dedicada.
          </p>
          <a
            href="/crm/kanban"
            className="b2b-btn b2b-btn-primary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            Abrir Kanban Evolução →
          </a>
        </div>
      )}

      {view === 'table' && (
        <>
          {/* ── Tabs período · Todos / Hoje / Semana / Mês / Período ──── */}
          <div
            style={{
              display: 'flex',
              gap: 4,
              flexWrap: 'wrap',
              marginBottom: 14,
              borderBottom: '1px solid var(--b2b-border)',
            }}
          >
            {(['all', 'today', 'week', 'month', 'custom'] as Period[]).map((p) => {
              const active = periodFromUrl === p
              const label =
                p === 'all'
                  ? 'Todos'
                  : p === 'today'
                    ? 'Hoje'
                    : p === 'week'
                      ? 'Semana'
                      : p === 'month'
                        ? 'Mês'
                        : 'Período'
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => updateUrl({ period: p === 'all' ? null : p })}
                  style={{
                    position: 'relative',
                    padding: '10px 14px',
                    background: 'transparent',
                    color: active ? 'var(--b2b-champagne)' : 'var(--b2b-text-muted)',
                    border: 'none',
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: 1.2,
                    textTransform: 'uppercase',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  {label}
                  {active && (
                    <span
                      aria-hidden
                      style={{
                        position: 'absolute',
                        left: 12,
                        right: 12,
                        bottom: -1,
                        height: 1.5,
                        background: 'var(--b2b-champagne)',
                      }}
                    />
                  )}
                </button>
              )
            })}
          </div>

          {/* Date range custom (visível só com period=custom) */}
          {periodFromUrl === 'custom' && (
            <div
              style={{
                display: 'flex',
                gap: 8,
                alignItems: 'center',
                marginBottom: 14,
                flexWrap: 'wrap',
              }}
            >
              <Calendar size={14} style={{ color: 'var(--b2b-champagne)' }} />
              <input
                type="date"
                value={dateFromUrl}
                onChange={(e) => updateUrl({ from: e.target.value })}
                className="b2b-input"
                style={{ width: 160, padding: '6px 10px', fontSize: 12 }}
              />
              <span style={{ fontSize: 11, color: 'var(--b2b-text-muted)' }}>até</span>
              <input
                type="date"
                value={dateToUrl}
                onChange={(e) => updateUrl({ to: e.target.value })}
                className="b2b-input"
                style={{ width: 160, padding: '6px 10px', fontSize: 12 }}
              />
            </div>
          )}

          {/* Search */}
          <div
            style={{
              position: 'relative',
              marginBottom: 14,
              maxWidth: 420,
            }}
          >
            <Search
              size={14}
              style={{
                position: 'absolute',
                left: 12,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--b2b-text-muted)',
                pointerEvents: 'none',
              }}
            />
            <input
              type="text"
              placeholder="Buscar por nome, telefone ou email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="b2b-input"
              style={{ paddingLeft: 36 }}
            />
          </div>

          {/* Card ESTRATÉGICO · Temperatura + Tags + Queixas */}
          <div
            style={{
              padding: '14px 16px',
              background:
                'linear-gradient(135deg, rgba(201,169,110,0.05), rgba(201,169,110,0.01))',
              border: '1px solid rgba(201,169,110,0.20)',
              borderRadius: 8,
              marginBottom: 18,
              display: 'flex',
              gap: 12,
              flexWrap: 'wrap',
              alignItems: 'center',
            }}
          >
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 10,
                letterSpacing: 2,
                textTransform: 'uppercase',
                color: 'var(--b2b-champagne)',
                fontWeight: 700,
                paddingRight: 12,
                borderRight: '1px solid var(--b2b-border)',
              }}
            >
              <Thermometer size={12} /> Estratégico
            </span>

            <select
              value={tempFromUrl}
              onChange={(e) => updateUrl({ temp: e.target.value || null })}
              className="b2b-input"
              style={{ width: 220, fontSize: 12 }}
            >
              <option value="">Todas as temperaturas</option>
              <option value="hot">🔴 Quente</option>
              <option value="warm">🟡 Morno</option>
              <option value="cold">🔵 Frio</option>
            </select>

            <select
              value={tagFromUrl}
              onChange={(e) => updateUrl({ tag: e.target.value || null })}
              className="b2b-input"
              style={{ width: 200, fontSize: 12 }}
              disabled={allTags.length === 0}
            >
              <option value="">Todas as tags</option>
              {allTags.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>

            <select
              value={queixaFromUrl}
              onChange={(e) => updateUrl({ queixa: e.target.value || null })}
              className="b2b-input"
              style={{ width: 220, fontSize: 12 }}
              disabled={allQueixas.length === 0}
            >
              <option value="">Todas as queixas</option>
              {allQueixas.map((q) => (
                <option key={q} value={q}>
                  {q}
                </option>
              ))}
            </select>
          </div>

          {/* BLOCO 3.4B · banner de bulk actions sticky · só com seleção */}
          {selectedIds.size > 0 && (
            <BulkActionBar
              selectedIds={Array.from(selectedIds)}
              onClearSelection={clearSelection}
              onToast={showToast}
              onAfterSuccess={() => {
                /* clearSelection já roda dentro do bar · router.refresh idem */
              }}
            />
          )}

          {/* ── Tabela 8 colunas (checkbox + 7 originais) ─────────────── */}
          {finalRows.length === 0 ? (
            <div className="b2b-empty" style={{ padding: 32 }}>
              Nenhum lead encontrado · ajuste os filtros ou aguarde novos contatos.
            </div>
          ) : (
            <div className="luxury-card" style={{ overflow: 'hidden', padding: 0 }}>
              <div
                role="table"
                style={{
                  display: 'grid',
                  gridTemplateColumns:
                    '36px 40px minmax(220px, 1.6fr) 110px 1fr 1.2fr 80px 110px',
                  rowGap: 0,
                  fontSize: 12,
                }}
              >
                <Cell header center>
                  <input
                    type="checkbox"
                    aria-label={
                      allSelected
                        ? 'Desmarcar todos visíveis'
                        : 'Selecionar todos visíveis'
                    }
                    checked={allSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = someSelected
                    }}
                    onChange={toggleAllVisible}
                    disabled={selectableIds.length === 0}
                    style={{ cursor: 'pointer' }}
                  />
                </Cell>
                <Cell header>#</Cell>
                <Cell header>Lead</Cell>
                <Cell header>Temperatura</Cell>
                <Cell header>Tags</Cell>
                <Cell header>Queixas</Cell>
                <Cell header center>
                  Ativo
                </Cell>
                <Cell header center>
                  Ações
                </Cell>

                {finalRows.map((lead, idx) => (
                  <LeadRow
                    key={lead.id}
                    rowIdx={(page - 1) * pageSize + idx + 1}
                    lead={lead}
                    canEdit={canEdit}
                    canDelete={canDelete}
                    onDelete={() => setConfirmDelete(lead)}
                    isSelected={selectedIds.has(lead.id)}
                    onToggleSelect={() => toggleLead(lead.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Paginação */}
          {totalPages > 1 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginTop: 14,
                gap: 8,
                fontSize: 12,
                color: 'var(--b2b-text-dim)',
              }}
            >
              <span>
                Página{' '}
                <strong style={{ color: 'var(--b2b-ivory)' }}>{page}</strong> de{' '}
                <strong style={{ color: 'var(--b2b-ivory)' }}>{totalPages}</strong> ·{' '}
                {total} {total === 1 ? 'lead' : 'leads'} no total
              </span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  className="b2b-btn"
                  onClick={() => gotoPage(page - 1)}
                  disabled={page <= 1}
                >
                  Anterior
                </button>
                <button
                  type="button"
                  className="b2b-btn"
                  onClick={() => gotoPage(page + 1)}
                  disabled={page >= totalPages}
                >
                  Próxima
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {confirmDelete && canDelete && (
        <DeleteModal
          lead={confirmDelete}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={async () => {
            const id = confirmDelete.id
            const result = await softDeleteLeadAction(id)
            if (!result.ok) {
              showToast(result.error || 'Falha ao deletar', 'err')
              return
            }
            setConfirmDelete(null)
            showToast('Lead removido')
            startTransition(() => router.refresh())
          }}
        />
      )}

      {showNewLead && (
        <NewLeadModal
          onClose={() => setShowNewLead(false)}
          onToast={showToast}
          onCreated={(leadId) => {
            setShowNewLead(false)
            startTransition(() => router.refresh())
            router.push(`/leads/${leadId}`)
          }}
        />
      )}

      {toast && (
        <div
          role="status"
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            padding: '10px 18px',
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 600,
            zIndex: 1000,
            background:
              toast.tone === 'err' ? 'rgba(217,122,122,0.18)' : 'rgba(138,158,136,0.18)',
            color: toast.tone === 'err' ? 'var(--b2b-red)' : 'var(--b2b-sage)',
            border: `1px solid ${toast.tone === 'err' ? 'rgba(217,122,122,0.4)' : 'rgba(138,158,136,0.4)'}`,
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          }}
        >
          {toast.msg}
        </div>
      )}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────
// KPI badge horizontal (mirror clinic-dashboard #leadsCountBadge)
// ──────────────────────────────────────────────────────────────────────────

function KpiBadge({
  total,
  hot,
  warm,
  cold,
}: {
  total: number
  hot: number
  warm: number
  cold: number
}) {
  return (
    <div
      role="status"
      aria-label="Resumo de leads"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 14,
        padding: '8px 16px',
        background:
          'linear-gradient(135deg, rgba(201,169,110,0.10), rgba(201,169,110,0.04))',
        border: '1px solid rgba(201,169,110,0.30)',
        borderRadius: 999,
        fontSize: 12,
      }}
    >
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'baseline',
          gap: 6,
          color: 'var(--b2b-champagne)',
          fontWeight: 700,
        }}
      >
        <span
          className="font-display"
          style={{ fontSize: 22, fontWeight: 500, lineHeight: 1 }}
        >
          {total}
        </span>
        <span
          style={{
            fontSize: 9,
            letterSpacing: 2,
            textTransform: 'uppercase',
            color: 'var(--b2b-text-muted)',
          }}
        >
          {total === 1 ? 'lead' : 'leads'}
        </span>
      </span>
      <span style={{ width: 1, height: 20, background: 'var(--b2b-border)' }} />
      <KpiTemp label="Quente" value={hot} color="#ef4444" />
      <KpiTemp label="Morno" value={warm} color="#f59e0b" />
      <KpiTemp label="Frio" value={cold} color="#60a5fa" />
    </div>
  )
}

function KpiTemp({
  label,
  value,
  color,
}: {
  label: string
  value: number
  color: string
}) {
  return (
    <span
      title={label}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      <Thermometer size={11} style={{ color }} />
      <strong style={{ color: 'var(--b2b-ivory)' }}>{value}</strong>
    </span>
  )
}

// ──────────────────────────────────────────────────────────────────────────
// Linha da tabela
// ──────────────────────────────────────────────────────────────────────────

function LeadRow({
  rowIdx,
  lead,
  canEdit,
  canDelete,
  onDelete,
  isSelected,
  onToggleSelect,
}: {
  rowIdx: number
  lead: LeadDTO
  canEdit: boolean
  canDelete: boolean
  onDelete: () => void
  isSelected: boolean
  onToggleSelect: () => void
}) {
  const router = useRouter()
  const initial = (lead.name || lead.phone || '?').trim().charAt(0).toUpperCase()
  const phoneDigits = (lead.phone || '').replace(/\D/g, '')
  const waHref = phoneDigits
    ? `https://wa.me/${phoneDigits.length <= 11 ? '55' + phoneDigits : phoneDigits}`
    : null
  const queixas = lead.queixasFaciais || []
  const queixaText = queixas.join(' · ')
  const isActive = !lead.deletedAt
  const selectable = !lead.deletedAt

  function clickRow(e: React.MouseEvent) {
    // Ignora click se vier de elemento interativo (a/button/select/checkbox)
    const target = e.target as HTMLElement
    if (target.closest('a, button, select, input, label')) return
    router.push(`/leads/${lead.id}`)
  }

  return (
    <>
      <Cell center>
        <input
          type="checkbox"
          aria-label={isSelected ? 'Desmarcar lead' : 'Selecionar lead'}
          checked={isSelected}
          onChange={onToggleSelect}
          onClick={(e) => e.stopPropagation()}
          disabled={!selectable}
          title={
            selectable
              ? 'Marcar/desmarcar pra ações em lote'
              : 'Lead deletado · não selecionável'
          }
          style={{ cursor: selectable ? 'pointer' : 'not-allowed' }}
        />
      </Cell>

      <Cell onClick={clickRow}>
        <span style={{ color: 'var(--b2b-text-muted)' }}>{rowIdx}</span>
      </Cell>

      <Cell onClick={clickRow}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <Avatar initial={initial} />
          <div style={{ overflow: 'hidden', minWidth: 0 }}>
            <div
              style={{
                fontWeight: 600,
                color: 'var(--b2b-ivory)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {lead.name || '—'}
            </div>
            <div
              style={{
                fontSize: 11,
                color: 'var(--b2b-text-muted)',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Phone size={10} />
              {formatPhoneBr(lead.phone)}
              {waHref && (
                <a
                  href={waHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Abrir no WhatsApp"
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    marginLeft: 4,
                    display: 'inline-flex',
                    alignItems: 'center',
                    color: '#22c55e',
                  }}
                >
                  <svg
                    viewBox="0 0 24 24"
                    width="11"
                    height="11"
                    fill="currentColor"
                  >
                    <path d="M17.5 14.4c-.3-.1-1.7-.8-2-.9-.3-.1-.5-.1-.7.2-.2.3-.7.9-.9 1.1-.2.2-.3.2-.6.1-.3-.2-1.2-.5-2.3-1.5-.9-.7-1.4-1.7-1.6-2-.2-.3 0-.5.1-.6.1-.1.3-.3.4-.5.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5-.1-.2-.7-1.6-.9-2.2-.2-.6-.5-.5-.7-.5-.2 0-.4 0-.6 0s-.5.1-.7.4c-.3.3-1 1-1 2.4 0 1.4 1 2.7 1.2 2.9.2.2 2.1 3.2 5 4.5.7.3 1.3.5 1.7.6.7.2 1.3.2 1.8.1.6-.1 1.7-.7 1.9-1.4.2-.7.2-1.2.2-1.4-.1-.2-.3-.3-.6-.4z" />
                    <path d="M12 2C6.5 2 2 6.5 2 12c0 1.7.4 3.4 1.3 4.9L2 22l5.2-1.4c1.5.8 3.1 1.3 4.8 1.3 5.5 0 10-4.5 10-10S17.5 2 12 2zm0 18.3c-1.5 0-3-.4-4.4-1.2l-.3-.2-3.1.8.8-3-.2-.3c-.9-1.4-1.3-3-1.3-4.5 0-4.6 3.7-8.3 8.3-8.3 4.6 0 8.3 3.7 8.3 8.3.1 4.6-3.6 8.3-8.1 8.3z" />
                  </svg>
                </a>
              )}
            </div>
          </div>
        </div>
      </Cell>

      <Cell onClick={clickRow}>
        <TempPill temp={lead.temperature} />
      </Cell>

      <Cell onClick={clickRow}>
        <TagsCell tags={lead.tags || []} />
      </Cell>

      <Cell onClick={clickRow}>
        <span
          title={queixaText}
          style={{
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            color: 'var(--b2b-text-dim)',
            fontSize: 11,
            lineHeight: 1.4,
            maxHeight: '2.8em',
          }}
        >
          {queixaText || '—'}
        </span>
      </Cell>

      <Cell center onClick={clickRow}>
        <ActiveBadge active={isActive} />
      </Cell>

      <Cell center>
        <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
          {canEdit && (
            <button
              type="button"
              title="Editar"
              onClick={(e) => {
                e.stopPropagation()
                router.push(`/leads/${lead.id}`)
              }}
              className="b2b-btn"
              style={{ padding: '4px 7px', fontSize: 11, lineHeight: 1 }}
            >
              <Edit3 size={12} />
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              title="Deletar"
              onClick={(e) => {
                e.stopPropagation()
                onDelete()
              }}
              className="b2b-btn"
              style={{
                padding: '4px 7px',
                fontSize: 11,
                lineHeight: 1,
                color: 'var(--b2b-red)',
                borderColor: 'rgba(217,122,122,0.35)',
              }}
            >
              <Trash2 size={12} />
            </button>
          )}
        </div>
      </Cell>
    </>
  )
}

function Cell({
  header = false,
  center = false,
  children,
  onClick,
}: {
  header?: boolean
  center?: boolean
  children: React.ReactNode
  onClick?: (e: React.MouseEvent) => void
}) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: '10px 14px',
        borderBottom: '1px solid rgba(201,169,110,0.10)',
        background: header ? 'rgba(201,169,110,0.06)' : 'transparent',
        fontSize: header ? 10 : 12,
        fontWeight: header ? 700 : 400,
        textTransform: header ? 'uppercase' : 'none',
        letterSpacing: header ? 1.2 : 0,
        color: header ? 'var(--b2b-champagne)' : 'var(--b2b-text-dim)',
        textAlign: center ? 'center' : 'left',
        display: 'flex',
        alignItems: 'center',
        justifyContent: center ? 'center' : 'flex-start',
        cursor: header ? 'default' : onClick ? 'pointer' : 'default',
      }}
    >
      {children}
    </div>
  )
}

function Avatar({ initial }: { initial: string }) {
  return (
    <div
      style={{
        width: 32,
        height: 32,
        borderRadius: '50%',
        flexShrink: 0,
        background:
          'linear-gradient(135deg, var(--b2b-bg-3), var(--b2b-bg-2))',
        border: '1px solid var(--b2b-border-strong)',
        color: 'var(--b2b-champagne)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 600,
        fontSize: 13,
        fontFamily: 'Cormorant Garamond, serif',
      }}
    >
      {initial}
    </div>
  )
}

function TempPill({ temp }: { temp: string }) {
  const cfg: Record<string, { label: string; color: string; bg: string }> = {
    hot: { label: 'Quente', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
    warm: { label: 'Morno', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
    cold: { label: 'Frio', color: '#60a5fa', bg: 'rgba(96,165,250,0.12)' },
  }
  const c = cfg[temp] || cfg.cold
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '2px 8px',
        borderRadius: 999,
        fontSize: 10,
        fontWeight: 600,
        background: c.bg,
        color: c.color,
        border: `1px solid ${c.color}40`,
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: c.color,
        }}
      />
      {c.label}
    </span>
  )
}

function TagsCell({ tags }: { tags: string[] }) {
  if (!tags.length) return <span style={{ color: 'var(--b2b-text-muted)' }}>—</span>
  const visible = tags.slice(0, 3)
  const extra = tags.length - visible.length
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
      {visible.map((t) => (
        <span
          key={t}
          style={{
            padding: '1px 7px',
            background: 'rgba(201,169,110,0.10)',
            color: 'var(--b2b-text-dim)',
            border: '1px solid var(--b2b-border)',
            borderRadius: 10,
            fontSize: 10,
            whiteSpace: 'nowrap',
          }}
        >
          {t}
        </span>
      ))}
      {extra > 0 && (
        <span
          style={{
            padding: '1px 7px',
            color: 'var(--b2b-text-muted)',
            fontSize: 10,
          }}
        >
          +{extra}
        </span>
      )}
    </div>
  )
}

function ActiveBadge({ active }: { active: boolean }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 8px',
        borderRadius: 999,
        fontSize: 10,
        fontWeight: 600,
        background: active ? 'rgba(138,158,136,0.12)' : 'rgba(122,113,101,0.12)',
        color: active ? 'var(--b2b-sage)' : 'var(--b2b-text-muted)',
        border: `1px solid ${active ? 'rgba(138,158,136,0.35)' : 'var(--b2b-border)'}`,
      }}
    >
      <span
        style={{
          width: 5,
          height: 5,
          borderRadius: '50%',
          background: active ? 'var(--b2b-sage)' : 'var(--b2b-text-muted)',
        }}
      />
      {active ? 'Ativo' : 'Inativo'}
    </span>
  )
}

function formatPhoneBr(phone: string): string {
  if (!phone) return '—'
  const digits = phone.replace(/\D/g, '')
  const local =
    digits.length === 13 || digits.length === 12 ? digits.substring(2) : digits
  if (local.length === 11) {
    return `(${local.substring(0, 2)}) ${local.substring(2, 7)}-${local.substring(7)}`
  }
  if (local.length === 10) {
    return `(${local.substring(0, 2)}) ${local.substring(2, 6)}-${local.substring(6)}`
  }
  return phone
}

// ──────────────────────────────────────────────────────────────────────────
// Modais
// ──────────────────────────────────────────────────────────────────────────

function DeleteModal({
  lead,
  onCancel,
  onConfirm,
}: {
  lead: LeadDTO
  onCancel: () => void
  onConfirm: () => void | Promise<void>
}) {
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const expected = (lead.name || '').trim()
  const matches = typed.trim() === expected && expected.length > 0

  return (
    <div className="b2b-overlay" onClick={onCancel}>
      <div
        className="b2b-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 460 }}
      >
        <div className="b2b-modal-hdr">
          <h2
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              color: 'var(--b2b-red)',
            }}
          >
            <AlertTriangle size={16} />
            Deletar lead
          </h2>
          <button onClick={onCancel} className="b2b-close" aria-label="Fechar">
            ×
          </button>
        </div>
        <div className="b2b-modal-body">
          <p style={{ marginBottom: 12, color: 'var(--b2b-text-dim)', fontSize: 13 }}>
            Esta ação é{' '}
            <strong style={{ color: 'var(--b2b-ivory)' }}>permanente</strong>{' '}
            (soft-delete · pode ser restaurado por admin).
          </p>
          <p style={{ marginBottom: 6, fontSize: 12, color: 'var(--b2b-text-muted)' }}>
            Para confirmar, digite o nome exato do lead:
          </p>
          <p
            style={{
              padding: '6px 10px',
              borderRadius: 6,
              background: 'rgba(255,255,255,0.04)',
              fontFamily: 'monospace',
              fontSize: 13,
              marginBottom: 12,
              color: 'var(--b2b-ivory)',
            }}
          >
            {expected || '(sem nome)'}
          </p>
          <input
            type="text"
            className="b2b-input"
            placeholder={
              expected ? 'Digite o nome...' : 'Lead sem nome — confirme assim mesmo'
            }
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            disabled={!expected}
          />
          <div className="b2b-form-actions">
            <button type="button" className="b2b-btn" onClick={onCancel} disabled={busy}>
              Cancelar
            </button>
            <button
              type="button"
              className="b2b-btn"
              disabled={busy || (!matches && Boolean(expected))}
              onClick={async () => {
                setBusy(true)
                try {
                  await onConfirm()
                } finally {
                  setBusy(false)
                }
              }}
              style={{
                background: 'rgba(217,122,122,0.18)',
                color: 'var(--b2b-red)',
                borderColor: 'rgba(217,122,122,0.5)',
                fontWeight: 600,
              }}
            >
              {busy ? 'Deletando...' : 'Deletar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────
// Novo Lead · wizard 3 steps (Lote 2 P0.1 · 2026-05-17)
//
// Step 1 · Identificação: nome (≥2), telefone BR (10-11 dig), email/cpf/birth
// Step 2 · Origem & qualificação: source, source_type, funnel, temperature, score
// Step 3 · Operação & notas: phase=lead FIXED, notes (≤1000)
//
// Dedup phone via createLeadAction (server) que chama
// repos.leads.findByPhoneVariants + RPC lead_create (idempotente).
// Quando bate dupe, modal mostra dialog "Lead já existe · Abrir detalhe".
// ──────────────────────────────────────────────────────────────────────────

interface NewLeadModalProps {
  onClose: () => void
  onToast: (msg: string, tone?: 'ok' | 'err') => void
  onCreated: (leadId: string) => void
}

type WizardStep = 1 | 2 | 3

interface WizardState {
  // Step 1
  name: string
  phone: string
  email: string
  cpf: string
  birthDate: string
  // Step 2
  source: LeadSource | ''
  sourceType: LeadSourceType | ''
  funnel: Funnel | ''
  temperature: LeadTemperature | ''
  score: string
  // Step 3
  notes: string
}

const INITIAL_STATE: WizardState = {
  name: '',
  phone: '',
  email: '',
  cpf: '',
  birthDate: '',
  source: 'manual',
  sourceType: 'manual',
  funnel: 'procedimentos',
  temperature: 'hot',
  score: '',
  notes: '',
}

// Sources alinhados com enum em packages/repositories/src/types/enums.ts.
// Subset operacional · removo os internos (webhook, lara_*, b2b_*) porque
// esses não fazem sentido no UI de cadastro manual.
const SOURCE_OPTIONS: { value: LeadSource; label: string }[] = [
  { value: 'manual', label: 'Manual · cadastro pela equipe' },
  { value: 'quiz', label: 'Quiz · paciente respondeu' },
  { value: 'landing_page', label: 'Landing page' },
  { value: 'import', label: 'Import · planilha' },
]

const SOURCE_TYPE_OPTIONS: { value: LeadSourceType; label: string }[] = [
  { value: 'manual', label: 'Manual' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'whatsapp_fullface', label: 'WhatsApp · Full Face' },
  { value: 'quiz', label: 'Quiz' },
  { value: 'landing_page', label: 'Landing page' },
  { value: 'referral', label: 'Indicação' },
  { value: 'social', label: 'Social' },
  { value: 'import', label: 'Import' },
  { value: 'b2b_voucher', label: 'B2B · voucher' },
  { value: 'vpi_referral', label: 'VPI · referral' },
]

const FUNNEL_OPTIONS: { value: Funnel; label: string }[] = [
  { value: 'olheiras', label: 'Olheiras' },
  { value: 'fullface', label: 'Full Face' },
  { value: 'procedimentos', label: 'Procedimentos' },
]

const TEMP_OPTIONS: { value: LeadTemperature; label: string }[] = [
  { value: 'hot', label: 'Quente · pronto pra agendar' },
  { value: 'warm', label: 'Morno · em qualificação' },
  { value: 'cold', label: 'Frio · sem urgência' },
]

function normalizePhoneInputBr(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, 13)
}

function formatPhoneInputBr(digits: string): string {
  if (!digits) return ''
  const d = digits.slice(-11) // mostra como local mesmo se tiver 55
  if (d.length <= 2) return `(${d}`
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) {
    return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  }
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7, 11)}`
}

function isPhoneValid(digits: string): boolean {
  // 10 ou 11 dígitos BR · ou 12-13 com prefixo 55
  return digits.length >= 10 && digits.length <= 13
}

function isEmailValid(raw: string): boolean {
  if (!raw) return true
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw.trim())
}

function NewLeadModal({ onClose, onToast, onCreated }: NewLeadModalProps) {
  const [step, setStep] = useState<WizardStep>(1)
  const [state, setState] = useState<WizardState>(INITIAL_STATE)
  const [busy, setBusy] = useState(false)
  const [duplicate, setDuplicate] = useState<
    | { leadId: string; reason: 'phone' | 'email'; name?: string | null }
    | null
  >(null)

  function patch<K extends keyof WizardState>(k: K, v: WizardState[K]) {
    setState((s) => ({ ...s, [k]: v }))
  }

  // ── Validators por step ───────────────────────────────────────────────
  const phoneDigits = state.phone
  const step1Errors: string[] = []
  if (state.name.trim().length < 2) {
    step1Errors.push('Nome obrigatório · mínimo 2 caracteres')
  }
  if (!isPhoneValid(phoneDigits)) {
    step1Errors.push('Telefone obrigatório · 10 ou 11 dígitos (DDD + número)')
  }
  if (state.email && !isEmailValid(state.email)) {
    step1Errors.push('Email inválido')
  }
  const cpfDigits = state.cpf.replace(/\D/g, '')
  if (cpfDigits && cpfDigits.length !== 11) {
    step1Errors.push('CPF inválido · 11 dígitos quando preenchido')
  }
  if (
    state.birthDate &&
    !/^\d{4}-\d{2}-\d{2}$/.test(state.birthDate)
  ) {
    step1Errors.push('Data de nascimento inválida (YYYY-MM-DD)')
  }
  const step1Valid = step1Errors.length === 0

  const step2Errors: string[] = []
  if (state.score) {
    const n = Number(state.score)
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      step2Errors.push('Score deve ser entre 0 e 100')
    }
  }
  const step2Valid = step2Errors.length === 0

  const step3Errors: string[] = []
  if (state.notes.length > 1000) {
    step3Errors.push('Notas longas · máximo 1000 caracteres')
  }
  const step3Valid = step3Errors.length === 0

  async function handleSubmit() {
    if (!step1Valid || !step2Valid || !step3Valid) {
      onToast('Verifique os campos antes de criar o lead', 'err')
      return
    }
    setBusy(true)
    setDuplicate(null)
    try {
      const payload: NewLeadInput = {
        name: state.name.trim(),
        phone: phoneDigits,
        email: state.email.trim() || null,
        cpf: cpfDigits || null,
        birthDate: state.birthDate || null,
        source: (state.source as LeadSource) || 'manual',
        sourceType: (state.sourceType as LeadSourceType) || 'manual',
        funnel: (state.funnel as Funnel) || 'procedimentos',
        temperature: (state.temperature as LeadTemperature) || 'hot',
        score: state.score ? Number(state.score) : null,
        notes: state.notes.trim() || null,
      }
      const result = await createLeadAction(payload)
      if (!result.ok) {
        onToast(result.error || 'Falha ao criar lead', 'err')
        return
      }
      const data = result.data
      if (!data) {
        onToast('Resposta vazia do servidor', 'err')
        return
      }
      if (data.existed && data.duplicate) {
        setDuplicate(data.duplicate)
        return
      }
      onToast('Lead criado com sucesso')
      onCreated(data.leadId)
    } catch (e) {
      onToast((e as Error).message || 'Erro inesperado', 'err')
    } finally {
      setBusy(false)
    }
  }

  // ── Dialog dedup ──────────────────────────────────────────────────────
  if (duplicate) {
    return (
      <div className="b2b-overlay" onClick={busy ? undefined : onClose}>
        <div
          className="b2b-modal"
          onClick={(e) => e.stopPropagation()}
          style={{ maxWidth: 480 }}
        >
          <div className="b2b-modal-hdr">
            <h2
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                color: 'var(--b2b-champagne)',
              }}
            >
              <AlertTriangle size={16} />
              Lead já existe
            </h2>
            <button
              onClick={onClose}
              className="b2b-close"
              aria-label="Fechar"
              disabled={busy}
            >
              ×
            </button>
          </div>
          <div className="b2b-modal-body">
            <p style={{ color: 'var(--b2b-text-dim)', fontSize: 13, marginBottom: 12 }}>
              Já existe um lead ativo com este{' '}
              <strong style={{ color: 'var(--b2b-ivory)' }}>
                {duplicate.reason === 'phone' ? 'telefone' : 'email'}
              </strong>
              {duplicate.name ? (
                <>
                  {' '}
                  · <em style={{ color: 'var(--b2b-champagne)' }}>{duplicate.name}</em>
                </>
              ) : null}
              .
            </p>
            <p style={{ color: 'var(--b2b-text-muted)', fontSize: 12, marginBottom: 4 }}>
              Pra evitar duplicatas, abra a ficha existente e atualize o que precisa.
            </p>
            <div className="b2b-form-actions" style={{ marginTop: 16 }}>
              <button type="button" className="b2b-btn" onClick={onClose}>
                Cancelar
              </button>
              <button
                type="button"
                className="b2b-btn b2b-btn-primary"
                onClick={() => onCreated(duplicate.leadId)}
              >
                Abrir lead existente
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Wizard ────────────────────────────────────────────────────────────
  return (
    <div className="b2b-overlay" onClick={busy ? undefined : onClose}>
      <div
        className="b2b-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 560, width: '92vw' }}
      >
        <div className="b2b-modal-hdr">
          <h2>
            Novo <em style={{ color: 'var(--b2b-champagne)' }}>lead</em>
          </h2>
          <button
            onClick={onClose}
            className="b2b-close"
            aria-label="Fechar"
            disabled={busy}
          >
            ×
          </button>
        </div>

        {/* Stepper */}
        <div
          style={{
            display: 'flex',
            gap: 4,
            padding: '0 24px',
            marginTop: 4,
            marginBottom: 14,
          }}
        >
          {([1, 2, 3] as WizardStep[]).map((s) => {
            const active = step === s
            const done = step > s
            const label =
              s === 1 ? 'Identificação' : s === 2 ? 'Origem & qualificação' : 'Operação'
            return (
              <div
                key={s}
                style={{
                  flex: 1,
                  padding: '8px 10px',
                  borderTop: '2px solid',
                  borderColor: active
                    ? 'var(--b2b-champagne)'
                    : done
                      ? 'var(--b2b-sage)'
                      : 'var(--b2b-border)',
                  fontSize: 10,
                  letterSpacing: 1.2,
                  textTransform: 'uppercase',
                  fontWeight: 700,
                  color: active
                    ? 'var(--b2b-champagne)'
                    : done
                      ? 'var(--b2b-sage)'
                      : 'var(--b2b-text-muted)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                {done ? <Check size={11} /> : <span>{s}.</span>}
                {label}
              </div>
            )
          })}
        </div>

        <div className="b2b-modal-body" style={{ minHeight: 280 }}>
          {step === 1 && (
            <Step1
              state={state}
              patch={patch}
              busy={busy}
              errors={step1Errors}
              phoneDigits={phoneDigits}
            />
          )}
          {step === 2 && (
            <Step2 state={state} patch={patch} busy={busy} errors={step2Errors} />
          )}
          {step === 3 && (
            <Step3 state={state} patch={patch} busy={busy} errors={step3Errors} />
          )}

          {/* Nav buttons */}
          <div
            className="b2b-form-actions"
            style={{
              marginTop: 18,
              display: 'flex',
              justifyContent: 'space-between',
              gap: 8,
            }}
          >
            <div>
              {step > 1 && (
                <button
                  type="button"
                  className="b2b-btn"
                  onClick={() => setStep((s) => (s - 1) as WizardStep)}
                  disabled={busy}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  <ArrowLeft size={12} /> Voltar
                </button>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="b2b-btn" onClick={onClose} disabled={busy}>
                Cancelar
              </button>
              {step < 3 && (
                <button
                  type="button"
                  className="b2b-btn b2b-btn-primary"
                  disabled={
                    busy ||
                    (step === 1 && !step1Valid) ||
                    (step === 2 && !step2Valid)
                  }
                  onClick={() => setStep((s) => (s + 1) as WizardStep)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  Avançar <ArrowRight size={12} />
                </button>
              )}
              {step === 3 && (
                <button
                  type="button"
                  className="b2b-btn b2b-btn-primary"
                  disabled={busy || !step1Valid || !step2Valid || !step3Valid}
                  onClick={handleSubmit}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  {busy ? 'Criando...' : 'Criar lead'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Steps ────────────────────────────────────────────────────────────────

function ErrorsBlock({ errors }: { errors: string[] }) {
  if (!errors.length) return null
  return (
    <ul
      style={{
        margin: '0 0 12px',
        padding: '8px 10px 8px 26px',
        background: 'rgba(217,122,122,0.10)',
        border: '1px solid rgba(217,122,122,0.30)',
        borderRadius: 6,
        color: 'var(--b2b-red)',
        fontSize: 11,
        listStyle: 'disc',
      }}
    >
      {errors.map((e) => (
        <li key={e}>{e}</li>
      ))}
    </ul>
  )
}

function FormField({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <label
      style={{
        display: 'block',
        marginBottom: 12,
        fontSize: 11,
        letterSpacing: 1,
        textTransform: 'uppercase',
        color: 'var(--b2b-text-muted)',
        fontWeight: 700,
      }}
    >
      <span>{label}</span>
      {hint ? (
        <span
          style={{
            marginLeft: 6,
            fontSize: 10,
            color: 'var(--b2b-text-muted)',
            textTransform: 'none',
            letterSpacing: 0,
            fontWeight: 400,
            fontStyle: 'italic',
          }}
        >
          {hint}
        </span>
      ) : null}
      <div style={{ marginTop: 4 }}>{children}</div>
    </label>
  )
}

function Step1({
  state,
  patch,
  busy,
  errors,
  phoneDigits,
}: {
  state: WizardState
  patch: <K extends keyof WizardState>(k: K, v: WizardState[K]) => void
  busy: boolean
  errors: string[]
  phoneDigits: string
}) {
  return (
    <>
      <ErrorsBlock errors={errors} />
      <FormField label="Nome completo *">
        <input
          type="text"
          className="b2b-input"
          value={state.name}
          onChange={(e) => patch('name', e.target.value)}
          disabled={busy}
          maxLength={200}
          autoFocus
          placeholder="Ex: Maria da Silva"
        />
      </FormField>

      <FormField label="Telefone *" hint="apenas DDD + número (BR)">
        <input
          type="tel"
          inputMode="numeric"
          className="b2b-input"
          value={formatPhoneInputBr(phoneDigits)}
          onChange={(e) => patch('phone', normalizePhoneInputBr(e.target.value))}
          disabled={busy}
          placeholder="(44) 99162-2986"
        />
      </FormField>

      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}>
        <FormField label="Email" hint="opcional">
          <input
            type="email"
            className="b2b-input"
            value={state.email}
            onChange={(e) => patch('email', e.target.value)}
            disabled={busy}
            maxLength={200}
            placeholder="maria@exemplo.com"
          />
        </FormField>
        <FormField label="CPF" hint="opcional · 11 dígitos">
          <input
            type="text"
            inputMode="numeric"
            className="b2b-input"
            value={state.cpf}
            onChange={(e) => patch('cpf', e.target.value.replace(/\D/g, '').slice(0, 11))}
            disabled={busy}
            placeholder="00000000000"
          />
        </FormField>
      </div>

      <FormField label="Data de nascimento" hint="opcional">
        <input
          type="date"
          className="b2b-input"
          value={state.birthDate}
          onChange={(e) => patch('birthDate', e.target.value)}
          disabled={busy}
          style={{ maxWidth: 220 }}
        />
      </FormField>
    </>
  )
}

function Step2({
  state,
  patch,
  busy,
  errors,
}: {
  state: WizardState
  patch: <K extends keyof WizardState>(k: K, v: WizardState[K]) => void
  busy: boolean
  errors: string[]
}) {
  return (
    <>
      <ErrorsBlock errors={errors} />
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}>
        <FormField label="Origem (source)">
          <select
            className="b2b-input"
            value={state.source}
            onChange={(e) => patch('source', e.target.value as LeadSource | '')}
            disabled={busy}
          >
            {SOURCE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Tipo de origem (source_type)">
          <select
            className="b2b-input"
            value={state.sourceType}
            onChange={(e) => patch('sourceType', e.target.value as LeadSourceType | '')}
            disabled={busy}
          >
            {SOURCE_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </FormField>
      </div>

      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}>
        <FormField label="Funil">
          <select
            className="b2b-input"
            value={state.funnel}
            onChange={(e) => patch('funnel', e.target.value as Funnel | '')}
            disabled={busy}
          >
            {FUNNEL_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Temperatura">
          <select
            className="b2b-input"
            value={state.temperature}
            onChange={(e) => patch('temperature', e.target.value as LeadTemperature | '')}
            disabled={busy}
          >
            {TEMP_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </FormField>
      </div>

      <FormField label="Score" hint="opcional · 0 a 100">
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={100}
          className="b2b-input"
          value={state.score}
          onChange={(e) => patch('score', e.target.value)}
          disabled={busy}
          placeholder="0-100"
          style={{ maxWidth: 160 }}
        />
      </FormField>
    </>
  )
}

function Step3({
  state,
  patch,
  busy,
  errors,
}: {
  state: WizardState
  patch: <K extends keyof WizardState>(k: K, v: WizardState[K]) => void
  busy: boolean
  errors: string[]
}) {
  return (
    <>
      <ErrorsBlock errors={errors} />
      <div
        style={{
          padding: '10px 12px',
          background: 'rgba(201,169,110,0.08)',
          border: '1px solid rgba(201,169,110,0.25)',
          borderRadius: 6,
          marginBottom: 14,
          fontSize: 12,
          color: 'var(--b2b-text-dim)',
        }}
      >
        Lead será criado em <strong style={{ color: 'var(--b2b-champagne)' }}>fase
        “Lead”</strong> com lifecycle{' '}
        <strong style={{ color: 'var(--b2b-champagne)' }}>ativo</strong>. Para
        avançar (agendar, perdido, paciente, orçamento) use as ações
        específicas da ficha após criar.
      </div>

      <FormField label="Notas / contexto" hint="opcional · até 1000 caracteres">
        <textarea
          className="b2b-input"
          value={state.notes}
          onChange={(e) => patch('notes', e.target.value)}
          disabled={busy}
          rows={6}
          maxLength={1000}
          placeholder="Anote contexto inicial · de onde veio, queixas, urgência..."
          style={{ minHeight: 140, resize: 'vertical', fontFamily: 'inherit' }}
        />
        <div
          style={{
            fontSize: 10,
            color: 'var(--b2b-text-muted)',
            textAlign: 'right',
            marginTop: 2,
          }}
        >
          {state.notes.length}/1000
        </div>
      </FormField>
    </>
  )
}
