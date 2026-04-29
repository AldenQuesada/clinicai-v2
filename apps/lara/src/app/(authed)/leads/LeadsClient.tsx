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

import { useMemo, useState, useTransition } from 'react'
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
} from 'lucide-react'
import type { LeadDTO } from '@clinicai/repositories'
import { softDeleteLeadAction } from './actions'

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

      {view !== 'table' && (
        <div
          className="luxury-card"
          style={{
            padding: '40px 24px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <Construction size={28} style={{ color: 'var(--b2b-champagne)' }} />
          <div className="font-display" style={{ fontSize: 20, color: 'var(--b2b-ivory)' }}>
            {view === 'seven_days' ? 'Kanban 7 Dias' : 'Kanban Evolução'} ·{' '}
            <em>em breve</em>
          </div>
          <p
            className="font-display"
            style={{ fontStyle: 'italic', color: 'var(--b2b-text-muted)', fontSize: 14 }}
          >
            {view === 'seven_days'
              ? 'Pipeline read-only · stages avançam automaticamente.'
              : 'Pipeline drag-drop · arraste leads entre stages.'}
          </p>
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

          {/* ── Tabela 7 colunas ──────────────────────────────────────── */}
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
                    '40px minmax(220px, 1.6fr) 110px 1fr 1.2fr 80px 110px',
                  rowGap: 0,
                  fontSize: 12,
                }}
              >
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
        <NewLeadPlaceholderModal onClose={() => setShowNewLead(false)} />
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
}: {
  rowIdx: number
  lead: LeadDTO
  canEdit: boolean
  canDelete: boolean
  onDelete: () => void
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

  function clickRow(e: React.MouseEvent) {
    // Ignora click se vier de elemento interativo (a/button/select)
    const target = e.target as HTMLElement
    if (target.closest('a, button, select, input')) return
    router.push(`/leads/${lead.id}`)
  }

  return (
    <>
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

function NewLeadPlaceholderModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="b2b-overlay" onClick={onClose}>
      <div
        className="b2b-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 480 }}
      >
        <div className="b2b-modal-hdr">
          <h2>
            Novo <em style={{ color: 'var(--b2b-champagne)' }}>lead</em>
          </h2>
          <button onClick={onClose} className="b2b-close" aria-label="Fechar">
            ×
          </button>
        </div>
        <div className="b2b-modal-body">
          <p
            className="font-display"
            style={{
              fontSize: 16,
              fontStyle: 'italic',
              color: 'var(--b2b-text-dim)',
              lineHeight: 1.5,
              marginBottom: 12,
            }}
          >
            O cadastro completo em 3 etapas (dados pessoais · endereço/origem ·
            dados clínicos) entra no próximo commit.
          </p>
          <p style={{ fontSize: 12, color: 'var(--b2b-text-muted)' }}>
            Por enquanto, leads chegam automaticamente via WhatsApp Cloud API +
            quiz/landing pages. Pra cadastro manual urgente, use o painel CRM
            antigo.
          </p>
        </div>
        <div className="b2b-form-actions" style={{ padding: '0 24px 20px' }}>
          <button type="button" className="b2b-btn b2b-btn-primary" onClick={onClose}>
            Entendi
          </button>
        </div>
      </div>
    </div>
  )
}
