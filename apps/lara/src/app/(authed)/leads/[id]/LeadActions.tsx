'use client'

/**
 * LeadActions · botoes de acao destrutiva/operacional.
 *   - Soft-delete (com confirmacao por nome · igual clinic-dashboard)
 *   - Restaurar (se ja deletado)
 *   - Transbordar pra humano (Dra · pausa IA na conversa)
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertTriangle,
  ArchiveRestore,
  Trash2,
  UserCog,
  UserX,
} from 'lucide-react'
import type { LeadDTO } from '@clinicai/repositories'
import {
  markLeadLostAction,
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
  const [confirmLost, setConfirmLost] = useState(false)
  const [busy, setBusy] = useState(false)

  // BLOCO 3.3 · só ativos podem virar perdido
  const canMarkLost =
    canEdit && !lead.deletedAt && lead.lifecycleStatus === 'ativo'
  const lifecycleLabel =
    lead.lifecycleStatus && lead.lifecycleStatus !== 'ativo'
      ? lead.lifecycleStatus
      : null

  async function handleMarkLost(reason: string) {
    if (!canMarkLost) return
    setBusy(true)
    const result = await markLeadLostAction(lead.id, reason)
    setBusy(false)
    if (!result.ok) {
      onToast(result.error || 'Falha ao marcar perdido', 'err')
      return
    }
    onToast('Lead marcado como perdido')
    setConfirmLost(false)
    startTransition(() => router.refresh())
  }

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

      {lifecycleLabel && (
        <div
          style={{
            padding: '10px 12px',
            border: '1px solid rgba(239,68,68,0.30)',
            borderRadius: 8,
            background: 'rgba(239,68,68,0.08)',
            color: '#ef4444',
            fontSize: 11,
            marginBottom: 10,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <AlertTriangle size={13} />
          <span>
            Lifecycle atual:{' '}
            <strong style={{ textTransform: 'uppercase' }}>{lifecycleLabel}</strong>{' '}
            · ações destrutivas indisponíveis enquanto este estado persistir.
          </span>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Marcar perdido · BLOCO 3.3 */}
        {canMarkLost && (
          <ActionRow
            title="Marcar como perdido"
            description="Move este lead pro lifecycle 'perdido' preservando a phase atual em lost_from_phase. Reversível via /crm/recuperacao."
            actionLabel="Marcar perdido"
            actionIcon={UserX}
            onAction={() => setConfirmLost(true)}
            disabled={busy}
            tone="danger"
          />
        )}

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

      {/* Modal motivo · marcar perdido · BLOCO 3.3 */}
      {confirmLost && (
        <MarkLostModal
          lead={lead}
          busy={busy}
          onCancel={() => setConfirmLost(false)}
          onConfirm={handleMarkLost}
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

function MarkLostModal({
  lead,
  busy,
  onCancel,
  onConfirm,
}: {
  lead: LeadDTO
  busy: boolean
  onCancel: () => void
  onConfirm: (reason: string) => void | Promise<void>
}) {
  const [reason, setReason] = useState('')
  const trimmed = reason.trim()
  const canSubmit = trimmed.length >= 3 && trimmed.length <= 500

  return (
    <div className="b2b-overlay" onClick={busy ? undefined : onCancel}>
      <div
        className="b2b-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 480 }}
      >
        <div className="b2b-modal-hdr">
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#ef4444' }}>
            <AlertTriangle size={16} />
            Marcar lead como perdido
          </h2>
          <button onClick={onCancel} aria-label="Fechar" disabled={busy}>
            ×
          </button>
        </div>
        <div className="b2b-modal-body">
          <p style={{ marginBottom: 12, color: 'var(--b2b-text-dim)', fontSize: 13 }}>
            Esta ação move <strong style={{ color: 'var(--b2b-ivory)' }}>{lead.name || '(sem nome)'}</strong>{' '}
            pro lifecycle <code>perdido</code> preservando a phase atual em <code>lost_from_phase</code>.
            Reversível pela página de recuperação.
          </p>
          <p style={{ marginBottom: 6, fontSize: 12 }}>Motivo (mín 3 caracteres):</p>
          <textarea
            className="b2b-input"
            placeholder="Ex: sem interesse, optou por concorrente, preço, sem retorno..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            maxLength={500}
            disabled={busy}
            style={{ minHeight: 72, resize: 'vertical', fontFamily: 'inherit' }}
          />
          <div
            style={{
              fontSize: 10,
              color: 'var(--b2b-text-muted)',
              textAlign: 'right',
              marginTop: 4,
            }}
          >
            {trimmed.length}/500
          </div>
          <div className="b2b-form-actions">
            <button type="button" className="b2b-btn" onClick={onCancel} disabled={busy}>
              Cancelar
            </button>
            <button
              type="button"
              className="b2b-btn"
              disabled={busy || !canSubmit}
              onClick={() => onConfirm(trimmed)}
              style={{
                background: '#ef4444',
                color: '#fff',
                borderColor: '#ef4444',
              }}
            >
              {busy ? 'Salvando...' : 'Marcar perdido'}
            </button>
          </div>
        </div>
      </div>
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
