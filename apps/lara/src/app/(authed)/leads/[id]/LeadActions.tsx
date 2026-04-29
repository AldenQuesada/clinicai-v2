'use client'

/**
 * LeadActions · botoes de acao destrutiva/operacional.
 *   - Soft-delete (com confirmacao por nome · igual clinic-dashboard)
 *   - Restaurar (se ja deletado)
 *   - Transbordar pra humano (Dra · pausa IA na conversa)
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, ArchiveRestore, Trash2, UserCog } from 'lucide-react'
import type { LeadDTO } from '@clinicai/repositories'
import {
  restoreLeadAction,
  softDeleteLeadAction,
  transbordarLeadAction,
} from '../actions'

export function LeadActions({
  lead,
  canEdit,
  canDelete,
  onToast,
  onAfterDelete,
}: {
  lead: LeadDTO
  canEdit: boolean
  canDelete: boolean
  onToast: (msg: string, tone?: 'ok' | 'err') => void
  onAfterDelete: () => void
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [confirmDel, setConfirmDel] = useState(false)
  const [busy, setBusy] = useState(false)

  async function handleTransbordar() {
    if (!canEdit) return
    setBusy(true)
    const result = await transbordarLeadAction(lead.id)
    setBusy(false)
    if (!result.ok) {
      onToast(result.error || 'Falha ao transbordar', 'err')
      return
    }
    onToast('Conversa transferida para atendimento humano')
    startTransition(() => router.refresh())
  }

  async function handleRestore() {
    if (!canDelete) return
    setBusy(true)
    const result = await restoreLeadAction(lead.id)
    setBusy(false)
    if (!result.ok) {
      onToast(result.error || 'Falha ao restaurar', 'err')
      return
    }
    onToast('Lead restaurado')
    startTransition(() => router.refresh())
  }

  async function handleDelete() {
    if (!canDelete) return
    setBusy(true)
    const result = await softDeleteLeadAction(lead.id)
    setBusy(false)
    if (!result.ok) {
      onToast(result.error || 'Falha ao deletar', 'err')
      return
    }
    onToast('Lead removido')
    onAfterDelete()
  }

  return (
    <div className="luxury-card" style={{ padding: 18 }}>
      <h3
        style={{
          fontSize: 10,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: 1.5,
          color: 'var(--b2b-champagne)',
          margin: '0 0 12px',
        }}
      >
        Ações operacionais
      </h3>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Transbordar */}
        {canEdit && !lead.deletedAt && (
          <ActionRow
            title="Transbordar para humano"
            description="Pausa a Lara na conversa associada e marca o lead com a tag transbordo_humano. A recepção ou Dra. assume a partir daí."
            actionLabel="Transbordar"
            actionIcon={UserCog}
            onAction={handleTransbordar}
            disabled={busy}
          />
        )}

        {/* Restore */}
        {canDelete && lead.deletedAt && (
          <ActionRow
            title="Restaurar lead"
            description="Remove o soft-delete · lead volta a aparecer nas listas ativas."
            actionLabel="Restaurar"
            actionIcon={ArchiveRestore}
            onAction={handleRestore}
            disabled={busy}
            tone="ok"
          />
        )}

        {/* Soft-delete */}
        {canDelete && !lead.deletedAt && (
          <ActionRow
            title="Deletar lead"
            description="Soft-delete · seta deleted_at. Pode ser restaurado depois por admin/owner."
            actionLabel="Deletar"
            actionIcon={Trash2}
            onAction={() => setConfirmDel(true)}
            disabled={busy}
            tone="danger"
          />
        )}
      </div>

      {/* Modal confirmacao delete */}
      {confirmDel && (
        <DeleteConfirmModal
          lead={lead}
          busy={busy}
          onCancel={() => setConfirmDel(false)}
          onConfirm={handleDelete}
        />
      )}
    </div>
  )
}

function ActionRow({
  title,
  description,
  actionLabel,
  actionIcon: Icon,
  onAction,
  disabled,
  tone = 'neutral',
}: {
  title: string
  description: string
  actionLabel: string
  actionIcon: React.ComponentType<{ size?: number }>
  onAction: () => void
  disabled: boolean
  tone?: 'neutral' | 'ok' | 'danger'
}) {
  const colorByTone: Record<string, string> = {
    neutral: 'var(--b2b-champagne)',
    ok: 'var(--b2b-sage)',
    danger: '#ef4444',
  }
  const c = colorByTone[tone]
  return (
    <div
      style={{
        padding: 14,
        border: '1px solid var(--b2b-border)',
        borderRadius: 8,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 14,
        flexWrap: 'wrap',
      }}
    >
      <div style={{ flex: 1, minWidth: 220 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--b2b-ivory)' }}>{title}</div>
        <div
          style={{
            fontSize: 11,
            color: 'var(--b2b-text-dim)',
            marginTop: 4,
            lineHeight: 1.45,
          }}
        >
          {description}
        </div>
      </div>
      <button
        type="button"
        className="b2b-btn"
        onClick={onAction}
        disabled={disabled}
        style={{
          color: c,
          borderColor: `${c}80`,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <Icon size={13} />
        {actionLabel}
      </button>
    </div>
  )
}

function DeleteConfirmModal({
  lead,
  busy,
  onCancel,
  onConfirm,
}: {
  lead: LeadDTO
  busy: boolean
  onCancel: () => void
  onConfirm: () => void | Promise<void>
}) {
  const [typed, setTyped] = useState('')
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
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#ef4444' }}>
            <AlertTriangle size={16} />
            Deletar lead
          </h2>
          <button onClick={onCancel} aria-label="Fechar">
            ×
          </button>
        </div>
        <div className="b2b-modal-body">
          <p style={{ marginBottom: 12, color: 'var(--b2b-text-dim)', fontSize: 13 }}>
            Esta ação é <strong style={{ color: 'var(--b2b-ivory)' }}>permanente</strong> · pode
            ser restaurada por admin/owner.
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
              className="b2b-btn"
              disabled={busy || (!matches && Boolean(expected))}
              onClick={onConfirm}
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
