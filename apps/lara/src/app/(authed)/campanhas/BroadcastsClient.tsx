'use client'

/**
 * BroadcastsClient · lista de broadcasts com tabs + auto-refresh.
 *
 * Espelho de _renderBroadcastHistoryTab + _renderBroadcastScheduledTab
 * (broadcast.ui.js linhas 389–479).
 *
 * Auto-refresh a cada 5s se algum broadcast esta em status='sending'
 * (broadcast.ui.js _scheduleBroadcastRefresh linhas 77–92).
 */

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Plus, Trash2, Copy, Clock } from 'lucide-react'
import type { BroadcastDTO } from '@clinicai/repositories'
import { describeFilter, statusColor, statusLabel } from './lib/filters'
import { deleteBroadcastAction } from './actions'

type Tab = 'all' | 'draft' | 'scheduled' | 'sending' | 'completed'

const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'all', label: 'Histórico' },
  { key: 'draft', label: 'Rascunhos' },
  { key: 'scheduled', label: 'Agendados' },
  { key: 'sending', label: 'Em envio' },
  { key: 'completed', label: 'Concluídos' },
]

function isScheduledFuture(b: BroadcastDTO): boolean {
  return !!(
    b.scheduled_at &&
    new Date(b.scheduled_at).getTime() > Date.now() &&
    (b.status === 'draft' || b.status === 'sending')
  )
}

function tabFilter(broadcasts: BroadcastDTO[], tab: Tab): BroadcastDTO[] {
  if (tab === 'all') return broadcasts
  if (tab === 'scheduled') return broadcasts.filter(isScheduledFuture)
  return broadcasts.filter((b) => b.status === tab)
}

export function BroadcastsClient({ broadcasts }: { broadcasts: BroadcastDTO[] }) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('all')
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [, startTransition] = useTransition()
  const [toast, setToast] = useState<{ msg: string; tone: 'ok' | 'err' } | null>(null)

  const hasSending = useMemo(
    () => broadcasts.some((b) => b.status === 'sending'),
    [broadcasts],
  )

  // Auto-refresh enquanto houver disparos em sending (5s)
  useEffect(() => {
    if (!hasSending) return
    const t = setInterval(() => {
      startTransition(() => router.refresh())
    }, 5000)
    return () => clearInterval(t)
  }, [hasSending, router])

  function showToast(msg: string, tone: 'ok' | 'err' = 'ok') {
    setToast({ msg, tone })
    setTimeout(() => setToast(null), 3000)
  }

  async function handleDelete(id: string) {
    const result = await deleteBroadcastAction(id)
    setDeleteConfirm(null)
    if (!result.ok) {
      showToast(result.error || 'Falha ao remover', 'err')
      return
    }
    showToast('Disparo removido')
    startTransition(() => router.refresh())
  }

  const filtered = useMemo(() => tabFilter(broadcasts, tab), [broadcasts, tab])

  return (
    <>
      <div className="b2b-list-head">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {TABS.map((t) => {
            const count = tabFilter(broadcasts, t.key).length
            return (
              <FilterPill
                key={t.key}
                active={tab === t.key}
                onClick={() => setTab(t.key)}
                label={`${t.label} (${count})`}
              />
            )
          })}
        </div>
        <div className="b2b-list-head-acts">
          <Link href="/campanhas/nova" className="b2b-btn b2b-btn-primary">
            <Plus className="w-3.5 h-3.5" />
            Nova campanha
          </Link>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="b2b-empty">
          {tab === 'all'
            ? 'Nenhum disparo ainda · crie sua primeira campanha pra começar'
            : `Nenhum disparo em ${TABS.find((t) => t.key === tab)?.label.toLowerCase()}`}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map((b) => (
            <BroadcastRow
              key={b.id}
              broadcast={b}
              isDeleting={deleteConfirm === b.id}
              onAskDelete={() => setDeleteConfirm(b.id)}
              onConfirmDelete={() => handleDelete(b.id)}
              onCancelDelete={() => setDeleteConfirm(null)}
            />
          ))}
        </div>
      )}

      {toast && (
        <div
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            zIndex: 50,
            padding: '12px 16px',
            background:
              toast.tone === 'err' ? 'rgba(239,68,68,0.95)' : 'rgba(16,185,129,0.95)',
            color: '#fff',
            borderRadius: 6,
            fontSize: 13,
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          }}
        >
          {toast.msg}
        </div>
      )}
    </>
  )
}

