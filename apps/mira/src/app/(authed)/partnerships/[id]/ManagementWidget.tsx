'use client'

/**
 * ManagementWidget · header de acoes do detail (mirror b2b-detail.ui.js).
 *
 * Combina 2 widgets do legacy num so:
 *   - Account manager dropdown + assign (B2BAccountManager)
 *   - Status switcher com prompt de razao (Status select da b2b-detail-actions)
 *
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
      <div className="rounded-lg border border-white/10 bg-white/[0.02] px-3.5 py-3 text-[11px] text-[#9CA3AF]">
        Status: <strong className="text-[#F5F0E8]">{STATUS_LABELS[currentStatus]}</strong>
        {currentManager ? (
          <> · Account manager: <strong className="text-[#F5F0E8]">@{currentManager}</strong></>
        ) : null}
        <div className="mt-1.5 text-[10px] uppercase tracking-[1.2px] text-[#6B7280]">
          Apenas owner/admin podem alterar.
        </div>
      </div>
    )
  }

  const allowed = ALLOWED_TRANSITIONS[currentStatus] || []

  return (
    <div className="rounded-lg border border-[#C9A96E]/22 bg-[#C9A96E]/[0.04] p-4 flex flex-col gap-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Account manager */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-bold uppercase tracking-[1px] text-[#9CA3AF]">
            Account manager
          </label>
          <div className="flex gap-2">
            <select
              className="flex-1 px-3 py-1.5 rounded-lg border border-white/10 bg-white/[0.02] text-[#F5F0E8] text-xs focus:outline-none focus:border-[#C9A96E]/50"
              value={managerValue}
              onChange={(e) => setManagerValue(e.target.value)}
              disabled={pending}
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
              className="px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-[1px] bg-[#C9A96E] text-[#1A1814] hover:bg-[#D4B785] transition-colors disabled:opacity-50"
              onClick={onAssign}
              disabled={pending}
            >
              {pending ? '…' : 'Atribuir'}
            </button>
          </div>
        </div>

        {/* Status switcher */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-bold uppercase tracking-[1px] text-[#9CA3AF]">
            Status
          </label>
          <select
            className="px-3 py-1.5 rounded-lg border border-white/10 bg-white/[0.02] text-[#F5F0E8] text-xs focus:outline-none focus:border-[#C9A96E]/50 disabled:opacity-50"
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

      {feedback ? (
        <div className="text-[11px] text-[#C9A96E] pt-2 border-t border-[#C9A96E]/10">
          {feedback}
        </div>
      ) : null}
    </div>
  )
}
