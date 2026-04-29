'use client'

/**
 * LeadsClient · tabela de leads + paginacao + acoes inline.
 *
 * Mesmas funcionalidades do clinic-dashboard `leads-table.js`:
 *   - Avatar (initial) + nome + phone + funnel + phase + temperature pills
 *   - last_response_at relativo
 *   - score
 *   - actions: WhatsApp link, editar (linka pra detalhes), deletar (modal)
 *   - click linha → /leads/[id]
 *   - paginacao 50/page
 *   - empty state b2b-empty
 */

import Link from 'next/link'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useState, useTransition } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Phone,
  Trash2,
  Edit3,
  AlertTriangle,
} from 'lucide-react'
import type { LeadDTO } from '@clinicai/repositories'
import { LeadFiltersPanel } from './LeadFiltersPanel'
import { softDeleteLeadAction } from './actions'

interface ClientFilter {
  search: string
  funnel: string
  phase: string
  temperature: string
  sourceType: string
  status: string
  noResponseDays: number
}

interface Props {
  rows: LeadDTO[]
  total: number
  page: number
  pageSize: number
  initialFilter: ClientFilter
  canEdit: boolean
  canDelete: boolean
}

export function LeadsClient({
  rows,
  total,
  page,
  pageSize,
  initialFilter,
  canEdit,
  canDelete,
}: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()
  const [confirmDelete, setConfirmDelete] = useState<LeadDTO | null>(null)
  const [toast, setToast] = useState<{ msg: string; tone: 'ok' | 'err' } | null>(null)

  function showToast(msg: string, tone: 'ok' | 'err' = 'ok') {
    setToast({ msg, tone })
    setTimeout(() => setToast(null), 3000)
  }

  function gotoPage(next: number) {
    const sp = new URLSearchParams(searchParams.toString())
    if (next <= 1) sp.delete('page')
    else sp.set('page', String(next))
    router.replace(`${pathname}?${sp.toString()}`, { scroll: false })
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div>
      <LeadFiltersPanel initial={initialFilter} />

      {rows.length === 0 ? (
        <div className="b2b-empty" style={{ padding: 32, textAlign: 'center' }}>
          Nenhum lead encontrado · ajuste os filtros ou aguarde novos contatos chegarem.
        </div>
      ) : (
        <>
          <div className="luxury-card" style={{ overflow: 'hidden', padding: 0 }}>
            <div
              role="table"
              style={{
                display: 'grid',
                gridTemplateColumns:
                  '40px 1.6fr 0.9fr 0.9fr 0.9fr 1.2fr 0.6fr 110px',
                rowGap: 0,
                fontSize: 12,
              }}
            >
              {/* Header */}
              <Cell header>#</Cell>
              <Cell header>Lead</Cell>
              <Cell header>Funnel</Cell>
              <Cell header>Fase</Cell>
              <Cell header>Temp.</Cell>
              <Cell header>Última resposta</Cell>
              <Cell header>Score</Cell>
              <Cell header center>
                Ações
              </Cell>

              {rows.map((lead, idx) => (
                <RowGroup
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

          {/* Paginacao */}
          {totalPages > 1 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginTop: 12,
                gap: 8,
                fontSize: 12,
                color: 'var(--b2b-text-dim)',
              }}
            >
              <span>
                Página <strong style={{ color: 'var(--b2b-ivory)' }}>{page}</strong> de{' '}
                <strong style={{ color: 'var(--b2b-ivory)' }}>{totalPages}</strong> ·{' '}
                {total} {total === 1 ? 'lead' : 'leads'} no total
              </span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  className="b2b-btn"
                  onClick={() => gotoPage(page - 1)}
                  disabled={page <= 1}
                  style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                >
                  <ChevronLeft size={14} /> Anterior
                </button>
                <button
                  className="b2b-btn"
                  onClick={() => gotoPage(page + 1)}
                  disabled={page >= totalPages}
                  style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                >
                  Próxima <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Modal confirmacao delete · padrao b2b-overlay */}
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

      {/* Toast */}
      {toast && (
        <div
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
              toast.tone === 'err' ? 'rgba(239,68,68,0.95)' : 'rgba(138,158,136,0.95)',
            color: '#fff',
            boxShadow: '0 6px 20px rgba(0,0,0,0.4)',
          }}
        >
          {toast.msg}
        </div>
      )}
    </div>
  )
}

// ── Row ─────────────────────────────────────────────────────────────────────

function RowGroup({
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
  const initial = (lead.name || lead.phone || '?').trim().charAt(0).toUpperCase()
  const phoneDigits = (lead.phone || '').replace(/\D/g, '')
  const waHref = phoneDigits
    ? `https://wa.me/${phoneDigits.length <= 11 ? '55' + phoneDigits : phoneDigits}`
    : null

  // Cada celula vira um <Link> independente · CSS Grid + display:contents
  // nao se da bem com aninhamento de Link em Link, entao envolvemos cada
  // celula clickable e a coluna de acoes fica como conteudo solto.
  const wrap = (node: React.ReactNode, key: string) => (
    <Link
      key={key}
      href={`/leads/${lead.id}`}
      style={{ display: 'contents', textDecoration: 'none' }}
    >
      <Cell>{node}</Cell>
    </Link>
  )

  return (
    <>
      <Link
        href={`/leads/${lead.id}`}
        style={{ display: 'contents', textDecoration: 'none' }}
      >
        <Cell>
          <span style={{ color: 'var(--b2b-text-muted)' }}>{rowIdx}</span>
        </Cell>
      </Link>

      <Link
        href={`/leads/${lead.id}`}
        style={{ display: 'contents', textDecoration: 'none' }}
      >
        <Cell>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Avatar initial={initial} />
            <div style={{ overflow: 'hidden' }}>
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
                  gap: 4,
                }}
              >
                <Phone size={10} />
                {formatPhoneBr(lead.phone)}
              </div>
            </div>
          </div>
        </Cell>
      </Link>

      {wrap(<FunnelPill funnel={lead.funnel} />, 'fn')}
      {wrap(<PhasePill phase={lead.phase} />, 'ph')}
      {wrap(<TempPill temp={lead.temperature} />, 'tp')}
      {wrap(
        <span style={{ fontSize: 11, color: 'var(--b2b-text-dim)' }}>
          {formatRelative(lead.lastResponseAt)}
        </span>,
        'lr',
      )}
      {wrap(
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>{lead.leadScore || 0}</span>,
        'sc',
      )}

      <Cell center>
        <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
          {waHref && (
            <a
              href={waHref}
              target="_blank"
              rel="noopener noreferrer"
              className="b2b-btn"
              title="Abrir no WhatsApp"
              style={{
                color: '#22c55e',
                background: 'rgba(34,197,94,0.08)',
                border: '1px solid rgba(34,197,94,0.3)',
                padding: '4px 6px',
                fontSize: 11,
                lineHeight: 1,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink size={12} />
            </a>
          )}
          {canEdit && (
            <Link
              href={`/leads/${lead.id}`}
              className="b2b-btn"
              title="Editar"
              style={{ padding: '4px 6px', fontSize: 11, lineHeight: 1 }}
            >
              <Edit3 size={12} />
            </Link>
          )}
          {canDelete && (
            <button
              type="button"
              className="b2b-btn"
              title="Deletar"
              style={{ color: '#ef4444', padding: '4px 6px', fontSize: 11, lineHeight: 1 }}
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onDelete()
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

// ── Cell + visuals ─────────────────────────────────────────────────────────

function Cell({
  header = false,
  center = false,
  children,
}: {
  header?: boolean
  center?: boolean
  children: React.ReactNode
}) {
  return (
    <div
      style={{
        padding: '12px 14px',
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
        cursor: header ? 'default' : 'pointer',
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
        width: 34,
        height: 34,
        borderRadius: '50%',
        flexShrink: 0,
        background: 'linear-gradient(135deg,#7C3AED,#C9A96E)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 700,
        color: '#fff',
        fontSize: 13,
      }}
    >
      {initial}
    </div>
  )
}

function pillStyle(color: string, bg: string): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '2px 8px',
    borderRadius: 999,
    fontSize: 10,
    fontWeight: 600,
    background: bg,
    color,
    border: `1px solid ${color}40`,
    whiteSpace: 'nowrap',
  }
}

function FunnelPill({ funnel }: { funnel: string }) {
  const cfg: Record<string, { label: string; color: string; bg: string }> = {
    olheiras: { label: 'Olheiras', color: '#a855f7', bg: 'rgba(168,85,247,0.12)' },
    fullface: { label: 'Full Face', color: '#22d3ee', bg: 'rgba(34,211,238,0.12)' },
    procedimentos: {
      label: 'Procedimentos',
      color: '#C9A96E',
      bg: 'rgba(201,169,110,0.12)',
    },
  }
  const c = cfg[funnel] || cfg.procedimentos
  return <span style={pillStyle(c.color, c.bg)}>{c.label}</span>
}

function PhasePill({ phase }: { phase: string }) {
  const cfg: Record<string, { label: string; color: string; bg: string }> = {
    lead: { label: 'Lead', color: '#818cf8', bg: 'rgba(129,140,248,0.12)' },
    agendado: { label: 'Agendado', color: '#a78bfa', bg: 'rgba(167,139,250,0.12)' },
    reagendado: { label: 'Reagendado', color: '#c084fc', bg: 'rgba(192,132,252,0.12)' },
    compareceu: { label: 'Compareceu', color: '#22d3ee', bg: 'rgba(34,211,238,0.12)' },
    paciente: { label: 'Paciente', color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
    orcamento: { label: 'Orçamento', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
    perdido: { label: 'Perdido', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
  }
  const c = cfg[phase] || { label: phase || '—', color: '#9ca3af', bg: 'rgba(156,163,175,0.12)' }
  return <span style={pillStyle(c.color, c.bg)}>{c.label}</span>
}

function TempPill({ temp }: { temp: string }) {
  const cfg: Record<string, { label: string; color: string; bg: string }> = {
    hot: { label: 'Quente', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
    warm: { label: 'Morno', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
    cold: { label: 'Frio', color: '#60a5fa', bg: 'rgba(96,165,250,0.12)' },
  }
  const c = cfg[temp] || cfg.cold
  return (
    <span style={pillStyle(c.color, c.bg)}>
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: c.color,
          display: 'inline-block',
        }}
      />
      {c.label}
    </span>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatPhoneBr(phone: string): string {
  if (!phone) return '—'
  const digits = phone.replace(/\D/g, '')
  // Remove prefixo 55 BR se 12-13 digitos
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

function formatRelative(iso: string | null): string {
  if (!iso) return 'nunca'
  const ts = new Date(iso).getTime()
  if (!Number.isFinite(ts)) return '—'
  const diff = Date.now() - ts
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `${min}m atrás`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h atrás`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}d atrás`
  const months = Math.floor(d / 30)
  if (months < 12) return `${months}m atrás`
  return new Date(iso).toLocaleDateString('pt-BR')
}

// ── Delete modal · padrao b2b-overlay com confirmacao por nome ────────────

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
        style={{ maxWidth: 480 }}
      >
        <div className="b2b-modal-hdr">
          <h2
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              color: '#ef4444',
            }}
          >
            <AlertTriangle size={16} />
            Deletar lead
          </h2>
          <button onClick={onCancel} aria-label="Fechar">
            ×
          </button>
        </div>
        <div className="b2b-modal-body">
          <p style={{ marginBottom: 12, color: 'var(--b2b-text-dim)', fontSize: 13 }}>
            Esta ação é{' '}
            <strong style={{ color: 'var(--b2b-ivory)' }}>permanente</strong> (soft-delete ·
            pode ser restaurado por admin).
          </p>
          <p style={{ marginBottom: 6, fontSize: 12 }}>
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
              className="b2b-btn b2b-btn-primary"
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
                background: '#ef4444',
                color: '#fff',
                borderColor: '#ef4444',
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