function BroadcastRow({
  broadcast: b,
  isDeleting,
  onAskDelete,
  onConfirmDelete,
  onCancelDelete,
}: {
  broadcast: BroadcastDTO
  isDeleting: boolean
  onAskDelete: () => void
  onConfirmDelete: () => void
  onCancelDelete: () => void
}) {
  const filterTags = describeFilter(b.target_filter)
  const created = b.created_at ? new Date(b.created_at) : null
  const dateStr = created ? created.toLocaleDateString('pt-BR') : '--'
  const timeStr = created
    ? created.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : ''
  const schedDate = b.scheduled_at ? new Date(b.scheduled_at) : null

  return (
    <div className="luxury-card" style={{ padding: 14, display: 'flex', gap: 12 }}>
      <div
        style={{
          width: 8,
          alignSelf: 'stretch',
          borderRadius: 2,
          background: statusColor(b.status),
          flexShrink: 0,
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <Link
          href={`/campanhas/${b.id}`}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
            color: 'var(--b2b-ivory)',
            fontWeight: 600,
            fontSize: 14,
            textDecoration: 'none',
          }}
        >
          {b.name || '(sem nome)'}
          <span
            className="b2b-pill"
            style={{
              background: `${statusColor(b.status)}20`,
              color: statusColor(b.status),
              fontSize: 10,
              letterSpacing: 1,
              padding: '2px 8px',
            }}
          >
            {statusLabel(b.status)}
          </span>
          {filterTags.map((t) => (
            <span
              key={t}
              className="b2b-pill"
              style={{
                fontSize: 10,
                color: 'var(--b2b-text-dim)',
                background: 'rgba(255,255,255,0.04)',
                padding: '2px 8px',
              }}
            >
              {t}
            </span>
          ))}
        </Link>
        <div
          style={{
            fontSize: 12,
            color: 'var(--b2b-text-muted)',
            marginTop: 4,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
          }}
        >
          <span>
            {dateStr} {timeStr}
          </span>
          <span>·</span>
          <span>
            {b.sent_count || 0}/{b.total_targets || 0} env.
          </span>
          {schedDate && (
            <>
              <span>·</span>
              <span style={{ color: 'var(--b2b-champagne)' }}>
                <Clock className="w-3 h-3 inline" />{' '}
                {schedDate.toLocaleString('pt-BR', {
                  day: '2-digit',
                  month: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </>
          )}
        </div>
        {isDeleting && (
          <div
            style={{
              marginTop: 8,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 12,
              color: 'var(--b2b-text-dim)',
            }}
          >
            <span>Deletar?</span>
            <button
              type="button"
              onClick={onConfirmDelete}
              className="b2b-btn"
              style={{
                padding: '4px 10px',
                fontSize: 11,
                color: '#EF4444',
                borderColor: '#EF4444',
              }}
            >
              Sim
            </button>
            <button
              type="button"
              onClick={onCancelDelete}
              className="b2b-btn"
              style={{ padding: '4px 10px', fontSize: 11 }}
            >
              Não
            </button>
          </div>
        )}
      </div>
      {!isDeleting && (
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <Link
            href={`/campanhas/nova?clone=${b.id}`}
            title="Reaproveitar"
            className="b2b-btn"
            style={{ padding: '6px 8px' }}
          >
            <Copy className="w-3.5 h-3.5" />
          </Link>
          <button
            type="button"
            onClick={onAskDelete}
            title="Deletar"
            className="b2b-btn"
            style={{ padding: '6px 8px', color: '#EF4444' }}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}

function FilterPill({
  active,
  onClick,
  label,
}: {
  active: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '6px 12px',
        fontSize: 11,
        letterSpacing: 1,
        textTransform: 'uppercase',
        fontWeight: 600,
        border: `1px solid ${active ? 'var(--b2b-champagne)' : 'var(--b2b-border)'}`,
        color: active ? 'var(--b2b-champagne)' : 'var(--b2b-text-dim)',
        background: active ? 'rgba(201,169,110,0.10)' : 'transparent',
        borderRadius: 4,
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  )
}

