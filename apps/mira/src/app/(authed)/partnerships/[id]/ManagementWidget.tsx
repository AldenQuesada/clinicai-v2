'use client'

/**
 * ManagementWidget · header de acoes do detail (mirror b2b-detail.ui.js).
 *
 * Combina 2 widgets do legacy num so:
 *   - Account manager dropdown + assign (B2BAccountManager)
 *   - Status switcher com prompt de razao (Status select da b2b-detail-actions)
 *
 * Visual luxury · b2b-card-gold + b2b-input + b2b-btn-primary.
 * Restrito a owner/admin via prop canManage.
 */

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import {
  transitionStatusAction,
  assignAccountManagerAction,
} from './actions'

type PartnershipStatus =
  | 'prospect'
  | 'dna_check'
  | 'contract'
  | 'active'
  | 'review'
  | 'paused'
  | 'closed'

const STATUS_LABELS: Record<PartnershipStatus, string> = {
  prospect: 'Prospect',
  dna_check: 'Avaliar DNA',
  contract: 'Em contrato',
  active: 'Ativa',
  review: 'Em revisão',
  paused: 'Pausada',
  closed: 'Encerrada',
}

// Maquina de transicoes permitidas (espelha B2BService.canTransition)
const ALLOWED_TRANSITIONS: Record<PartnershipStatus, PartnershipStatus[]> = {
  prospect: ['dna_check', 'closed'],
  dna_check: ['contract', 'active', 'closed'],
  contract: ['active', 'paused', 'closed'],
  active: ['paused', 'review', 'closed'],
  review: ['active', 'paused', 'closed'],
  paused: ['active', 'closed'],
  closed: [],
}

const ALL_STATUSES: PartnershipStatus[] = [
  'prospect',
  'dna_check',
  'contract',
  'active',
  'review',
  'paused',
  'closed',
]

export function ManagementWidget({
  partnershipId,
  currentStatus,
  currentManager,
  managers,
  canManage,
}: {
  partnershipId: string
  currentStatus: PartnershipStatus
  currentManager: string | null
  managers: string[]
  canManage: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [statusValue, setStatusValue] = useState<PartnershipStatus>(currentStatus)
  const [managerValue, setManagerValue] = useState<string>(currentManager || '')
  const [feedback, setFeedback] = useState<string | null>(null)

  function onStatusChange(next: PartnershipStatus) {
    if (next === currentStatus) {
      setStatusValue(currentStatus)
      return
    }
    const reason = window.prompt(
      `Motivo da transição ${currentStatus} → ${next} (opcional):`,
      '',
    )
    if (reason === null) {
      setStatusValue(currentStatus)
      return
    }
    startTransition(async () => {
      const r = await transitionStatusAction(partnershipId, next, reason || null)
      if (!r.ok) {
        setFeedback(`Erro: ${r.error || 'falha'}`)
        setStatusValue(currentStatus)
        return
      }
      setFeedback(`Status atualizado: ${STATUS_LABELS[next]}`)
      router.refresh()
    })
  }

  function onAssign() {
    const next = managerValue.trim() || null
    if (next === (currentManager || null)) {
      setFeedback('Nenhuma mudança.')
      return
    }
    startTransition(async () => {
      const r = await assignAccountManagerAction(partnershipId, next)
      if (!r.ok) {
        setFeedback(`Erro: ${r.error || 'falha'}`)
        return
      }
      setFeedback(
        next === null
          ? 'Account manager removido.'
          : currentManager
          ? `Handoff: ${currentManager} → ${next}.`
          : `Atribuído a ${next}.`,
      )
      router.refresh()
    })
  }

  if (!canManage) {
    return (
      <div className="b2b-card">
        <div style={{ fontSize: 12, color: 'var(--b2b-text-dim)' }}>
          Status: <strong style={{ color: 'var(--b2b-ivory)' }}>{STATUS_LABELS[currentStatus]}</strong>
          {currentManager ? (
            <>
              {' · '}Account manager:{' '}
              <strong style={{ color: 'var(--b2b-ivory)' }}>@{currentManager}</strong>
            </>
          ) : null}
        </div>
        <div className="text-[10px] uppercase tracking-[1.4px] text-[var(--b2b-text-muted)] mt-1">
          Apenas owner/admin podem alterar.
        </div>
      </div>
    )
  }

  const allowed = ALLOWED_TRANSITIONS[currentStatus] || []

  return (
    <div className="b2b-card b2b-card-gold">
      <div className="b2b-grid-2">
        {/* Account manager */}
        <div className="b2b-field" style={{ marginBottom: 0 }}>
          <label className="b2b-field-lbl">Account manager</label>
          <div className="flex gap-2">
            <select
              className="b2b-input"
              value={managerValue}
              onChange={(e) => setManagerValue(e.target.value)}
              disabled={pending}
              style={{ flex: 1 }}
            >
              <option value="">— sem responsável —</option>
              {managers.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="b2b-btn b2b-btn-primary"
              onClick={onAssign}
              disabled={pending}
            >
              {pending ? '…' : 'Atribuir'}
            </button>
          </div>
        </div>

        {/* Status switcher */}
        <div className="b2b-field" style={{ marginBottom: 0 }}>
          <label className="b2b-field-lbl">Status</label>
          <select
            className="b2b-input"
            value={statusValue}
            onChange={(e) => onStatusChange(e.target.value as PartnershipStatus)}
            disabled={pending}
          >
            {ALL_STATUSES.map((s) => {
              const isAllowed = s === currentStatus || allowed.includes(s)
              return (
                <option key={s} value={s} disabled={!isAllowed}>
                  {STATUS_LABELS[s]}
                  {!isAllowed && s !== currentStatus ? ' (não permitido)' : ''}
                </option>
              )
            })}
          </select>
        </div>
      </div>

      {feedback ? <div className="b2b-feedback">{feedback}</div> : null}
    </div>
  )
}
